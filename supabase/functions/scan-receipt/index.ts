import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MODEL = "claude-haiku-4-5-20251001";

const dataUrlRegex =
  /^data:(image\/[a-z0-9.+-]+)(?:;[a-z0-9.+-]+=[^;,]+)*(?:;charset=[^;,]+)?;base64,([\s\S]+)$/i;

const normalizeImagePayload = (
  input: string
): { mediaType: string; base64Data: string } => {
  const trimmed = input.trim();
  const match = trimmed.match(dataUrlRegex);

  if (match) {
    return {
      mediaType: match[1].toLowerCase(),
      base64Data: match[2].replace(/\s/g, ""),
    };
  }

  return {
    mediaType: "image/jpeg",
    base64Data: trimmed.replace(/\s/g, ""),
  };
};

serve(async (req) => {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log(`[scan-receipt:${requestId}] Request received`);

  try {
    const rawBody = await req.text();
    console.log(`[scan-receipt:${requestId}] Raw body length: ${rawBody.length}`);
    
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch (e) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body", rawLength: rawBody.length }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const imageBase64 = body?.imageBase64;
    console.log(`[scan-receipt:${requestId}] imageBase64 length: ${imageBase64?.length ?? "missing"}`);

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return new Response(
        JSON.stringify({ error: "No image provided", bodyKeys: Object.keys(body || {}), rawLength: rawBody.length }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[scan-receipt:${requestId}] Image payload: ${imageBase64.length} chars`);

    const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
    if (!ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not configured");
    }

    const { mediaType, base64Data } = normalizeImagePayload(imageBase64);

    console.log(`[scan-receipt:${requestId}] Normalized: mediaType=${mediaType}, base64Length=${base64Data.length}`);

    if (base64Data.length < 100) {
      return new Response(
        JSON.stringify({ error: `Image data too small (${base64Data.length} chars)` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[scan-receipt:${requestId}] Calling Anthropic API (${MODEL})...`);

    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: base64Data,
                },
              },
              {
                type: "text",
                text: `Extract all line items from this receipt. Return ONLY a valid JSON object with this exact structure:
{"items": [{"name": "Item Name", "price": 5.90, "quantity": 2, "mismatch": false}]}

Rules:
- "price" must be the UNIT price (for ONE item), not the line total.
- If a line shows "2x Guinness €11.80", return quantity=2, price=5.90.
- If quantity × price does not match the line total shown, set "mismatch" to true.
- Use numeric values for price and quantity.
- Return ONLY the JSON object, no other text.`,
              },
            ],
          },
        ],
      }),
    });

    const elapsed = Date.now() - startedAt;
    console.log(`[scan-receipt:${requestId}] Anthropic responded: ${response.status} (${elapsed}ms)`);

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[scan-receipt:${requestId}] Anthropic error:`, errText);
      return new Response(
        JSON.stringify({ error: `Anthropic API error (${response.status}): ${errText}` }),
        {
          status: response.status === 429 ? 429 : response.status === 401 ? 401 : 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const data = await response.json();
    const textContent = data.content?.find((c: any) => c.type === "text")?.text;

    if (!textContent) {
      console.error(`[scan-receipt:${requestId}] No text in response:`, JSON.stringify(data));
      return new Response(
        JSON.stringify({ error: "No text content in AI response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[scan-receipt:${requestId}] Raw AI text:`, textContent);

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = textContent.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                      textContent.match(/(\{[\s\S]*\})/);

    if (!jsonMatch) {
      console.error(`[scan-receipt:${requestId}] Could not find JSON in response`);
      return new Response(
        JSON.stringify({ error: `Could not parse AI response: ${textContent}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let parsed: { items?: any[] };
    try {
      parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
    } catch (parseErr) {
      console.error(`[scan-receipt:${requestId}] JSON parse failed:`, parseErr);
      return new Response(
        JSON.stringify({ error: `Invalid JSON from AI: ${jsonMatch[1] || jsonMatch[0]}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Normalize: if response is an array, wrap it
    if (Array.isArray(parsed)) {
      parsed = { items: parsed };
    }

    const itemCount = Array.isArray(parsed?.items) ? parsed.items.length : 0;
    console.log(`[scan-receipt:${requestId}] Success: ${itemCount} items (${Date.now() - startedAt}ms)`);

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(`[scan-receipt:${requestId}] Unhandled error:`, e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

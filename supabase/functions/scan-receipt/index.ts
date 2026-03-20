import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-2.5-flash";

serve(async (req) => {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log(`[scan-receipt:${requestId}] Request received`);

  try {
    const rawBody = await req.text();
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid JSON body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const imageBase64 = body?.imageBase64;
    if (!imageBase64 || typeof imageBase64 !== "string") {
      return new Response(
        JSON.stringify({ error: "No image provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build the data URL for the image
    const dataUrl = imageBase64.startsWith("data:") ? imageBase64 : `data:image/jpeg;base64,${imageBase64}`;

    console.log(`[scan-receipt:${requestId}] Calling Lovable AI Gateway (${MODEL})...`);

    const prompt = `Extract all line items from this receipt image. Return ONLY a valid JSON object with this exact structure:
{"items": [{"name": "Item Name", "price": 5.90, "quantity": 2, "mismatch": false}]}

Rules:
- "price" must be the UNIT price (for ONE item), not the line total.
- If a line shows "2x Guinness €11.80", return quantity=2, price=5.90.
- If quantity × price does not match the line total shown, set "mismatch" to true.
- Use numeric values for price and quantity.
- Return ONLY the JSON object, no other text.`;

    const response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: dataUrl },
              },
              {
                type: "text",
                text: prompt,
              },
            ],
          },
        ],
      }),
    });

    const elapsed = Date.now() - startedAt;
    console.log(`[scan-receipt:${requestId}] Gateway responded: ${response.status} (${elapsed}ms)`);

    if (!response.ok) {
      const errText = await response.text();
      console.error(`[scan-receipt:${requestId}] Gateway error:`, errText);
      const status = response.status === 429 ? 429 : response.status === 402 ? 402 : 500;
      const userMsg = response.status === 429
        ? "Rate limit exceeded, please try again shortly."
        : response.status === 402
        ? "AI credits exhausted. Please add funds in Settings > Workspace > Usage."
        : `AI gateway error (${response.status})`;
      return new Response(
        JSON.stringify({ error: userMsg }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();
    const textContent = data.choices?.[0]?.message?.content;

    if (!textContent) {
      console.error(`[scan-receipt:${requestId}] No content in response:`, JSON.stringify(data));
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
      return new Response(
        JSON.stringify({ error: `Could not parse AI response: ${textContent}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let parsed: { items?: any[] };
    try {
      parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
    } catch {
      return new Response(
        JSON.stringify({ error: `Invalid JSON from AI: ${jsonMatch[1] || jsonMatch[0]}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

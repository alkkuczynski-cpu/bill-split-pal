import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const dataUrlRegex = /^data:(image\/[a-z0-9.+-]+)(?:;[a-z0-9.+-]+=[^;,]+)*(?:;charset=[^;,]+)?;base64,([\s\S]+)$/i;
const base64Regex = /^[A-Za-z0-9+/]+={0,2}$/;
const model = "google/gemini-2.5-flash";

const normalizeImagePayload = (input: string) => {
  const trimmed = input.trim();
  const match = trimmed.match(dataUrlRegex);

  if (match) {
    return {
      mimeType: match[1].toLowerCase(),
      cleanBase64: match[2].replace(/\s/g, ""),
      hadDataUrlPrefix: true,
    };
  }

  return {
    mimeType: "image/jpeg",
    cleanBase64: trimmed.replace(/\s/g, ""),
    hadDataUrlPrefix: false,
  };
};

serve(async (req) => {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  console.log(`[scan-receipt:${requestId}] Request received`, {
    method: req.method,
    url: req.url,
  });

  try {
    let body: { imageBase64?: string };
    try {
      body = await req.json();
    } catch (parseError) {
      console.error(`[scan-receipt:${requestId}] Failed to parse request JSON`, parseError);
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const imageBase64 = body?.imageBase64;
    if (!imageBase64 || typeof imageBase64 !== "string") {
      console.error(`[scan-receipt:${requestId}] Missing imageBase64 in request body`);
      return new Response(JSON.stringify({ error: "No image provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[scan-receipt:${requestId}] Image payload received`, {
      imageLength: imageBase64.length,
      prefixPreview: imageBase64.slice(0, 40),
    });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const { mimeType, cleanBase64, hadDataUrlPrefix } = normalizeImagePayload(imageBase64);

    console.log(`[scan-receipt:${requestId}] Image normalized`, {
      mimeType,
      hadDataUrlPrefix,
      cleanLength: cleanBase64.length,
    });

    if (!cleanBase64 || cleanBase64.length < 100) {
      console.error(`[scan-receipt:${requestId}] Image data too small after normalization`, {
        cleanLength: cleanBase64.length,
      });
      return new Response(JSON.stringify({ error: `Image data is empty or too small (${cleanBase64.length} chars)` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!base64Regex.test(cleanBase64)) {
      console.error(`[scan-receipt:${requestId}] Invalid base64 payload detected`);
      return new Response(JSON.stringify({ error: "Invalid base64 image payload format" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const imageUrl = `data:${mimeType};base64,${cleanBase64}`;

    console.log(`[scan-receipt:${requestId}] Sending request to AI gateway`, {
      model,
      elapsedMs: Date.now() - startedAt,
    });

    const gatewayResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: `You are a receipt parser. Extract all line items from the receipt image.

CRITICAL RULES FOR QUANTITY AND PRICE:
- The "price" you return must be the UNIT price (price for ONE item), NOT the line total.
- If a line shows "2x Guinness €11.80", that means 2 items at €5.90 each. Return quantity=2, price=5.90.
- If a line shows "Burger €14.50", that means 1 item at €14.50. Return quantity=1, price=14.50.
- Always verify: quantity × price = the line total shown on the receipt.
- Cross-check that the sum of all (quantity × price) equals the receipt subtotal (before tip/tax).
- If a line total doesn't divide evenly by quantity, return the line total as price with quantity=1 and set "mismatch" to true.

Return ONLY valid JSON using the extract_items tool.`,
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: imageUrl },
              },
              {
                type: "text",
                text: "Extract all line items and their prices from this receipt. For each item: if a quantity is shown (e.g. '2x'), divide the line total by the quantity to get the unit price. Use euro amounts. Verify that quantity × unit_price = line_total for every item.",
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_items",
              description: "Extract line items from a receipt",
              parameters: {
                type: "object",
                properties: {
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string", description: "Item name" },
                        price: { type: "number", description: "Price in euros" },
                        quantity: { type: "number", description: "Quantity, default 1" },
                        mismatch: { type: "boolean", description: "True if quantity × price does not match line total on receipt" },
                      },
                      required: ["name", "price"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["items"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_items" } },
      }),
    });

    console.log(`[scan-receipt:${requestId}] AI gateway responded`, {
      status: gatewayResponse.status,
      ok: gatewayResponse.ok,
      elapsedMs: Date.now() - startedAt,
    });

    if (!gatewayResponse.ok) {
      const errText = await gatewayResponse.text();
      console.error(`[scan-receipt:${requestId}] AI gateway error body`, errText);

      const errorStatus = [400, 402, 429].includes(gatewayResponse.status) ? gatewayResponse.status : 500;
      return new Response(JSON.stringify({
        error: `AI gateway error (${gatewayResponse.status}): ${errText}`,
      }), {
        status: errorStatus,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const gatewayData = await gatewayResponse.json();
    const toolCall = gatewayData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      const rawGateway = JSON.stringify(gatewayData);
      console.error(`[scan-receipt:${requestId}] Missing tool call arguments`, rawGateway);
      return new Response(JSON.stringify({
        error: `Missing tool call arguments in AI response: ${rawGateway}`,
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: { items?: Array<unknown> };
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch (parseError) {
      console.error(`[scan-receipt:${requestId}] Failed to parse tool arguments`, {
        parseError,
        rawArguments: toolCall.function.arguments,
      });
      return new Response(JSON.stringify({
        error: `Invalid tool arguments JSON: ${toolCall.function.arguments}`,
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const itemCount = Array.isArray(parsed?.items) ? parsed.items.length : 0;
    console.log(`[scan-receipt:${requestId}] Returning result to frontend`, {
      itemCount,
      elapsedMs: Date.now() - startedAt,
    });

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(`[scan-receipt:${requestId}] Unhandled error`, e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64 } = await req.json();
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "No image provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Determine mime type from base64 prefix or default to jpeg
    let mimeType = "image/jpeg";
    const match = imageBase64.match(/^data:(image\/[a-zA-Z+]+);base64,/);
    let cleanBase64 = imageBase64;
    if (match) {
      mimeType = match[1];
      cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, "");
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
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
                image_url: { url: `data:${mimeType};base64,${cleanBase64}` },
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

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited. Please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      return new Response(JSON.stringify({ error: "Failed to process receipt" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (!toolCall?.function?.arguments) {
      console.error("No tool call in response:", JSON.stringify(data));
      return new Response(JSON.stringify({ error: "Could not extract items from receipt" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("scan-receipt error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

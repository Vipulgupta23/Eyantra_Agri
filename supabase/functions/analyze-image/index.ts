import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { prompt, image, language, farmerData } = await req.json();

    if (!image) {
      return new Response(JSON.stringify({ error: "Image is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    const togetherApiKey = Deno.env.get("TOGETHER_API_KEY");
    const mistralApiKey = Deno.env.get("MISTRAL_API_KEY");

    console.log("API Keys status - Gemini:", !!geminiApiKey, "Together:", !!togetherApiKey, "Mistral:", !!mistralApiKey);

    // Build personalized agricultural prompt
    const langInstruction = language === 'hi'
      ? 'Respond in Hindi (हिंदी में जवाब दें)'
      : language === 'ta'
        ? 'Respond in Tamil (தமிழில் பதிலளிக்கவும்)'
        : 'Respond in English';

    const farmerContext = farmerData ? `
FARMER PROFILE:
- Name: ${farmerData.name || 'Farmer'}
- Location: ${farmerData.location || 'India'}
- Crops Grown: ${farmerData.crops?.join(', ') || 'Various crops'}
- Land Size: ${farmerData.landSize || 'Not specified'} ${farmerData.landUnit || ''}
` : '';

    const analysisPrompt = prompt || `You are Krishi Sahayak AI, an expert agricultural advisor and botanist analyzing a farmer's image.

${farmerContext}

CRITICAL TASK - ANALYZE THIS IMAGE CAREFULLY:

${langInstruction}

RESPONSE FORMAT (FOLLOW EXACTLY):

1. **🌱 Crop/Plant Identification** (MOST IMPORTANT):
   - SPECIFIC crop name (e.g., "Rice (Oryza sativa)", "Wheat (Triticum aestivum)", "Tomato (Solanum lycopersicum)")
   - Growth stage (seedling, vegetative, flowering, fruiting, mature)
   - Leaf shape, color, and distinguishing features you observe
   - If you cannot determine the exact species, list 2-3 most likely possibilities with reasons

2. **🔍 Health Assessment**:
   - Healthy / Diseased / Pest-affected / Nutrient deficient
   - Specific disease/pest name with confidence (e.g., "Late Blight - 85% confidence")
   - Visible symptoms: spots, yellowing, wilting, holes, discoloration patterns

3. **💊 Immediate Treatment** (if problem detected):
   - Specific fungicide/pesticide name and dosage per acre
   - Application method and timing
   - Organic alternatives if available

4. **🛡️ Prevention**:
   - How to prevent recurrence
   - Best practices for THIS specific crop

5. **📋 Additional Tips**:
   - Season-specific advice for ${farmerData?.location || 'India'}
   - Companion planting or rotation suggestions

IMPORTANT: If you truly cannot identify the specific plant, ask the farmer to provide more context about what they planted, but still give your best analysis based on visual features.

Address the farmer as: ${farmerData?.name || 'Farmer'}
Keep response under 300 words but be specific about crop identification.`;

    // Gemini API call (Primary)
    const callGemini = async (): Promise<{ ok: boolean; content?: string; error?: string }> => {
      if (!geminiApiKey) {
        console.log("GEMINI_API_KEY not configured, skipping");
        return { ok: false, error: "GEMINI_API_KEY not configured" };
      }

      try {
        console.log("Analyzing image with Gemini...");

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { text: analysisPrompt },
                    {
                      inline_data: {
                        mime_type: "image/png",
                        data: image,
                      },
                    },
                  ],
                },
              ],
              generationConfig: {
                maxOutputTokens: 500,
                temperature: 0.3,
              },
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Gemini API error:", response.status, errorText);
          return { ok: false, error: `Gemini error: ${response.status}` };
        }

        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

        if (!content) {
          console.error("Gemini returned empty content");
          return { ok: false, error: "Empty response from Gemini" };
        }

        console.log("Gemini image analysis completed successfully");
        return { ok: true, content };
      } catch (error) {
        console.error("Gemini API error:", error);
        return { ok: false, error: error.message };
      }
    };

    // Together AI call (Fallback) - Using Llama Vision Free
    const callTogether = async (): Promise<{ ok: boolean; content?: string; error?: string }> => {
      if (!togetherApiKey) {
        console.log("TOGETHER_API_KEY not configured, skipping");
        return { ok: false, error: "TOGETHER_API_KEY not configured" };
      }

      try {
        console.log("Analyzing image with Together AI Llama Vision...");

        const response = await fetch("https://api.together.xyz/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${togetherApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "meta-llama/Llama-Vision-Free",
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: analysisPrompt,
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:image/png;base64,${image}`,
                    },
                  },
                ],
              },
            ],
            max_tokens: 500,
            temperature: 0.3,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Together API error:", response.status, errorText);
          return { ok: false, error: `Together error: ${response.status} - ${errorText}` };
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || "";

        if (!content) {
          console.error("Together returned empty content");
          return { ok: false, error: "Empty response from Together" };
        }

        console.log("Together image analysis completed successfully");
        return { ok: true, content };
      } catch (error) {
        console.error("Together API error:", error);
        return { ok: false, error: error.message };
      }
    };

    // Mistral Pixtral call (Third fallback)
    const callMistral = async (): Promise<{ ok: boolean; content?: string; error?: string }> => {
      if (!mistralApiKey) {
        console.log("MISTRAL_API_KEY not configured, skipping");
        return { ok: false, error: "MISTRAL_API_KEY not configured" };
      }

      try {
        console.log("Analyzing image with Mistral Pixtral...");

        const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${mistralApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "pixtral-12b-2409",
            messages: [
              {
                role: "user",
                content: [
                  {
                    type: "text",
                    text: analysisPrompt,
                  },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:image/png;base64,${image}`,
                    },
                  },
                ],
              },
            ],
            max_tokens: 500,
            temperature: 0.3,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error("Mistral API error:", response.status, errorText);
          return { ok: false, error: `Mistral error: ${response.status} - ${errorText}` };
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || "";

        if (!content) {
          console.error("Mistral returned empty content");
          return { ok: false, error: "Empty response from Mistral" };
        }

        console.log("Mistral image analysis completed successfully");
        return { ok: true, content };
      } catch (error) {
        console.error("Mistral API error:", error);
        return { ok: false, error: error.message };
      }
    };

    // Try providers in order: Gemini -> Together -> Mistral
    let result = await callGemini();
    let usedProvider = "gemini";

    if (!result.ok) {
      console.log("Gemini failed, trying Together AI...");
      result = await callTogether();
      usedProvider = "together";
    }

    if (!result.ok) {
      console.log("Together failed, trying Mistral Pixtral...");
      result = await callMistral();
      usedProvider = "mistral";
    }

    if (!result.ok) {
      console.error("All image providers failed");

      // Provide a helpful error message
      const errorMessage = language === 'hi'
        ? "छवि का विश्लेषण नहीं हो सका। कृपया पुनः प्रयास करें।"
        : language === 'ta'
          ? "படத்தை பகுப்பாய்வு செய்ய முடியவில்லை. மீண்டும் முயற்சிக்கவும்."
          : "Could not analyze the image. Please try again.";

      return new Response(JSON.stringify({
        error: errorMessage,
        details: result.error,
        status: "error"
      }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      output: result.content,
      status: "success",
      provider: usedProvider,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in analyze-image function:", error);

    return new Response(JSON.stringify({
      error: "Failed to analyze image",
      details: error.message,
      status: "error"
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

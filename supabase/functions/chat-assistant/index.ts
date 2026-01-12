import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Get current season based on month (Indian agricultural seasons)
const getCurrentSeason = (): string => {
  const month = new Date().getMonth() + 1;
  if (month >= 6 && month <= 9) return 'Kharif (Monsoon)';
  if (month >= 10 || month <= 2) return 'Rabi (Winter)';
  return 'Zaid (Summer)';
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, language, farmerData, debug, history } = await req.json();

    if (!message) {
      throw new Error('Message is required');
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    const mistralApiKey = Deno.env.get('MISTRAL_API_KEY');
    const currentSeason = getCurrentSeason();

    console.log('API Keys status - Gemini:', !!geminiApiKey, 'Mistral:', !!mistralApiKey);

    // Enhanced personalization prompt
    const systemPrompt = `You are Krishi Sahayak AI (कृषि सहायक), a trusted and friendly agricultural advisor for Indian farmers.

FARMER PROFILE:
- Name: ${farmerData?.name || 'Farmer'}
- Location: ${farmerData?.location || 'India'} (consider local climate, soil type, and nearby markets)
- Crops: ${farmerData?.crops?.join(', ') || 'General farming'}
- Land Size: ${farmerData?.landSize || 'Not specified'} ${farmerData?.landUnit || ''}
- Current Season: ${currentSeason}
- Today's Date: ${new Date().toLocaleDateString('en-IN')}

PERSONALIZATION RULES:
1. Always greet by name: "${language === 'hi' ? `नमस्ते ${farmerData?.name || 'किसान'} जी` : language === 'ta' ? `வணக்கம் ${farmerData?.name || 'விவசாயி'}` : `Hello ${farmerData?.name || 'Farmer'}`}"
2. Reference their specific crops (${farmerData?.crops?.join(', ') || 'their crops'}) in advice
3. Consider ${farmerData?.location || 'their region'}'s climate and soil conditions
4. Provide advice relevant to ${currentSeason} season

RESPONSE FORMAT:
- Language: ${language === 'hi' ? 'Hindi (हिंदी)' : language === 'ta' ? 'Tamil (தமிழ்)' : 'English'}
- Start with personalized greeting using farmer's name
- Give 3-5 actionable bullet points with specific quantities when relevant (e.g., "50kg urea per acre")
- Include timing advice (e.g., "water early morning", "spray in evening")
- Bold important terms using **bold**
- If asking about diseases/pests, provide immediate treatment + prevention
- End with encouraging words
- Keep response under 180 words

EXPERTISE AREAS:
- Crop diseases and pest identification
- Fertilizer recommendations with dosage
- Irrigation and water management  
- Weather-based farming advice
- Market prices and selling strategies
- Government schemes for farmers
- Organic farming practices`;

    // Fetch live context if we have coordinates/location
    let weatherSummary = '';
    let marketSummary = '';
    try {
      const forwardApiKey = req.headers.get('apikey') || '';
      if (farmerData?.latitude && farmerData?.longitude) {
        const weatherResp = await fetch(`${new URL(req.url).origin}/functions/v1/weather-data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(forwardApiKey ? { apikey: forwardApiKey } : {}) },
          body: JSON.stringify({ latitude: farmerData.latitude, longitude: farmerData.longitude })
        });
        if (weatherResp.ok) {
          const w = await weatherResp.json();
          const c = w?.weather?.current;
          if (c) {
            weatherSummary = `Current Weather: ${c.condition}, ${c.temperature}°C, humidity ${c.humidity}%, wind ${c.windSpeed} km/h${c.rainfall > 0 ? `, rainfall ${c.rainfall}mm` : ''}.`;
          }
        }
      }
      if (farmerData?.location) {
        const marketResp = await fetch(`${new URL(req.url).origin}/functions/v1/market-data`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(forwardApiKey ? { apikey: forwardApiKey } : {}) },
          body: JSON.stringify({ location: farmerData.location, crops: farmerData.crops || [] })
        });
        if (marketResp.ok) {
          const m = await marketResp.json();
          const top = m?.marketData?.[0];
          if (top) {
            marketSummary = `Market Update (${m.state}): ${top.crop} ₹${top.currentPrice}/quintal (${top.change}, ${top.trend}).`;
          }
        }
      }
    } catch (_) {
      // Swallow context errors silently; chat will still work
    }

    // Build context message
    const contextInfo = [weatherSummary, marketSummary].filter(Boolean).join('\n');
    const userMessageWithContext = contextInfo
      ? `${contextInfo}\n\nFarmer's Question: ${message}`
      : `Farmer's Question: ${message}`;

    // Helper: Build fallback message
    const buildFallback = () => (
      language === 'hi'
        ? `नमस्ते ${farmerData?.name || 'किसान'} जी! मैं आपका कृषि सहायक हूँ। वर्तमान में AI सेवा व्यस्त है। कृपया कुछ समय बाद पुनः प्रयास करें। इस बीच, मौसम और बाजार विजेट का उपयोग करें।`
        : language === 'ta'
          ? `வணக்கம் ${farmerData?.name || 'விவசாயி'}! நான் உங்கள் விவசாய உதவியாளர். AI சேவை தற்போது பிஸியாக உள்ளது. சிறிது நேரம் கழித்து மீண்டும் முயற்சிக்கவும்.`
          : `Hello ${farmerData?.name || 'Farmer'}! I'm your agricultural assistant. The AI service is currently busy. Please try again in a moment.`
    );

    // Gemini AI call using REST API (Primary)
    const callGemini = async (): Promise<{ ok: boolean; content?: string; error?: string }> => {
      if (!geminiApiKey) {
        console.error('GEMINI_API_KEY is missing');
        return { ok: false, error: 'GEMINI_API_KEY missing' };
      }

      try {
        console.log('Calling Gemini AI via REST API...');

        // Build conversation for Gemini
        const contents = [
          {
            role: 'user',
            parts: [{ text: 'You are Krishi Sahayak AI. Here is your system instruction:\n\n' + systemPrompt }]
          },
          {
            role: 'model',
            parts: [{ text: 'Understood! I am Krishi Sahayak AI, ready to help farmers with personalized agricultural advice.' }]
          }
        ];

        // Add history if available
        if (Array.isArray(history)) {
          for (const h of history) {
            contents.push({
              role: h.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: h.content }]
            });
          }
        }

        // Add current message
        contents.push({
          role: 'user',
          parts: [{ text: userMessageWithContext }]
        });

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: contents,
              generationConfig: {
                maxOutputTokens: 300,
                temperature: 0.4,
              },
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          console.error('Gemini API error:', response.status, errorText);
          return { ok: false, error: `Gemini API error: ${response.status} - ${errorText}` };
        }

        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        if (!content) {
          console.error('Gemini returned empty content:', JSON.stringify(data));
          return { ok: false, error: 'Empty response from Gemini' };
        }

        console.log('Gemini response received successfully');
        return { ok: true, content };
      } catch (error) {
        console.error('Gemini API error:', error);
        return { ok: false, error: error.message };
      }
    };

    // Mistral AI call (Fallback)
    const callMistral = async (): Promise<{ ok: boolean; content?: string; error?: string }> => {
      if (!mistralApiKey) {
        console.error('MISTRAL_API_KEY is missing');
        return { ok: false, error: 'MISTRAL_API_KEY missing' };
      }

      console.log('Calling Mistral AI (fallback)...');

      try {
        const messages = [
          { role: 'system', content: systemPrompt },
          ...(Array.isArray(history) ? history : []),
          { role: 'user', content: userMessageWithContext }
        ];

        const resp = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${mistralApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'mistral-small',
            messages: messages,
            max_tokens: 300,
            temperature: 0.4,
          }),
        });

        if (!resp.ok) {
          const txt = await resp.text();
          console.error('Mistral API error:', resp.status, txt);
          return { ok: false, error: txt };
        }

        const json = await resp.json();
        const content = json.choices?.[0]?.message?.content ?? '';
        console.log('Mistral response received successfully');
        return { ok: true, content };
      } catch (error) {
        console.error('Error calling Mistral API:', error);
        return { ok: false, error: error.message };
      }
    };

    // Try Gemini first, then fallback to Mistral
    let result = await callGemini();
    let usedProvider = 'gemini';
    let geminiError = result.ok ? null : result.error;

    if (!result.ok) {
      console.log('Gemini failed with error:', result.error);
      console.log('Trying Mistral fallback...');
      result = await callMistral();
      usedProvider = 'mistral';
    }

    if (!result.ok) {
      // Both providers failed
      console.error('Both AI providers failed. Gemini error:', geminiError, 'Mistral error:', result.error);

      if (debug) {
        return new Response(JSON.stringify({
          status: 'error',
          error: 'All AI providers failed',
          geminiError: geminiError,
          mistralError: result.error,
        }), {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        response: buildFallback(),
        status: 'success',
        fallback: true,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      response: result.content,
      status: 'success',
      provider: usedProvider,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in chat-assistant function:', error);
    return new Response(JSON.stringify({
      error: error.message,
      status: 'error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
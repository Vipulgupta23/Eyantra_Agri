import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Seasonal factors for crop prices in India
const getSeasonalFactor = (crop: string): { trend: string; factor: number; reason: string } => {
    const month = new Date().getMonth() + 1;
    const cropLower = crop.toLowerCase();

    // Rabi crops (Oct-Mar harvest): Wheat, Barley, Mustard, Gram
    const rabiCrops = ['wheat', 'barley', 'mustard', 'gram', 'pea', 'lentil'];
    // Kharif crops (Jun-Oct harvest): Rice, Maize, Cotton, Soybean
    const kharifCrops = ['rice', 'paddy', 'maize', 'cotton', 'soybean', 'groundnut', 'sugarcane', 'bajra', 'jowar'];

    const isRabi = rabiCrops.some(c => cropLower.includes(c));
    const isKharif = kharifCrops.some(c => cropLower.includes(c));

    // Harvest season = prices drop, Pre-harvest = prices rise
    if (isRabi) {
        // Rabi harvest: Mar-Apr, sowing: Oct-Nov
        if (month >= 3 && month <= 5) {
            return { trend: 'down', factor: -0.05, reason: 'Post-harvest supply increase' };
        } else if (month >= 1 && month <= 2) {
            return { trend: 'up', factor: 0.08, reason: 'Pre-harvest demand' };
        } else if (month >= 10 && month <= 12) {
            return { trend: 'up', factor: 0.05, reason: 'Sowing season, old stock demand' };
        }
    }

    if (isKharif) {
        // Kharif harvest: Oct-Nov, sowing: Jun-Jul
        if (month >= 10 && month <= 12) {
            return { trend: 'down', factor: -0.06, reason: 'Post-harvest supply increase' };
        } else if (month >= 8 && month <= 9) {
            return { trend: 'up', factor: 0.10, reason: 'Pre-harvest demand peak' };
        } else if (month >= 3 && month <= 5) {
            return { trend: 'up', factor: 0.07, reason: 'Off-season scarcity' };
        }
    }

    return { trend: 'stable', factor: 0.02, reason: 'Normal market conditions' };
};

// Calculate simple forecast based on current trend and seasonality
const calculateForecast = (currentPrice: number, currentTrend: string, crop: string) => {
    const seasonal = getSeasonalFactor(crop);

    // Combine current market trend with seasonal expectations
    let expectedChangeMin = 0;
    let expectedChangeMax = 0;
    let confidence = 'medium';
    let direction = 'stable';

    if (currentTrend === 'up' && seasonal.trend === 'up') {
        expectedChangeMin = 8;
        expectedChangeMax = 15;
        direction = 'up';
        confidence = 'high';
    } else if (currentTrend === 'up' && seasonal.trend === 'stable') {
        expectedChangeMin = 3;
        expectedChangeMax = 8;
        direction = 'up';
        confidence = 'medium';
    } else if (currentTrend === 'up' && seasonal.trend === 'down') {
        expectedChangeMin = -2;
        expectedChangeMax = 5;
        direction = 'stable';
        confidence = 'low';
    } else if (currentTrend === 'down' && seasonal.trend === 'down') {
        expectedChangeMin = -10;
        expectedChangeMax = -5;
        direction = 'down';
        confidence = 'high';
    } else if (currentTrend === 'down' && seasonal.trend === 'up') {
        expectedChangeMin = -3;
        expectedChangeMax = 5;
        direction = 'stable';
        confidence = 'low';
    } else if (currentTrend === 'down') {
        expectedChangeMin = -8;
        expectedChangeMax = -2;
        direction = 'down';
        confidence = 'medium';
    } else {
        expectedChangeMin = -3;
        expectedChangeMax = 3;
        direction = 'stable';
        confidence = 'medium';
    }

    // Calculate expected price range
    const expectedPriceMin = Math.round(currentPrice * (1 + expectedChangeMin / 100));
    const expectedPriceMax = Math.round(currentPrice * (1 + expectedChangeMax / 100));

    return {
        direction,
        expectedChangeMin,
        expectedChangeMax,
        expectedChange: `${expectedChangeMin > 0 ? '+' : ''}${expectedChangeMin}% to ${expectedChangeMax > 0 ? '+' : ''}${expectedChangeMax}%`,
        expectedPriceRange: `₹${expectedPriceMin} - ₹${expectedPriceMax}`,
        confidence,
        timeframe: '7 days',
        seasonalReason: seasonal.reason,
    };
};

// Determine selling recommendation
const getRecommendation = (direction: string, confidence: string) => {
    if (direction === 'up' && confidence === 'high') {
        return { action: 'wait', priority: 'strong' };
    } else if (direction === 'up') {
        return { action: 'wait', priority: 'moderate' };
    } else if (direction === 'down' && confidence === 'high') {
        return { action: 'sell', priority: 'strong' };
    } else if (direction === 'down') {
        return { action: 'sell', priority: 'moderate' };
    }
    return { action: 'hold', priority: 'neutral' };
};

serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders });
    }

    try {
        const { crop, location, currentPrice, currentTrend, language = 'en', farmerData } = await req.json();

        if (!crop) {
            throw new Error('Crop is required');
        }

        console.log(`Generating forecast for ${crop} in ${location}`);

        const mistralApiKey = Deno.env.get('MISTRAL_API_KEY');

        // Use provided price/trend or defaults
        const price = currentPrice || 2500;
        const trend = currentTrend || 'stable';

        // Calculate forecast
        const forecast = calculateForecast(price, trend, crop);
        const recommendation = getRecommendation(forecast.direction, forecast.confidence);

        // Generate AI-powered advice using Mistral
        let aiAdvice = '';
        if (mistralApiKey) {
            try {
                const langInstruction = language === 'hi'
                    ? 'Respond ONLY in Hindi (हिंदी में)'
                    : language === 'ta'
                        ? 'Respond ONLY in Tamil (தமிழில்)'
                        : 'Respond in simple English';

                const prompt = `You are Krishi Sahayak AI, a friendly market advisor for Indian farmers.

FARMER: ${farmerData?.name || 'Farmer'}
LOCATION: ${location || 'India'}
CROP: ${crop}
CURRENT PRICE: ₹${price}/quintal
PRICE TREND: ${trend}
FORECAST: ${forecast.expectedChange} in next 7 days
RECOMMENDATION: ${recommendation.action.toUpperCase()}
REASON: ${forecast.seasonalReason}

${langInstruction}

Write a SHORT, friendly 2-3 sentence advice for the farmer about whether to sell now or wait. Include:
- Mention them by name
- State the expected price movement
- Give clear action (sell now / wait X days)
- One practical tip

Keep it under 50 words, conversational and encouraging.`;

                const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${mistralApiKey}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: 'mistral-small',
                        messages: [{ role: 'user', content: prompt }],
                        max_tokens: 100,
                        temperature: 0.5,
                    }),
                });

                if (response.ok) {
                    const data = await response.json();
                    aiAdvice = data.choices?.[0]?.message?.content || '';
                }
            } catch (err) {
                console.error('AI advice generation failed:', err);
            }
        }

        // Fallback advice if AI fails
        if (!aiAdvice) {
            const name = farmerData?.name || 'Farmer';
            if (language === 'hi') {
                aiAdvice = recommendation.action === 'wait'
                    ? `${name} जी, ${crop} की कीमत बढ़ने की संभावना है। 5-7 दिन इंतजार करें।`
                    : recommendation.action === 'sell'
                        ? `${name} जी, ${crop} की कीमत गिर सकती है। जल्द बेचना फायदेमंद होगा।`
                        : `${name} जी, ${crop} की कीमत स्थिर है। मंडी की स्थिति देखते रहें।`;
            } else if (language === 'ta') {
                aiAdvice = recommendation.action === 'wait'
                    ? `${name}, ${crop} விலை உயரும் என எதிர்பார்க்கப்படுகிறது. 5-7 நாட்கள் காத்திருங்கள்.`
                    : recommendation.action === 'sell'
                        ? `${name}, ${crop} விலை குறையலாம். விரைவில் விற்பனை செய்யுங்கள்.`
                        : `${name}, ${crop} விலை நிலையானது. சந்தையைக் கவனியுங்கள்.`;
            } else {
                aiAdvice = recommendation.action === 'wait'
                    ? `${name}, ${crop} prices are expected to rise. Wait 5-7 days for better returns.`
                    : recommendation.action === 'sell'
                        ? `${name}, ${crop} prices may decline. Consider selling soon.`
                        : `${name}, ${crop} prices are stable. Monitor the market closely.`;
            }
        }

        return new Response(JSON.stringify({
            crop,
            currentPrice: price,
            location: location || 'India',
            forecast,
            recommendation: {
                action: recommendation.action,
                priority: recommendation.priority,
                aiAdvice,
            },
            status: 'success',
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });

    } catch (error) {
        console.error('Error in market-forecast function:', error);
        return new Response(JSON.stringify({
            error: error.message,
            status: 'error'
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
});

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Map user locations to states for market data
const getStateFromLocation = (location: string): string => {
  const locationLower = location.toLowerCase();

  if (locationLower.includes('punjab')) return 'Punjab';
  if (locationLower.includes('haryana')) return 'Haryana';
  if (locationLower.includes('uttar pradesh') || locationLower.includes('up')) return 'Uttar Pradesh';
  if (locationLower.includes('bihar')) return 'Bihar';
  if (locationLower.includes('west bengal') || locationLower.includes('kolkata')) return 'West Bengal';
  if (locationLower.includes('maharashtra') || locationLower.includes('mumbai') || locationLower.includes('pune')) return 'Maharashtra';
  if (locationLower.includes('gujarat') || locationLower.includes('ahmedabad')) return 'Gujarat';
  if (locationLower.includes('rajasthan') || locationLower.includes('jaipur')) return 'Rajasthan';
  if (locationLower.includes('madhya pradesh') || locationLower.includes('mp') || locationLower.includes('bhopal')) return 'Madhya Pradesh';
  if (locationLower.includes('karnataka') || locationLower.includes('bangalore') || locationLower.includes('bengaluru')) return 'Karnataka';
  if (locationLower.includes('andhra pradesh') || locationLower.includes('hyderabad')) return 'Andhra Pradesh';
  if (locationLower.includes('telangana')) return 'Telangana';
  if (locationLower.includes('tamil nadu') || locationLower.includes('chennai')) return 'Tamil Nadu';
  if (locationLower.includes('kerala') || locationLower.includes('kochi')) return 'Kerala';
  if (locationLower.includes('odisha') || locationLower.includes('bhubaneswar')) return 'Odisha';
  if (locationLower.includes('assam') || locationLower.includes('guwahati')) return 'Assam';

  // Default fallback based on region detection
  if (locationLower.includes('delhi') || locationLower.includes('ncr')) return 'Delhi';

  return 'Maharashtra'; // Default state
};

// Robust Market Data Estimation Engine (Fallback when API fails)
const generateMarketData = (state: string, userCrops: string[] = []) => {
  const month = new Date().getMonth() + 1; // 1-12

  // State-specific price multipliers (Supply vs Demand)
  // < 1.0 means cheaper (producer state), > 1.0 means expensive (consumer state)
  const stateFactors: { [key: string]: { [key: string]: number } } = {
    'Punjab': { 'Wheat': 0.9, 'Rice': 0.92, 'Maize': 0.95, 'Mustard': 0.95 },
    'Haryana': { 'Wheat': 0.9, 'Rice': 0.92, 'Bajra': 0.9, 'Mustard': 0.94 },
    'Madhya Pradesh': { 'Wheat': 0.92, 'Soybean': 0.88, 'Gram': 0.85, 'Garlic': 0.8 },
    'Maharashtra': { 'Onion': 0.7, 'Grapes': 0.8, 'Cotton': 0.9, 'Sugarcane': 0.95 },
    'Gujarat': { 'Cotton': 0.88, 'Groundnut': 0.85, 'Cumin': 0.8, 'Onion': 0.85 },
    'UP': { 'Sugarcane': 0.9, 'Wheat': 0.93, 'Potato': 0.8, 'Mango': 0.85 },
    'West Bengal': { 'Rice': 0.88, 'Jute': 0.85, 'Potato': 0.85 },
    'Tamil Nadu': { 'Rice': 0.95, 'Coconut': 0.8, 'Banana': 0.85 },
    'Kerala': { 'Coconut': 0.75, 'Spices': 0.8, 'Rubber': 0.85, 'Rice': 1.2 },
    'Karnataka': { 'Coffee': 0.8, 'Ragi': 0.85, 'Arecanut': 0.8 },
    'Andhra Pradesh': { 'Rice': 0.9, 'Chilli': 0.8, 'Tobacco': 0.85 },
    'Telangana': { 'Cotton': 0.9, 'Turmeric': 0.85, 'Maize': 0.92 },
    'Rajasthan': { 'Bajra': 0.85, 'Mustard': 0.88, 'Coriander': 0.85, 'Guar': 0.8 },
    'Bihar': { 'Maize': 0.88, 'Litchi': 0.8, 'Rice': 0.95 },
  };

  // 2026 Realistic Base Prices (Per Quintal) roughly for India avg
  const baseData = [
    { crop: 'Rice', basePrice: 2900, msp: 2300, volatility: 0.05 },
    { crop: 'Wheat', basePrice: 2550, msp: 2275, volatility: 0.04 },
    { crop: 'Cotton', basePrice: 7200, msp: 6620, volatility: 0.12 },
    { crop: 'Sugarcane', basePrice: 390, msp: 340, volatility: 0.02 }, // Per Quintal
    { crop: 'Soybean', basePrice: 4600, msp: 4600, volatility: 0.10 },
    { crop: 'Groundnut', basePrice: 6200, msp: 6377, volatility: 0.08 },
    { crop: 'Maize', basePrice: 2250, msp: 2090, volatility: 0.06 },
    { crop: 'Bajra', basePrice: 2450, msp: 2500, volatility: 0.07 },
    { crop: 'Mustard', basePrice: 5600, msp: 5650, volatility: 0.09 },
    { crop: 'Gram', basePrice: 5900, msp: 5440, volatility: 0.08 },
    { crop: 'Onion', basePrice: 3500, msp: 0, volatility: 0.40 }, // High volatility
    { crop: 'Potato', basePrice: 1800, msp: 0, volatility: 0.25 },
    { crop: 'Tomato', basePrice: 3000, msp: 0, volatility: 0.50 },
    { crop: 'Tur', basePrice: 9500, msp: 7000, volatility: 0.10 },
    { crop: 'Moong', basePrice: 8200, msp: 8558, volatility: 0.08 },
  ];

  // Seasonality Logic roughly (1 = neutral, >1 expensive (off-season/demand), <1 cheap (harvest))
  const getSeasonalFactor = (crop: string) => {
    const c = crop.toLowerCase();
    // Rabi Harvest (Mar-May): Wheat, Mustard, Gram -> Low Price
    if (['wheat', 'mustard', 'gram', 'barley'].includes(c)) {
      if (month >= 3 && month <= 5) return 0.9;
      if (month >= 11 && month <= 2) return 1.1; // Pre-harvest high
    }
    // Kharif Harvest (Oct-Dec): Rice, Soybean, Cotton, Maize -> Low Price
    if (['rice', 'paddy', 'soybean', 'cotton', 'maize', 'bajra', 'groundnut'].includes(c)) {
      if (month >= 10 && month <= 12) return 0.9;
      if (month >= 6 && month <= 8) return 1.1;
    }
    // Perishables
    if (c === 'onion') return month >= 9 && month <= 12 ? 1.5 : 0.8; // Late kharif crisis usually
    if (c === 'tomato') return month >= 6 && month <= 8 ? 1.4 : 0.8;

    return 1.0;
  };

  const multiplier = 1.0; // Default state multiplier if not found

  // Prioritize user crops
  const prioritizedCrops = userCrops.length > 0
    ? baseData.filter(crop => userCrops.some(userCrop =>
      userCrop.toLowerCase().includes(crop.crop.toLowerCase()) ||
      crop.crop.toLowerCase().includes(userCrop.toLowerCase())
    ))
    : [];

  const otherCrops = baseData.filter(crop =>
    !prioritizedCrops.some(pc => pc.crop === crop.crop)
  );

  const selectedCrops = [
    ...prioritizedCrops,
    ...otherCrops.slice(0, Math.max(0, 8 - prioritizedCrops.length))
  ];

  return selectedCrops.map(item => {
    // 1. Identify state factor
    let stateFactor = 1.05; // Slightly above avg default
    // Check if state is in our dictionary map (handling varied spellings)
    for (const [sKey, factors] of Object.entries(stateFactors)) {
      if (state.toLowerCase().includes(sKey.toLowerCase())) {
        // Known state
        stateFactor = factors[item.crop] || 1.0; // Specific crop factor or avg
        break;
      }
    }

    // 2. Identify seasonal factor
    const seasonalFactor = getSeasonalFactor(item.crop);

    // 3. Add small daily noise (Simulated realism)
    const randomNoise = 1 + (Math.random() - 0.5) * item.volatility;

    // Calculate Final Estimated Price
    let estimatedPrice = Math.round(item.basePrice * stateFactor * seasonalFactor * randomNoise);

    // Ensure estimated price isn't ridiculously below MSP unless it's a crisis crop (onion/tomato)
    if (item.msp > 0 && estimatedPrice < item.msp * 0.85) {
      estimatedPrice = Math.round(item.msp * 0.95); // Support levels
    }

    const change = ((estimatedPrice - item.basePrice) / item.basePrice * 100);

    let trend = 'stable';
    if (change > 2) trend = 'up';
    else if (change < -2) trend = 'down';

    return {
      crop: item.crop,
      currentPrice: estimatedPrice,
      msp: Math.round(item.msp),
      trend,
      change: `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`,
      market: state,
    };
  });
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { location, crops } = await req.json();

    if (!location) {
      throw new Error('Location is required');
    }

    console.log(`Fetching market data for location: ${location}, crops: ${crops}`);

    const state = getStateFromLocation(location);

    // 1. Try Custom Scraper API (if configured)
    // Supports the Python scraper format: /request?commodity=X&state=Y&market=Z
    const customApiUrl = Deno.env.get('MARKET_DATA_API_URL');
    if (customApiUrl) {
      try {
        console.log('Fetching from custom API:', customApiUrl);
        // Map common crops/states to Agmarknet names if needed
        // For now pass directly
        const promises = userCrops.slice(0, 5).map(async (crop) => {
          try {
            // Construct URL: baseUrl/request?commodity=Crop&state=State
            const url = new URL(customApiUrl.endsWith('/') ? customApiUrl + 'request' : customApiUrl + '/request');
            url.searchParams.set('commodity', crop);
            url.searchParams.set('state', state);
            // Market is optional, maybe don't set to get state average?
            // url.searchParams.set('market', state); 

            // Check if user is using the python scraper pattern
            const resp = await fetch(url.toString());
            if (resp.ok) {
              const json = await resp.json();
              // Expecting array: [{ "Model Prize": "1600", "Date": "..." }]
              if (Array.isArray(json) && json.length > 0) {
                const latest = json[0];
                const price = parseFloat(latest["Model Prize"]);
                if (!isNaN(price)) {
                  return {
                    crop,
                    currentPrice: price,
                    msp: 0, // Scraper might not have MSP
                    trend: 'stable', // Could calulcate from history
                    change: '0%',
                    market: state,
                    source: 'custom-api'
                  };
                }
              }
            }
          } catch (e) {
            console.error(`Custom API failed for ${crop}:`, e);
          }
          return null;
        });

        const results = await Promise.all(promises);
        const validResults = results.filter(r => r !== null);

        if (validResults.length > 0) {
          return new Response(JSON.stringify({
            marketData: validResults,
            state,
            status: 'success',
            source: 'custom-api'
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } catch (err) {
        console.error('Custom API error:', err);
      }
    }

    // 2. Try AGMARKNET (data.gov.in) first if key is present
    const agmarkKey = Deno.env.get('AGMARKNET_API_KEY');
    if (agmarkKey) {
      try {
        // data.gov.in AGMARKNET resource id (wholesale market prices)
        const RESOURCE_ID = '9ef84268-d588-465a-a308-a864a43d0070';
        const baseUrl = `https://api.data.gov.in/resource/${RESOURCE_ID}`;
        // Build query: state filter, optional commodity filter if user crops provided
        const params = new URLSearchParams();
        params.set('api-key', agmarkKey);
        params.set('format', 'json');
        params.set('limit', '500');
        // Filters per data.gov.in patterns
        params.set('filters[state]', state);
        // Optionally narrow by commodity
        // Do not filter by commodity to maximize chances of records

        const url = `${baseUrl}?${params.toString()}`;
        console.log('Calling AGMARKNET:', url);
        const resp = await fetch(url);
        if (!resp.ok) {
          throw new Error(`AGMARKNET API error: ${resp.status}`);
        }
        const json = await resp.json();
        const records: any[] = json?.records || [];

        // If no records, fallback
        if (records.length > 0) {
          // Normalize and pick a small set
          const normalizeName = (s: string) => (s || '').trim();
          const userCrops = Array.isArray(crops) ? crops : [];

          // Group by commodity and compute a representative price (median/modal_price)
          const byCommodity = new Map<string, number[]>();
          for (const r of records) {
            const commodity = normalizeName(r.commodity);
            const modal = Number(r.modal_price);
            if (!commodity || isNaN(modal)) continue;
            if (!byCommodity.has(commodity)) byCommodity.set(commodity, []);
            byCommodity.get(commodity)!.push(modal);
          }

          const computeMedian = (arr: number[]) => {
            const a = [...arr].sort((x, y) => x - y);
            const mid = Math.floor(a.length / 2);
            return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
          };

          // Prioritize user crops
          const prioritized: any[] = [];
          const others: any[] = [];
          for (const [commodity, prices] of byCommodity.entries()) {
            const median = computeMedian(prices);
            const item = { commodity, price: median };
            if (userCrops.some(c => c.toLowerCase().includes(commodity.toLowerCase()) || commodity.toLowerCase().includes(c.toLowerCase()))) {
              prioritized.push(item);
            } else {
              others.push(item);
            }
          }

          const selected = [...prioritized, ...others].slice(0, 6);
          const basePriceMap = new Map<string, number>();
          // Build response in your UI shape
          const marketData = selected.map((it) => {
            const base = basePriceMap.get(it.commodity) ?? it.price;
            const change = base ? ((it.price - base) / base) * 100 : 0;
            const trend = change > 1 ? 'up' : change < -1 ? 'down' : 'stable';
            return {
              crop: it.commodity,
              currentPrice: it.price,
              msp: it.price, // AGMARKNET doesn’t provide MSP; use price as placeholder
              trend,
              change: `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`,
              market: state,
            };
          });

          console.log(`AGMARKNET data prepared for state: ${state}, items: ${marketData.length}`);
          return new Response(JSON.stringify({ marketData, state, status: 'success', source: 'agmarknet' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } catch (agErr) {
        console.error('AGMARKNET fetch failed, falling back:', agErr);
      }
    }

    // Fallback to generated sample data
    const marketData = generateMarketData(state, crops);
    console.log(`Generated fallback market data for state: ${state}`);

    return new Response(JSON.stringify({
      marketData,
      state,
      status: 'success',
      source: agmarkKey ? 'fallback' : 'mock'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in market-data function:', error);
    return new Response(JSON.stringify({
      error: error.message,
      status: 'error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
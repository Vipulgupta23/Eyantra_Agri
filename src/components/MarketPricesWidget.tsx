import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, IndianRupee, Loader2, Sparkles, AlertCircle, X } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation, translateStateName, translateCropName } from "@/lib/translations";
import { Button } from "@/components/ui/button";

interface MarketPrice {
  crop: string;
  currentPrice: number;
  msp: number;
  trend: 'up' | 'down' | 'stable';
  change: string;
  market: string;
}

interface MarketPricesWidgetProps {
  location?: string;
  crops?: string[];
  language?: string;
  userName?: string;
}

interface ForecastData {
  direction: string;
  expectedChange: string;
  expectedPriceRange: string;
  confidence: string;
  timeframe: string;
  recommendation: {
    action: string;
    priority: string;
    aiAdvice: string;
  };
}

// Mock market data fallback
const mockMarketData: MarketPrice[] = [
  {
    crop: 'Rice',
    currentPrice: 2850,
    msp: 2700,
    trend: 'up',
    change: '+5.6%',
    market: 'Delhi',
  },
  {
    crop: 'Wheat',
    currentPrice: 2450,
    msp: 2425,
    trend: 'up',
    change: '+1.0%',
    market: 'Punjab',
  },
  {
    crop: 'Cotton',
    currentPrice: 6800,
    msp: 6620,
    trend: 'down',
    change: '-2.3%',
    market: 'Gujarat',
  },
  {
    crop: 'Sugarcane',
    currentPrice: 385,
    msp: 375,
    trend: 'stable',
    change: '0.0%',
    market: 'UP',
  },
  {
    crop: 'Soybean',
    currentPrice: 4200,
    msp: 4300,
    trend: 'down',
    change: '-2.3%',
    market: 'MP',
  },
  {
    crop: 'Groundnut',
    currentPrice: 5850,
    msp: 5850,
    trend: 'up',
    change: '+3.2%',
    market: 'Gujarat',
  },
];

const getTrendIcon = (trend: string) => {
  switch (trend) {
    case 'up':
      return <TrendingUp className="h-4 w-4 text-success" />;
    case 'down':
      return <TrendingDown className="h-4 w-4 text-destructive" />;
    default:
      return <Minus className="h-4 w-4 text-muted-foreground" />;
  }
};

const getTrendColor = (trend: string) => {
  switch (trend) {
    case 'up':
      return 'text-success';
    case 'down':
      return 'text-destructive';
    default:
      return 'text-muted-foreground';
  }
};

export const MarketPricesWidget: React.FC<MarketPricesWidgetProps> = ({ location, crops, language = 'en', userName }) => {
  const { toast } = useToast();
  const t = useTranslation(language);
  const [marketData, setMarketData] = useState<MarketPrice[]>(mockMarketData);
  const [isLoading, setIsLoading] = useState(false);
  const [isUsingMockData, setIsUsingMockData] = useState(true);
  const [currentState, setCurrentState] = useState<string>('');

  // Forecast state
  const [activeForecastCrop, setActiveForecastCrop] = useState<string | null>(null);
  const [forecastData, setForecastData] = useState<ForecastData | null>(null);
  const [isLoadingForecast, setIsLoadingForecast] = useState(false);

  useEffect(() => {
    if (location) {
      fetchMarketData();
    }
  }, [location, crops]);

  const fetchMarketData = async () => {
    if (!location) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('market-data', {
        body: { location, crops: crops || [] },
      });

      if (error) throw error;

      setMarketData((data as any).marketData);
      setCurrentState((data as any).state);
      setIsUsingMockData(false);
    } catch (error) {
      console.error('Market data fetch error:', error);
      toast({
        title: "Market Data Error",
        description: "Failed to fetch live market prices. Using sample data.",
        variant: "destructive",
      });
      setIsUsingMockData(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGetForecast = async (crop: string, currentPrice: number, currentTrend: string) => {
    if (activeForecastCrop === crop) {
      setActiveForecastCrop(null);
      setForecastData(null);
      return;
    }

    setActiveForecastCrop(crop);
    setIsLoadingForecast(true);
    setForecastData(null);

    try {
      const { data, error } = await supabase.functions.invoke('market-forecast', {
        body: {
          crop,
          location,
          currentPrice,
          currentTrend,
          language,
          farmerData: { name: userName }
        },
      });

      if (error) throw error;
      setForecastData(data.forecast ? { ...data.forecast, recommendation: data.recommendation } : null);
    } catch (error) {
      console.error('Forecast error:', error);
      toast({
        title: "Forecast Failed",
        description: "Could not generate price forecast. Please try again.",
        variant: "destructive",
      });
      setActiveForecastCrop(null);
    } finally {
      setIsLoadingForecast(false);
    }
  };

  return (
    <Card className="shadow-agricultural relative overflow-hidden">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-primary">
          <IndianRupee className="h-5 w-5" />
          {t('marketPrices.title')} & MSP
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
          {isUsingMockData && <span className="text-xs text-muted-foreground">(Sample Data)</span>}
        </CardTitle>
        {currentState && (
          <p className="text-sm text-muted-foreground">
            📍 {t('marketPrices.showingPricesFor')} {currentState}
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {marketData.map((item, index) => (
            <div key={index} className="space-y-2">
              <div
                className={`flex items-center justify-between p-3 border rounded-lg transition-agricultural ${activeForecastCrop === item.crop
                    ? 'bg-primary/5 border-primary shadow-sm'
                    : 'border-border hover:bg-earth-light/50'
                  }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{translateCropName(item.crop, language)}</span>
                    <Badge variant="outline" className="text-xs">
                      {translateStateName(item.market, language)}
                    </Badge>
                    {crops && crops.some(userCrop =>
                      userCrop.toLowerCase().includes(item.crop.toLowerCase()) ||
                      item.crop.toLowerCase().includes(userCrop.toLowerCase())
                    ) && (
                        <Badge variant="default" className="text-xs">
                          {t('marketPrices.yourCrop')}
                        </Badge>
                      )}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {t('marketPrices.msp')}: ₹{item.msp.toLocaleString()}/quintal
                  </div>
                </div>

                <div className="text-right flex items-center gap-4">
                  <div>
                    <div className="flex items-center gap-1 justify-end">
                      <span className="font-semibold text-lg">
                        ₹{item.currentPrice.toLocaleString()}
                      </span>
                      {getTrendIcon(item.trend)}
                    </div>
                    <div className={`text-sm ${getTrendColor(item.trend)}`}>
                      {item.change}
                    </div>
                  </div>

                  <Button
                    variant={activeForecastCrop === item.crop ? "default" : "outline"}
                    size="sm"
                    className={`h-8 gap-1 ${activeForecastCrop === item.crop ? 'bg-gradient-to-r from-primary to-accent' : ''}`}
                    onClick={() => handleGetForecast(item.crop, item.currentPrice, item.trend)}
                  >
                    {activeForecastCrop === item.crop ? (
                      <X className="h-3 w-3" />
                    ) : (
                      <Sparkles className="h-3 w-3 text-yellow-500" />
                    )}
                    <span className="hidden sm:inline">Forecast</span>
                  </Button>
                </div>
              </div>

              {/* Forecast Overlay/Area */}
              {activeForecastCrop === item.crop && (
                <div className="bg-gradient-to-r from-green-50 to-blue-50 dark:from-green-950/20 dark:to-blue-950/20 rounded-lg p-4 border border-primary/20 animate-in slide-in-from-top-2 duration-300">
                  {isLoadingForecast ? (
                    <div className="flex items-center justify-center p-4 gap-2 text-primary">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span>Generating AI Forecast...</span>
                    </div>
                  ) : forecastData ? (
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                          <TrendingUp className="h-4 w-4" />
                          Price Forecast (7 Days)
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className={`text-2xl font-bold ${forecastData.direction === 'up' ? 'text-green-600' :
                              forecastData.direction === 'down' ? 'text-red-500' : 'text-yellow-600'
                            }`}>
                            {forecastData.expectedChange}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            Expected: {forecastData.expectedPriceRange}
                          </span>
                        </div>
                        <Badge variant={
                          forecastData.recommendation.action === 'wait' ? 'default' :
                            forecastData.recommendation.action === 'sell' ? 'destructive' : 'secondary'
                        } className="uppercase tracking-wider">
                          Advisor: {forecastData.recommendation.action}
                        </Badge>
                      </div>

                      <div className="bg-white/50 dark:bg-black/20 rounded p-3 text-sm">
                        <div className="flex items-start gap-2">
                          <Sparkles className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                          <div>
                            <p className="font-medium text-foreground mb-1">AI Recommendation:</p>
                            <p className="text-muted-foreground leading-relaxed">
                              "{forecastData.recommendation.aiAdvice}"
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center p-4 gap-2 text-destructive">
                      <AlertCircle className="h-4 w-4" />
                      <span>Forecast unavailable</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 p-3 bg-primary/10 rounded-lg">
          <p className="text-sm text-primary text-center">
            💡 <strong>{t('common.tip')}:</strong> {t('marketPrices.tipAboveMsp')}
          </p>
          {crops && crops.length > 0 && (
            <p className="text-xs text-muted-foreground text-center mt-1">
              {t('marketPrices.showingPersonalizedData')}: {crops.join(', ')}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Send, Image, Paperclip, Bot, User, Cloud, Thermometer, Droplets } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "@/lib/translations";

interface Message {
  id: string;
  content: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  type: 'text' | 'image' | 'weather';
  imageUrl?: string;
  weatherData?: any;
}

interface ChatInterfaceProps {
  language: string;
  farmerData?: {
    name: string;
    location: string;
    crops: string[];
    landSize?: number;
    landUnit?: string;
    latitude?: number;
    longitude?: number;
  };
}

// Weather-related keywords to detect weather queries
const weatherKeywords = {
  en: ['weather', 'temperature', 'rain', 'rainfall', 'humidity', 'wind', 'forecast', 'climate', 'sunny', 'cloudy', 'storm'],
  hi: ['मौसम', 'तापमान', 'बारिश', 'वर्षा', 'नमी', 'हवा', 'पूर्वानुमान', 'जलवायु', 'धूप', 'बादल'],
  ta: ['வானிலை', 'வெப்பநிலை', 'மழை', 'ஈரப்பதம்', 'காற்று', 'முன்னறிவிப்பு', 'தட்பவெப்ப நிலை']
};

// Mock AI responses for demo
const mockResponses = {
  en: [
    "Hello! I'm your agricultural assistant. How can I help you today?",
    "Based on your location and crop, I recommend checking the soil moisture levels.",
    "For better yield, consider organic fertilizers during this season.",
    "Weather conditions look favorable for sowing. Would you like specific timing recommendations?",
  ],
  hi: [
    "नमस्ते! मैं आपका कृषि सहायक हूँ। आज मैं आपकी कैसे मदद कर सकता हूँ?",
    "आपकी फसल के लिए मिट्टी की नमी की जांच करना अच्छ�� होगा।",
    "बेहतर पैदावार के लिए जैविक खाद का उपयोग करें।",
  ],
  ta: [
    "வணக்கம்! நான் உங்கள் விவசாய உதவியாளர். இன்று நான் உங்களுக்கு எப்படி உதவ முடியும்?",
    "உங்கள் பயிருக்கு மண்ணின் ஈரப்பதத்தை சரிபார்ப்பது நல்லது.",
  ],
};

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ language, farmerData }) => {
  const { toast } = useToast();
  const t = useTranslation(language);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: mockResponses[language as keyof typeof mockResponses]?.[0] || mockResponses.en[0],
      sender: 'bot',
      timestamp: new Date(),
      type: 'text',
    },
  ]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check if message contains weather-related keywords
  const containsWeatherKeyword = (message: string): boolean => {
    const keywords = weatherKeywords[language as keyof typeof weatherKeywords] || weatherKeywords.en;
    const lowerMessage = message.toLowerCase();
    return keywords.some(keyword => lowerMessage.includes(keyword.toLowerCase()));
  };

  // Fetch weather data
  const fetchWeatherData = async (): Promise<any> => {
    if (!farmerData?.latitude || !farmerData?.longitude) {
      throw new Error('Location coordinates not available');
    }

    const { data, error } = await supabase.functions.invoke('weather-data', {
      body: {
        latitude: farmerData.latitude,
        longitude: farmerData.longitude,
      },
    });

    if (error) {
      throw error;
    }

    return data.weather;
  };

  // Render weather data in a formatted way
  const renderWeatherData = (weatherData: any) => {
    if (!weatherData) return null;

    const { current, forecast } = weatherData;

    return (
      <div className="bg-gradient-to-br from-blue-50 to-green-50 dark:from-blue-900/20 dark:to-green-900/20 p-4 rounded-lg space-y-4">
        <div className="flex items-center gap-2 text-lg font-semibold">
          <Cloud className="h-5 w-5 text-blue-500" />
          {t('weather.currentWeather')} - {current.location}
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <Thermometer className="h-4 w-4 text-red-500" />
            <span className="text-sm">{t('weather.temperature')}: {current.temperature}°C</span>
          </div>
          <div className="flex items-center gap-2">
            <Droplets className="h-4 w-4 text-blue-500" />
            <span className="text-sm">{t('weather.humidity')}: {current.humidity}%</span>
          </div>
          <div className="flex items-center gap-2">
            <Cloud className="h-4 w-4 text-gray-500" />
            <span className="text-sm">{t('weather.condition')}: {current.condition}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm">{t('weather.windSpeed')}: {current.windSpeed} km/h</span>
          </div>
        </div>

        {current.rainfall > 0 && (
          <div className="bg-blue-100 dark:bg-blue-900/30 p-2 rounded text-sm">
            🌧️ {t('weather.precipitation')}: {current.rainfall}mm
          </div>
        )}

        {forecast && (
          <div>
            <h4 className="font-medium mb-2">{t('weather.forecast')}</h4>
            <div className="grid grid-cols-7 gap-1 text-xs">
              {forecast.labels.map((day: string, index: number) => (
                <div key={index} className="text-center bg-white/50 dark:bg-black/20 p-2 rounded">
                  <div className="font-medium">{day}</div>
                  <div>{forecast.temperature[index]}°C</div>
                  <div className="text-blue-500">{forecast.humidity[index]}%</div>
                  {forecast.rainfall[index] > 0 && (
                    <div className="text-blue-600">{forecast.rainfall[index]}mm</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderBotMessage = (text: string, weatherData?: any) => {
    // Very lightweight markdown-ish rendering: **bold**, - bullets, newlines
    // 1) Split into lines to detect bullet blocks
    const lines = text.split(/\n/);
    const blocks: JSX.Element[] = [];
    let currentList: string[] = [];

    const flushList = () => {
      if (currentList.length > 0) {
        blocks.push(
          <ul key={`ul-${blocks.length}`} className="list-disc pl-4 space-y-2">
            {currentList.map((li, idx) => (
              <li key={idx} dangerouslySetInnerHTML={{
                __html: li
                  .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
              }} />
            ))}
          </ul>
        );
        currentList = [];
      }
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const item = trimmed.replace(/^[-*]\s+/, '');
        currentList.push(item);
      } else if (trimmed === '') {
        flushList();
        blocks.push(<div key={`sp-${blocks.length}`} className="h-2" />);
      } else {
        flushList();
        blocks.push(
          <p key={`p-${blocks.length}`} className="mb-2" dangerouslySetInnerHTML={{
            __html: trimmed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          }} />
        );
      }
    }
    flushList();
    
    return (
      <div className="space-y-3">
        <div className="space-y-1">{blocks}</div>
        {weatherData && renderWeatherData(weatherData)}
      </div>
    );
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast({
        title: t('common.error'),
        description: "Please upload a valid image file.",
        variant: "destructive",
      });
      return;
    }

    // Check file size (limit to 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: t('common.error'),
        description: "Image size should be less than 5MB.",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingImage(true);

    try {
      // Create a preview URL for the user message
      const imageUrl = URL.createObjectURL(file);
      
      // Add user message with image
      const userMessage: Message = {
        id: Date.now().toString(),
        content: "Uploaded an image",
        sender: 'user',
        timestamp: new Date(),
        type: 'image',
        imageUrl: imageUrl,
      };

      setMessages(prev => [...prev, userMessage]);
      setIsLoading(true);

      // Try Hugging Face API first, then fallback to intelligent analysis
      const hfApiKey = import.meta.env.VITE_HUGGINGFACE_API_KEY;
      let analysisResult = `**Image Analysis:** Agricultural image received for analysis`;
      
      if (hfApiKey && hfApiKey !== "hf_your_api_key_here") {
        try {
          // Convert file to blob using proper async approach
          const imageBlob = file;

          // Try Hugging Face models with proper error handling
          // Using Google ViT, Facebook DETR, and Crop Disease Detection models
          const models = [
            {
              name: "google/vit-base-patch16-224",
              url: "https://api-inference.huggingface.co/models/google/vit-base-patch16-224",
              type: "classification"
            },
            {
              name: "facebook/detr-resnet-50",
              url: "https://api-inference.huggingface.co/models/facebook/detr-resnet-50",
              type: "object-detection"
            },
            {
              name: "wambugu71/crop_leaf_diseases_vit",
              url: "https://api-inference.huggingface.co/models/wambugu71/crop_leaf_diseases_vit",
              type: "disease-detection"
            }
          ];

          let analysisResults = {
            classification: null,
            objectDetection: null,
            diseaseDetection: null
          };
          let modelUsed = [];
          
          // Process all models
          for (const model of models) {
            try {
              console.log(`Trying model: ${model.name}`);
              
              const response = await fetch(model.url, {
                headers: { 
                  Authorization: `Bearer ${hfApiKey}`,
                  "Content-Type": "application/octet-stream"
                },
                method: "POST",
                body: imageBlob,
              });

              if (response.ok) {
                const result = await response.json();
                console.log(`Response from ${model.name}:`, result);
                
                if (model.type === "classification" && Array.isArray(result)) {
                  // Handle ViT classification results
                  const topClass = result[0];
                  if (topClass?.label) {
                    const confidence = (topClass.score * 100).toFixed(1);
                    analysisResults.classification = {
                      label: topClass.label,
                      confidence: confidence,
                      allResults: result.slice(0, 3)
                    };
                    modelUsed.push(model.name);
                  }
                } else if (model.type === "object-detection" && Array.isArray(result)) {
                  // Handle DETR object detection results
                  if (result.length > 0) {
                    const objects = result
                      .filter(obj => obj.score > 0.3) // Filter low confidence detections
                      .slice(0, 3);
                    
                    if (objects.length > 0) {
                      analysisResults.objectDetection = {
                        objects: objects,
                        summary: objects.map(obj => `${obj.label} (${(obj.score * 100).toFixed(1)}%)`).join(', ')
                      };
                      modelUsed.push(model.name);
                    }
                  }
                } else if (model.type === "disease-detection" && Array.isArray(result)) {
                  // Handle crop disease detection results
                  const topDisease = result[0];
                  if (topDisease?.label) {
                    const confidence = (topDisease.score * 100).toFixed(1);
                    analysisResults.diseaseDetection = {
                      disease: topDisease.label,
                      confidence: confidence,
                      allResults: result.slice(0, 3)
                    };
                    modelUsed.push(model.name);
                  }
                }
              } else {
                const errorText = await response.text();
                console.log(`Model ${model.name} failed with status ${response.status}:`, errorText);
              }
            } catch (error) {
              console.log(`Model ${model.name} failed with error:`, error);
              continue;
            }
          }

          // Create comprehensive analysis summary for Mistral AI
          let huggingFaceAnalysis = "Hugging Face Model Analysis Results:\n\n";
          
          if (analysisResults.classification) {
            huggingFaceAnalysis += `1. Image Classification (Google ViT):\n`;
            huggingFaceAnalysis += `   - Primary classification: ${analysisResults.classification.label} (${analysisResults.classification.confidence}% confidence)\n`;
            if (analysisResults.classification.allResults.length > 1) {
              huggingFaceAnalysis += `   - Alternative classifications: ${analysisResults.classification.allResults.slice(1).map(r => `${r.label} (${(r.score * 100).toFixed(1)}%)`).join(', ')}\n`;
            }
            huggingFaceAnalysis += "\n";
          }
          
          if (analysisResults.objectDetection) {
            huggingFaceAnalysis += `2. Object Detection (Facebook DETR):\n`;
            huggingFaceAnalysis += `   - Objects found: ${analysisResults.objectDetection.summary}\n\n`;
          }
          
          if (analysisResults.diseaseDetection) {
            huggingFaceAnalysis += `3. Crop Disease Detection (Specialized Agricultural Model):\n`;
            huggingFaceAnalysis += `   - Disease identified: ${analysisResults.diseaseDetection.disease} (${analysisResults.diseaseDetection.confidence}% confidence)\n`;
            if (analysisResults.diseaseDetection.allResults.length > 1) {
              huggingFaceAnalysis += `   - Other possibilities: ${analysisResults.diseaseDetection.allResults.slice(1).map(r => `${r.label} (${(r.score * 100).toFixed(1)}%)`).join(', ')}\n`;
            }
            huggingFaceAnalysis += "\n";
          }

          // If we have any results, send to Mistral AI for comprehensive analysis
          if (modelUsed.length > 0) {
            console.log(`Successfully used models: ${modelUsed.join(', ')}`);
            
            try {
              // Call Mistral AI for comprehensive agricultural analysis
              const mistralApiKey = import.meta.env.VITE_MISTRAL_API_KEY;
              
              if (mistralApiKey) {
                const mistralPrompt = `${huggingFaceAnalysis}

Farmer Context:
- Location: ${farmerData?.location || 'Unknown'}
- Crops grown: ${farmerData?.crops?.join(', ') || 'Unknown'}
- Land size: ${farmerData?.landSize || 'Unknown'} ${farmerData?.landUnit || ''}

Based on the above AI model analysis results, provide comprehensive agricultural advice in ${language === 'hi' ? 'Hindi' : language === 'ta' ? 'Tamil' : 'English'}. Include:

1. Summary of what the AI models detected
2. Specific agricultural recommendations based on the findings
3. If diseases were detected, provide treatment suggestions
4. Preventive measures for the farmer
5. Next steps and monitoring advice

Keep the response practical, actionable, and under 300 words.`;

                const mistralResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${mistralApiKey}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    model: 'mistral-small',
                    messages: [
                      { role: 'system', content: 'You are an expert agricultural advisor specializing in crop health and disease management.' },
                      { role: 'user', content: mistralPrompt }
                    ],
                    max_tokens: 400,
                    temperature: 0.3,
                  }),
                });

                if (mistralResponse.ok) {
                  const mistralResult = await mistralResponse.json();
                  const comprehensiveAnalysis = mistralResult.choices?.[0]?.message?.content || '';
                  
                  if (comprehensiveAnalysis) {
                    analysisResult = `**AI-Powered Agricultural Analysis:**\n\n${comprehensiveAnalysis}`;
                  } else {
                    // Fallback to basic analysis
                    analysisResult = `**Image Analysis Results:**\n\n${huggingFaceAnalysis}`;
                  }
                } else {
                  // Fallback to basic analysis if Mistral fails
                  analysisResult = `**Image Analysis Results:**\n\n${huggingFaceAnalysis}`;
                }
              } else {
                // No Mistral API key, use basic analysis
                analysisResult = `**Image Analysis Results:**\n\n${huggingFaceAnalysis}`;
              }
            } catch (mistralError) {
              console.error('Mistral AI error:', mistralError);
              // Fallback to basic analysis
              analysisResult = `**Image Analysis Results:**\n\n${huggingFaceAnalysis}`;
            }
          } else {
            console.log('All models failed, using fallback');
            analysisResult = `**Image Analysis:** Agricultural image received (API analysis unavailable)`;
          }
          
        } catch (error) {
          console.error('HF API error:', error);
        }
      }
      
      // Generate contextual advice
      function generateAdviceAndRespond() {
        // Smart recommendations based on farmer context
        let specificAdvice = "";
        
        if (farmerData?.crops && farmerData.crops.length > 0) {
          const cropList = farmerData.crops.join(', ');
          specificAdvice = language === 'hi' ? 
            `**${cropList} के लिए सुझाव:**\n- फसल की वर्तमान अवस्था की जांच करें\n- पत्तियों में रोग के लक्��ण देखें\n- मिट्टी की नमी और पोषण जांचें\n- कीट-पतंगों की निगरानी करें\n- स्थानीय मौसम के अनुसार सिंचाई करें` :
            language === 'ta' ?
            `**${cropList} க்கான ஆலோசனைகள்:**\n- பயிரின் தற்போதைய நிலையை சரிபார்க்கவும்\n- இலைகளில் நோய் அறிகுறிகளை கவனிக்கவும்\n- மண்ணின் ஈரப்பதம் மற்றும் ஊட்டச்சத்தை சரிபார்க்கவும்\n- பூச்சிகளை கண்காணிக்கவும்\n- உள்ளூர் வானிலைக்கு ஏற்ப நீர்ப்பாசனம் செய்யவும்` :
            `**Recommendations for ${cropList}:**\n- Check current crop stage and health\n- Look for disease symptoms on leaves\n- Monitor soil moisture and nutrition\n- Watch for pest activity\n- Irrigate according to local weather`;
        } else {
          specificAdvice = language === 'hi' ? 
            "**सामान्य कृषि सुझाव:**\n- नियमित फसल निरीक्षण करें\n- मिट्टी की गुणवत्ता बनाए रखें\n- उचित सिंचाई व्यवस्था करें\n- जैविक खाद का उपयोग क��ें\n- स्थानीय कृषि विशेषज्ञ से सलाह लें" :
            language === 'ta' ?
            "**பொதுவான விவசாய ஆலோசனைகள்:**\n- தொடர்ந்து பயிர் ஆய்வு செய்யவும்\n- மண்ணின் தரத்தை பராமரிக்கவும்\n- சரியான நீர்ப்பாசனம் செய்யவும்\n- இயற்கை உரம் பயன்படுத்தவும்\n- உள்ளூர் விவசாய நிபுணரை அணுகவும்" :
            "**General Agricultural Advice:**\n- Conduct regular crop inspections\n- Maintain soil quality\n- Ensure proper irrigation\n- Use organic fertilizers\n- Consult local agricultural experts";
        }
        
        analysisResult += `\n\n${specificAdvice}`;
        
        // Add location-specific advice if available
        if (farmerData?.location) {
          const locationAdvice = language === 'hi' ? 
            `\n\n**${farmerData.location} के लिए विशेष सुझाव:**\n- स्थानीय मौसम पैटर्न का ध्यान रखें\n- क्षेत्रीय कृषि अधिकारियों से संपर्क करें\n- स्था��ीय बाजार की कीमतों की जानकारी रखें` :
            language === 'ta' ?
            `\n\n**${farmerData.location} க்கான சிறப்பு ஆலோசனைகள்:**\n- உள்ளூர் வானிலை முறைகளை கவனிக்கவும்\n- பிராந்திய விவசாய அதிகாரிகளை தொடர்பு கொள்ளவும்\n- உள்ளூர் சந்தை விலைகளை அறிந்து கொள்ளவும்` :
            `\n\n**Specific advice for ${farmerData.location}:**\n- Consider local weather patterns\n- Contact regional agricultural officers\n- Stay updated on local market prices`;
          
          analysisResult += locationAdvice;
        }

        // Add note about AI analysis
        const aiNote = language === 'hi' ? 
          `\n\n*नोट: यह AI-आधारित सामान्य सुझाव है। विशिष्ट समस्याओं के लिए स्थानीय कृषि विशेषज्ञ से सलाह लें।*` :
          language === 'ta' ?
          `\n\n*குறிப்பு: இது AI-அடிப்படையிலான பொத��வான ஆலோசனை. குறிப்பிட்ட பிரச்சினைகளுக்கு உள்ளூர் விவசாய நிபுணரை அணுகவும்.*` :
          `\n\n*Note: This is AI-based general advice. For specific issues, please consult local agricultural experts.*`;
        
        analysisResult += aiNote;

        const botMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: analysisResult,
          sender: 'bot',
          timestamp: new Date(),
          type: 'text',
        };

        setMessages(prev => [...prev, botMessage]);
        setIsLoading(false);
      }
      
    } catch (error) {
      console.error('File processing error:', error);
      toast({
        title: t('common.error'),
        description: "Failed to process the image.",
        variant: "destructive",
      });
      setIsLoading(false);
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleImageUpload(file);
    }
    // Reset the input value so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: newMessage,
      sender: 'user',
      timestamp: new Date(),
      type: 'text',
    };

    setMessages(prev => [...prev, userMessage]);
    const currentMessage = newMessage;
    setNewMessage('');
    setIsLoading(true);

    try {
      let weatherData = null;
      
      // Check if the message is weather-related
      if (containsWeatherKeyword(currentMessage)) {
        try {
          weatherData = await fetchWeatherData();
          console.log('Weather data fetched:', weatherData);
        } catch (weatherError) {
          console.error('Weather fetch error:', weatherError);
          // Continue without weather data
        }
      }

      // Build a short rolling history (last 6 messages, excluding images for now)
      const recentHistory = messages
        .filter(m => m.type === 'text') // Only include text messages in history
        .slice(-6)
        .map(m => ({
          role: m.sender === 'user' ? 'user' : 'assistant',
          content: m.content
        }));

      // Enhanced prompt for weather-related queries
      let enhancedMessage = currentMessage;
      if (weatherData) {
        const weatherContext = `Current weather in ${farmerData?.location || 'your location'}: 
        Temperature: ${weatherData.current.temperature}°C, 
        Humidity: ${weatherData.current.humidity}%, 
        Condition: ${weatherData.current.condition}, 
        Wind Speed: ${weatherData.current.windSpeed} km/h
        ${weatherData.current.rainfall > 0 ? `, Rainfall: ${weatherData.current.rainfall}mm` : ''}
        
        User's question: ${currentMessage}`;
        
        enhancedMessage = weatherContext;
      }

      // Call Mistral AI directly
      const mistralApiKey = import.meta.env.VITE_MISTRAL_API_KEY;
      
      if (!mistralApiKey) {
        throw new Error('Mistral API key not configured');
      }

      // Create system prompt
      const systemPrompt = `You are Krishi AI, an expert agricultural assistant for India.

      Farmer profile (use to personalize):
      - Name: ${farmerData?.name || 'Unknown'}
      - Location: ${farmerData?.location || 'Unknown'}
      - Crops: ${farmerData?.crops?.join(', ') || 'Unknown'}
      - Land size: ${farmerData?.landSize || 'Unknown'} ${farmerData?.landUnit || ''}

      Response rules:
      - Language: ${language === 'hi' ? 'Hindi' : language === 'ta' ? 'Tamil' : 'English'}
      - Start with a one-line summary tailored to the farmer
      - Then give 4–6 short bullet points, each actionable and location-aware
      - Bold key crop names like **Rice**, **Sugarcane**, etc.
      - Include specific next step(s) and quantities if relevant
      - If critical info is missing (e.g., season, irrigation), ask up to 2 targeted questions at the end
      - Keep the entire answer under 180 words
      - Avoid generic textbook explanations; prioritize practical, local guidance for ${farmerData?.location || 'their area'}`;

      // Build messages for Mistral API
      const apiMessages = [
        { role: 'system', content: systemPrompt },
        ...recentHistory,
        { role: 'user', content: enhancedMessage }
      ];

      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${mistralApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'mistral-small',
          messages: apiMessages,
          max_tokens: 250,
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Mistral API error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      const assistantResponse = result.choices?.[0]?.message?.content || 'Sorry, I could not generate a response.';

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: assistantResponse,
        sender: 'bot',
        timestamp: new Date(),
        type: weatherData ? 'weather' : 'text',
        weatherData: weatherData,
      };

      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      toast({
        title: t('common.error'),
        description: t('chat.error'),
        variant: "destructive",
      });
      
      // Fallback to mock response with weather data if available
      const responses = mockResponses[language as keyof typeof mockResponses] || mockResponses.en;
      let fallbackResponse = responses[Math.floor(Math.random() * responses.length)];
      
      // If it was a weather query, try to provide weather data even in fallback
      let weatherData = null;
      if (containsWeatherKeyword(currentMessage)) {
        try {
          weatherData = await fetchWeatherData();
          fallbackResponse = language === 'hi' ? 
            "यहाँ आपके क्षेत्र का मौसम डेटा है। कृषि कार्य की योजना बनाने के लिए इसका उपयोग करें।" :
            language === 'ta' ?
            "இங்கே உங்கள் பகுதியின் வானிலை தரவு உள்ளது. விவசாய நடவடிக்கைகளை திட்டமிட இதைப் பயன்படுத்தவும்." :
            "Here's the weather data for your area. Use this to plan your agricultural activities.";
        } catch (weatherError) {
          console.error('Weather fallback error:', weatherError);
        }
      }
      
      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `⚠️ ${fallbackResponse} (Offline mode)`,
        sender: 'bot',
        timestamp: new Date(),
        type: weatherData ? 'weather' : 'text',
        weatherData: weatherData,
      };

      setMessages(prev => [...prev, botMessage]);
    } finally {
      setIsLoading(false);
    }
  };


  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <Card className="h-[600px] flex flex-col shadow-agricultural bg-card">
      <CardHeader className="bg-card border-b border-border">
        <CardTitle className="flex items-center gap-2 text-primary">
          <Bot className="h-5 w-5" />
          {t('chat.title')}
          <Cloud className="h-4 w-4 text-blue-500 ml-auto" title="Weather-enabled" />
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col p-0 bg-card">
        {/* Messages Area */}
        <ScrollArea className="flex-1 p-4 bg-card">
          <div className="space-y-4 min-h-full">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${
                  message.sender === 'user' ? 'justify-end' : 'justify-start'
                }`}
              >
                {message.sender === 'bot' && (
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary text-primary-foreground">
                      <Bot className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                )}
                
                <div
                  className={`max-w-[75%] rounded-lg px-3 py-2 ${
                    message.sender === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card text-foreground border border-border shadow-sm'
                  }`}
                >
                  <div className="text-sm">
                    {message.type === 'image' && message.imageUrl ? (
                      <div className="space-y-2">
                        <img 
                          src={message.imageUrl} 
                          alt="Uploaded image" 
                          className="max-w-full h-auto rounded-md max-h-48 object-contain"
                        />
                        <p className="text-xs opacity-75">{t('chat.imageUploaded')}</p>
                      </div>
                    ) : message.sender === 'bot' ? (
                      renderBotMessage(message.content, message.weatherData)
                    ) : (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    )}
                  </div>
                  <span className="text-xs opacity-70 mt-1 block">
                    {message.timestamp.toLocaleTimeString([], { 
                      hour: '2-digit', 
                      minute: '2-digit' 
                    })}
                  </span>
                </div>
                
                {message.sender === 'user' && (
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-accent text-accent-foreground">
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))}
            
            {(isLoading || isUploadingImage) && (
              <div className="flex gap-3 justify-start">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary text-primary-foreground">
                    <Bot className="h-4 w-4" />
                  </AvatarFallback>
                </Avatar>
                <div className="bg-card text-foreground border border-border rounded-lg px-3 py-2 shadow-sm">
                  <div className="flex gap-1 items-center">
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce delay-100"></div>
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce delay-200"></div>
                    {isUploadingImage && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {t('chat.analyzingImage')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t border-border p-4 bg-card">
          <div className="flex gap-2">
            <div className="flex-1 flex gap-2">
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={t('chat.placeholder') + ' (' + t('chat.tryWeather') + ')'}
                className="flex-1"
                disabled={isLoading || isUploadingImage}
              />
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/*"
                style={{ display: 'none' }}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading || isUploadingImage}
                title="Upload image"
              >
                <Image className="h-4 w-4" />
              </Button>
            </div>
            <Button
              onClick={handleSendMessage}
              disabled={!newMessage.trim() || isLoading || isUploadingImage}
              className="px-6"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
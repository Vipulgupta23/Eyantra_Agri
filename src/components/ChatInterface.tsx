import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Send, Image, Bot, User, Cloud, Thermometer, Droplets, Mic, MicOff, Volume2, StopCircle } from 'lucide-react';
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

// Personalized greeting based on language and farmer name
const getWelcomeMessage = (language: string, farmerName?: string): string => {
  const name = farmerName || 'Farmer';
  switch (language) {
    case 'hi':
      return `नमस्ते ${name} जी! 🙏 मैं कृषि सहायक AI हूँ। आपकी फसलों और खेती से जुड़े किसी भी सवाल का जवाब देने के लिए तैयार हूँ। आप मुझसे हिंदी में बात कर सकते हैं!`;
    case 'ta':
      return `வணக்கம் ${name}! 🙏 நான் கிருஷி சகாயக் AI. உங்கள் பயிர்கள் மற்றும் விவசாயம் தொடர்பான எந்த கேள்விக்கும் பதிலளிக்க தயாராக இருக்கிறேன்!`;
    default:
      return `Hello ${name}! 🙏 I'm Krishi Sahayak AI, your personal farming assistant. I'm ready to help with questions about your crops, diseases, weather, and farming practices. Feel free to ask me anything or upload images of your crops!`;
  }
};

export const ChatInterface: React.FC<ChatInterfaceProps> = ({ language, farmerData }) => {
  const { toast } = useToast();
  const t = useTranslation(language);

  // Initialize with personalized welcome message
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: getWelcomeMessage(language, farmerData?.name),
      sender: 'bot',
      timestamp: new Date(),
      type: 'text',
    },
  ]);
  const [newMessage, setNewMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [chatHistory, setChatHistory] = useState<Array<{ role: string, content: string }>>([]);

  // Voice State
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis>(window.speechSynthesis);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Cleanup speech synthesis on unmount
  useEffect(() => {
    return () => {
      if (synthRef.current) {
        synthRef.current.cancel();
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  // Initialize Speech Recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setNewMessage(transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);

        let errorMessage = "Could not hear you. Please try again.";
        let errorTitle = "Voice Input Error";

        if (event.error === 'not-allowed') {
          errorTitle = "Microphone Permission Denied";
          errorMessage = "Please allow microphone access in your browser settings to use voice features.";
        } else if (event.error === 'no-speech') {
          errorTitle = "No Speech Detected";
          errorMessage = "I didn't hear anything. Please try speaking again.";
        } else if (event.error === 'network') {
          errorTitle = "Network Error";
          errorMessage = "Voice recognition requires an internet connection.";
        }

        toast({
          title: errorTitle,
          description: errorMessage,
          variant: "destructive"
        });
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }
  }, []);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      toast({
        title: "Not Supported",
        description: "Voice input is not supported in this browser.",
        variant: "destructive"
      });
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      // Set language based on current app language
      let langCode = 'en-IN';
      if (language === 'hi') langCode = 'hi-IN';
      else if (language === 'ta') langCode = 'ta-IN';

      recognitionRef.current.lang = langCode;
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {
        console.error("Mic start error:", e);
      }
    }
  };

  const handleSpeak = (text: string) => {
    if (isSpeaking) {
      synthRef.current.cancel();
      setIsSpeaking(false);
      return;
    }

    // Clean text (remove markdown asterisks)
    const cleanText = text.replace(/\*\*/g, '').replace(/[\#\-\*]/g, '');

    const utterance = new SpeechSynthesisUtterance(cleanText);

    // Attempt to match language voice
    const voices = synthRef.current.getVoices();
    let langCode = 'en-IN';
    if (language === 'hi') langCode = 'hi-IN';
    else if (language === 'ta') langCode = 'ta-IN';

    // Try to find an exact locale match
    const voice = voices.find(v => v.lang.includes(langCode)) || voices.find(v => v.lang.includes(language));
    if (voice) {
      utterance.voice = voice;
    }

    utterance.lang = langCode;
    utterance.rate = 0.9; // Slightly slower for clarity

    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    setIsSpeaking(true);
    synthRef.current.speak(utterance);
  };

  // Check if message contains weather-related keywords
  const containsWeatherKeyword = (message: string): boolean => {
    const keywords = weatherKeywords[language as keyof typeof weatherKeywords] || weatherKeywords.en;
    const lowerMessage = message.toLowerCase();
    return keywords.some(keyword => lowerMessage.includes(keyword.toLowerCase()));
  };

  // Fetch weather data
  const fetchWeatherData = async (): Promise<any> => {
    if (!farmerData?.latitude || !farmerData?.longitude) {
      return null;
    }

    try {
      const { data, error } = await supabase.functions.invoke('weather-data', {
        body: {
          latitude: farmerData.latitude,
          longitude: farmerData.longitude,
        },
      });

      if (error) throw error;
      return data.weather;
    } catch (error) {
      console.error('Weather fetch error:', error);
      return null;
    }
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

  // Render bot message with markdown-like formatting
  const renderBotMessage = (text: string, weatherData?: any) => {
    const lines = text.split(/\n/);
    const blocks: JSX.Element[] = [];
    let currentList: string[] = [];

    const flushList = () => {
      if (currentList.length > 0) {
        blocks.push(
          <ul key={`ul-${blocks.length}`} className="list-disc pl-4 space-y-2">
            {currentList.map((li, idx) => (
              <li key={idx} dangerouslySetInnerHTML={{
                __html: li.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
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
        {/* Speak Button for Bot Messages */}
        <div className="flex justify-end pt-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-muted-foreground hover:text-primary"
            onClick={() => handleSpeak(text)}
            title="Read Aloud"
          >
            {isSpeaking ? <StopCircle className="h-3 w-3 mr-1" /> : <Volume2 className="h-3 w-3 mr-1" />}
            <span className="text-[10px]">
              {language === 'hi' ? 'सुने' : language === 'ta' ? 'கேளுங்கள்' : 'Listen'}
            </span>
          </Button>
        </div>
      </div>
    );
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // Convert file to base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        // Remove the data:image/xxx;base64, prefix
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  // Handle image upload - uses Supabase analyze-image function
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
    setIsLoading(true);

    try {
      // Create a preview URL for the user message
      const imageUrl = URL.createObjectURL(file);

      // Add user message with image
      const userMessage: Message = {
        id: Date.now().toString(),
        content: language === 'hi' ? "📷 छवि अपलोड की गई" : language === 'ta' ? "📷 படம் பதிவேற்றப்பட்டது" : "📷 Image uploaded for analysis",
        sender: 'user',
        timestamp: new Date(),
        type: 'image',
        imageUrl: imageUrl,
      };

      setMessages(prev => [...prev, userMessage]);

      // Convert image to base64
      const base64Image = await fileToBase64(file);

      // Call Supabase analyze-image function (uses Gemini)
      const { data, error } = await supabase.functions.invoke('analyze-image', {
        body: {
          image: base64Image,
          language: language,
          farmerData: farmerData,
        },
      });

      if (error) {
        throw error;
      }

      const analysisResult = data?.output || data?.error ||
        (language === 'hi' ? 'छवि का विश्लेषण नहीं हो सका।' :
          language === 'ta' ? 'படத்தை பகுப்பாய்வு செய்ய முடியவில்லை.' :
            'Could not analyze the image.');

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: analysisResult,
        sender: 'bot',
        timestamp: new Date(),
        type: 'text',
      };

      setMessages(prev => [...prev, botMessage]);

      // Add to chat history
      setChatHistory(prev => [
        ...prev,
        { role: 'user', content: 'Uploaded an image for analysis' },
        { role: 'assistant', content: analysisResult }
      ]);

    } catch (error) {
      console.error('Image analysis error:', error);
      toast({
        title: t('common.error'),
        description: language === 'hi' ? 'छवि का विश्लेषण करने में विफल।' :
          language === 'ta' ? 'படத்தை பகுப்பாய்வு செய்வதில் தோல்வி.' :
            'Failed to analyze the image. Please try again.',
        variant: "destructive",
      });

      // Add error message
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: language === 'hi' ? '⚠️ छवि का विश्लेषण करने में त्रुटि हुई। कृपया पुनः प्रयास करें।' :
          language === 'ta' ? '⚠️ படத்தை பகுப்பாய்வு செய்வதில் பிழை. மீண்டும் முயற்சிக்கவும்.' :
            '⚠️ Error analyzing image. Please try again.',
        sender: 'bot',
        timestamp: new Date(),
        type: 'text',
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsUploadingImage(false);
      setIsLoading(false);
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

  // Handle sending text message - uses Supabase chat-assistant function
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
        weatherData = await fetchWeatherData();
      }

      // Call Supabase chat-assistant function (uses Gemini with Mistral fallback)
      const { data, error } = await supabase.functions.invoke('chat-assistant', {
        body: {
          message: currentMessage,
          language: language,
          farmerData: farmerData,
          history: chatHistory.slice(-10), // Send last 10 messages for context
        },
      });

      if (error) {
        throw error;
      }

      const assistantResponse = data?.response ||
        (language === 'hi' ? 'क्षमा करें, जवाब देने में समस्या हुई।' :
          language === 'ta' ? 'மன்னிக்கவும், பதிலளிப்பதில் சிக்கல்.' :
            'Sorry, there was an issue generating a response.');

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: assistantResponse,
        sender: 'bot',
        timestamp: new Date(),
        type: weatherData ? 'weather' : 'text',
        weatherData: weatherData,
      };

      setMessages(prev => [...prev, botMessage]);

      // Update chat history for context
      setChatHistory(prev => [
        ...prev,
        { role: 'user', content: currentMessage },
        { role: 'assistant', content: assistantResponse }
      ]);

      // OPTIONAL: Auto-speak the response if user used voice?
      // For now, let's keep it manual to avoid annoyance.

    } catch (error) {
      console.error('Chat error:', error);
      toast({
        title: t('common.error'),
        description: t('chat.error'),
        variant: "destructive",
      });

      // Fallback message
      const fallbackMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: language === 'hi'
          ? `⚠️ नमस्ते ${farmerData?.name || 'किसान'} जी! AI सेवा अस्थायी रूप से व्यस्त है। कृपया कुछ समय बाद पुनः प्रयास करें।`
          : language === 'ta'
            ? `⚠️ வணக்கம் ${farmerData?.name || 'விவசாயி'}! AI சேவை தற்காலிகமாக பிஸியாக உள்ளது. மீண்டும் முயற்சிக்கவும்.`
            : `⚠️ Hello ${farmerData?.name || 'Farmer'}! The AI service is temporarily busy. Please try again in a moment.`,
        sender: 'bot',
        timestamp: new Date(),
        type: 'text',
      };

      setMessages(prev => [...prev, fallbackMessage]);
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
          <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
            <Cloud className="h-3 w-3 text-blue-500" />
            AI-Powered
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col p-0 bg-card">
        {/* Messages Area */}
        <ScrollArea className="flex-1 p-4 bg-card">
          <div className="space-y-4 min-h-full">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.sender === 'user' ? 'justify-end' : 'justify-start'
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
                  className={`max-w-[75%] rounded-lg px-3 py-2 ${message.sender === 'user'
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
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {isUploadingImage
                        ? (language === 'hi' ? 'छवि का विश्लेषण...' : language === 'ta' ? 'படத்தை பகுப்பாய்வு...' : 'Analyzing image...')
                        : (language === 'hi' ? 'सोच रहा हूँ...' : language === 'ta' ? 'சிந்திக்கிறேன்...' : 'Thinking...')}
                    </span>
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
            {/* Mic Button */}
            <Button
              variant={isListening ? "destructive" : "secondary"}
              size="icon"
              onClick={toggleListening}
              className={`shrink-0 ${isListening ? 'animate-pulse' : ''}`}
              title={isListening ? "Stop listening" : "Speak"}
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>

            <div className="flex-1 flex gap-2">
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={isListening ? (language === 'hi' ? 'सुन रहा हूँ...' : 'Listening...') : (t('chat.placeholder') + ' (' + t('chat.tryWeather') + ')')}
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
                title={language === 'hi' ? 'छवि अपलोड करें' : language === 'ta' ? 'படத்தைப் பதிவேற்றவும்' : 'Upload image'}
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
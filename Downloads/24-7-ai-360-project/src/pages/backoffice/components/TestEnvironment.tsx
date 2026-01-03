import React, { useState, useRef, useEffect } from 'react';
import { aiConfigStore } from '../../../utils/aiConfigStore';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export default function TestEnvironment() {
  const [activeTab, setActiveTab] = useState('chat');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isCallActive, setIsCallActive] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);

  // ✅ FILLER WORDS - Don't interrupt Sarah for these
  const FILLER_WORDS = ['sí', 'si', 'aha', 'ajá', 'ok', 'okay', 'hmm', 'mm', 'eh', 'ah', 'um', 'uh'];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    return () => {
      if (callTimerRef.current) {
        clearInterval(callTimerRef.current);
      }
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const sendChatMessage = async () => {
    if (!inputMessage.trim() || isSending) return;

    const config = aiConfigStore.getConfig();
    if (!config.openaiApiKey) {
      setError('OpenAI API key not configured');
      return;
    }

    const userMessage: Message = {
      role: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsSending(true);
    setError('');

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.openaiApiKey}`
        },
        body: JSON.stringify({
          model: config.model || 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: config.systemPrompt || 'You are Sarah, a helpful AI assistant for a solar panel company. Keep responses short and professional.'
            },
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: inputMessage }
          ],
          temperature: config.temperature || 0.7,
          max_tokens: config.maxTokens || 150
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const assistantMessage: Message = {
        role: 'assistant',
        content: data.choices[0].message.content,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err: any) {
      setError(err.message || 'Failed to send message');
      console.error('Chat error:', err);
    } finally {
      setIsSending(false);
    }
  };

  const startVoiceCall = () => {
    setIsCallActive(true);
    setCallDuration(0);
    setMessages([{
      role: 'assistant',
      content: 'Hello! I\'m Sarah from Solar Solutions. How can I help you today?',
      timestamp: new Date()
    }]);

    callTimerRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);

    speakText('Hello! I\'m Sarah from Solar Solutions. How can I help you today?');
  };

  const endVoiceCall = () => {
    setIsCallActive(false);
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsListening(false);
    setIsSpeaking(false);
    isPlayingRef.current = false;
    audioQueueRef.current = [];
  };

  // ✅ NEW: Check if text is only filler words
  const isOnlyFillerWords = (text: string): boolean => {
    if (!text || text.trim().length === 0) return true;
    const words = text.toLowerCase().trim().split(/\s+/);
    if (words.length > 3) return false; // More than 3 words = real speech
    return words.every(word => {
      const cleanWord = word.replace(/[.,!?;:]/g, '');
      return FILLER_WORDS.includes(cleanWord);
    });
  };

  const startListening = () => {
    // ✅ REMOVED: Don't stop Sarah when mic opens
    // Only stop if user says something meaningful (not filler words)

    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      setError('Speech recognition not supported in this browser');
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    recognitionRef.current = new SpeechRecognition();
    recognitionRef.current.continuous = false;
    recognitionRef.current.interimResults = true; // ✅ Enable interim results
    recognitionRef.current.lang = 'en-US';

    recognitionRef.current.onstart = () => {
      setIsListening(true);
      setError('');
      // ✅ DON'T stop Sarah here - let her finish speaking
    };

    recognitionRef.current.onresult = async (event: any) => {
      const result = event.results[event.results.length - 1];
      const transcript = result[0].transcript;
      const isFinal = result.isFinal;

      console.log(`🎤 ${isFinal ? 'FINAL' : 'INTERIM'}: "${transcript}"`);

      // ✅ Only process FINAL transcripts that are NOT filler words
      if (isFinal) {
        if (isOnlyFillerWords(transcript)) {
          console.log('🚫 Ignoring filler word:', transcript);
          return; // Don't interrupt Sarah for "sí", "aha", etc.
        }

        // ✅ Real speech detected - NOW we can interrupt Sarah
        if (isSpeaking && 'speechSynthesis' in window) {
          console.log('🛑 Real speech detected - interrupting Sarah');
          window.speechSynthesis.cancel();
          setIsSpeaking(false);
          isPlayingRef.current = false;
        }

        const userMessage: Message = {
          role: 'user',
          content: transcript,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, userMessage]);

        await processVoiceInput(transcript);
      }
    };

    recognitionRef.current.onerror = (event: any) => {
      setError(`Speech recognition error: ${event.error}`);
      setIsListening(false);
    };

    recognitionRef.current.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current.start();
  };

  const processVoiceInput = async (text: string) => {
    const config = aiConfigStore.getConfig();
    if (!config.openaiApiKey) {
      setError('OpenAI API key not configured');
      return;
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.openaiApiKey}`
        },
        body: JSON.stringify({
          model: config.model || 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: config.systemPrompt || 'You are Sarah, a helpful AI assistant. Keep responses very short (under 30 words) for voice conversations.'
            },
            ...messages.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: text }
          ],
          temperature: config.temperature || 0.7,
          max_tokens: 100
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const assistantMessage: Message = {
        role: 'assistant',
        content: data.choices[0].message.content,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
      await speakText(assistantMessage.content);
    } catch (err: any) {
      setError(err.message || 'Failed to process voice input');
      console.error('Voice processing error:', err);
    }
  };

  // ✅ IMPROVED: Better TTS with proper queueing
  const speakText = async (text: string) => {
    if ('speechSynthesis' in window) {
      // ✅ Don't cancel if already speaking - queue it instead
      setIsSpeaking(true);
      isPlayingRef.current = true;

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      
      utterance.onstart = () => {
        console.log('🎙️ Sarah started speaking');
      };

      utterance.onend = () => {
        console.log('✅ Sarah finished speaking');
        setIsSpeaking(false);
        isPlayingRef.current = false;
      };

      utterance.onerror = (event) => {
        console.error('❌ TTS error:', event);
        setIsSpeaking(false);
        isPlayingRef.current = false;
      };

      // ✅ Ensure audio context is active (for iOS/Safari)
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      window.speechSynthesis.speak(utterance);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-white rounded-lg shadow-sm">
      <div className="border-b border-gray-200">
        <div className="flex space-x-1 p-4">
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-6 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
              activeTab === 'chat'
                ? 'bg-teal-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <i className="ri-message-3-line mr-2"></i>
            Chat Test
          </button>
          <button
            onClick={() => setActiveTab('voice')}
            className={`px-6 py-2 rounded-lg font-medium transition-colors whitespace-nowrap ${
              activeTab === 'voice'
                ? 'bg-teal-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <i className="ri-phone-line mr-2"></i>
            Voice Test
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          <i className="ri-error-warning-line mr-2"></i>
          {error}
        </div>
      )}

      {activeTab === 'chat' && (
        <div className="p-4">
          <div className="bg-gray-50 rounded-lg h-96 overflow-y-auto p-4 mb-4">
            {messages.length === 0 ? (
              <div className="text-center text-gray-400 mt-20">
                <i className="ri-chat-3-line text-4xl mb-2"></i>
                <p>Start a conversation with Sarah</p>
              </div>
            ) : (
              <>
                {messages.map((msg, index) => (
                  <div
                    key={index}
                    className={`mb-4 flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                        msg.role === 'user'
                          ? 'bg-teal-600 text-white'
                          : 'bg-white border border-gray-200 text-gray-800'
                      }`}
                    >
                      <p className="text-sm">{msg.content}</p>
                      <p className={`text-xs mt-1 ${msg.role === 'user' ? 'text-teal-100' : 'text-gray-400'}`}>
                        {msg.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          <div className="flex space-x-2">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && sendChatMessage()}
              placeholder="Type your message..."
              disabled={isSending}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-100"
            />
            <button
              onClick={sendChatMessage}
              disabled={isSending || !inputMessage.trim()}
              className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              {isSending ? (
                <>
                  <i className="ri-loader-4-line animate-spin mr-2"></i>
                  Sending...
                </>
              ) : (
                <>
                  <i className="ri-send-plane-fill mr-2"></i>
                  Send
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'voice' && (
        <div className="p-8">
          <div className="max-w-md mx-auto text-center">
            {!isCallActive ? (
              <div>
                <div className="mb-8">
                  <div className="w-32 h-32 mx-auto bg-teal-100 rounded-full flex items-center justify-center mb-4">
                    <i className="ri-phone-line text-6xl text-teal-600"></i>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-800 mb-2">Test Voice Call</h3>
                  <p className="text-gray-600">Start a voice conversation with Sarah</p>
                </div>
                <button
                  onClick={startVoiceCall}
                  className="px-8 py-3 bg-teal-600 text-white rounded-full hover:bg-teal-700 transition-colors whitespace-nowrap"
                >
                  <i className="ri-phone-fill mr-2"></i>
                  Start Call
                </button>
              </div>
            ) : (
              <div>
                <div className="mb-8">
                  <div className={`w-32 h-32 mx-auto rounded-full flex items-center justify-center mb-4 ${
                    isSpeaking ? 'bg-teal-600 animate-pulse' : 'bg-teal-100'
                  }`}>
                    <i className={`ri-phone-line text-6xl ${isSpeaking ? 'text-white' : 'text-teal-600'}`}></i>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-800 mb-2">Call Active</h3>
                  <p className="text-2xl font-mono text-teal-600 mb-4">{formatTime(callDuration)}</p>
                  {isSpeaking && (
                    <p className="text-sm text-gray-600 mb-4">
                      <i className="ri-volume-up-line mr-1"></i>
                      Sarah is speaking...
                    </p>
                  )}
                  {isListening && (
                    <p className="text-sm text-teal-600 mb-4 font-medium">
                      <i className="ri-mic-line mr-1 animate-pulse"></i>
                      Listening to you...
                    </p>
                  )}
                </div>

                <div className="bg-gray-50 rounded-lg p-4 mb-6 max-h-48 overflow-y-auto">
                  {messages.map((msg, index) => (
                    <div key={index} className="mb-2 text-left">
                      <span className={`font-semibold ${msg.role === 'user' ? 'text-teal-600' : 'text-gray-800'}`}>
                        {msg.role === 'user' ? 'You' : 'Sarah'}:
                      </span>
                      <span className="ml-2 text-gray-700">{msg.content}</span>
                    </div>
                  ))}
                </div>

                <div className="flex justify-center space-x-4">
                  <button
                    onClick={isListening ? () => recognitionRef.current?.stop() : startListening}
                    className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                      isListening
                        ? 'bg-red-600 hover:bg-red-700 animate-pulse'
                        : 'bg-teal-600 hover:bg-teal-700'
                    } text-white`}
                  >
                    <i className={`text-2xl ${isListening ? 'ri-stop-circle-line' : 'ri-mic-line'}`}></i>
                  </button>
                  <button
                    onClick={endVoiceCall}
                    className="w-16 h-16 bg-red-600 hover:bg-red-700 text-white rounded-full flex items-center justify-center transition-colors"
                  >
                    <i className="ri-phone-line text-2xl"></i>
                  </button>
                </div>
                <p className="text-sm text-gray-600 mt-4">
                  {isListening ? 'Speak now - Sarah won\'t stop for "sí" or "aha"' : isSpeaking ? 'Sarah is speaking - mic is listening' : 'Click microphone to speak'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
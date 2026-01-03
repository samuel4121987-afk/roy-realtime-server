import { useState, useEffect, useCallback } from 'react';
import { aiConfigStore } from '../../../utils/aiConfigStore';

export default function AIConfiguration() {
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [activeKeyId, setActiveKeyId] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  // Add new key state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [selectedModel, setSelectedModel] = useState('gpt-4o-mini');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  
  // Test messaging state
  const [testMessage, setTestMessage] = useState('Hello, this is a test. Please respond with: The connection works.');
  const [testResponse, setTestResponse] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testError, setTestError] = useState('');

  // Voice testing state
  const [isTestingVoice, setIsTestingVoice] = useState(false);
  const [voiceTestError, setVoiceTestError] = useState('');
  const [selectedVoice, setSelectedVoice] = useState('nova');

  const [selectedPersona, setSelectedPersona] = useState('sofia');

  // Twilio sync state
  const [twilioAccountSid, setTwilioAccountSid] = useState('');
  const [twilioAuthToken, setTwilioAuthToken] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any>(null);
  const [syncError, setSyncError] = useState('');

  // Load and sync configuration
  const syncConfig = useCallback(() => {
    const config = aiConfigStore.getConfig();
    setApiKeys(config.apiKeys);
    setActiveKeyId(config.activeKeyId);
    setIsConnected(config.apiKeys.length > 0);
  }, []);

  useEffect(() => {
    syncConfig();
    const unsubscribe = aiConfigStore.subscribe(syncConfig);
    return unsubscribe;
  }, [syncConfig]);

  const handleAddKey = async () => {
    const trimmedKey = newApiKey.trim();
    const trimmedName = newKeyName.trim();
    
    if (!trimmedName) {
      setError('Please enter a name for this API key');
      return;
    }

    if (!aiConfigStore.isValidApiKey(trimmedKey)) {
      setError('Please enter a valid OpenAI API key (starts with sk- and at least 40 characters)');
      return;
    }

    setIsConnecting(true);
    setError('');
    setSuccess('');

    try {
      const result = await aiConfigStore.testConnection(trimmedKey);
      
      if (result.success) {
        aiConfigStore.addApiKey(trimmedName, trimmedKey, selectedModel, result.details);
        setSuccess(`API key "${trimmedName}" added successfully!`);
        setShowAddForm(false);
        setNewKeyName('');
        setNewApiKey('');
        setSelectedModel('gpt-4o-mini');
      } else {
        setError(result.error || 'Connection failed');
      }
    } catch (err: any) {
      setError(`Unexpected error: ${err.message}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSwitchKey = (keyId: string) => {
    aiConfigStore.setActiveKey(keyId);
    setSuccess('Switched active API key successfully!');
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleDeleteKey = (keyId: string, keyName: string) => {
    if (confirm(`Are you sure you want to delete "${keyName}"?`)) {
      aiConfigStore.deleteApiKey(keyId);
      setSuccess(`API key "${keyName}" deleted successfully!`);
      setTimeout(() => setSuccess(''), 3000);
    }
  };

  const handleModelChange = (model: string, keyId: string) => {
    aiConfigStore.setModel(model, keyId);
  };

  const sendTestMessage = async () => {
    if (!testMessage.trim()) return;
    
    const activeKey = aiConfigStore.getActiveKey();
    if (!activeKey) {
      setTestError('No active API key selected');
      return;
    }
    
    setIsTesting(true);
    setTestError('');
    setTestResponse('');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${activeKey.key}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: activeKey.model,
          messages: [
            {
              role: 'user',
              content: testMessage
            }
          ],
          max_tokens: 150,
          temperature: 0.7
        })
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errorData = await response.json();
          if (errorData.error?.message) {
            errorMessage = errorData.error.message;
          }
        } catch (e) {
          // Use default error message
        }
        setTestError(errorMessage);
        return;
      }

      const data = await response.json();
      
      if (data.choices && data.choices[0] && data.choices[0].message) {
        const responseText = data.choices[0].message.content;
        setTestResponse(responseText);
      } else {
        setTestError('Invalid response format from API');
      }

    } catch (error: any) {
      if (error.name === 'AbortError') {
        setTestError('Request timeout - please try again');
      } else {
        setTestError(error.message || 'Network error occurred');
      }
    } finally {
      setIsTesting(false);
    }
  };

  const testVoice = async () => {
    if (!testResponse) {
      setVoiceTestError('Please send a test message first to get a response to test with voice');
      return;
    }

    setIsTestingVoice(true);
    setVoiceTestError('');

    try {
      const activeKey = aiConfigStore.getActiveKey();
      if (!activeKey) {
        setVoiceTestError('No active API key found');
        setIsTestingVoice(false);
        return;
      }

      const response = await fetch(`${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/openai-tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          text: testResponse,
          voice: selectedVoice,
          model: 'tts-1',
          speed: 1.0,
          apiKey: activeKey.key
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        setVoiceTestError(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        return;
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
      };
      
      await audio.play();

    } catch (error: any) {
      setVoiceTestError(error.message || 'Voice test failed');
    } finally {
      setIsTestingVoice(false);
    }
  };

  // Sync Twilio calls
  const syncTwilioCalls = async () => {
    if (!twilioAccountSid.trim() || !twilioAuthToken.trim()) {
      setSyncError('Please enter both Twilio Account SID and Auth Token');
      return;
    }

    setIsSyncing(true);
    setSyncError('');
    setSyncResult(null);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/sync-twilio-calls`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            twilioAccountSid: twilioAccountSid.trim(),
            twilioAuthToken: twilioAuthToken.trim(),
          }),
        }
      );

      const result = await response.json();

      if (result.success) {
        setSyncResult(result);
        setSuccess(`Successfully synced ${result.synced} new call(s)!`);
        setTimeout(() => setSuccess(''), 5000);
        
        // Save credentials to localStorage for convenience
        localStorage.setItem('twilio_account_sid', twilioAccountSid.trim());
        localStorage.setItem('twilio_auth_token', twilioAuthToken.trim());
      } else {
        setSyncError(result.error || 'Failed to sync calls');
      }
    } catch (error: any) {
      setSyncError(error.message || 'Network error occurred');
    } finally {
      setIsSyncing(false);
    }
  };

  // Load saved Twilio credentials on mount
  useEffect(() => {
    const savedSid = localStorage.getItem('twilio_account_sid');
    const savedToken = localStorage.getItem('twilio_auth_token');
    if (savedSid) setTwilioAccountSid(savedSid);
    if (savedToken) setTwilioAuthToken(savedToken);
  }, []);

  const models = [
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Fast, cost-effective model for most tasks' },
    { id: 'gpt-4', name: 'GPT-4', description: 'Most capable model for complex conversations' },
    { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', description: 'Faster and more cost-effective' },
    { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', description: 'Fast and efficient for basic tasks' },
  ];

  const personas = [
    {
      id: 'sofia',
      name: 'Sofia - Hotel Receptionist',
      description: 'Warm, multilingual hotel receptionist with professional hospitality expertise',
      icon: 'ri-hotel-line',
      color: 'from-rose-500 to-pink-600',
    },
    {
      id: 'professional',
      name: 'Professional Assistant',
      description: 'Formal, detailed responses for business environments',
      icon: 'ri-briefcase-line',
      color: 'from-blue-500 to-indigo-600'
    },
    {
      id: 'friendly',
      name: 'Friendly Helper',
      description: 'Warm, conversational tone for customer service',
      icon: 'ri-heart-line',
      color: 'from-green-500 to-emerald-600'
    },
    {
      id: 'technical',
      name: 'Technical Expert',
      description: 'Detailed, precise responses for technical queries',
      icon: 'ri-settings-line',
      color: 'from-purple-500 to-violet-600'
    }
  ];

  const voiceOptions = [
    { id: 'alloy', name: 'Alloy', description: 'Neutral, balanced voice' },
    { id: 'echo', name: 'Echo', description: 'Clear, professional voice' },
    { id: 'fable', name: 'Fable', description: 'Warm, storytelling voice' },
    { id: 'onyx', name: 'Onyx', description: 'Deep, authoritative voice' },
    { id: 'nova', name: 'Nova', description: 'Bright, energetic voice (recommended for Sofia)' },
    { id: 'shimmer', name: 'Shimmer', description: 'Gentle, soothing voice' },
  ];

  const activeKey = apiKeys.find(k => k.id === activeKeyId);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">OpenAI API Keys Management</h2>
            <p className="text-gray-600">Manage multiple OpenAI API keys and switch between them</p>
          </div>
          <div className={`flex items-center px-4 py-2 rounded-full text-sm font-medium ${
            isConnected 
              ? 'bg-green-100 text-green-800 border border-green-200' 
              : 'bg-red-100 text-red-800 border border-red-200'
          }`}>
            <div className={`w-2 h-2 rounded-full mr-2 ${
              isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'
            }`}></div>
            {isConnected ? `${apiKeys.length} Key${apiKeys.length !== 1 ? 's' : ''} Connected` : 'No Keys'}
          </div>
        </div>

        {/* Status Messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <div className="flex items-start">
              <i className="ri-error-warning-line text-red-500 mr-3 mt-0.5"></i>
              <div>
                <p className="text-red-800 font-medium">Error</p>
                <p className="text-red-600 text-sm mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <div className="flex items-start">
              <i className="ri-check-circle-line text-green-500 mr-3 mt-0.5"></i>
              <p className="text-green-800 font-medium">{success}</p>
            </div>
          </div>
        )}

        {/* Add New Key Button */}
        {!showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors whitespace-nowrap cursor-pointer flex items-center justify-center"
          >
            <i className="ri-add-line mr-2"></i>
            Add New API Key
          </button>
        )}

        {/* Add New Key Form */}
        {showAddForm && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Add New API Key</h3>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewKeyName('');
                  setNewApiKey('');
                  setError('');
                }}
                className="text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Key Name / Label
              </label>
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g., Production Key, Development Key, Personal Key"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                OpenAI API Key
              </label>
              <input
                type="password"
                value={newApiKey}
                onChange={(e) => setNewApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-sm text-gray-500 mt-1">
                Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 cursor-pointer">OpenAI Platform</a>
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Default Model
              </label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {models.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name} - {model.description}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleAddKey}
                disabled={isConnecting}
                className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors whitespace-nowrap cursor-pointer flex items-center justify-center"
              >
                {isConnecting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                    Testing...
                  </>
                ) : (
                  <>
                    <i className="ri-check-line mr-2"></i>
                    Test & Add Key
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewKeyName('');
                  setNewApiKey('');
                  setError('');
                }}
                className="px-6 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors whitespace-nowrap cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* API Keys List */}
      {apiKeys.length > 0 && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
          <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
            <i className="ri-key-line mr-2"></i>
            Your API Keys ({apiKeys.length})
          </h3>

          <div className="space-y-4">
            {apiKeys.map((key) => (
              <div
                key={key.id}
                className={`p-6 rounded-lg border transition-all ${
                  key.id === activeKeyId
                    ? 'border-green-500 bg-green-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="font-bold text-gray-900 text-lg">{key.name}</h4>
                      {key.id === activeKeyId && (
                        <span className="bg-green-500 text-white text-xs px-2 py-1 rounded-full font-medium">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mb-2">
                      Key: {key.key.substring(0, 10)}...{key.key.substring(key.key.length - 4)}
                    </p>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>
                        <i className="ri-calendar-line mr-1"></i>
                        Added {new Date(key.createdAt).toLocaleDateString()}
                      </span>
                      {key.lastUsed && (
                        <span>
                          <i className="ri-time-line mr-1"></i>
                          Last used {new Date(key.lastUsed).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {key.connectionDetails && (
                      <div className="mt-2 text-xs text-gray-600">
                        <span className="mr-3">✓ {key.connectionDetails.modelsCount} models</span>
                        <span>✓ Org: {key.connectionDetails.organization}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {key.id !== activeKeyId && (
                      <button
                        onClick={() => handleSwitchKey(key.id)}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <i className="ri-arrow-right-circle-line mr-1"></i>
                        Use This
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteKey(key.id, key.name)}
                      className="px-4 py-2 bg-red-100 text-red-600 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <i className="ri-delete-bin-line"></i>
                    </button>
                  </div>
                </div>

                {/* Model Selection for this key */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Model for this key
                  </label>
                  <select
                    value={key.model}
                    onChange={(e) => handleModelChange(e.target.value, key.id)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {models.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name} - {model.description}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Test Messaging Section */}
      {isConnected && activeKey && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl shadow-lg p-8">
          <h3 className="text-xl font-bold text-gray-900 mb-2 flex items-center">
            <i className="ri-chat-3-line mr-2 text-blue-600"></i>
            Test Active API Key
          </h3>
          <p className="text-sm text-gray-600 mb-6">Testing with: {activeKey.name} ({activeKey.model})</p>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Test Message
              </label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  placeholder="Enter your test message..."
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  onClick={sendTestMessage}
                  disabled={isTesting || !testMessage.trim()}
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors whitespace-nowrap cursor-pointer flex items-center"
                >
                  {isTesting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                      Sending...
                    </>
                  ) : (
                    <>
                      <i className="ri-send-plane-line mr-2"></i>
                      Send Test
                    </>
                  )}
                </button>
              </div>
            </div>

            {testResponse && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-start">
                  <i className="ri-robot-line text-green-500 mr-3 mt-0.5"></i>
                  <div className="flex-1">
                    <p className="text-green-800 font-medium mb-2">AI Response:</p>
                    <p className="text-green-700 whitespace-pre-wrap">{testResponse}</p>
                  </div>
                </div>
              </div>
            )}

            {testResponse && (
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center">
                    <i className="ri-volume-up-line text-purple-500 mr-2"></i>
                    <p className="text-purple-800 font-medium">Test Voice (OpenAI TTS)</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <select
                      value={selectedVoice}
                      onChange={(e) => setSelectedVoice(e.target.value)}
                      className="px-3 py-1 border border-purple-300 rounded text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    >
                      {voiceOptions.map((voice) => (
                        <option key={voice.id} value={voice.id}>
                          {voice.name} - {voice.description}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={testVoice}
                      disabled={isTestingVoice}
                      className="bg-purple-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors whitespace-nowrap cursor-pointer flex items-center text-sm"
                    >
                      {isTestingVoice ? (
                        <>
                          <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                          Playing...
                        </>
                      ) : (
                        <>
                          <i className="ri-play-line mr-2"></i>
                          Test Voice
                        </>
                      )}
                    </button>
                  </div>
                </div>
                
                {voiceTestError && (
                  <div className="text-red-600 text-sm mt-2">
                    <i className="ri-error-warning-line mr-1"></i>
                    {voiceTestError}
                  </div>
                )}
              </div>
            )}

            {testError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start">
                  <i className="ri-error-warning-line text-red-500 mr-3 mt-0.5"></i>
                  <div>
                    <p className="text-red-800 font-medium">Test Failed</p>
                    <p className="text-red-600 text-sm mt-1">{testError}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Persona Selection */}
      {isConnected && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
          <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
            <i className="ri-user-star-line mr-2"></i>
            AI Persona Selection
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {personas.map((persona) => (
              <div
                key={persona.id}
                onClick={() => setSelectedPersona(persona.id)}
                className={`p-6 rounded-xl border cursor-pointer transition-all ${
                  selectedPersona === persona.id
                    ? 'border-blue-500 bg-blue-50 shadow-md'
                    : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 rounded-full bg-gradient-to-r ${persona.color} flex items-center justify-center`}>
                    <i className={`${persona.icon} text-white text-xl`}></i>
                  </div>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                    selectedPersona === persona.id
                      ? 'border-blue-500 bg-blue-500'
                      : 'border-gray-300'
                  }`}>
                    {selectedPersona === persona.id && (
                      <i className="ri-check-line text-white text-sm"></i>
                    )}
                  </div>
                </div>
                
                <h4 className="font-bold text-gray-900 mb-2">{persona.name}</h4>
                <p className="text-sm text-gray-600">{persona.description}</p>
                
                {selectedPersona === persona.id && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                    <p className="text-xs text-blue-700 font-medium">✓ Active Persona</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sync Call Data Section */}
      {isConnected && activeKey && (
        <div className="bg-gradient-to-r from-teal-50 to-cyan-50 border border-teal-200 rounded-xl shadow-lg p-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-bold text-gray-900 mb-2 flex items-center">
                <i className="ri-phone-line mr-2 text-teal-600"></i>
                Sync Call Data from Roy
              </h3>
              <p className="text-sm text-gray-600">Import call recordings and client information from Twilio</p>
            </div>
          </div>

          {/* Twilio Credentials */}
          <div className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Twilio Account SID
              </label>
              <input
                type="text"
                value={twilioAccountSid}
                onChange={(e) => setTwilioAccountSid(e.target.value)}
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                Find this in your <a href="https://console.twilio.com/" target="_blank" rel="noopener noreferrer" className="text-teal-600 hover:text-teal-800 cursor-pointer">Twilio Console</a>
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Twilio Auth Token
              </label>
              <input
                type="password"
                value={twilioAuthToken}
                onChange={(e) => setTwilioAuthToken(e.target.value)}
                placeholder="Your Twilio Auth Token"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                Keep this secure - it's like a password for your Twilio account
              </p>
            </div>
          </div>

          {/* Sync Button */}
          <button
            onClick={syncTwilioCalls}
            disabled={isSyncing || !twilioAccountSid.trim() || !twilioAuthToken.trim()}
            className="w-full bg-teal-600 text-white px-6 py-4 rounded-lg font-medium hover:bg-teal-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors whitespace-nowrap cursor-pointer flex items-center justify-center"
          >
            {isSyncing ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                Syncing calls from Twilio...
              </>
            ) : (
              <>
                <i className="ri-refresh-line mr-2"></i>
                Sync Call Data Now
              </>
            )}
          </button>

          {/* Sync Result */}
          {syncResult && (
            <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-6">
              <div className="flex items-start">
                <i className="ri-check-circle-line text-green-500 text-2xl mr-3"></i>
                <div className="flex-1">
                  <h4 className="text-green-800 font-bold mb-2">Sync Completed!</h4>
                  <div className="space-y-2 text-sm text-green-700">
                    <p>✅ <strong>{syncResult.synced}</strong> new call(s) imported</p>
                    <p>📞 <strong>{syncResult.total_calls}</strong> total calls found in Twilio</p>
                    {syncResult.new_leads && syncResult.new_leads.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-green-200">
                        <p className="font-medium mb-2">New Leads:</p>
                        <ul className="space-y-1">
                          {syncResult.new_leads.map((lead: any, idx: number) => (
                            <li key={idx} className="text-xs">
                              • {lead.name} - {lead.phone}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-green-600 mt-4">
                    💡 Go to Client Management to view and manage these leads
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Sync Error */}
          {syncError && (
            <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start">
                <i className="ri-error-warning-line text-red-500 mr-3 mt-0.5"></i>
                <div>
                  <p className="text-red-800 font-medium">Sync Failed</p>
                  <p className="text-red-600 text-sm mt-1">{syncError}</p>
                </div>
              </div>
            </div>
          )}

          {/* Info Box */}
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start">
              <i className="ri-information-line text-blue-500 mr-3 mt-0.5"></i>
              <div className="text-sm text-blue-700">
                <p className="font-medium mb-2">How it works:</p>
                <ul className="space-y-1 text-xs">
                  <li>• Fetches recent calls from your Twilio account</li>
                  <li>• Extracts caller information (name, phone, business details)</li>
                  <li>• Automatically creates leads in your Client Management</li>
                  <li>• Skips calls that have already been imported</li>
                  <li>• Safe to run multiple times - no duplicates!</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Status */}
      {isConnected && activeKey && (
        <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-xl p-8">
          <div className="flex items-center mb-6">
            <div className="w-12 h-12 bg-gradient-to-r from-green-500 to-blue-500 rounded-full flex items-center justify-center mr-4">
              <i className="ri-robot-line text-white text-xl"></i>
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">AI Assistant Active</h3>
              <p className="text-gray-600">
                Running {personas.find(p => p.id === selectedPersona)?.name} on {activeKey.name} ({activeKey.model}) with OpenAI TTS
              </p>
            </div>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="flex items-center text-green-600">
              <i className="ri-phone-line mr-2"></i>
              Phone calls ready
            </div>
            <div className="flex items-center text-green-600">
              <i className="ri-volume-up-line mr-2"></i>
              Premium TTS ready
            </div>
            <div className="flex items-center text-green-600">
              <i className="ri-chat-3-line mr-2"></i>
              Website chat ready
            </div>
            <div className="flex items-center text-green-600">
              <i className="ri-calendar-line mr-2"></i>
              Booking ready
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

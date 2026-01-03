import { useState } from 'react';

export default function ChatGPTIntegration() {
  const [apiKey, setApiKey] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleConnect = async () => {
    if (!apiKey.trim()) return;
    
    setIsConnecting(true);
    setConnectionStatus('idle');

    // Simulate API connection
    setTimeout(() => {
      if (apiKey.startsWith('sk-')) {
        setIsConnected(true);
        setConnectionStatus('success');
      } else {
        setConnectionStatus('error');
      }
      setIsConnecting(false);
    }, 2000);
  };

  const handleDisconnect = () => {
    setIsConnected(false);
    setApiKey('');
    setConnectionStatus('idle');
  };

  return (
    <div className="space-y-8">
      {/* Connection Status Card */}
      <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">ChatGPT API Integration</h2>
            <p className="text-gray-300">Connect your paid ChatGPT account to power the AI assistant</p>
          </div>
          <div className={`flex items-center px-4 py-2 rounded-full ${
            isConnected ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
          }`}>
            <div className={`w-2 h-2 rounded-full mr-2 ${
              isConnected ? 'bg-green-400' : 'bg-red-400'
            }`}></div>
            {isConnected ? 'Connected' : 'Disconnected'}
          </div>
        </div>

        {!isConnected ? (
          <div className="space-y-6">
            <div>
              <label htmlFor="api-key" className="block text-sm font-medium text-gray-300 mb-2">
                OpenAI API Key
              </label>
              <div className="relative">
                <input
                  type="password"
                  id="api-key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500 transition-colors pr-12"
                />
                <i className="ri-key-line absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
              </div>
              <p className="text-sm text-gray-400 mt-2">
                Get your API key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 cursor-pointer">OpenAI Platform</a>
              </p>
            </div>

            <button
              onClick={handleConnect}
              disabled={!apiKey.trim() || isConnecting}
              className="bg-gradient-to-r from-green-500 to-green-600 text-white px-8 py-3 rounded-lg font-semibold hover:from-green-600 hover:to-green-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
            >
              {isConnecting ? (
                <>
                  <i className="ri-loader-4-line mr-2 animate-spin"></i>
                  Connecting...
                </>
              ) : (
                <>
                  <i className="ri-plug-line mr-2"></i>
                  Connect ChatGPT API
                </>
              )}
            </button>

            {connectionStatus === 'error' && (
              <div className="p-4 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400">
                <i className="ri-error-warning-line mr-2"></i>
                Invalid API key. Please check your key and try again.
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <div className="p-4 bg-green-500/20 border border-green-500/30 rounded-lg text-green-400">
              <i className="ri-check-circle-line mr-2"></i>
              ChatGPT API successfully connected and ready to serve clients
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="bg-gray-700/30 rounded-lg p-4">
                <h4 className="font-semibold text-white mb-2">API Status</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-300">Model:</span>
                    <span className="text-green-400">GPT-4</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Rate Limit:</span>
                    <span className="text-green-400">Active</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-300">Usage:</span>
                    <span className="text-green-400">Available</span>
                  </div>
                </div>
              </div>

              <div className="bg-gray-700/30 rounded-lg p-4">
                <h4 className="font-semibold text-white mb-2">Capabilities</h4>
                <div className="space-y-2 text-sm text-gray-300">
                  <div className="flex items-center">
                    <i className="ri-check-line text-green-400 mr-2"></i>
                    Calendar Management
                  </div>
                  <div className="flex items-center">
                    <i className="ri-check-line text-green-400 mr-2"></i>
                    Email Responses
                  </div>
                  <div className="flex items-center">
                    <i className="ri-check-line text-green-400 mr-2"></i>
                    Business Analysis
                  </div>
                  <div className="flex items-center">
                    <i className="ri-check-line text-green-400 mr-2"></i>
                    Travel Integration
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={handleDisconnect}
              className="bg-red-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-red-700 transition-colors whitespace-nowrap cursor-pointer"
            >
              <i className="ri-unlink mr-2"></i>
              Disconnect API
            </button>
          </div>
        )}
      </div>

      {/* Usage Statistics */}
      <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-8">
        <h3 className="text-xl font-bold text-white mb-6">Usage Statistics</h3>
        
        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-gray-700/30 rounded-lg p-6 text-center">
            <div className="text-3xl font-bold text-cyan-400 mb-2">1,247</div>
            <div className="text-gray-300">Total Conversations</div>
          </div>
          <div className="bg-gray-700/30 rounded-lg p-6 text-center">
            <div className="text-3xl font-bold text-green-400 mb-2">89%</div>
            <div className="text-gray-300">Success Rate</div>
          </div>
          <div className="bg-gray-700/30 rounded-lg p-6 text-center">
            <div className="text-3xl font-bold text-blue-400 mb-2">342</div>
            <div className="text-gray-300">Bookings Made</div>
          </div>
        </div>
      </div>

      {/* API Documentation */}
      <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-8">
        <h3 className="text-xl font-bold text-white mb-6">Quick Setup Guide</h3>
        
        <div className="space-y-4">
          <div className="flex items-start">
            <div className="w-8 h-8 bg-cyan-500 rounded-full flex items-center justify-center text-white font-bold text-sm mr-4 mt-1">1</div>
            <div>
              <h4 className="font-semibold text-white mb-1">Get Your API Key</h4>
              <p className="text-gray-300 text-sm">Visit OpenAI Platform and create a new API key from your account settings</p>
            </div>
          </div>
          
          <div className="flex items-start">
            <div className="w-8 h-8 bg-cyan-500 rounded-full flex items-center justify-center text-white font-bold text-sm mr-4 mt-1">2</div>
            <div>
              <h4 className="font-semibold text-white mb-1">Connect Your Account</h4>
              <p className="text-gray-300 text-sm">Paste your API key above and click connect to enable AI features</p>
            </div>
          </div>
          
          <div className="flex items-start">
            <div className="w-8 h-8 bg-cyan-500 rounded-full flex items-center justify-center text-white font-bold text-sm mr-4 mt-1">3</div>
            <div>
              <h4 className="font-semibold text-white mb-1">Configure AI Settings</h4>
              <p className="text-gray-300 text-sm">Use the AI Configuration tab to customize responses and behavior</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
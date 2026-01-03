import { useState, useEffect } from 'react';

interface TwilioConfig {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
  webhookUrl: string;
}

export default function TwilioIntegration() {
  const [config, setConfig] = useState<TwilioConfig>({
    accountSid: '',
    authToken: '',
    phoneNumber: '',
    webhookUrl: ''
  });
  
  const [isConnected, setIsConnected] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [testResult, setTestResult] = useState<any>(null);

  // Load saved config
  useEffect(() => {
    const savedConfig = localStorage.getItem('twilio_config');
    if (savedConfig) {
      const parsed = JSON.parse(savedConfig);
      setConfig(parsed);
      setIsConnected(true);
    }
  }, []);

  const handleSave = async () => {
    if (!config.accountSid.trim() || !config.authToken.trim()) {
      setError('Please enter both Account SID and Auth Token');
      return;
    }

    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      // Save to localStorage
      localStorage.setItem('twilio_config', JSON.stringify(config));
      setIsConnected(true);
      setSuccess('Twilio configuration saved successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    if (!config.accountSid.trim() || !config.authToken.trim()) {
      setError('Please save your configuration first');
      return;
    }

    setIsTesting(true);
    setError('');
    setTestResult(null);

    try {
      // Test Twilio connection by fetching account info
      const auth = btoa(`${config.accountSid}:${config.authToken}`);
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}.json`,
        {
          headers: {
            'Authorization': `Basic ${auth}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Invalid credentials or connection failed');
      }

      const data = await response.json();
      setTestResult({
        success: true,
        accountName: data.friendly_name,
        status: data.status,
        type: data.type
      });
      setSuccess('Connection test successful!');
    } catch (err: any) {
      setError(err.message || 'Connection test failed');
      setTestResult({ success: false });
    } finally {
      setIsTesting(false);
    }
  };

  const handleDisconnect = () => {
    if (confirm('Are you sure you want to disconnect Twilio?')) {
      localStorage.removeItem('twilio_config');
      setConfig({
        accountSid: '',
        authToken: '',
        phoneNumber: '',
        webhookUrl: ''
      });
      setIsConnected(false);
      setTestResult(null);
      setSuccess('Twilio disconnected successfully');
      setTimeout(() => setSuccess(''), 3000);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Twilio Integration</h2>
            <p className="text-gray-600">Connect your Twilio account to enable phone call features</p>
          </div>
          <div className={`flex items-center px-4 py-2 rounded-full text-sm font-medium ${
            isConnected 
              ? 'bg-green-100 text-green-800 border border-green-200' 
              : 'bg-gray-100 text-gray-800 border border-gray-200'
          }`}>
            <div className={`w-2 h-2 rounded-full mr-2 ${
              isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
            }`}></div>
            {isConnected ? 'Connected' : 'Not Connected'}
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

        {/* Configuration Form */}
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Account SID
            </label>
            <input
              type="text"
              value={config.accountSid}
              onChange={(e) => setConfig({ ...config, accountSid: e.target.value })}
              placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Find this in your <a href="https://console.twilio.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 cursor-pointer">Twilio Console</a>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Auth Token
            </label>
            <input
              type="password"
              value={config.authToken}
              onChange={(e) => setConfig({ ...config, authToken: e.target.value })}
              placeholder="Your Twilio Auth Token"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Keep this secure - it's like a password for your Twilio account
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Phone Number (Optional)
            </label>
            <input
              type="text"
              value={config.phoneNumber}
              onChange={(e) => setConfig({ ...config, phoneNumber: e.target.value })}
              placeholder="+1234567890"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Your Twilio phone number for incoming calls
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Webhook URL (Optional)
            </label>
            <input
              type="text"
              value={config.webhookUrl}
              onChange={(e) => setConfig({ ...config, webhookUrl: e.target.value })}
              placeholder="https://your-domain.com/webhook"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              URL where Twilio will send call events
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors whitespace-nowrap cursor-pointer flex items-center justify-center"
            >
              {isSaving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                  Saving...
                </>
              ) : (
                <>
                  <i className="ri-save-line mr-2"></i>
                  Save Configuration
                </>
              )}
            </button>

            <button
              onClick={handleTest}
              disabled={isTesting || !config.accountSid || !config.authToken}
              className="px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors whitespace-nowrap cursor-pointer flex items-center"
            >
              {isTesting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                  Testing...
                </>
              ) : (
                <>
                  <i className="ri-test-tube-line mr-2"></i>
                  Test Connection
                </>
              )}
            </button>

            {isConnected && (
              <button
                onClick={handleDisconnect}
                className="px-6 py-3 bg-red-100 text-red-600 rounded-lg font-medium hover:bg-red-200 transition-colors whitespace-nowrap cursor-pointer flex items-center"
              >
                <i className="ri-link-unlink mr-2"></i>
                Disconnect
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Test Result */}
      {testResult && (
        <div className={`rounded-xl shadow-lg border p-8 ${
          testResult.success 
            ? 'bg-green-50 border-green-200' 
            : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-start">
            <i className={`${
              testResult.success ? 'ri-check-circle-line text-green-500' : 'ri-error-warning-line text-red-500'
            } text-2xl mr-3`}></i>
            <div className="flex-1">
              <h3 className={`font-bold mb-2 ${
                testResult.success ? 'text-green-800' : 'text-red-800'
              }`}>
                {testResult.success ? 'Connection Successful!' : 'Connection Failed'}
              </h3>
              {testResult.success && (
                <div className="space-y-1 text-sm text-green-700">
                  <p>✅ Account: {testResult.accountName}</p>
                  <p>✅ Status: {testResult.status}</p>
                  <p>✅ Type: {testResult.type}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <div className="flex items-start">
          <i className="ri-information-line text-blue-500 mr-3 mt-0.5"></i>
          <div className="text-sm text-blue-700">
            <p className="font-medium mb-2">How to get your Twilio credentials:</p>
            <ol className="space-y-1 text-xs list-decimal list-inside">
              <li>Go to <a href="https://console.twilio.com/" target="_blank" rel="noopener noreferrer" className="underline cursor-pointer">Twilio Console</a></li>
              <li>Find your Account SID and Auth Token on the dashboard</li>
              <li>Copy and paste them into the fields above</li>
              <li>Click "Test Connection" to verify</li>
              <li>Save your configuration</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Features */}
      {isConnected && (
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-8">
          <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
            <i className="ri-phone-line mr-2 text-purple-600"></i>
            Available Features
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-lg p-4 border border-purple-100">
              <div className="flex items-center mb-2">
                <i className="ri-phone-incoming-line text-purple-600 mr-2"></i>
                <h4 className="font-bold text-gray-900">Incoming Calls</h4>
              </div>
              <p className="text-sm text-gray-600">Handle incoming phone calls with AI</p>
            </div>

            <div className="bg-white rounded-lg p-4 border border-purple-100">
              <div className="flex items-center mb-2">
                <i className="ri-phone-outgoing-line text-purple-600 mr-2"></i>
                <h4 className="font-bold text-gray-900">Outgoing Calls</h4>
              </div>
              <p className="text-sm text-gray-600">Make automated calls to clients</p>
            </div>

            <div className="bg-white rounded-lg p-4 border border-purple-100">
              <div className="flex items-center mb-2">
                <i className="ri-message-3-line text-purple-600 mr-2"></i>
                <h4 className="font-bold text-gray-900">SMS Messages</h4>
              </div>
              <p className="text-sm text-gray-600">Send and receive text messages</p>
            </div>

            <div className="bg-white rounded-lg p-4 border border-purple-100">
              <div className="flex items-center mb-2">
                <i className="ri-record-circle-line text-purple-600 mr-2"></i>
                <h4 className="font-bold text-gray-900">Call Recording</h4>
              </div>
              <p className="text-sm text-gray-600">Record and transcribe conversations</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState, useEffect } from 'react';

export default function WebhookConfiguration() {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const defaultWebhookUrl = 'https://juhadbclndzkkallgmpr.supabase.co/functions/v1/readdy-agent-webhook';

  useEffect(() => {
    // Load saved webhook URL from localStorage
    const saved = localStorage.getItem('readdy_agent_webhook_url');
    if (saved) {
      setWebhookUrl(saved);
    } else {
      setWebhookUrl(defaultWebhookUrl);
    }
  }, []);

  const handleSave = () => {
    setIsLoading(true);
    
    // Save to localStorage
    localStorage.setItem('readdy_agent_webhook_url', webhookUrl);
    
    setTimeout(() => {
      setIsLoading(false);
      setIsSaved(true);
      
      setTimeout(() => {
        setIsSaved(false);
      }, 3000);
    }, 500);
  };

  const handleReset = () => {
    setWebhookUrl(defaultWebhookUrl);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(webhookUrl);
    alert('Webhook URL copied to clipboard!');
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 border border-white/20">
        <div className="flex items-start mb-6">
          <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center mr-4">
            <i className="ri-webhook-line text-2xl text-white"></i>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-white mb-2">Webhook Configuration</h2>
            <p className="text-gray-300">
              Configure where your Readdy Agent conversations are sent
            </p>
          </div>
        </div>

        {/* Important Notice */}
        <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-4 mb-6">
          <div className="flex items-start">
            <i className="ri-error-warning-line text-yellow-400 text-xl mr-3 mt-0.5"></i>
            <div>
              <h3 className="text-yellow-400 font-semibold mb-1">Important!</h3>
              <p className="text-gray-200 text-sm">
                Without this webhook URL configured, your Readdy Agent conversations will NOT be saved to your database. 
                All chat and voice conversations need this webhook to store customer details in Back Office → Requests.
              </p>
            </div>
          </div>
        </div>

        {/* Webhook URL Input */}
        <div className="mb-6">
          <label className="block text-white font-medium mb-2">
            Webhook URL
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              className="flex-1 px-4 py-3 bg-white/5 border border-white/20 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500 transition-all"
              placeholder="Enter your webhook URL"
            />
            <button
              onClick={copyToClipboard}
              className="px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-all whitespace-nowrap"
              title="Copy to clipboard"
            >
              <i className="ri-file-copy-line"></i>
            </button>
          </div>
          <p className="text-gray-400 text-sm mt-2">
            This URL will receive all conversation data from your Readdy Agent widget
          </p>
        </div>

        {/* Default URL Info */}
        <div className="bg-blue-500/20 border border-blue-500/50 rounded-lg p-4 mb-6">
          <div className="flex items-start">
            <i className="ri-information-line text-blue-400 text-xl mr-3 mt-0.5"></i>
            <div>
              <h3 className="text-blue-400 font-semibold mb-1">Default Webhook URL</h3>
              <p className="text-gray-200 text-sm mb-2">
                Your default webhook URL is already configured to save conversations to your Supabase database:
              </p>
              <code className="block bg-black/30 px-3 py-2 rounded text-cyan-400 text-xs break-all">
                {defaultWebhookUrl}
              </code>
            </div>
          </div>
        </div>

        {/* What Gets Saved */}
        <div className="mb-6">
          <h3 className="text-white font-semibold mb-3">What Gets Saved:</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/5 rounded-lg p-3 border border-white/10">
              <i className="ri-user-line text-cyan-400 mr-2"></i>
              <span className="text-gray-200 text-sm">Customer Name</span>
            </div>
            <div className="bg-white/5 rounded-lg p-3 border border-white/10">
              <i className="ri-mail-line text-cyan-400 mr-2"></i>
              <span className="text-gray-200 text-sm">Email Address</span>
            </div>
            <div className="bg-white/5 rounded-lg p-3 border border-white/10">
              <i className="ri-phone-line text-cyan-400 mr-2"></i>
              <span className="text-gray-200 text-sm">Phone Number</span>
            </div>
            <div className="bg-white/5 rounded-lg p-3 border border-white/10">
              <i className="ri-message-3-line text-cyan-400 mr-2"></i>
              <span className="text-gray-200 text-sm">Full Transcript</span>
            </div>
            <div className="bg-white/5 rounded-lg p-3 border border-white/10">
              <i className="ri-time-line text-cyan-400 mr-2"></i>
              <span className="text-gray-200 text-sm">Timestamp</span>
            </div>
            <div className="bg-white/5 rounded-lg p-3 border border-white/10">
              <i className="ri-chat-voice-line text-cyan-400 mr-2"></i>
              <span className="text-gray-200 text-sm">Chat/Voice Type</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleSave}
            disabled={isLoading || !webhookUrl}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-medium rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
          >
            {isLoading ? (
              <>
                <i className="ri-loader-4-line animate-spin mr-2"></i>
                Saving...
              </>
            ) : isSaved ? (
              <>
                <i className="ri-check-line mr-2"></i>
                Saved Successfully!
              </>
            ) : (
              <>
                <i className="ri-save-line mr-2"></i>
                Save Webhook URL
              </>
            )}
          </button>
          
          <button
            onClick={handleReset}
            className="px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-all whitespace-nowrap"
          >
            <i className="ri-refresh-line mr-2"></i>
            Reset to Default
          </button>
        </div>

        {/* Success Message */}
        {isSaved && (
          <div className="mt-4 bg-green-500/20 border border-green-500/50 rounded-lg p-4">
            <div className="flex items-center">
              <i className="ri-checkbox-circle-line text-green-400 text-xl mr-3"></i>
              <div>
                <p className="text-green-400 font-semibold">Webhook URL Saved!</p>
                <p className="text-gray-200 text-sm">
                  All new Readdy Agent conversations will now be saved to your database.
                  Check Back Office → Requests to see them.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Testing Instructions */}
        <div className="mt-6 bg-white/5 rounded-lg p-4 border border-white/10">
          <h3 className="text-white font-semibold mb-2 flex items-center">
            <i className="ri-test-tube-line text-cyan-400 mr-2"></i>
            Test Your Webhook
          </h3>
          <ol className="text-gray-300 text-sm space-y-2 ml-6 list-decimal">
            <li>Save the webhook URL above</li>
            <li>Go to your website and open the Readdy Agent chat widget</li>
            <li>Have a conversation and leave your details (name, email, phone)</li>
            <li>Go to Back Office → Requests</li>
            <li>Your conversation should appear there!</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';

export default function WebhookSetup() {
  const [webhookUrl] = useState(
    'https://juhadbclndzkkallgmpr.supabase.co/functions/v1/readdy-agent-webhook'
  );
  const [copied, setCopied] = useState(false);
  const [testResult, setTestResult] = useState<string>('');
  const [testing, setTesting] = useState(false);
  const projectId = '91f5ca60-2741-4424-b942-77e783d1adc7';

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const testWebhook = async () => {
    setTesting(true);
    setTestResult('');
    
    try {
      const testData = {
        conversationId: 'test_' + Date.now(),
        userName: 'Test User',
        userEmail: 'test@example.com',
        userPhone: '+1234567890',
        businessName: 'Test Business',
        message: 'This is a test message',
        transcript: 'User: Hello\nAssistant: Hi there!',
        status: 'completed'
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testData)
      });

      const result = await response.json();
      
      if (response.ok) {
        setTestResult('✅ SUCCESS! Webhook is working. Check the Requests tab to see the test data.');
      } else {
        setTestResult(`❌ FAILED: ${result.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      setTestResult(`❌ ERROR: ${error.message}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Critical Alert */}
      <div className="bg-red-50 border-l-4 border-red-500 p-6 mb-8">
        <div className="flex items-start">
          <i className="ri-error-warning-line text-red-500 text-2xl mr-4 flex-shrink-0"></i>
          <div>
            <h3 className="text-lg font-bold text-red-900 mb-2">
              ⚠️ WEBHOOK NOT CONFIGURED - DATA NOT SAVING
            </h3>
            <p className="text-red-800 font-medium">
              Your Readdy Agent widget is installed but NOT sending data to your database. 
              Follow the steps below to fix this NOW.
            </p>
          </div>
        </div>
      </div>

      {/* Step-by-Step Instructions */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
          <i className="ri-webhook-line text-teal-600 mr-3"></i>
          Configure Your Webhook (3 Minutes)
        </h2>

        {/* Step 1 */}
        <div className="mb-8 pb-8 border-b border-gray-200">
          <div className="flex items-start">
            <div className="flex-shrink-0 w-10 h-10 bg-teal-600 text-white rounded-full flex items-center justify-center font-bold text-lg mr-4">
              1
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900 mb-3">
                Copy Your Webhook URL
              </h3>
              <div className="bg-gray-50 border border-gray-300 rounded-lg p-4 mb-3">
                <div className="flex items-center justify-between">
                  <code className="text-sm text-gray-800 break-all flex-1 mr-4">
                    {webhookUrl}
                  </code>
                  <button
                    onClick={() => copyToClipboard(webhookUrl)}
                    className="flex-shrink-0 bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 transition-colors whitespace-nowrap"
                  >
                    {copied ? (
                      <>
                        <i className="ri-check-line mr-2"></i>
                        Copied!
                      </>
                    ) : (
                      <>
                        <i className="ri-file-copy-line mr-2"></i>
                        Copy URL
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Step 2 */}
        <div className="mb-8 pb-8 border-b border-gray-200">
          <div className="flex items-start">
            <div className="flex-shrink-0 w-10 h-10 bg-teal-600 text-white rounded-full flex items-center justify-center font-bold text-lg mr-4">
              2
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900 mb-3">
                Go to Readdy Agent Dashboard
              </h3>
              <p className="text-gray-700 mb-4">
                Open the Readdy Agent dashboard where you manage your AI assistant:
              </p>
              <a
                href="https://readdy.ai/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center bg-teal-600 text-white px-6 py-3 rounded-lg hover:bg-teal-700 transition-colors font-medium"
              >
                <i className="ri-external-link-line mr-2"></i>
                Open Readdy Dashboard
              </a>
              <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900">
                  <strong>Your Project ID:</strong> <code className="bg-blue-100 px-2 py-1 rounded">{projectId}</code>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Step 3 */}
        <div className="mb-8 pb-8 border-b border-gray-200">
          <div className="flex items-start">
            <div className="flex-shrink-0 w-10 h-10 bg-teal-600 text-white rounded-full flex items-center justify-center font-bold text-lg mr-4">
              3
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900 mb-3">
                Find Webhook Settings
              </h3>
              <p className="text-gray-700 mb-3">
                In the Readdy Agent dashboard, look for one of these sections:
              </p>
              <ul className="space-y-2 text-gray-700">
                <li className="flex items-start">
                  <i className="ri-arrow-right-s-line text-teal-600 mt-1 mr-2"></i>
                  <span><strong>Webhook Settings</strong></span>
                </li>
                <li className="flex items-start">
                  <i className="ri-arrow-right-s-line text-teal-600 mt-1 mr-2"></i>
                  <span><strong>Integration Settings</strong></span>
                </li>
                <li className="flex items-start">
                  <i className="ri-arrow-right-s-line text-teal-600 mt-1 mr-2"></i>
                  <span><strong>API Configuration</strong></span>
                </li>
                <li className="flex items-start">
                  <i className="ri-arrow-right-s-line text-teal-600 mt-1 mr-2"></i>
                  <span><strong>Advanced Settings</strong></span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Step 4 */}
        <div className="mb-8 pb-8 border-b border-gray-200">
          <div className="flex items-start">
            <div className="flex-shrink-0 w-10 h-10 bg-teal-600 text-white rounded-full flex items-center justify-center font-bold text-lg mr-4">
              4
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900 mb-3">
                Paste Your Webhook URL
              </h3>
              <p className="text-gray-700 mb-3">
                Find the webhook URL field and paste the URL you copied in Step 1.
              </p>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-900">
                  <i className="ri-lightbulb-line mr-2"></i>
                  <strong>Tip:</strong> The field might be labeled as "Webhook URL", "Callback URL", or "Integration Endpoint"
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Step 5 */}
        <div>
          <div className="flex items-start">
            <div className="flex-shrink-0 w-10 h-10 bg-teal-600 text-white rounded-full flex items-center justify-center font-bold text-lg mr-4">
              5
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-gray-900 mb-3">
                Save & Test
              </h3>
              <p className="text-gray-700 mb-4">
                Click "Save" or "Update" in the Readdy Agent dashboard, then test it:
              </p>
              <ol className="space-y-2 text-gray-700 list-decimal list-inside">
                <li>Go to your website</li>
                <li>Click the Readdy Agent widget (bottom-right corner)</li>
                <li>Have a conversation and leave your details (name, email, phone)</li>
                <li>Come back to this Back Office → Check the "Requests" tab</li>
              </ol>
              <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-900 font-medium">
                  <i className="ri-check-line mr-2"></i>
                  If configured correctly, you'll see the conversation details in the Requests tab within seconds!
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Test Webhook</h3>
        <p className="text-sm text-gray-600 mb-4">
          Click the button below to send test data to your webhook and verify it's working correctly.
        </p>
        
        <button
          onClick={testWebhook}
          disabled={testing}
          className="px-6 py-3 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {testing ? (
            <>
              <i className="ri-loader-4-line animate-spin mr-2"></i>
              Testing...
            </>
          ) : (
            <>
              <i className="ri-test-tube-line mr-2"></i>
              Test Webhook Now
            </>
          )}
        </button>

        {testResult && (
          <div className={`mt-4 p-4 rounded-lg ${
            testResult.includes('SUCCESS') 
              ? 'bg-green-50 border border-green-200 text-green-800' 
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}>
            <p className="text-sm font-medium">{testResult}</p>
          </div>
        )}
      </div>

      {/* What Happens After Configuration */}
      <div className="bg-gradient-to-r from-teal-50 to-blue-50 rounded-lg border border-teal-200 p-8">
        <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
          <i className="ri-magic-line text-teal-600 mr-3"></i>
          What Happens After Configuration?
        </h3>
        <div className="space-y-3 text-gray-700">
          <div className="flex items-start">
            <i className="ri-check-double-line text-teal-600 text-xl mr-3 mt-1"></i>
            <p>Every conversation with your Readdy Agent widget will automatically save to your database</p>
          </div>
          <div className="flex items-start">
            <i className="ri-check-double-line text-teal-600 text-xl mr-3 mt-1"></i>
            <p>Client details (name, email, phone, business info) will appear in the "Requests" tab</p>
          </div>
          <div className="flex items-start">
            <i className="ri-check-double-line text-teal-600 text-xl mr-3 mt-1"></i>
            <p>Full conversation transcripts will be saved for review</p>
          </div>
          <div className="flex items-start">
            <i className="ri-check-double-line text-teal-600 text-xl mr-3 mt-1"></i>
            <p>You can manage and respond to leads directly from your Back Office</p>
          </div>
        </div>
      </div>

      {/* Need Help */}
      <div className="mt-6 bg-gray-50 rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-2 flex items-center">
          <i className="ri-question-line text-gray-600 mr-2"></i>
          Need Help?
        </h3>
        <p className="text-gray-700 mb-4">
          If you can't find the webhook settings in Readdy Agent dashboard, contact Readdy support:
        </p>
        <a
          href="mailto:support@readdy.ai"
          className="inline-flex items-center text-teal-600 hover:text-teal-700 font-medium"
        >
          <i className="ri-mail-line mr-2"></i>
          support@readdy.ai
        </a>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function SupabaseConnect() {
  const navigate = useNavigate();
  const [isConnected, setIsConnected] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [connectionDetails, setConnectionDetails] = useState({
    url: '',
    anonKey: '',
    serviceKey: ''
  });

  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = () => {
    setIsChecking(true);
    // Check if Supabase credentials exist in environment
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    const supabaseServiceKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && supabaseAnonKey && supabaseServiceKey) {
      setIsConnected(true);
      setConnectionDetails({
        url: supabaseUrl,
        anonKey: supabaseAnonKey.substring(0, 20) + '...',
        serviceKey: supabaseServiceKey.substring(0, 20) + '...'
      });
    }
    setIsChecking(false);
  };

  const handleConnect = () => {
    // Trigger Readdy.ai's Supabase connection flow
    window.location.href = 'readdy://connect-supabase';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl mb-4 shadow-lg">
            <i className="ri-database-2-line text-white text-4xl"></i>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Supabase Connection
          </h1>
          <p className="text-lg text-gray-600">
            Connect your database to enable all features
          </p>
        </div>

        {/* Connection Card */}
        <div className="bg-white rounded-3xl shadow-2xl p-8 border-2 border-gray-100">
          {isChecking ? (
            <div className="text-center py-12">
              <div className="inline-block w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
              <p className="text-gray-600">Checking connection status...</p>
            </div>
          ) : isConnected ? (
            <>
              {/* Connected State */}
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
                  <i className="ri-check-line text-green-600 text-3xl"></i>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  ✅ Connected Successfully!
                </h2>
                <p className="text-gray-600">
                  Your Supabase database is connected and ready to use
                </p>
              </div>

              {/* Connection Details */}
              <div className="space-y-4 mb-8">
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4">
                  <div className="flex items-start space-x-3">
                    <i className="ri-link text-blue-600 text-xl mt-1"></i>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-gray-700 mb-1">Database URL</div>
                      <div className="text-sm text-gray-600 font-mono break-all">{connectionDetails.url}</div>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-green-50 to-teal-50 rounded-xl p-4">
                  <div className="flex items-start space-x-3">
                    <i className="ri-key-2-line text-green-600 text-xl mt-1"></i>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-gray-700 mb-1">Anon Key</div>
                      <div className="text-sm text-gray-600 font-mono">{connectionDetails.anonKey}</div>
                    </div>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-4">
                  <div className="flex items-start space-x-3">
                    <i className="ri-shield-keyhole-line text-purple-600 text-xl mt-1"></i>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-gray-700 mb-1">Service Role Key</div>
                      <div className="text-sm text-gray-600 font-mono">{connectionDetails.serviceKey}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Features Enabled */}
              <div className="bg-gradient-to-r from-teal-50 to-cyan-50 rounded-xl p-6 mb-8">
                <h3 className="text-lg font-bold text-gray-900 mb-4">✨ Features Enabled:</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex items-center space-x-2">
                    <i className="ri-check-line text-teal-600"></i>
                    <span className="text-sm text-gray-700">Client Management</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <i className="ri-check-line text-teal-600"></i>
                    <span className="text-sm text-gray-700">Lead Tracking</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <i className="ri-check-line text-teal-600"></i>
                    <span className="text-sm text-gray-700">Automation Rules</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <i className="ri-check-line text-teal-600"></i>
                    <span className="text-sm text-gray-700">AI Conversations</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <i className="ri-check-line text-teal-600"></i>
                    <span className="text-sm text-gray-700">Form Submissions</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <i className="ri-check-line text-teal-600"></i>
                    <span className="text-sm text-gray-700">Business Config</span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-4">
                <button
                  onClick={() => navigate('/backoffice')}
                  className="flex-1 py-4 bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold rounded-xl hover:shadow-xl transform hover:scale-105 transition-all whitespace-nowrap cursor-pointer"
                >
                  <i className="ri-dashboard-line mr-2"></i>
                  Go to Backoffice
                </button>
                <button
                  onClick={() => navigate('/')}
                  className="flex-1 py-4 border-2 border-gray-300 text-gray-700 font-semibold rounded-xl hover:border-blue-500 hover:text-blue-600 transition-all whitespace-nowrap cursor-pointer"
                >
                  <i className="ri-home-line mr-2"></i>
                  Back to Home
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Not Connected State */}
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-orange-100 rounded-full mb-4">
                  <i className="ri-alert-line text-orange-600 text-3xl"></i>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  Not Connected Yet
                </h2>
                <p className="text-gray-600">
                  Connect your Supabase database to unlock all features
                </p>
              </div>

              {/* What You'll Get */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 mb-8">
                <h3 className="text-lg font-bold text-gray-900 mb-4">🚀 What You'll Get:</h3>
                <div className="space-y-3">
                  <div className="flex items-start space-x-3">
                    <i className="ri-database-2-line text-blue-600 text-xl mt-1"></i>
                    <div>
                      <div className="font-semibold text-gray-900">Secure Database</div>
                      <div className="text-sm text-gray-600">Store all your client data securely</div>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <i className="ri-robot-line text-indigo-600 text-xl mt-1"></i>
                    <div>
                      <div className="font-semibold text-gray-900">AI Automation</div>
                      <div className="text-sm text-gray-600">Automate workflows and responses</div>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <i className="ri-line-chart-line text-purple-600 text-xl mt-1"></i>
                    <div>
                      <div className="font-semibold text-gray-900">Analytics & Tracking</div>
                      <div className="text-sm text-gray-600">Monitor all interactions and leads</div>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <i className="ri-shield-check-line text-green-600 text-xl mt-1"></i>
                    <div>
                      <div className="font-semibold text-gray-900">Enterprise Security</div>
                      <div className="text-sm text-gray-600">Row-level security and encryption</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Connect Button */}
              <button
                onClick={handleConnect}
                className="w-full py-5 bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-lg font-bold rounded-xl hover:shadow-2xl transform hover:scale-105 transition-all whitespace-nowrap cursor-pointer"
              >
                <i className="ri-plug-line mr-2"></i>
                Connect Supabase Now
              </button>

              <p className="text-center text-sm text-gray-500 mt-4">
                This will open a secure authorization window
              </p>
            </>
          )}
        </div>

        {/* Help Section */}
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-600 mb-2">
            Need help? Check out the{' '}
            <a href="https://supabase.com/docs" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 font-semibold cursor-pointer">
              Supabase Documentation
            </a>
          </p>
          <button
            onClick={checkConnection}
            className="text-sm text-gray-500 hover:text-gray-700 underline cursor-pointer"
          >
            <i className="ri-refresh-line mr-1"></i>
            Refresh Connection Status
          </button>
        </div>
      </div>
    </div>
  );
}

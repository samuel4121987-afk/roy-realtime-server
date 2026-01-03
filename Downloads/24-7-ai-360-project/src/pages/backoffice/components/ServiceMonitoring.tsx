import { useState, useEffect } from 'react';

interface ServiceStatus {
  name: string;
  status: 'online' | 'offline' | 'checking' | 'not_configured';
  responseTime?: number;
  lastChecked?: string;
  error?: string;
}

interface ServiceConfig {
  openai: {
    apiKey: string;
  };
  twilio: {
    accountSid: string;
    authToken: string;
  };
}

export default function ServiceMonitoring() {
  const [services, setServices] = useState<ServiceStatus[]>([
    {
      name: 'OpenAI API',
      status: 'checking',
      lastChecked: new Date().toISOString(),
    },
    {
      name: 'Twilio Service',
      status: 'checking',
      lastChecked: new Date().toISOString(),
    },
  ]);

  const [isChecking, setIsChecking] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [showConfig, setShowConfig] = useState(false);
  
  // Edit states for individual services
  const [editingService, setEditingService] = useState<string | null>(null);
  
  const [config, setConfig] = useState<ServiceConfig>({
    openai: {
      apiKey: '',
    },
    twilio: {
      accountSid: '',
      authToken: '',
    },
  });

  // Load config from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('service_monitoring_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        
        const migratedConfig: ServiceConfig = {
          openai: {
            apiKey: parsed.openai?.apiKey || '',
          },
          twilio: {
            accountSid: parsed.twilio?.accountSid || '',
            authToken: parsed.twilio?.authToken || '',
          },
        };
        
        setConfig(migratedConfig);
        
        // Auto-check on load if configured
        const hasOpenAIConfig = migratedConfig.openai.apiKey;
        const hasTwilioConfig = migratedConfig.twilio.accountSid;
        
        if (hasOpenAIConfig || hasTwilioConfig) {
          checkAllServices(migratedConfig);
        }
      } catch (e) {
        console.error('Failed to load config:', e);
      }
    }
  }, []);

  // Auto-refresh effect
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      checkAllServices(config);
    }, refreshInterval * 1000);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval, config]);

  const saveConfig = (newConfig: ServiceConfig) => {
    setConfig(newConfig);
    localStorage.setItem('service_monitoring_config', JSON.stringify(newConfig));
  };

  const checkOpenAIStatus = async (apiKey: string): Promise<ServiceStatus> => {
    if (!apiKey) {
      return {
        name: 'OpenAI API',
        status: 'not_configured',
        error: 'API key not configured',
        lastChecked: new Date().toISOString(),
      };
    }

    const startTime = Date.now();
    
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
        signal: AbortSignal.timeout(5000),
      });

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        return {
          name: 'OpenAI API',
          status: 'offline',
          responseTime,
          error: `HTTP ${response.status}`,
          lastChecked: new Date().toISOString(),
        };
      }

      return {
        name: 'OpenAI API',
        status: 'online',
        responseTime,
        lastChecked: new Date().toISOString(),
      };
    } catch (error: any) {
      return {
        name: 'OpenAI API',
        status: 'offline',
        responseTime: Date.now() - startTime,
        error: error.message || 'Connection failed',
        lastChecked: new Date().toISOString(),
      };
    }
  };

  const checkTwilioStatus = async (accountSid: string, authToken: string): Promise<ServiceStatus> => {
    if (!accountSid || !authToken) {
      return {
        name: 'Twilio Service',
        status: 'not_configured',
        error: 'Credentials not configured',
        lastChecked: new Date().toISOString(),
      };
    }

    const startTime = Date.now();
    
    try {
      const credentials = btoa(`${accountSid}:${authToken}`);
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${credentials}`,
        },
        signal: AbortSignal.timeout(5000),
      });

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        return {
          name: 'Twilio Service',
          status: 'offline',
          responseTime,
          error: `HTTP ${response.status}`,
          lastChecked: new Date().toISOString(),
        };
      }

      return {
        name: 'Twilio Service',
        status: 'online',
        responseTime,
        lastChecked: new Date().toISOString(),
      };
    } catch (error: any) {
      return {
        name: 'Twilio Service',
        status: 'offline',
        responseTime: Date.now() - startTime,
        error: error.message || 'Connection failed',
        lastChecked: new Date().toISOString(),
      };
    }
  };

  const checkAllServices = async (configToUse: ServiceConfig = config) => {
    setIsChecking(true);

    const [openaiStatus, twilioStatus] = await Promise.all([
      checkOpenAIStatus(configToUse.openai.apiKey),
      checkTwilioStatus(configToUse.twilio.accountSid, configToUse.twilio.authToken),
    ]);

    setServices([openaiStatus, twilioStatus]);
    setIsChecking(false);
  };

  const handleSaveConfig = () => {
    saveConfig(config);
    setShowConfig(false);
    checkAllServices(config);
  };

  const handleUpdateService = async (serviceName: string) => {
    saveConfig(config);
    setEditingService(null);
    
    // Re-check only the updated service
    if (serviceName === 'OpenAI API') {
      const status = await checkOpenAIStatus(config.openai.apiKey);
      setServices(prev => prev.map(s => s.name === serviceName ? status : s));
    } else if (serviceName === 'Twilio Service') {
      const status = await checkTwilioStatus(config.twilio.accountSid, config.twilio.authToken);
      setServices(prev => prev.map(s => s.name === serviceName ? status : s));
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'text-green-600 bg-green-100 border-green-200';
      case 'offline': return 'text-red-600 bg-red-100 border-red-200';
      case 'checking': return 'text-blue-600 bg-blue-100 border-blue-200';
      case 'not_configured': return 'text-orange-600 bg-orange-100 border-orange-200';
      default: return 'text-gray-600 bg-gray-100 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'online': return 'ri-checkbox-circle-line';
      case 'offline': return 'ri-close-circle-line';
      case 'checking': return 'ri-loader-4-line animate-spin';
      case 'not_configured': return 'ri-settings-3-line';
      default: return 'ri-question-line';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'online': return 'Online';
      case 'offline': return 'Offline';
      case 'checking': return 'Checking...';
      case 'not_configured': return 'Not Configured';
      default: return 'Unknown';
    }
  };

  const overallStatus = services.every(s => s.status === 'online') ? 'online' : 
                       services.some(s => s.status === 'offline') ? 'offline' : 
                       services.some(s => s.status === 'not_configured') ? 'not_configured' : 'checking';

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Service Health Monitoring</h2>
            <p className="text-gray-600">Real-time monitoring of all connected services</p>
          </div>
          <div className={`flex items-center px-4 py-2 rounded-full text-sm font-medium ${getStatusColor(overallStatus)}`}>
            <i className={`${getStatusIcon(overallStatus)} mr-2`}></i>
            {overallStatus === 'online' ? 'All Systems Operational' : 
             overallStatus === 'offline' ? 'Service Issues Detected' :
             overallStatus === 'not_configured' ? 'Configuration Required' : 'Checking...'}
          </div>
        </div>

        {/* Control Panel */}
        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={() => checkAllServices()}
            disabled={isChecking}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors whitespace-nowrap cursor-pointer flex items-center"
          >
            {isChecking ? (
              <>
                <i className="ri-loader-4-line animate-spin mr-2"></i>
                Checking...
              </>
            ) : (
              <>
                <i className="ri-refresh-line mr-2"></i>
                Check Now
              </>
            )}
          </button>

          <button
            onClick={() => setShowConfig(!showConfig)}
            className="bg-gray-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-gray-700 transition-colors whitespace-nowrap cursor-pointer flex items-center"
          >
            <i className="ri-settings-3-line mr-2"></i>
            {showConfig ? 'Hide Config' : 'Configure'}
          </button>

          <div className="flex items-center gap-3">
            <label className="flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="mr-2 cursor-pointer"
              />
              <span className="text-sm font-medium text-gray-700">Auto-refresh</span>
            </label>
            
            {autoRefresh && (
              <select
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(Number(e.target.value))}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value={10}>Every 10s</option>
                <option value={30}>Every 30s</option>
                <option value={60}>Every 1m</option>
                <option value={300}>Every 5m</option>
              </select>
            )}
          </div>
        </div>

        {/* Configuration Panel */}
        {showConfig && (
          <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-6 space-y-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Service Configuration</h3>
              <button
                onClick={() => setShowConfig(false)}
                className="text-gray-500 hover:text-gray-700 cursor-pointer"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
            </div>

            {/* OpenAI Config */}
            <div className="bg-white rounded-lg p-4 border border-blue-200">
              <h4 className="font-bold text-gray-900 mb-3 flex items-center">
                <i className="ri-robot-line mr-2 text-green-600"></i>
                OpenAI API
              </h4>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  API Key
                </label>
                <input
                  type="password"
                  value={config.openai.apiKey}
                  onChange={(e) => setConfig({
                    ...config,
                    openai: { apiKey: e.target.value }
                  })}
                  placeholder="sk-..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* Twilio Config */}
            <div className="bg-white rounded-lg p-4 border border-blue-200">
              <h4 className="font-bold text-gray-900 mb-3 flex items-center">
                <i className="ri-phone-line mr-2 text-purple-600"></i>
                Twilio Service
              </h4>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Account SID
                  </label>
                  <input
                    type="text"
                    value={config.twilio.accountSid}
                    onChange={(e) => setConfig({
                      ...config,
                      twilio: { ...config.twilio, accountSid: e.target.value }
                    })}
                    placeholder="AC..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Auth Token
                  </label>
                  <input
                    type="password"
                    value={config.twilio.authToken}
                    onChange={(e) => setConfig({
                      ...config,
                      twilio: { ...config.twilio, authToken: e.target.value }
                    })}
                    placeholder="Your auth token"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={handleSaveConfig}
              className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors whitespace-nowrap cursor-pointer flex items-center justify-center"
            >
              <i className="ri-save-line mr-2"></i>
              Save Configuration & Start Monitoring
            </button>
          </div>
        )}
      </div>

      {/* Service Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {services.map((service) => (
          <div
            key={service.name}
            className={`bg-white rounded-xl shadow-lg border-2 p-6 transition-all ${
              service.status === 'online' ? 'border-green-200' :
              service.status === 'offline' ? 'border-red-200' :
              service.status === 'not_configured' ? 'border-orange-200' :
              'border-gray-200'
            }`}
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h3 className="font-bold text-gray-900 text-lg mb-2">{service.name}</h3>
                <div className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(service.status)}`}>
                  <i className={`${getStatusIcon(service.status)} mr-2`}></i>
                  {getStatusText(service.status)}
                </div>
              </div>
              
              {/* Edit Button - Always Visible */}
              <button
                onClick={() => {
                  if (editingService === service.name) {
                    setEditingService(null);
                  } else {
                    setEditingService(service.name);
                  }
                }}
                className={`p-2 rounded-lg transition-colors cursor-pointer ${
                  editingService === service.name 
                    ? 'bg-blue-100 text-blue-600' 
                    : 'bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-600'
                }`}
                title={editingService === service.name ? "Close editor" : "Edit configuration"}
              >
                <i className={`${editingService === service.name ? 'ri-close-line' : 'ri-edit-line'} text-xl`}></i>
              </button>
            </div>

            {/* Edit Panel - Shows when editing */}
            {editingService === service.name && (
              <div className="mt-4 p-4 bg-blue-50 border-2 border-blue-300 rounded-lg space-y-3">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-bold text-gray-900 text-sm">Configure {service.name}</h4>
                  <i className="ri-settings-3-line text-blue-600"></i>
                </div>

                {service.name === 'OpenAI API' && (
                  <div>
                    <label className="block text-sm font-bold text-gray-900 mb-2">
                      OpenAI API Key
                    </label>
                    <input
                      type="password"
                      value={config.openai.apiKey}
                      onChange={(e) => setConfig({
                        ...config,
                        openai: { apiKey: e.target.value }
                      })}
                      placeholder="sk-..."
                      className="w-full px-3 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <p className="text-xs text-gray-600 mt-2">
                      Get from: <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">OpenAI Platform</a>
                    </p>
                  </div>
                )}

                {service.name === 'Twilio Service' && (
                  <>
                    <div>
                      <label className="block text-sm font-bold text-gray-900 mb-2">
                        Twilio Account SID
                      </label>
                      <input
                        type="text"
                        value={config.twilio.accountSid}
                        onChange={(e) => setConfig({
                          ...config,
                          twilio: { ...config.twilio, accountSid: e.target.value }
                        })}
                        placeholder="AC..."
                        className="w-full px-3 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-gray-900 mb-2">
                        Twilio Auth Token
                      </label>
                      <input
                        type="password"
                        value={config.twilio.authToken}
                        onChange={(e) => setConfig({
                          ...config,
                          twilio: { ...config.twilio, authToken: e.target.value }
                        })}
                        placeholder="Your auth token"
                        className="w-full px-3 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <p className="text-xs text-gray-600">
                      Get from: <a href="https://console.twilio.com/" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">Twilio Console</a>
                    </p>
                  </>
                )}

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => handleUpdateService(service.name)}
                    className="flex-1 bg-blue-600 text-white px-4 py-3 rounded-lg text-sm font-bold hover:bg-blue-700 transition-colors whitespace-nowrap cursor-pointer flex items-center justify-center"
                  >
                    <i className="ri-check-line mr-2"></i>
                    Save & Test Connection
                  </button>
                  <button
                    onClick={() => setEditingService(null)}
                    className="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-300 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Service Details */}
            {service.responseTime !== undefined && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Response Time:</span>
                  <span className="font-medium text-gray-900">{service.responseTime}ms</span>
                </div>
              </div>
            )}

            {service.lastChecked && (
              <div className="mt-2 text-xs text-gray-500">
                Last checked: {new Date(service.lastChecked).toLocaleTimeString()}
              </div>
            )}

            {service.error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-xs text-red-600 font-medium">Error:</p>
                <p className="text-xs text-red-500 mt-1">{service.error}</p>
              </div>
            )}

            {service.status === 'not_configured' && !editingService && (
              <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                <p className="text-xs text-orange-700">
                  <i className="ri-information-line mr-1"></i>
                  Click the edit icon above to configure this service
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Help Section */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6">
        <h3 className="font-bold text-gray-900 mb-4 flex items-center">
          <i className="ri-information-line mr-2 text-blue-600"></i>
          Quick Setup Guide
        </h3>
        
        <div className="space-y-3 text-sm text-gray-700">
          <div className="flex items-start">
            <div className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center mr-3 mt-0.5 flex-shrink-0">
              1
            </div>
            <div>
              <p className="font-medium text-gray-900">OpenAI API</p>
              <p className="text-gray-600 mt-1">Get your API key from OpenAI Platform → API Keys</p>
            </div>
          </div>

          <div className="flex items-start">
            <div className="w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center mr-3 mt-0.5 flex-shrink-0">
              2
            </div>
            <div>
              <p className="font-medium text-gray-900">Twilio Service</p>
              <p className="text-gray-600 mt-1">Find your Account SID and Auth Token in Twilio Console</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

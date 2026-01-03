import { useState } from 'react';

export default function SystemSettings() {
  const [settings, setSettings] = useState({
    notifications: {
      emailAlerts: true,
      smsAlerts: false,
      webhookUrl: '',
      dailyReports: true
    },
    security: {
      twoFactorAuth: false,
      sessionTimeout: '30',
      ipWhitelist: '',
      apiRateLimit: '1000'
    },
    integrations: {
      googleCalendar: false,
      outlook: false,
      zapier: false,
      slack: false
    },
    backup: {
      autoBackup: true,
      backupFrequency: 'daily',
      retentionDays: '30'
    }
  });

  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSave = async () => {
    setIsSaving(true);
    setSaveStatus('idle');

    // Simulate save
    setTimeout(() => {
      setSaveStatus('success');
      setIsSaving(false);
    }, 1500);
  };

  const updateSetting = (category: string, field: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      [category]: {
        ...prev[category as keyof typeof prev],
        [field]: value
      }
    }));
  };

  return (
    <div className="space-y-8">
      {/* System Status */}
      <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-8">
        <h2 className="text-2xl font-bold text-white mb-6">System Status</h2>
        
        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-gray-700/30 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-white">Server Health</h4>
              <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-300">CPU Usage:</span>
                <span className="text-green-400">23%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Memory:</span>
                <span className="text-green-400">45%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Uptime:</span>
                <span className="text-green-400">99.9%</span>
              </div>
            </div>
          </div>

          <div className="bg-gray-700/30 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-white">API Status</h4>
              <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-300">Requests/min:</span>
                <span className="text-green-400">847</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Success Rate:</span>
                <span className="text-green-400">99.2%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Avg Response:</span>
                <span className="text-green-400">120ms</span>
              </div>
            </div>
          </div>

          <div className="bg-gray-700/30 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-semibold text-white">Database</h4>
              <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-300">Connections:</span>
                <span className="text-green-400">12/100</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Query Time:</span>
                <span className="text-green-400">45ms</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">Storage:</span>
                <span className="text-green-400">2.3GB</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-8">
        <h3 className="text-xl font-bold text-white mb-6">Notification Settings</h3>
        
        <div className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="flex items-center justify-between p-4 bg-gray-700/30 rounded-lg">
              <div className="flex items-center">
                <i className="ri-mail-line text-cyan-400 mr-3 text-xl"></i>
                <span className="text-white font-medium">Email Alerts</span>
              </div>
              <button
                onClick={() => updateSetting('notifications', 'emailAlerts', !settings.notifications.emailAlerts)}
                className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer ${
                  settings.notifications.emailAlerts ? 'bg-cyan-500' : 'bg-gray-600'
                }`}
              >
                <div className={`absolute w-5 h-5 bg-white rounded-full top-0.5 transition-transform ${
                  settings.notifications.emailAlerts ? 'translate-x-6' : 'translate-x-0.5'
                }`}></div>
              </button>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-700/30 rounded-lg">
              <div className="flex items-center">
                <i className="ri-message-line text-cyan-400 mr-3 text-xl"></i>
                <span className="text-white font-medium">SMS Alerts</span>
              </div>
              <button
                onClick={() => updateSetting('notifications', 'smsAlerts', !settings.notifications.smsAlerts)}
                className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer ${
                  settings.notifications.smsAlerts ? 'bg-cyan-500' : 'bg-gray-600'
                }`}
              >
                <div className={`absolute w-5 h-5 bg-white rounded-full top-0.5 transition-transform ${
                  settings.notifications.smsAlerts ? 'translate-x-6' : 'translate-x-0.5'
                }`}></div>
              </button>
            </div>

            <div className="flex items-center justify-between p-4 bg-gray-700/30 rounded-lg">
              <div className="flex items-center">
                <i className="ri-file-chart-line text-cyan-400 mr-3 text-xl"></i>
                <span className="text-white font-medium">Daily Reports</span>
              </div>
              <button
                onClick={() => updateSetting('notifications', 'dailyReports', !settings.notifications.dailyReports)}
                className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer ${
                  settings.notifications.dailyReports ? 'bg-cyan-500' : 'bg-gray-600'
                }`}
              >
                <div className={`absolute w-5 h-5 bg-white rounded-full top-0.5 transition-transform ${
                  settings.notifications.dailyReports ? 'translate-x-6' : 'translate-x-0.5'
                }`}></div>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Webhook URL
            </label>
            <input
              type="url"
              value={settings.notifications.webhookUrl}
              onChange={(e) => updateSetting('notifications', 'webhookUrl', e.target.value)}
              placeholder="https://your-webhook-url.com"
              className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Security Settings */}
      <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-8">
        <h3 className="text-xl font-bold text-white mb-6">Security Settings</h3>
        
        <div className="space-y-6">
          <div className="flex items-center justify-between p-4 bg-gray-700/30 rounded-lg">
            <div className="flex items-center">
              <i className="ri-shield-check-line text-cyan-400 mr-3 text-xl"></i>
              <div>
                <span className="text-white font-medium block">Two-Factor Authentication</span>
                <span className="text-gray-400 text-sm">Add extra security to your account</span>
              </div>
            </div>
            <button
              onClick={() => updateSetting('security', 'twoFactorAuth', !settings.security.twoFactorAuth)}
              className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer ${
                settings.security.twoFactorAuth ? 'bg-cyan-500' : 'bg-gray-600'
              }`}
            >
              <div className={`absolute w-5 h-5 bg-white rounded-full top-0.5 transition-transform ${
                settings.security.twoFactorAuth ? 'translate-x-6' : 'translate-x-0.5'
              }`}></div>
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Session Timeout (minutes)
              </label>
              <select
                value={settings.security.sessionTimeout}
                onChange={(e) => updateSetting('security', 'sessionTimeout', e.target.value)}
                className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500 transition-colors pr-8"
              >
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
                <option value="120">2 hours</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                API Rate Limit (requests/hour)
              </label>
              <input
                type="number"
                value={settings.security.apiRateLimit}
                onChange={(e) => updateSetting('security', 'apiRateLimit', e.target.value)}
                className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              IP Whitelist (comma-separated)
            </label>
            <textarea
              value={settings.security.ipWhitelist}
              onChange={(e) => updateSetting('security', 'ipWhitelist', e.target.value)}
              rows={3}
              placeholder="192.168.1.1, 10.0.0.1"
              className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500 transition-colors resize-none"
            />
          </div>
        </div>
      </div>

      {/* Backup Settings */}
      <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-8">
        <h3 className="text-xl font-bold text-white mb-6">Backup & Recovery</h3>
        
        <div className="space-y-6">
          <div className="flex items-center justify-between p-4 bg-gray-700/30 rounded-lg">
            <div className="flex items-center">
              <i className="ri-save-line text-cyan-400 mr-3 text-xl"></i>
              <span className="text-white font-medium">Automatic Backups</span>
            </div>
            <button
              onClick={() => updateSetting('backup', 'autoBackup', !settings.backup.autoBackup)}
              className={`relative w-12 h-6 rounded-full transition-colors cursor-pointer ${
                settings.backup.autoBackup ? 'bg-cyan-500' : 'bg-gray-600'
              }`}
            >
              <div className={`absolute w-5 h-5 bg-white rounded-full top-0.5 transition-transform ${
                settings.backup.autoBackup ? 'translate-x-6' : 'translate-x-0.5'
              }`}></div>
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Backup Frequency
              </label>
              <select
                value={settings.backup.backupFrequency}
                onChange={(e) => updateSetting('backup', 'backupFrequency', e.target.value)}
                className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500 transition-colors pr-8"
              >
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Retention Period (days)
              </label>
              <input
                type="number"
                value={settings.backup.retentionDays}
                onChange={(e) => updateSetting('backup', 'retentionDays', e.target.value)}
                className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500 transition-colors"
              />
            </div>
          </div>

          <div className="flex space-x-4">
            <button className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:from-cyan-600 hover:to-blue-700 transition-all whitespace-nowrap cursor-pointer">
              <i className="ri-download-line mr-2"></i>
              Create Backup Now
            </button>
            <button className="bg-gray-700 text-white px-6 py-3 rounded-lg font-medium hover:bg-gray-600 transition-colors whitespace-nowrap cursor-pointer">
              <i className="ri-upload-line mr-2"></i>
              Restore from Backup
            </button>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-8 py-3 rounded-lg font-semibold hover:from-cyan-600 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
        >
          {isSaving ? (
            <>
              <i className="ri-loader-4-line mr-2 animate-spin"></i>
              Saving Settings...
            </>
          ) : (
            <>
              <i className="ri-save-line mr-2"></i>
              Save All Settings
            </>
          )}
        </button>
      </div>

      {saveStatus === 'success' && (
        <div className="p-4 bg-green-500/20 border border-green-500/30 rounded-lg text-green-400 text-center">
          <i className="ri-check-circle-line mr-2"></i>
          All settings saved successfully!
        </div>
      )}
    </div>
  );
}
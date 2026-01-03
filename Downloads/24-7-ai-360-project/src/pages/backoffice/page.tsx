import { useState } from 'react';
import AdminNavigation from './components/AdminNavigation';
import WebhookSetup from './components/WebhookSetup';
import AIConfiguration from './components/AIConfiguration';
import ClientManagement from './components/ClientManagement';
import RequestsManagement from './components/RequestsManagement';
import SystemSettings from './components/SystemSettings';
import ServiceMonitoring from './components/ServiceMonitoring';
import TwilioIntegration from './components/TwilioIntegration';
import BusinessConfiguration from './components/BusinessConfiguration';
import AutomationControl from './components/AutomationControl';

export default function Backoffice() {
  const [activeTab, setActiveTab] = useState<'clients' | 'requests' | 'webhook' | 'ai' | 'business' | 'twilio' | 'monitoring' | 'automation' | 'settings'>('clients');

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminNavigation activeTab={activeTab} onTabChange={setActiveTab} />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'clients' && <ClientManagement />}
        {activeTab === 'requests' && <RequestsManagement />}
        {activeTab === 'webhook' && <WebhookSetup />}
        {activeTab === 'ai' && <AIConfiguration />}
        {activeTab === 'business' && <BusinessConfiguration />}
        {activeTab === 'twilio' && <TwilioIntegration />}
        {activeTab === 'monitoring' && <ServiceMonitoring />}
        {activeTab === 'automation' && <AutomationControl />}
        {activeTab === 'settings' && <SystemSettings />}
      </main>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

interface AdminNavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function AdminNavigation({ 
  activeTab, 
  onTabChange 
}: { 
  activeTab: string; 
  onTabChange: (tab: 'clients' | 'requests' | 'webhook' | 'ai' | 'business' | 'twilio' | 'monitoring' | 'automation' | 'settings') => void;
}) {
  const [newRequestsCount, setNewRequestsCount] = useState(0);

  useEffect(() => {
    fetchNewRequestsCount();

    // Real-time subscription for both tables
    const conversationsSubscription = supabase
      .channel('nav_conversations')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'readdy_agent_conversations' },
        () => {
          fetchNewRequestsCount();
        }
      )
      .subscribe();

    const clientsSubscription = supabase
      .channel('nav_clients')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'clients' },
        () => {
          fetchNewRequestsCount();
        }
      )
      .subscribe();

    return () => {
      conversationsSubscription.unsubscribe();
      clientsSubscription.unsubscribe();
    };
  }, []);

  const fetchNewRequestsCount = async () => {
    try {
      // Count new requests from conversations
      const { count: convCount } = await supabase
        .from('readdy_agent_conversations')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'new');

      // Count new requests from clients
      const { count: clientsCount } = await supabase
        .from('clients')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'new');

      const totalNew = (convCount || 0) + (clientsCount || 0);
      setNewRequestsCount(totalNew);
    } catch (error) {
      console.error('Error fetching new requests count:', error);
    }
  };

  const getDisplayCount = () => {
    if (newRequestsCount === 0) return null;
    if (newRequestsCount > 100) return '100+';
    return newRequestsCount.toString();
  };

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-r from-teal-500 to-cyan-600 rounded-xl flex items-center justify-center">
              <i className="ri-dashboard-line text-white text-xl"></i>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Admin Dashboard</h1>
              <p className="text-xs text-gray-500">24/7 AI 360 Management</p>
            </div>
          </div>

          {/* Notification Bell */}
          <button
            onClick={() => onTabChange('requests')}
            className="relative p-2 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
          >
            <i className="ri-notification-3-line text-2xl text-gray-700"></i>
            {newRequestsCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center animate-pulse">
                {newRequestsCount > 100 ? '100+' : newRequestsCount}
              </span>
            )}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 -mb-px overflow-x-auto">
          <button
            onClick={() => onTabChange('clients')}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'clients'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            <i className="ri-team-line"></i>
            Clients
          </button>

          <button
            onClick={() => onTabChange('requests')}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors cursor-pointer flex items-center gap-2 relative ${
              activeTab === 'requests'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            <i className="ri-message-3-line"></i>
            Requests
            {newRequestsCount > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {newRequestsCount > 100 ? '99+' : newRequestsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => onTabChange('webhook')}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'webhook'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            <i className="ri-webhook-line"></i>
            Webhook
          </button>

          <button
            onClick={() => onTabChange('ai')}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'ai'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            <i className="ri-robot-line"></i>
            AI Setup
          </button>

          <button
            onClick={() => onTabChange('business')}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'business'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            <i className="ri-building-line"></i>
            Business Info
          </button>

          <button
            onClick={() => onTabChange('twilio')}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'twilio'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            <i className="ri-phone-line"></i>
            Twilio
          </button>

          <button
            onClick={() => onTabChange('monitoring')}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'monitoring'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            <i className="ri-line-chart-line"></i>
            Monitoring
          </button>

          <button
            onClick={() => onTabChange('automation')}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'automation'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            <i className="ri-robot-line"></i>
            Automation
          </button>

          <button
            onClick={() => onTabChange('settings')}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'settings'
                ? 'border-teal-500 text-teal-600'
                : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
            }`}
          >
            <i className="ri-settings-3-line"></i>
            Settings
          </button>
        </div>
      </div>
    </nav>
  );
}

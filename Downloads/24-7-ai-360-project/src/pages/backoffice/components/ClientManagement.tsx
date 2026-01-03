import { useState, useEffect } from 'react';

interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  industry: string;
  business_type: string;
  status: 'new' | 'contacted' | 'qualified' | 'converted' | 'inactive';
  source: 'phone_call' | 'web_form' | 'integration_form';
  created_at: string;
  last_contact_date: string;
  message: string;
  call_transcript?: string;
  call_summary?: string;
  call_duration?: number;
  metadata?: any;
}

interface Statistics {
  total: number;
  by_source: {
    phone_call: number;
    web_form: number;
    integration_form: number;
  };
  by_status: {
    new: number;
    contacted: number;
    qualified: number;
    converted: number;
    inactive: number;
  };
}

export default function ClientManagement() {
  const [clients, setClients] = useState<Client[]>([]);
  const [statistics, setStatistics] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Fetch clients from database
  const fetchClients = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/get-client-leads`,
        {
          headers: {
            'Authorization': `Bearer ${import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY}`
          }
        }
      );

      const result = await response.json();
      
      if (result.success) {
        setClients(result.clients);
        setStatistics(result.statistics);
      }
    } catch (error) {
      console.error('Error fetching clients:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  // Filter clients
  const filteredClients = clients.filter(client => {
    const matchesSearch = 
      client.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      client.phone?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || client.status === statusFilter;
    const matchesSource = sourceFilter === 'all' || client.source === sourceFilter;
    
    return matchesSearch && matchesStatus && matchesSource;
  });

  // Update client status
  const updateClientStatus = async (clientId: string, newStatus: string, notes?: string) => {
    try {
      setUpdatingStatus(true);
      const response = await fetch(
        `${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/update-client-status`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({
            client_id: clientId,
            status: newStatus,
            notes
          })
        }
      );

      const result = await response.json();
      
      if (result.success) {
        // Refresh clients list
        await fetchClients();
        
        // Show success notification
        showNotification('Status updated successfully!', 'success');
      }
    } catch (error) {
      console.error('Error updating status:', error);
      showNotification('Failed to update status', 'error');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const showNotification = (message: string, type: 'success' | 'error') => {
    const notification = document.createElement('div');
    notification.className = `fixed top-4 right-4 ${type === 'success' ? 'bg-green-500' : 'bg-red-500'} text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center space-x-2`;
    notification.innerHTML = `
      <i class="ri-${type === 'success' ? 'check' : 'error-warning'}-line"></i>
      <span>${message}</span>
    `;
    document.body.appendChild(notification);
    
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 3000);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'contacted': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'qualified': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'converted': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'inactive': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getSourceIcon = (source: string) => {
    switch (source) {
      case 'phone_call': return 'ri-phone-line';
      case 'web_form': return 'ri-global-line';
      case 'integration_form': return 'ri-settings-3-line';
      default: return 'ri-user-line';
    }
  };

  const getSourceColor = (source: string) => {
    switch (source) {
      case 'phone_call': return 'text-cyan-400';
      case 'web_form': return 'text-blue-400';
      case 'integration_form': return 'text-purple-400';
      default: return 'text-gray-400';
    }
  };

  const handleViewDetails = (client: Client) => {
    setSelectedClient(client);
    setShowDetailModal(true);
  };

  const handleEmailClient = async (client: Client) => {
    const emailTemplate = `To: ${client.email || 'N/A'}
From: 247@247ai360.com
Subject: Re: Your AI Assistant Inquiry

Dear ${client.name},

Thank you for your interest in our AI assistant services${client.company ? ` for ${client.company}` : ''}.

${client.message ? `Regarding your message: "${client.message}"` : ''}

${client.source === 'phone_call' ? 'Thank you for your recent phone call. ' : ''}We've reviewed your inquiry and would love to discuss how our AI assistant can help your business.

Best regards,
247 AI 360 Team
247@247ai360.com
Phone: +34638838399`;

    try {
      await navigator.clipboard.writeText(emailTemplate);
      showNotification('Email template copied to clipboard!', 'success');
    } catch (err) {
      console.error('Failed to copy:', err);
      alert('Email template:\n\n' + emailTemplate);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <i className="ri-loader-4-line text-4xl text-cyan-400 animate-spin mb-4"></i>
          <p className="text-gray-300">Loading client leads...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header Stats */}
      <div className="grid md:grid-cols-5 gap-6">
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-xl p-6 text-center">
          <div className="text-3xl font-bold text-white mb-2">{statistics?.total || 0}</div>
          <div className="text-gray-300 text-sm">Total Leads</div>
        </div>
        <div className="bg-gray-800/50 backdrop-blur-sm border border-cyan-500/30 rounded-xl p-6 text-center">
          <div className="text-3xl font-bold text-cyan-400 mb-2">
            {statistics?.by_source.phone_call || 0}
          </div>
          <div className="text-gray-300 text-sm">Phone Calls</div>
        </div>
        <div className="bg-gray-800/50 backdrop-blur-sm border border-blue-500/30 rounded-xl p-6 text-center">
          <div className="text-3xl font-bold text-blue-400 mb-2">
            {statistics?.by_source.web_form || 0}
          </div>
          <div className="text-gray-300 text-sm">Web Forms</div>
        </div>
        <div className="bg-gray-800/50 backdrop-blur-sm border border-green-500/30 rounded-xl p-6 text-center">
          <div className="text-3xl font-bold text-green-400 mb-2">
            {statistics?.by_status.new || 0}
          </div>
          <div className="text-gray-300 text-sm">New Leads</div>
        </div>
        <div className="bg-gray-800/50 backdrop-blur-sm border border-purple-500/30 rounded-xl p-6 text-center">
          <div className="text-3xl font-bold text-purple-400 mb-2">
            {statistics?.by_status.converted || 0}
          </div>
          <div className="text-gray-300 text-sm">Converted</div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <input
                type="text"
                placeholder="Search by name, email, company, or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-3 pl-12 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500 transition-colors text-sm"
              />
              <i className="ri-search-line absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
            </div>
          </div>
          
          <div>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500 transition-colors pr-8 text-sm"
            >
              <option value="all">All Sources</option>
              <option value="phone_call">Phone Calls</option>
              <option value="web_form">Web Forms</option>
              <option value="integration_form">Integration Forms</option>
            </select>
          </div>
          
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500 transition-colors pr-8 text-sm"
            >
              <option value="all">All Status</option>
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="qualified">Qualified</option>
              <option value="converted">Converted</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <button
            onClick={fetchClients}
            className="px-6 py-3 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors whitespace-nowrap cursor-pointer text-sm"
          >
            <i className="ri-refresh-line mr-2"></i>
            Refresh
          </button>
        </div>
      </div>

      {/* Client List */}
      <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-gray-700/50">
          <h2 className="text-2xl font-bold text-white">Client Leads ({filteredClients.length})</h2>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-700/30">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-300">Source</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-300">Client Info</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-300">Contact</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-300">Status</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-300">Date</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {filteredClients.map((client) => (
                <tr key={client.id} className="hover:bg-gray-700/20 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <i className={`${getSourceIcon(client.source)} ${getSourceColor(client.source)} text-xl mr-2`}></i>
                      <span className="text-sm text-gray-300 capitalize">
                        {client.source.replace('_', ' ')}
                      </span>
                    </div>
                  </td>
                  
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <div className="w-10 h-10 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm mr-3">
                        {client.name?.split(' ').map(n => n[0]).join('').slice(0, 2) || '?'}
                      </div>
                      <div>
                        <div className="font-medium text-white">{client.name}</div>
                        {client.company && (
                          <div className="text-sm text-gray-400">{client.company}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  
                  <td className="px-6 py-4">
                    <div className="text-sm">
                      {client.email && (
                        <div className="text-white mb-1">{client.email}</div>
                      )}
                      {client.phone && (
                        <div className="text-gray-400">{client.phone}</div>
                      )}
                    </div>
                  </td>
                  
                  <td className="px-6 py-4">
                    <select
                      value={client.status}
                      onChange={(e) => updateClientStatus(client.id, e.target.value)}
                      disabled={updatingStatus}
                      className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(client.status)} bg-transparent cursor-pointer`}
                    >
                      <option value="new">New</option>
                      <option value="contacted">Contacted</option>
                      <option value="qualified">Qualified</option>
                      <option value="converted">Converted</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </td>
                  
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-300">
                      {new Date(client.created_at).toLocaleDateString()}
                    </div>
                    <div className="text-xs text-gray-500">
                      {new Date(client.created_at).toLocaleTimeString()}
                    </div>
                  </td>
                  
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleViewDetails(client)}
                        className="p-2 text-gray-400 hover:text-cyan-400 transition-colors cursor-pointer"
                        title="View details"
                      >
                        <i className="ri-eye-line"></i>
                      </button>
                      {client.email && (
                        <button
                          onClick={() => handleEmailClient(client)}
                          className="p-2 text-gray-400 hover:text-blue-400 transition-colors cursor-pointer"
                          title="Copy email template"
                        >
                          <i className="ri-mail-line"></i>
                        </button>
                      )}
                      {client.phone && (
                        <a
                          href={`tel:${client.phone}`}
                          className="p-2 text-gray-400 hover:text-green-400 transition-colors cursor-pointer"
                          title="Call client"
                        >
                          <i className="ri-phone-line"></i>
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {filteredClients.length === 0 && (
          <div className="p-12 text-center">
            <i className="ri-user-search-line text-4xl text-gray-500 mb-4"></i>
            <p className="text-gray-400">No client leads found matching your criteria</p>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedClient && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-700 flex items-center justify-between sticky top-0 bg-gray-800 z-10">
              <h3 className="text-2xl font-bold text-white">Lead Details</h3>
              <button
                onClick={() => setShowDetailModal(false)}
                className="text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                <i className="ri-close-line text-2xl"></i>
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              {/* Basic Info */}
              <div>
                <h4 className="text-lg font-semibold text-white mb-4">Basic Information</h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-400">Name</label>
                    <p className="text-white">{selectedClient.name}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-400">Email</label>
                    <p className="text-white">{selectedClient.email || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-400">Phone</label>
                    <p className="text-white">{selectedClient.phone || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-400">Company</label>
                    <p className="text-white">{selectedClient.company || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-400">Source</label>
                    <p className="text-white capitalize">{selectedClient.source.replace('_', ' ')}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-400">Status</label>
                    <p className="text-white capitalize">{selectedClient.status}</p>
                  </div>
                </div>
              </div>

              {/* Message */}
              {selectedClient.message && (
                <div>
                  <h4 className="text-lg font-semibold text-white mb-2">Message</h4>
                  <p className="text-gray-300 bg-gray-700/30 p-4 rounded-lg">{selectedClient.message}</p>
                </div>
              )}

              {/* Call Details */}
              {selectedClient.source === 'phone_call' && (
                <div>
                  <h4 className="text-lg font-semibold text-white mb-4">Call Details</h4>
                  {selectedClient.call_duration && (
                    <div className="mb-2">
                      <label className="text-sm text-gray-400">Duration</label>
                      <p className="text-white">{Math.floor(selectedClient.call_duration / 60)} minutes</p>
                    </div>
                  )}
                  {selectedClient.call_transcript && (
                    <div className="mb-4">
                      <label className="text-sm text-gray-400 mb-2 block">Transcript</label>
                      <div className="bg-gray-700/30 p-4 rounded-lg text-gray-300 max-h-60 overflow-y-auto">
                        {selectedClient.call_transcript}
                      </div>
                    </div>
                  )}
                  {selectedClient.call_summary && (
                    <div>
                      <label className="text-sm text-gray-400 mb-2 block">Summary</label>
                      <p className="text-gray-300 bg-gray-700/30 p-4 rounded-lg">{selectedClient.call_summary}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Dates */}
              <div>
                <h4 className="text-lg font-semibold text-white mb-4">Timeline</h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-gray-400">Created</label>
                    <p className="text-white">{new Date(selectedClient.created_at).toLocaleString()}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-400">Last Contact</label>
                    <p className="text-white">{new Date(selectedClient.last_contact_date).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
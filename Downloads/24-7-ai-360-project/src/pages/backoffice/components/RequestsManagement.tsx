import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

interface BusinessRequest {
  id: string;
  businessName: string;
  contactName: string;
  email: string;
  phone: string;
  businessType: string;
  industry: string;
  challenges: string;
  goals: string;
  submittedAt: string;
  status: 'new' | 'contacted' | 'in-progress' | 'closed';
  transcript?: string;
  callDuration?: number;
  source: 'demo_form' | 'chat_widget' | 'phone_call' | 'get-started';
  callVolume?: string;
  languages?: string[];
  features?: string[];
  integrations?: string[];
  timeline?: string;
  budget?: string;
}

export default function RequestsManagement() {
  const [requests, setRequests] = useState<BusinessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedRequest, setSelectedRequest] = useState<BusinessRequest | null>(null);
  const [newRequestsCount, setNewRequestsCount] = useState(0);

  // Fetch ALL requests from ALL THREE tables
  const fetchAllRequests = async () => {
    try {
      setLoading(true);

      // 1. Fetch from readdy_agent_conversations (chat widget)
      const { data: conversations, error: convError } = await supabase
        .from('readdy_agent_conversations')
        .select('*')
        .order('created_at', { ascending: false });

      if (convError) {
        console.error('Error fetching conversations:', convError);
      }

      // 2. Fetch from clients table (demo form submissions)
      const { data: clients, error: clientsError } = await supabase
        .from('clients')
        .select('*')
        .order('created_at', { ascending: false });

      if (clientsError) {
        console.error('Error fetching clients:', clientsError);
      }

      // 3. Fetch from lead_submissions table (Get Started form)
      const { data: leads, error: leadsError } = await supabase
        .from('lead_submissions')
        .select('*')
        .order('created_at', { ascending: false });

      if (leadsError) {
        console.error('Error fetching lead submissions:', leadsError);
      }

      console.log('Fetched conversations:', conversations);
      console.log('Fetched clients:', clients);
      console.log('Fetched lead submissions:', leads);

      // Transform chat widget conversations
      const transformedConversations: BusinessRequest[] = (conversations || []).map(conv => ({
        id: conv.id,
        businessName: conv.business_name || 'Not provided',
        contactName: conv.user_name || 'Anonymous',
        email: conv.user_email || 'No email provided',
        phone: conv.user_phone || 'No phone provided',
        businessType: conv.business_type || 'General Inquiry',
        industry: conv.business_type || 'Not specified',
        challenges: conv.message_content || conv.transcript || 'No message content',
        goals: `Call Duration: ${conv.call_duration || 0} seconds`,
        submittedAt: conv.created_at,
        status: conv.status || 'new',
        transcript: conv.transcript,
        callDuration: conv.call_duration,
        source: 'chat_widget'
      }));

      // Transform demo form submissions from clients table
      const transformedClients: BusinessRequest[] = (clients || []).map(client => ({
        id: client.id,
        businessName: client.company || client.business_name || client.name || 'Not provided',
        contactName: client.name || client.contact_name || 'Anonymous',
        email: client.email || 'No email provided',
        phone: client.phone || client.phone_number || 'No phone provided',
        businessType: client.industry || client.business_type || client.type || 'General Inquiry',
        industry: client.industry || client.type || 'Not specified',
        challenges: client.message || client.notes || client.details || 'No message provided',
        goals: 'Demo Request from Homepage',
        submittedAt: client.created_at,
        status: client.status || 'new',
        source: 'demo_form'
      }));

      // Transform Get Started form submissions from lead_submissions table
      const transformedLeads: BusinessRequest[] = (leads || []).map(lead => ({
        id: lead.id,
        businessName: lead.business_name || 'Not provided',
        contactName: lead.full_name || 'Anonymous',
        email: lead.email || 'No email provided',
        phone: lead.phone || 'No phone provided',
        businessType: lead.business_type || lead.industry || 'Not specified',
        industry: lead.industry || 'Not specified',
        challenges: lead.additional_notes || 'No additional notes',
        goals: `Get Started Form - ${lead.call_volume || 'Volume not specified'}`,
        submittedAt: lead.created_at,
        status: lead.status || 'new',
        source: 'get-started',
        callVolume: lead.call_volume,
        languages: lead.languages || [],
        features: lead.features || [],
        integrations: lead.integrations || [],
        timeline: lead.timeline,
        budget: lead.budget
      }));

      console.log('Transformed conversations:', transformedConversations);
      console.log('Transformed clients:', transformedClients);
      console.log('Transformed leads:', transformedLeads);

      // Merge ALL THREE arrays and sort by date
      const allRequests = [...transformedConversations, ...transformedClients, ...transformedLeads]
        .sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

      console.log('All merged requests:', allRequests);

      setRequests(allRequests);
      
      // Count new requests
      const newCount = allRequests.filter(r => r.status === 'new').length;
      setNewRequestsCount(newCount);

    } catch (error) {
      console.error('Error fetching requests:', error);
    } finally {
      setLoading(false);
    }
  };

  // Request notification permission on mount
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const showNotification = () => {
    // Browser notification for new requests
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('New Demo Request!', {
        body: 'You have a new client demo request. Check your backoffice.',
        icon: '/favicon.ico'
      });
    }
  };

  useEffect(() => {
    fetchAllRequests();
    
    // Set up real-time subscriptions for ALL THREE tables
    const conversationsSubscription = supabase
      .channel('readdy_conversations')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'readdy_agent_conversations' },
        () => {
          fetchAllRequests();
        }
      )
      .subscribe();

    const clientsSubscription = supabase
      .channel('clients_updates')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'clients' },
        () => {
          fetchAllRequests();
          showNotification();
        }
      )
      .subscribe();

    const leadsSubscription = supabase
      .channel('lead_submissions_updates')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'lead_submissions' },
        () => {
          fetchAllRequests();
          showNotification();
        }
      )
      .subscribe();

    return () => {
      conversationsSubscription.unsubscribe();
      clientsSubscription.unsubscribe();
      leadsSubscription.unsubscribe();
    };
  }, []);

  const filteredRequests = requests.filter(request => {
    const matchesSearch = request.businessName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         request.contactName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         request.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         request.businessType.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || request.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Calculate new requests count (excluding closed)
  const activeNewRequestsCount = requests.filter(r => r.status === 'new').length;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'contacted': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'in-progress': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'closed': return 'bg-green-500/20 text-green-400 border-green-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const getSourceBadge = (source: string) => {
    switch (source) {
      case 'demo_form': return { icon: 'ri-file-list-3-line', label: 'Demo Form', color: 'bg-cyan-500/20 text-cyan-400' };
      case 'chat_widget': return { icon: 'ri-chat-3-line', label: 'Chat Widget', color: 'bg-purple-500/20 text-purple-400' };
      case 'phone_call': return { icon: 'ri-phone-line', label: 'Phone Call', color: 'bg-green-500/20 text-green-400' };
      case 'get-started': return { icon: 'ri-rocket-line', label: 'Get Started', color: 'bg-orange-500/20 text-orange-400' };
      default: return { icon: 'ri-question-line', label: 'Unknown', color: 'bg-gray-500/20 text-gray-400' };
    }
  };

  const getBusinessTypeIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'hotels & hospitality':
      case 'hospitality': return 'ri-hotel-line';
      case 'healthcare': return 'ri-hospital-line';
      case 'beauty & wellness':
      case 'beauty': return 'ri-scissors-line';
      case 'professional services':
      case 'professional': return 'ri-briefcase-line';
      case 'technology': return 'ri-computer-line';
      case 'retail': return 'ri-store-line';
      case 'restaurant': return 'ri-restaurant-line';
      case 'rentals': return 'ri-home-line';
      default: return 'ri-building-line';
    }
  };

  const updateRequestStatus = async (id: string, newStatus: BusinessRequest['status'], source: string) => {
    try {
      // Update in the correct table based on source
      let tableName = 'clients';
      if (source === 'chat_widget') tableName = 'readdy_agent_conversations';
      if (source === 'get-started') tableName = 'lead_submissions';
      
      const { error } = await supabase
        .from(tableName)
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      setRequests(prev => prev.map(req => 
        req.id === id ? { ...req, status: newStatus } : req
      ));
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <i className="ri-loader-4-line text-4xl text-cyan-400 animate-spin mb-4"></i>
          <p className="text-gray-400">Loading all requests...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Notification Banner for New Requests - Only show if there are active new requests */}
      {activeNewRequestsCount > 0 && (
        <div className="bg-gradient-to-r from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 rounded-xl p-4 flex items-center justify-between animate-pulse">
          <div className="flex items-center">
            <i className="ri-notification-3-line text-2xl text-cyan-400 mr-3"></i>
            <div>
              <div className="text-white font-semibold">
                {activeNewRequestsCount} New Request{activeNewRequestsCount > 1 ? 's' : ''}!
              </div>
              <div className="text-gray-300 text-sm">You have unread demo requests waiting for your response</div>
            </div>
          </div>
          <button
            onClick={() => setStatusFilter('new')}
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            View Now
          </button>
        </div>
      )}

      {/* Header Stats */}
      <div className="grid md:grid-cols-4 gap-6">
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-xl p-6 text-center relative">
          {requests.filter(r => r.status === 'new').length > 0 && (
            <div className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center text-white text-xs font-bold animate-bounce">
              {requests.filter(r => r.status === 'new').length}
            </div>
          )}
          <div className="text-3xl font-bold text-blue-400 mb-2">
            {requests.filter(r => r.status === 'new').length}
          </div>
          <div className="text-gray-300">New Requests</div>
        </div>
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-xl p-6 text-center">
          <div className="text-3xl font-bold text-yellow-400 mb-2">
            {requests.filter(r => r.status === 'contacted').length}
          </div>
          <div className="text-gray-300">Contacted</div>
        </div>
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-xl p-6 text-center">
          <div className="text-3xl font-bold text-purple-400 mb-2">
            {requests.filter(r => r.status === 'in-progress').length}
          </div>
          <div className="text-gray-300">In Progress</div>
        </div>
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-xl p-6 text-center">
          <div className="text-3xl font-bold text-green-400 mb-2">
            {requests.filter(r => r.status === 'closed').length}
          </div>
          <div className="text-gray-300">Closed</div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <input
                type="text"
                placeholder="Search requests..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-3 pl-12 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500 transition-colors"
              />
              <i className="ri-search-line absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400"></i>
            </div>
          </div>
          
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500 transition-colors pr-8"
            >
              <option value="all">All Status</option>
              <option value="new">New</option>
              <option value="contacted">Contacted</option>
              <option value="in-progress">In Progress</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          <button
            onClick={fetchAllRequests}
            className="flex items-center px-4 py-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-refresh-line mr-2"></i>
            Refresh
          </button>
        </div>
      </div>

      {/* Requests List */}
      <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-gray-700/50">
          <h2 className="text-2xl font-bold text-white">All Client Requests</h2>
          <p className="text-gray-400 mt-1">Get Started forms, demo requests, chat conversations, and phone inquiries</p>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-700/30">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-300">Source</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-300">Business</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-300">Contact</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-300">Type</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-300">Status</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-300">Submitted</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/50">
              {filteredRequests.map((request) => {
                const sourceBadge = getSourceBadge(request.source);
                return (
                  <tr key={request.id} className="hover:bg-gray-700/20 transition-colors">
                    <td className="px-6 py-4">
                      <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${sourceBadge.color}`}>
                        <i className={`${sourceBadge.icon} mr-1`}></i>
                        {sourceBadge.label}
                      </div>
                    </td>
                    
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-medium text-white">{request.businessName}</div>
                        <div className="text-sm text-gray-400 truncate max-w-xs">
                          {request.challenges.substring(0, 60)}...
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-medium text-white">{request.contactName}</div>
                        <div className="text-sm text-gray-400">{request.email}</div>
                        <div className="text-sm text-gray-400">{request.phone}</div>
                      </div>
                    </td>
                    
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <i className={`${getBusinessTypeIcon(request.businessType)} text-cyan-400 mr-2`}></i>
                        <div className="text-sm text-white">{request.businessType}</div>
                      </div>
                    </td>
                    
                    <td className="px-6 py-4">
                      <select
                        value={request.status}
                        onChange={(e) => updateRequestStatus(request.id, e.target.value as BusinessRequest['status'], request.source)}
                        className={`px-3 py-1 rounded-full text-xs font-medium border cursor-pointer ${getStatusColor(request.status)}`}
                      >
                        <option value="new">New</option>
                        <option value="contacted">Contacted</option>
                        <option value="in-progress">In Progress</option>
                        <option value="closed">Closed</option>
                      </select>
                    </td>
                    
                    <td className="px-6 py-4">
                      <div className="text-sm text-white">{formatDate(request.submittedAt)}</div>
                    </td>
                    
                    <td className="px-6 py-4">
                      <div className="flex items-center space-x-2">
                        <button 
                          onClick={() => setSelectedRequest(request)}
                          className="p-2 text-gray-400 hover:text-cyan-400 transition-colors cursor-pointer"
                          title="View Details"
                        >
                          <i className="ri-eye-line"></i>
                        </button>
                        <button
                          onClick={() => window.location.href = `mailto:${request.email}?subject=Re: Your AI Assistant Inquiry&body=Dear ${request.contactName},%0D%0A%0D%0AThank you for contacting 247 AI 360.%0D%0A%0D%0ABest regards,%0D%0A247 AI 360 Team%0D%0A247@247ai360.com`}
                          className="p-2 text-gray-400 hover:text-blue-400 transition-colors cursor-pointer"
                          title="Send Email"
                        >
                          <i className="ri-mail-line"></i>
                        </button>
                        <a 
                          href={`tel:${request.phone}`}
                          className="p-2 text-gray-400 hover:text-blue-400 transition-colors cursor-pointer"
                          title="Call"
                        >
                          <i className="ri-phone-line"></i>
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        
        {filteredRequests.length === 0 && (
          <div className="p-12 text-center">
            <i className="ri-inbox-line text-4xl text-gray-500 mb-4"></i>
            <p className="text-gray-400">No requests found. Your demo requests will appear here!</p>
          </div>
        )}
      </div>

      {/* Request Detail Modal */}
      {selectedRequest && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-700">
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <h3 className="text-xl font-bold text-white mr-3">Request Details</h3>
                  <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getSourceBadge(selectedRequest.source).color}`}>
                    <i className={`${getSourceBadge(selectedRequest.source).icon} mr-1`}></i>
                    {getSourceBadge(selectedRequest.source).label}
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedRequest(null)}
                  className="p-2 text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  <i className="ri-close-line"></i>
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Business Name</label>
                  <div className="text-white">{selectedRequest.businessName}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Contact Person</label>
                  <div className="text-white">{selectedRequest.contactName}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Email</label>
                  <div className="text-white">{selectedRequest.email}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Phone</label>
                  <div className="text-white">{selectedRequest.phone}</div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Business Type</label>
                  <div className="flex items-center text-white">
                    <i className={`${getBusinessTypeIcon(selectedRequest.businessType)} text-cyan-400 mr-2`}></i>
                    {selectedRequest.businessType}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Submitted</label>
                  <div className="text-white">{formatDate(selectedRequest.submittedAt)}</div>
                </div>
              </div>

              {/* Get Started Form Specific Details */}
              {selectedRequest.source === 'get-started' && (
                <div className="bg-orange-500/10 border border-orange-500/30 rounded-lg p-4 space-y-3">
                  <h4 className="font-semibold text-orange-400 mb-3">Get Started Form Details</h4>
                  
                  {selectedRequest.callVolume && (
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Expected Call Volume</label>
                      <div className="text-white">{selectedRequest.callVolume}</div>
                    </div>
                  )}
                  
                  {selectedRequest.languages && selectedRequest.languages.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Languages</label>
                      <div className="flex flex-wrap gap-2">
                        {selectedRequest.languages.map(lang => (
                          <span key={lang} className="px-2 py-1 bg-orange-500/20 text-orange-300 rounded text-sm">
                            {lang}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {selectedRequest.features && selectedRequest.features.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Required Features</label>
                      <div className="flex flex-wrap gap-2">
                        {selectedRequest.features.map(feature => (
                          <span key={feature} className="px-2 py-1 bg-orange-500/20 text-orange-300 rounded text-sm">
                            {feature}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {selectedRequest.integrations && selectedRequest.integrations.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Integrations</label>
                      <div className="flex flex-wrap gap-2">
                        {selectedRequest.integrations.map(integration => (
                          <span key={integration} className="px-2 py-1 bg-orange-500/20 text-orange-300 rounded text-sm">
                            {integration}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {selectedRequest.timeline && (
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Timeline</label>
                      <div className="text-white">{selectedRequest.timeline}</div>
                    </div>
                  )}
                  
                  {selectedRequest.budget && (
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-1">Budget</label>
                      <div className="text-white">{selectedRequest.budget}</div>
                    </div>
                  )}
                </div>
              )}
              
              {selectedRequest.transcript && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Full Transcript</label>
                  <div className="bg-gray-700/50 rounded-lg p-4 text-white max-h-64 overflow-y-auto">
                    {selectedRequest.transcript}
                  </div>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Message Content</label>
                <div className="bg-gray-700/50 rounded-lg p-4 text-white">
                  {selectedRequest.challenges}
                </div>
              </div>
              
              {selectedRequest.callDuration && selectedRequest.callDuration > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Call Duration</label>
                  <div className="text-white">{selectedRequest.callDuration} seconds</div>
                </div>
              )}
              
              <div className="flex items-center justify-between pt-4 border-t border-gray-700">
                <div className="flex items-center space-x-4">
                  <a 
                    href={`mailto:${selectedRequest.email}?subject=Re: Your AI Assistant Inquiry&body=Dear ${selectedRequest.contactName},%0D%0A%0D%0AThank you for contacting 247 AI 360.%0D%0A%0D%0ABest regards,%0D%0A247 AI 360 Team%0D%0A247@247ai360.com`}
                    className="flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-mail-line mr-2"></i>
                    Send Email
                  </a>
                  <a 
                    href={`tel:${selectedRequest.phone}`}
                    className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <i className="ri-phone-line mr-2"></i>
                    Call Now
                  </a>
                </div>
                
                <select
                  value={selectedRequest.status}
                  onChange={(e) => {
                    updateRequestStatus(selectedRequest.id, e.target.value as BusinessRequest['status'], selectedRequest.source);
                    setSelectedRequest({...selectedRequest, status: e.target.value as BusinessRequest['status']});
                  }}
                  className="px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500 transition-colors pr-8"
                >
                  <option value="new">New</option>
                  <option value="contacted">Contacted</option>
                  <option value="in-progress">In Progress</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

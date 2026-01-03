import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import AutomationChat from '../../../components/AutomationChat';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

interface AutomationRule {
  id: string;
  name: string;
  trigger: string;
  action: string;
  conditions: any;
  enabled: boolean;
  created_at: string;
  last_triggered?: string;
  trigger_count: number;
}

export default function AutomationControl() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);

  // Form state
  const [ruleName, setRuleName] = useState('');
  const [trigger, setTrigger] = useState('new_lead');
  const [action, setAction] = useState('send_email');
  const [conditions, setConditions] = useState<any>({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    loadRules();
    
    // Real-time subscription
    const subscription = supabase
      .channel('automation_rules')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'automation_rules' },
        () => {
          loadRules();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const loadRules = async () => {
    try {
      const { data, error } = await supabase
        .from('automation_rules')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRules(data || []);
    } catch (err: any) {
      console.error('Error loading rules:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRule = async () => {
    if (!ruleName.trim()) {
      setError('Please enter a rule name');
      return;
    }

    try {
      const { error } = await supabase
        .from('automation_rules')
        .insert({
          name: ruleName,
          trigger,
          action,
          conditions,
          enabled: true,
          trigger_count: 0
        });

      if (error) throw error;

      setSuccess('Automation rule created successfully!');
      setShowCreateForm(false);
      resetForm();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to create rule');
    }
  };

  const handleUpdateRule = async () => {
    if (!editingRule) return;

    try {
      const { error } = await supabase
        .from('automation_rules')
        .update({
          name: ruleName,
          trigger,
          action,
          conditions
        })
        .eq('id', editingRule.id);

      if (error) throw error;

      setSuccess('Rule updated successfully!');
      setEditingRule(null);
      resetForm();
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update rule');
    }
  };

  const toggleRule = async (ruleId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('automation_rules')
        .update({ enabled: !currentStatus })
        .eq('id', ruleId);

      if (error) throw error;
    } catch (err: any) {
      setError(err.message || 'Failed to toggle rule');
    }
  };

  const deleteRule = async (ruleId: string, ruleName: string) => {
    if (!confirm(`Are you sure you want to delete "${ruleName}"?`)) return;

    try {
      const { error } = await supabase
        .from('automation_rules')
        .delete()
        .eq('id', ruleId);

      if (error) throw error;
      setSuccess('Rule deleted successfully!');
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to delete rule');
    }
  };

  const startEdit = (rule: AutomationRule) => {
    setEditingRule(rule);
    setRuleName(rule.name);
    setTrigger(rule.trigger);
    setAction(rule.action);
    setConditions(rule.conditions || {});
    setShowCreateForm(true);
  };

  const resetForm = () => {
    setRuleName('');
    setTrigger('new_lead');
    setAction('send_email');
    setConditions({});
    setError('');
    setEditingRule(null);
  };

  const triggerOptions = [
    { id: 'new_lead', name: 'New Lead Created', icon: 'ri-user-add-line', color: 'blue' },
    { id: 'missed_call', name: 'Missed Call', icon: 'ri-phone-line', color: 'red' },
    { id: 'booking_request', name: 'Booking Request', icon: 'ri-calendar-line', color: 'green' },
    { id: 'status_change', name: 'Status Changed', icon: 'ri-refresh-line', color: 'purple' },
    { id: 'time_based', name: 'Time-Based', icon: 'ri-time-line', color: 'orange' },
  ];

  const actionOptions = [
    { id: 'send_email', name: 'Send Email', icon: 'ri-mail-line', color: 'blue' },
    { id: 'send_sms', name: 'Send SMS', icon: 'ri-message-line', color: 'green' },
    { id: 'create_task', name: 'Create Task', icon: 'ri-task-line', color: 'purple' },
    { id: 'update_status', name: 'Update Status', icon: 'ri-edit-line', color: 'orange' },
    { id: 'webhook', name: 'Call Webhook', icon: 'ri-webhook-line', color: 'red' },
    { id: 'ai_followup', name: 'AI Follow-up', icon: 'ri-robot-line', color: 'teal' },
  ];

  const getTriggerInfo = (triggerId: string) => 
    triggerOptions.find(t => t.id === triggerId) || triggerOptions[0];

  const getActionInfo = (actionId: string) => 
    actionOptions.find(a => a.id === actionId) || actionOptions[0];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-12 h-12 border-4 border-teal-500/30 border-t-teal-500 rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* AI Chat Assistant */}
      <AutomationChat />

      {/* Header */}
      <div className="bg-gradient-to-r from-teal-500 to-cyan-600 rounded-xl shadow-lg p-8 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold mb-2">Automation Control Panel</h2>
            <p className="text-teal-50">Create intelligent workflows to automate your business processes</p>
          </div>
          <div className="text-right">
            <div className="text-4xl font-bold">{rules.length}</div>
            <div className="text-sm text-teal-50">Active Rules</div>
          </div>
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
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
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start">
            <i className="ri-check-circle-line text-green-500 mr-3 mt-0.5"></i>
            <p className="text-green-800 font-medium">{success}</p>
          </div>
        </div>
      )}

      {/* Create/Edit Form */}
      {!showCreateForm && (
        <button
          onClick={() => setShowCreateForm(true)}
          className="w-full bg-gradient-to-r from-teal-500 to-cyan-600 text-white px-6 py-4 rounded-xl font-medium hover:from-teal-600 hover:to-cyan-700 transition-all shadow-lg whitespace-nowrap cursor-pointer flex items-center justify-center"
        >
          <i className="ri-add-line mr-2 text-xl"></i>
          Create New Automation Rule
        </button>
      )}

      {showCreateForm && (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold text-gray-900">
              {editingRule ? 'Edit Automation Rule' : 'Create New Rule'}
            </h3>
            <button
              onClick={() => {
                setShowCreateForm(false);
                resetForm();
              }}
              className="text-gray-500 hover:text-gray-700 cursor-pointer"
            >
              <i className="ri-close-line text-2xl"></i>
            </button>
          </div>

          <div className="space-y-6">
            {/* Rule Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Rule Name
              </label>
              <input
                type="text"
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
                placeholder="e.g., Send welcome email to new leads"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
              />
            </div>

            {/* Trigger Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                When this happens (Trigger)
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {triggerOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setTrigger(option.id)}
                    className={`p-4 rounded-lg border-2 transition-all cursor-pointer text-left ${
                      trigger === option.id
                        ? `border-${option.color}-500 bg-${option.color}-50`
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <i className={`${option.icon} text-2xl text-${option.color}-500 mb-2`}></i>
                    <div className="font-medium text-gray-900">{option.name}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Action Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Do this (Action)
              </label>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {actionOptions.map((option) => (
                  <button
                    key={option.id}
                    onClick={() => setAction(option.id)}
                    className={`p-4 rounded-lg border-2 transition-all cursor-pointer text-left ${
                      action === option.id
                        ? `border-${option.color}-500 bg-${option.color}-50`
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <i className={`${option.icon} text-2xl text-${option.color}-500 mb-2`}></i>
                    <div className="font-medium text-gray-900">{option.name}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <button
                onClick={editingRule ? handleUpdateRule : handleCreateRule}
                className="flex-1 bg-gradient-to-r from-teal-500 to-cyan-600 text-white px-6 py-3 rounded-lg font-medium hover:from-teal-600 hover:to-cyan-700 transition-all whitespace-nowrap cursor-pointer flex items-center justify-center"
              >
                <i className={`${editingRule ? 'ri-save-line' : 'ri-add-line'} mr-2`}></i>
                {editingRule ? 'Update Rule' : 'Create Rule'}
              </button>
              <button
                onClick={() => {
                  setShowCreateForm(false);
                  resetForm();
                }}
                className="px-6 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors whitespace-nowrap cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rules List */}
      {rules.length === 0 ? (
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-12 text-center">
          <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className="ri-robot-line text-4xl text-gray-400"></i>
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">No Automation Rules Yet</h3>
          <p className="text-gray-600 mb-6">Create your first automation rule to start automating your workflows</p>
          <button
            onClick={() => setShowCreateForm(true)}
            className="bg-gradient-to-r from-teal-500 to-cyan-600 text-white px-6 py-3 rounded-lg font-medium hover:from-teal-600 hover:to-cyan-700 transition-all whitespace-nowrap cursor-pointer inline-flex items-center"
          >
            <i className="ri-add-line mr-2"></i>
            Create First Rule
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {rules.map((rule) => {
            const triggerInfo = getTriggerInfo(rule.trigger);
            const actionInfo = getActionInfo(rule.action);

            return (
              <div
                key={rule.id}
                className={`bg-white rounded-xl shadow-lg border-2 transition-all ${
                  rule.enabled ? 'border-green-200' : 'border-gray-200'
                }`}
              >
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-bold text-gray-900">{rule.name}</h3>
                        <button
                          onClick={() => toggleRule(rule.id, rule.enabled)}
                          className={`px-3 py-1 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                            rule.enabled
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {rule.enabled ? '● Active' : '○ Inactive'}
                        </button>
                      </div>

                      {/* Workflow Visualization */}
                      <div className="flex items-center gap-4 mt-4">
                        <div className={`flex items-center gap-2 px-4 py-2 bg-${triggerInfo.color}-50 border border-${triggerInfo.color}-200 rounded-lg`}>
                          <i className={`${triggerInfo.icon} text-${triggerInfo.color}-500`}></i>
                          <span className="text-sm font-medium text-gray-700">{triggerInfo.name}</span>
                        </div>
                        
                        <i className="ri-arrow-right-line text-gray-400 text-xl"></i>
                        
                        <div className={`flex items-center gap-2 px-4 py-2 bg-${actionInfo.color}-50 border border-${actionInfo.color}-200 rounded-lg`}>
                          <i className={`${actionInfo.icon} text-${actionInfo.color}-500`}></i>
                          <span className="text-sm font-medium text-gray-700">{actionInfo.name}</span>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="flex items-center gap-6 mt-4 text-sm text-gray-600">
                        <span>
                          <i className="ri-flashlight-line mr-1"></i>
                          Triggered {rule.trigger_count} times
                        </span>
                        {rule.last_triggered && (
                          <span>
                            <i className="ri-time-line mr-1"></i>
                            Last: {new Date(rule.last_triggered).toLocaleString()}
                          </span>
                        )}
                        <span>
                          <i className="ri-calendar-line mr-1"></i>
                          Created {new Date(rule.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEdit(rule)}
                        className="px-4 py-2 bg-blue-100 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-200 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <i className="ri-edit-line"></i>
                      </button>
                      <button
                        onClick={() => deleteRule(rule.id, rule.name)}
                        className="px-4 py-2 bg-red-100 text-red-600 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors whitespace-nowrap cursor-pointer"
                      >
                        <i className="ri-delete-bin-line"></i>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <div className="flex items-start">
          <i className="ri-information-line text-blue-500 text-xl mr-3 mt-0.5"></i>
          <div className="text-sm text-blue-700">
            <p className="font-medium mb-2">How Automation Works:</p>
            <ul className="space-y-1 text-xs">
              <li>• <strong>Triggers</strong> - Events that start the automation (new lead, missed call, etc.)</li>
              <li>• <strong>Actions</strong> - What happens automatically (send email, create task, etc.)</li>
              <li>• <strong>Real-time</strong> - Automations run instantly when triggers occur</li>
              <li>• <strong>Smart</strong> - AI-powered actions can personalize responses</li>
              <li>• <strong>Reliable</strong> - All actions are logged and can be reviewed</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

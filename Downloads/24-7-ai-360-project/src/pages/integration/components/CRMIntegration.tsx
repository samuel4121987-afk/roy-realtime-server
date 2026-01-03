interface CRMIntegrationProps {
  selectedCRM: string;
  onCRMSelect: (crm: string) => void;
}

export default function CRMIntegration({ selectedCRM, onCRMSelect }: CRMIntegrationProps) {
  const crmOptions = [
    {
      id: 'salesforce',
      name: 'Salesforce',
      icon: 'ri-cloud-line',
      description: 'World\'s #1 CRM platform integration',
      features: ['Lead capture', 'Contact sync', 'Opportunity tracking', 'Custom fields'],
      color: 'from-blue-600 to-blue-800'
    },
    {
      id: 'hubspot',
      name: 'HubSpot',
      icon: 'ri-rocket-line',
      description: 'All-in-one marketing and sales platform',
      features: ['Contact management', 'Deal pipeline', 'Email sequences', 'Analytics'],
      color: 'from-orange-500 to-red-600'
    },
    {
      id: 'pipedrive',
      name: 'Pipedrive',
      icon: 'ri-line-chart-line',
      description: 'Sales-focused CRM for growing businesses',
      features: ['Pipeline management', 'Activity tracking', 'Sales reporting', 'Mobile sync'],
      color: 'from-green-500 to-teal-600'
    },
    {
      id: 'zoho',
      name: 'Zoho CRM',
      icon: 'ri-database-2-line',
      description: 'Comprehensive business suite integration',
      features: ['Multi-channel', 'Workflow automation', 'AI predictions', 'Custom modules'],
      color: 'from-purple-500 to-indigo-600'
    }
  ];

  return (
    <div className="bg-gray-800/30 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-8">
      <div className="flex items-center mb-6">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-600 rounded-full mr-4">
          <i className="ri-customer-service-2-line text-xl text-white"></i>
        </div>
        <div>
          <h3 className="text-2xl font-bold text-white font-orbitron">CRM Integration</h3>
          <p className="text-gray-400">Automatically sync leads and customer data</p>
        </div>
      </div>

      <div className="space-y-4">
        {crmOptions.map((option) => (
          <div
            key={option.id}
            onClick={() => onCRMSelect(option.id)}
            className={`relative p-4 border rounded-xl cursor-pointer transition-all duration-300 ${
              selectedCRM === option.id
                ? 'border-cyan-500 bg-cyan-500/10'
                : 'border-gray-600 hover:border-gray-500 bg-gray-700/30'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start">
                <div className={`inline-flex items-center justify-center w-10 h-10 bg-gradient-to-r ${option.color} rounded-lg mr-4 mt-1`}>
                  <i className={`${option.icon} text-lg text-white`}></i>
                </div>
                <div className="flex-1">
                  <h4 className="text-lg font-semibold text-white mb-1">{option.name}</h4>
                  <p className="text-gray-400 text-sm mb-3">{option.description}</p>
                  <div className="flex flex-wrap gap-2">
                    {option.features.map((feature, index) => (
                      <span key={index} className="px-2 py-1 bg-gray-600/50 text-gray-300 text-xs rounded-full">
                        {feature}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              
              {selectedCRM === option.id && (
                <div className="w-5 h-5 bg-cyan-500 rounded-full flex items-center justify-center">
                  <i className="ri-check-line text-white text-xs"></i>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {selectedCRM && (
        <div className="mt-6 p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
          <div className="flex items-center text-purple-400 mb-2">
            <i className="ri-shield-check-line mr-2"></i>
            <span className="font-medium">Secure Connection</span>
          </div>
          <p className="text-gray-300 text-sm">
            Your {crmOptions.find(o => o.id === selectedCRM)?.name} data is protected with enterprise-grade encryption and OAuth 2.0 authentication.
          </p>
        </div>
      )}
    </div>
  );
}
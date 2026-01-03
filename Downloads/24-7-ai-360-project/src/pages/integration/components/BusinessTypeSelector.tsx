import { useState } from 'react';

export default function BusinessTypeSelector() {
  const [selectedType, setSelectedType] = useState<string | null>(null);

  const businessTypes = [
    {
      id: 'hotel',
      title: 'Hotels & Hospitality',
      icon: 'ri-hotel-line',
      image: 'https://readdy.ai/api/search-image?query=Luxury%20hotel%20reception%20desk%20with%20modern%20professional%20hospitality%20service%20environment%2C%20elegant%20contemporary%20lobby%20design%20with%20warm%20welcoming%20atmosphere%2C%20high-end%20business%20hotel%20interior%20with%20sophisticated%20lighting&width=400&height=300&seq=hotel-integration&orientation=landscape',
      features: [
        'Automated booking confirmations',
        'Room availability inquiries',
        'Check-in/check-out assistance',
        'Concierge service requests',
        'Guest complaint handling',
        'Multi-language support'
      ],
      description: 'Perfect for hotels, resorts, and vacation rentals. Handle guest inquiries, bookings, and service requests 24/7.'
    },
    {
      id: 'clinic',
      title: 'Medical Clinics',
      icon: 'ri-hospital-line',
      image: 'https://readdy.ai/api/search-image?query=Modern%20medical%20clinic%20reception%20area%20with%20professional%20healthcare%20environment%2C%20clean%20contemporary%20waiting%20room%20design%20with%20comfortable%20seating%2C%20bright%20welcoming%20medical%20office%20interior%20with%20natural%20lighting&width=400&height=300&seq=clinic-integration&orientation=landscape',
      features: [
        'Appointment scheduling',
        'Patient intake forms',
        'Insurance verification',
        'Prescription refill requests',
        'Emergency triage',
        'HIPAA-compliant conversations'
      ],
      description: 'Designed for medical practices, dental offices, and healthcare facilities. Manage appointments and patient communications securely.'
    },
    {
      id: 'law',
      title: 'Law Offices',
      icon: 'ri-scales-3-line',
      image: 'https://readdy.ai/api/search-image?query=Professional%20law%20office%20reception%20with%20elegant%20legal%20firm%20environment%2C%20sophisticated%20attorney%20office%20interior%20with%20classic%20furniture%2C%20prestigious%20legal%20practice%20lobby%20with%20professional%20atmosphere&width=400&height=300&seq=law-integration&orientation=landscape',
      features: [
        'Client consultation scheduling',
        'Case inquiry management',
        'Document request handling',
        'Confidential communication',
        'Billing inquiries',
        'Multi-practice area support'
      ],
      description: 'Tailored for law firms and legal practices. Handle client consultations, case inquiries, and scheduling with confidentiality.'
    }
  ];

  const selectedBusiness = businessTypes.find(type => type.id === selectedType);

  return (
    <section className="bg-gray-800/30 backdrop-blur-sm border border-cyan-500/20 rounded-2xl p-8">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-white mb-3">
          Select Your Business Type
        </h2>
        <p className="text-gray-300">
          Choose your industry to customize your AI assistant with specialized features and workflows
        </p>
      </div>

      {!selectedType ? (
        <div className="grid md:grid-cols-3 gap-6">
          {businessTypes.map((type) => (
            <div
              key={type.id}
              onClick={() => setSelectedType(type.id)}
              className="group relative overflow-hidden rounded-xl border border-gray-700 hover:border-cyan-500 transition-all cursor-pointer bg-gray-900/50"
            >
              <div className="aspect-[4/3] overflow-hidden">
                <img
                  src={type.image}
                  alt={type.title}
                  className="w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-110"
                />
              </div>
              <div className="p-6">
                <div className="flex items-center mb-3">
                  <i className={`${type.icon} text-3xl text-cyan-400 mr-3`}></i>
                  <h3 className="text-xl font-bold text-white">{type.title}</h3>
                </div>
                <p className="text-gray-400 text-sm mb-4">
                  {type.description}
                </p>
                <div className="flex items-center text-cyan-400 font-medium">
                  <span>Select This Type</span>
                  <i className="ri-arrow-right-line ml-2"></i>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Selected Business Type Details */}
          <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 rounded-xl p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center">
                <i className={`${selectedBusiness?.icon} text-4xl text-cyan-400 mr-4`}></i>
                <div>
                  <h3 className="text-2xl font-bold text-white mb-1">
                    {selectedBusiness?.title}
                  </h3>
                  <p className="text-gray-300">
                    {selectedBusiness?.description}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedType(null)}
                className="text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                <i className="ri-close-line text-2xl"></i>
              </button>
            </div>
          </div>

          {/* Features Grid */}
          <div>
            <h4 className="text-xl font-bold text-white mb-4">
              Specialized Features for Your Business
            </h4>
            <div className="grid md:grid-cols-2 gap-4">
              {selectedBusiness?.features.map((feature, index) => (
                <div
                  key={index}
                  className="flex items-start bg-gray-800/50 border border-gray-700 rounded-lg p-4"
                >
                  <i className="ri-check-circle-fill text-cyan-400 text-xl mr-3 mt-0.5"></i>
                  <span className="text-gray-300">{feature}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Configuration Preview */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
            <h4 className="text-lg font-bold text-white mb-4 flex items-center">
              <i className="ri-settings-3-line text-cyan-400 mr-2"></i>
              AI Configuration Preview
            </h4>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-gray-700">
                <span className="text-gray-400">Business Type</span>
                <span className="text-white font-medium">{selectedBusiness?.title}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-700">
                <span className="text-gray-400">AI Personality</span>
                <span className="text-white font-medium">
                  {selectedType === 'hotel' && 'Friendly & Welcoming'}
                  {selectedType === 'clinic' && 'Professional & Caring'}
                  {selectedType === 'law' && 'Formal & Confidential'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-700">
                <span className="text-gray-400">Response Style</span>
                <span className="text-white font-medium">
                  {selectedType === 'hotel' && 'Conversational'}
                  {selectedType === 'clinic' && 'Clear & Concise'}
                  {selectedType === 'law' && 'Detailed & Precise'}
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-gray-400">Specialized Training</span>
                <span className="text-cyan-400 font-medium">
                  <i className="ri-check-line mr-1"></i>
                  Enabled
                </span>
              </div>
            </div>
          </div>

          {/* Success Message */}
          <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 flex items-center">
            <i className="ri-check-circle-line text-green-400 text-2xl mr-3"></i>
            <div>
              <p className="text-green-400 font-medium">Business Type Selected</p>
              <p className="text-gray-300 text-sm">
                Your AI assistant will be configured with {selectedBusiness?.title.toLowerCase()} specific features
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

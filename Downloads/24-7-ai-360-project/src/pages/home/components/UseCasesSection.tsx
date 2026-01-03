
export default function UseCasesSection() {
  const useCases = [
    {
      icon: 'ri-hospital-line',
      title: 'Healthcare',
      description: 'Automate appointment scheduling, patient inquiries, and prescription refills. HIPAA-compliant and secure.',
      features: ['Appointment Booking', 'Patient Reminders', 'Insurance Verification'],
      image: 'https://readdy.ai/api/search-image?query=modern%20healthcare%20medical%20clinic%20reception%20desk%20with%20digital%20screens%20and%20comfortable%20waiting%20area%2C%20clean%20professional%20environment%20with%20natural%20lighting%20and%20medical%20equipment%2C%20contemporary%20medical%20office%20interior%20design&width=600&height=400&seq=healthcare-usecase-001&orientation=landscape',
      gradient: 'from-teal-500 to-cyan-600'
    },
    {
      icon: 'ri-store-2-line',
      title: 'E-commerce',
      description: 'Handle customer support, order tracking, and product recommendations 24/7. Increase sales with instant responses.',
      features: ['Order Status', 'Product Support', 'Returns & Refunds'],
      image: 'https://readdy.ai/api/search-image?query=modern%20e-commerce%20online%20shopping%20workspace%20with%20laptop%20showing%20product%20catalog%2C%20packages%20and%20shipping%20boxes%2C%20clean%20minimalist%20office%20setup%20with%20natural%20light%20and%20plants&width=600&height=400&seq=ecommerce-usecase-002&orientation=landscape',
      gradient: 'from-cyan-500 to-blue-600'
    },
    {
      icon: 'ri-home-smile-line',
      title: 'Real Estate',
      description: 'Qualify leads, schedule property viewings, and answer questions about listings instantly. Never miss a potential buyer.',
      features: ['Lead Qualification', 'Tour Scheduling', 'Property Info'],
      image: 'https://readdy.ai/api/search-image?query=luxury%20modern%20real%20estate%20office%20with%20property%20listings%20on%20digital%20displays%2C%20elegant%20reception%20area%20with%20contemporary%20furniture%20and%20large%20windows%20showing%20city%20views&width=600&height=400&seq=realestate-usecase-003&orientation=landscape',
      gradient: 'from-blue-500 to-purple-600'
    },
    {
      icon: 'ri-restaurant-line',
      title: 'Restaurants',
      description: 'Take reservations, answer menu questions, and handle takeout orders. Focus on cooking while AI handles the phone.',
      features: ['Reservations', 'Menu Questions', 'Takeout Orders'],
      image: 'https://readdy.ai/api/search-image?query=upscale%20modern%20restaurant%20interior%20with%20elegant%20dining%20tables%2C%20ambient%20lighting%2C%20open%20kitchen%20view%2C%20contemporary%20design%20with%20warm%20atmosphere%20and%20professional%20service%20area&width=600&height=400&seq=restaurant-usecase-004&orientation=landscape',
      gradient: 'from-purple-500 to-pink-600'
    },
    {
      icon: 'ri-scales-3-line',
      title: 'Legal Services',
      description: 'Screen potential clients, schedule consultations, and provide basic legal information. Improve client intake efficiency.',
      features: ['Client Screening', 'Consultation Booking', 'Case Information'],
      image: 'https://readdy.ai/api/search-image?query=professional%20law%20office%20interior%20with%20modern%20furniture%2C%20legal%20books%20on%20shelves%2C%20conference%20table%2C%20elegant%20reception%20area%20with%20contemporary%20design%20and%20natural%20lighting&width=600&height=400&seq=legal-usecase-005&orientation=landscape',
      gradient: 'from-pink-500 to-rose-600'
    },
    {
      icon: 'ri-car-line',
      title: 'Automotive',
      description: 'Book service appointments, answer parts inquiries, and provide vehicle information. Keep your service bay full.',
      features: ['Service Booking', 'Parts Inquiries', 'Vehicle Info'],
      image: 'https://readdy.ai/api/search-image?query=modern%20automotive%20service%20center%20with%20clean%20workshop%2C%20professional%20mechanics%20area%2C%20customer%20waiting%20lounge%20with%20comfortable%20seating%2C%20bright%20lighting%20and%20organized%20tools%20display&width=600&height=400&seq=automotive-usecase-006&orientation=landscape',
      gradient: 'from-rose-500 to-orange-600'
    }
  ];

  return (
    <section id="use-cases" className="py-32 bg-white relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-20">
          <div className="inline-block px-4 py-2 bg-gradient-to-r from-teal-100 to-cyan-100 rounded-full mb-6">
            <span className="text-sm font-semibold bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent">
              USE CASES
            </span>
          </div>
          <h2 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Perfect for
            <span className="bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent"> Every Industry</span>
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            From healthcare to hospitality, our AI assistants adapt to your business needs.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {useCases.map((useCase, index) => (
            <div 
              key={index}
              className="group bg-white rounded-3xl overflow-hidden border-2 border-gray-100 hover:border-transparent hover:shadow-2xl transform hover:scale-105 transition-all duration-300"
            >
              {/* Image */}
              <div className="relative h-48 overflow-hidden">
                <img 
                  src={useCase.image} 
                  alt={useCase.title}
                  className="w-full h-full object-cover object-top transform group-hover:scale-110 transition-transform duration-500"
                />
                <div className={`absolute inset-0 bg-gradient-to-br ${useCase.gradient} opacity-20 group-hover:opacity-30 transition-opacity duration-300`}></div>
                
                {/* Icon Overlay */}
                <div className={`absolute top-4 right-4 w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-lg`}>
                  <i className={`${useCase.icon} text-2xl bg-gradient-to-br ${useCase.gradient} bg-clip-text text-transparent`}></i>
                </div>
              </div>

              {/* Content */}
              <div className="p-8">
                <h3 className="text-2xl font-bold text-gray-900 mb-3">{useCase.title}</h3>
                <p className="text-gray-600 mb-6 leading-relaxed">{useCase.description}</p>

                {/* Features */}
                <div className="space-y-2">
                  {useCase.features.map((feature, idx) => (
                    <div key={idx} className="flex items-center space-x-2">
                      <div className={`w-1.5 h-1.5 rounded-full bg-gradient-to-r ${useCase.gradient}`}></div>
                      <span className="text-sm text-gray-600">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

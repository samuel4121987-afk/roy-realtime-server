export default function BenefitsSection() {
  const benefits = [
    {
      icon: 'ri-time-line',
      title: 'Save Time',
      description: 'Eliminate hours spent on phone calls and appointment scheduling. Focus on what matters most.',
      stat: '20+ hrs/week',
      color: 'blue'
    },
    {
      icon: 'ri-money-dollar-circle-line',
      title: 'Reduce Costs',
      description: 'Replace expensive receptionist salaries with AI that works 24/7 at a fraction of the cost.',
      stat: '70% savings',
      color: 'green'
    },
    {
      icon: 'ri-customer-service-2-line',
      title: 'Better Service',
      description: 'Never miss a call again. Instant responses and professional service every single time.',
      stat: '100% coverage',
      color: 'purple'
    },
    {
      icon: 'ri-line-chart-line',
      title: 'Grow Revenue',
      description: 'Convert more leads into customers by responding instantly to every inquiry, day or night.',
      stat: '+40% bookings',
      color: 'orange'
    },
    {
      icon: 'ri-global-line',
      title: 'Multilingual',
      description: 'Serve customers in their preferred language. Break down language barriers effortlessly.',
      stat: '50+ languages',
      color: 'indigo'
    },
    {
      icon: 'ri-shield-check-line',
      title: 'Always Reliable',
      description: 'No sick days, no breaks, no holidays. Your AI assistant is always ready to help.',
      stat: '99.9% uptime',
      color: 'teal'
    }
  ];

  const colorClasses: Record<string, { bg: string; icon: string; stat: string }> = {
    blue: { bg: 'bg-blue-50', icon: 'text-blue-600', stat: 'text-blue-700' },
    green: { bg: 'bg-green-50', icon: 'text-green-600', stat: 'text-green-700' },
    purple: { bg: 'bg-purple-50', icon: 'text-purple-600', stat: 'text-purple-700' },
    orange: { bg: 'bg-orange-50', icon: 'text-orange-600', stat: 'text-orange-700' },
    indigo: { bg: 'bg-indigo-50', icon: 'text-indigo-600', stat: 'text-indigo-700' },
    teal: { bg: 'bg-teal-50', icon: 'text-teal-600', stat: 'text-teal-700' }
  };

  return (
    <section id="benefits" className="py-24 bg-gradient-to-br from-gray-50 to-blue-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center mb-16">
          <span className="inline-block px-4 py-2 bg-blue-50 text-blue-700 text-sm font-semibold rounded-full mb-4">
            Why Choose Us
          </span>
          <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-4">
            Transform Your Business
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Discover how AI can revolutionize your customer service and boost your bottom line
          </p>
        </div>

        {/* Benefits Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {benefits.map((benefit, index) => {
            const colors = colorClasses[benefit.color];
            return (
              <div 
                key={index}
                className="bg-white rounded-2xl p-8 border border-gray-100 hover:border-blue-200 hover:shadow-xl transition-all duration-300"
              >
                {/* Icon */}
                <div className={`w-14 h-14 ${colors.bg} rounded-xl flex items-center justify-center mb-6`}>
                  <i className={`${benefit.icon} ${colors.icon} text-2xl`}></i>
                </div>

                {/* Content */}
                <h3 className="text-xl font-bold text-gray-900 mb-3">
                  {benefit.title}
                </h3>
                <p className="text-gray-600 leading-relaxed mb-4">
                  {benefit.description}
                </p>

                {/* Stat */}
                <div className={`inline-flex items-center px-3 py-1 ${colors.bg} rounded-full`}>
                  <span className={`text-sm font-bold ${colors.stat}`}>
                    {benefit.stat}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom CTA */}
        <div className="mt-16 text-center bg-gradient-to-r from-blue-600 to-indigo-600 rounded-3xl p-12 text-white">
          <h3 className="text-3xl font-bold mb-4">
            Ready to Transform Your Business?
          </h3>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            Join hundreds of businesses already using AI to provide better service and grow faster
          </p>
          <button
            onClick={() => {
              const element = document.getElementById('contact');
              if (element) element.scrollIntoView({ behavior: 'smooth' });
            }}
            className="bg-white text-blue-600 px-8 py-4 rounded-lg text-lg font-semibold hover:bg-gray-50 transition-all transform hover:scale-105 shadow-lg whitespace-nowrap cursor-pointer"
          >
            Get Started Free
            <i className="ri-arrow-right-line ml-2"></i>
          </button>
        </div>
      </div>
    </section>
  );
}

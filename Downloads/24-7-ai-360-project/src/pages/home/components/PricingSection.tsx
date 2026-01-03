export default function PricingSection() {
  const plans = [
    {
      name: 'Starter',
      price: '99',
      description: 'Perfect for small businesses getting started with AI',
      features: [
        '500 conversations/month',
        'Voice & Chat AI',
        'Basic integrations',
        'Email support',
        'Analytics dashboard',
        '1 AI assistant'
      ],
      gradient: 'from-teal-500 to-cyan-600',
      popular: false
    },
    {
      name: 'Professional',
      price: '299',
      description: 'For growing businesses that need more power',
      features: [
        '2,000 conversations/month',
        'Voice & Chat AI',
        'Advanced integrations',
        'Priority support',
        'Advanced analytics',
        '3 AI assistants',
        'Custom voice training',
        'CRM integration'
      ],
      gradient: 'from-cyan-500 to-blue-600',
      popular: true
    },
    {
      name: 'Enterprise',
      price: 'Custom',
      description: 'For large organizations with custom needs',
      features: [
        'Unlimited conversations',
        'Voice & Chat AI',
        'Custom integrations',
        'Dedicated support',
        'Custom analytics',
        'Unlimited assistants',
        'White-label solution',
        'SLA guarantee',
        'Custom AI training'
      ],
      gradient: 'from-blue-500 to-purple-600',
      popular: false
    }
  ];

  return (
    <section id="pricing" className="py-32 bg-white relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-20">
          <div className="inline-block px-4 py-2 bg-gradient-to-r from-teal-100 to-cyan-100 rounded-full mb-6">
            <span className="text-sm font-semibold bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent">
              PRICING
            </span>
          </div>
          <h2 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Simple,
            <span className="bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent"> Transparent Pricing</span>
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            Choose the plan that fits your business. No hidden fees, cancel anytime.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
          {plans.map((plan, index) => (
            <div 
              key={index}
              className={`relative bg-white rounded-3xl p-8 border-2 ${
                plan.popular ? 'border-teal-500 shadow-2xl scale-105' : 'border-gray-100'
              } hover:shadow-2xl transform hover:scale-105 transition-all duration-300`}
            >
              {/* Popular Badge */}
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <div className="px-4 py-1 bg-gradient-to-r from-teal-500 to-cyan-600 text-white text-xs font-bold rounded-full shadow-lg">
                    MOST POPULAR
                  </div>
                </div>
              )}

              {/* Plan Name */}
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                <p className="text-sm text-gray-600">{plan.description}</p>
              </div>

              {/* Price */}
              <div className="text-center mb-8">
                {plan.price === 'Custom' ? (
                  <div className={`text-5xl font-bold bg-gradient-to-r ${plan.gradient} bg-clip-text text-transparent`}>
                    Custom
                  </div>
                ) : (
                  <div className="flex items-baseline justify-center">
                    <span className="text-2xl text-gray-600">$</span>
                    <span className={`text-6xl font-bold bg-gradient-to-r ${plan.gradient} bg-clip-text text-transparent`}>
                      {plan.price}
                    </span>
                    <span className="text-gray-600 ml-2">/month</span>
                  </div>
                )}
              </div>

              {/* Features */}
              <div className="space-y-4 mb-8">
                {plan.features.map((feature, idx) => (
                  <div key={idx} className="flex items-start space-x-3">
                    <div className={`w-5 h-5 rounded-full bg-gradient-to-r ${plan.gradient} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                      <i className="ri-check-line text-white text-xs"></i>
                    </div>
                    <span className="text-gray-700 text-sm">{feature}</span>
                  </div>
                ))}
              </div>

              {/* CTA Button */}
              <button 
                onClick={() => window.REACT_APP_NAVIGATE('/get-started')}
                className={`w-full py-4 rounded-full font-semibold transition-all duration-300 whitespace-nowrap cursor-pointer ${
                  plan.popular
                    ? `bg-gradient-to-r ${plan.gradient} text-white hover:shadow-xl hover:shadow-teal-500/50 transform hover:scale-105`
                    : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                }`}
              >
                {plan.price === 'Custom' ? 'Contact Sales' : 'Start Free Trial'}
              </button>
            </div>
          ))}
        </div>

        {/* Money Back Guarantee */}
        <div className="text-center mt-16">
          <div className="inline-flex items-center space-x-3 px-6 py-3 bg-gradient-to-r from-teal-50 to-cyan-50 rounded-full">
            <i className="ri-shield-check-line text-2xl text-teal-600"></i>
            <span className="text-sm font-semibold text-gray-700">30-Day Money-Back Guarantee</span>
          </div>
        </div>
      </div>
    </section>
  );
}

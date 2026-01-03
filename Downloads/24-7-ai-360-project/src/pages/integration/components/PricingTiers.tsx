export default function PricingTiers() {
  const pricingPlans = [
    {
      name: 'Starter',
      price: 49,
      period: 'month',
      description: 'Perfect for small businesses getting started',
      features: [
        '500 AI conversations/month',
        'Basic calendar integration',
        'Email support',
        'Standard AI prompts',
        '1 business integration',
        'Basic analytics'
      ],
      popular: false,
      color: 'from-gray-600 to-gray-800'
    },
    {
      name: 'Professional',
      price: 149,
      period: 'month',
      description: 'Ideal for growing businesses with higher volume',
      features: [
        '2,500 AI conversations/month',
        'Advanced calendar & CRM integration',
        'Priority support',
        'Custom AI prompts',
        '5 business integrations',
        'Advanced analytics',
        'Multi-language support',
        'API access'
      ],
      popular: true,
      color: 'from-cyan-500 to-blue-600'
    },
    {
      name: 'Enterprise',
      price: 399,
      period: 'month',
      description: 'For large organizations with complex needs',
      features: [
        'Unlimited AI conversations',
        'Full integration suite',
        'Dedicated account manager',
        'Custom AI training',
        'Unlimited integrations',
        'Real-time analytics',
        'White-label options',
        'SLA guarantee',
        'Custom development'
      ],
      popular: false,
      color: 'from-purple-500 to-indigo-600'
    }
  ];

  return (
    <section className="mb-20">
      <div className="text-center mb-12">
        <h2 className="text-4xl font-bold text-white mb-4 font-orbitron">
          Choose Your <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">Plan</span>
        </h2>
        <p className="text-lg text-gray-300 max-w-2xl mx-auto">
          Transparent pricing with no hidden fees. Start with a 14-day free trial on any plan.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {pricingPlans.map((plan, index) => (
          <div
            key={index}
            className={`relative bg-gray-800/50 backdrop-blur-sm border rounded-2xl p-8 transition-all duration-300 hover:transform hover:scale-105 ${
              plan.popular 
                ? 'border-cyan-500 ring-2 ring-cyan-500/20' 
                : 'border-gray-700/50 hover:border-cyan-500/50'
            }`}
          >
            {/* Popular Badge */}
            {plan.popular && (
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                <div className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-4 py-1 rounded-full text-sm font-medium">
                  Most Popular
                </div>
              </div>
            )}

            {/* Plan Header */}
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold text-white mb-2 font-orbitron">{plan.name}</h3>
              <p className="text-gray-400 mb-6">{plan.description}</p>
              
              <div className="flex items-baseline justify-center mb-2">
                <span className="text-5xl font-bold text-white">${plan.price}</span>
                <span className="text-gray-400 ml-2">/{plan.period}</span>
              </div>
              
              <div className="text-sm text-gray-500">
                Billed monthly • Cancel anytime
              </div>
            </div>

            {/* Features */}
            <div className="space-y-4 mb-8">
              {plan.features.map((feature, featureIndex) => (
                <div key={featureIndex} className="flex items-start">
                  <i className="ri-check-line text-cyan-400 mr-3 mt-0.5 flex-shrink-0"></i>
                  <span className="text-gray-300 text-sm">{feature}</span>
                </div>
              ))}
            </div>

            {/* CTA Button */}
            <button className={`w-full bg-gradient-to-r ${plan.color} text-white px-6 py-4 rounded-lg font-semibold hover:opacity-90 transition-all whitespace-nowrap cursor-pointer`}>
              {plan.name === 'Enterprise' ? 'Contact Sales' : 'Start Free Trial'}
            </button>

            {/* Additional Info */}
            <div className="text-center mt-4">
              <span className="text-xs text-gray-500">
                {plan.name === 'Enterprise' ? 'Custom pricing available' : '14-day free trial • No credit card required'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Enterprise Contact */}
      <div className="mt-12 text-center">
        <div className="bg-gray-800/30 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-8 max-w-2xl mx-auto">
          <h3 className="text-xl font-bold text-white mb-4">Need a Custom Solution?</h3>
          <p className="text-gray-300 mb-6">
            For enterprises with specific requirements, we offer custom integrations, dedicated infrastructure, and personalized support.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white px-6 py-3 rounded-lg font-medium hover:from-purple-600 hover:to-indigo-700 transition-all whitespace-nowrap cursor-pointer">
              <i className="ri-phone-line mr-2"></i>
              Schedule Call
            </button>
            <button className="border border-gray-600 text-gray-300 px-6 py-3 rounded-lg font-medium hover:border-gray-500 hover:text-white transition-all whitespace-nowrap cursor-pointer">
              <i className="ri-mail-line mr-2"></i>
              Contact Sales
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
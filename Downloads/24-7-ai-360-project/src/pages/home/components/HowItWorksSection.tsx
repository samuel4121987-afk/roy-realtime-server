
export default function HowItWorksSection() {
  return (
    <section id="how-it-works" className="relative py-24 bg-white overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-400/10 rounded-full blur-3xl animate-float"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-teal-400/10 rounded-full blur-3xl animate-float-delayed"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6">
        <div className="text-center mb-16">
          <div className="inline-block px-4 py-2 bg-gradient-to-r from-teal-500/10 to-cyan-500/10 rounded-full mb-4">
            <span className="text-sm font-semibold bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent">
              HOW IT WORKS
            </span>
          </div>
          <h2 className="text-5xl md:text-6xl font-bold mb-6">
            <span className="bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
              Get Started in
            </span>
            <br />
            <span className="bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent">
              3 Simple Steps
            </span>
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Launch your AI assistant in minutes, not months
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Step 1 */}
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-teal-500/20 to-cyan-500/20 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-300 opacity-0 group-hover:opacity-100"></div>
            <div className="relative bg-white rounded-3xl p-8 border-2 border-gray-100 hover:border-teal-500 shadow-lg hover:shadow-2xl transform hover:scale-105 transition-all duration-300">
              <div className="w-16 h-16 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg">
                <span className="text-3xl font-bold text-white">1</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Configure Your AI</h3>
              <p className="text-gray-600 leading-relaxed mb-6">
                Tell us about your business, services, and how you want your AI to respond. Customize the voice, tone, and personality.
              </p>
              <div className="flex items-center text-teal-600 font-semibold group-hover:translate-x-2 transition-transform duration-300 cursor-pointer">
                <span>Learn more</span>
                <i className="ri-arrow-right-line ml-2"></i>
              </div>
            </div>
          </div>

          {/* Step 2 */}
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-300 opacity-0 group-hover:opacity-100"></div>
            <div className="relative bg-white rounded-3xl p-8 border-2 border-gray-100 hover:border-cyan-500 shadow-lg hover:shadow-2xl transform hover:scale-105 transition-all duration-300">
              <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg">
                <span className="text-3xl font-bold text-white">2</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Connect Your Tools</h3>
              <p className="text-gray-600 leading-relaxed mb-6">
                Integrate with your calendar, CRM, and phone system. We support all major platforms and can connect to any API.
              </p>
              <div className="flex items-center text-cyan-600 font-semibold group-hover:translate-x-2 transition-transform duration-300 cursor-pointer">
                <span>View integrations</span>
                <i className="ri-arrow-right-line ml-2"></i>
              </div>
            </div>
          </div>

          {/* Step 3 */}
          <div className="relative group">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-300 opacity-0 group-hover:opacity-100"></div>
            <div className="relative bg-white rounded-3xl p-8 border-2 border-gray-100 hover:border-blue-500 shadow-lg hover:shadow-2xl transform hover:scale-105 transition-all duration-300">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mb-6 shadow-lg">
                <span className="text-3xl font-bold text-white">3</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-4">Go Live</h3>
              <p className="text-gray-600 leading-relaxed mb-6">
                Launch your AI assistant and watch it handle calls, chats, and bookings 24/7. Monitor performance in real-time.
              </p>
              <div className="flex items-center text-blue-600 font-semibold group-hover:translate-x-2 transition-transform duration-300 cursor-pointer">
                <span>Start now</span>
                <i className="ri-arrow-right-line ml-2"></i>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-16">
          <a 
            href="/get-started"
            className="inline-block px-8 py-4 bg-gradient-to-r from-teal-500 to-cyan-600 text-white text-lg font-semibold rounded-full hover:shadow-2xl hover:shadow-teal-500/50 transform hover:scale-105 transition-all duration-300 whitespace-nowrap cursor-pointer"
          >
            Get Started Free
          </a>
        </div>
      </div>
    </section>
  );
}

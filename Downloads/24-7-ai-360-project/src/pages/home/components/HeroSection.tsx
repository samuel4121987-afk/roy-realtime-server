export default function HeroSection() {
  const scrollToContact = () => {
    const element = document.getElementById('contact');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section 
      id="hero" 
      className="relative min-h-screen flex items-center justify-center overflow-hidden bg-white"
    >
      {/* Subtle gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50 via-white to-blue-50"></div>
      
      {/* Geometric patterns */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute top-20 left-20 w-72 h-72 bg-blue-500 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-indigo-500 rounded-full blur-3xl"></div>
      </div>
      
      {/* Content */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full py-20">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Column - Text Content */}
          <div className="text-left">
            <div className="mb-6">
              <span className="inline-flex items-center px-4 py-2 bg-blue-50 text-blue-700 text-sm font-semibold rounded-full border border-blue-100">
                <span className="w-2 h-2 bg-blue-500 rounded-full mr-2 animate-pulse"></span>
                AI-Powered Business Assistant
              </span>
            </div>
            
            <h1 className="text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
              Never Miss a Customer Call
              <span className="block text-blue-600 mt-2">Ever Again</span>
            </h1>
            
            <p className="text-xl text-gray-600 mb-8 leading-relaxed max-w-xl">
              Your AI receptionist answers every call, books appointments, and handles customer inquiries 
              <strong className="text-gray-900"> 24/7</strong> — even while you sleep.
            </p>

            <div className="mb-10">
              <div className="flex items-start space-x-3 mb-3">
                <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                  <i className="ri-check-line text-green-600 text-sm"></i>
                </div>
                <p className="text-gray-700">Instant response to every customer inquiry</p>
              </div>
              <div className="flex items-start space-x-3 mb-3">
                <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                  <i className="ri-check-line text-green-600 text-sm"></i>
                </div>
                <p className="text-gray-700">Automatic appointment scheduling and confirmations</p>
              </div>
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                  <i className="ri-check-line text-green-600 text-sm"></i>
                </div>
                <p className="text-gray-700">Natural conversations in multiple languages</p>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4 mb-12">
              <button
                onClick={scrollToContact}
                className="bg-blue-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-blue-700 transition-all transform hover:scale-105 shadow-lg hover:shadow-xl whitespace-nowrap cursor-pointer"
              >
                Get Started Free
                <i className="ri-arrow-right-line ml-2"></i>
              </button>
              
              <button
                onClick={() => {
                  const widget = document.querySelector('#vapi-widget-floating-button') as HTMLElement;
                  if (widget) widget.click();
                }}
                className="border-2 border-gray-300 text-gray-700 px-8 py-4 rounded-lg text-lg font-semibold hover:border-blue-600 hover:text-blue-600 transition-all whitespace-nowrap cursor-pointer"
              >
                <i className="ri-phone-line mr-2"></i>
                Try Live Demo
              </button>
            </div>
            
            {/* Stats */}
            <div className="grid grid-cols-3 gap-6 pt-8 border-t border-gray-200">
              <div>
                <div className="text-3xl font-bold text-gray-900 mb-1">24/7</div>
                <div className="text-sm text-gray-600">Always Available</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-gray-900 mb-1">&lt;1s</div>
                <div className="text-sm text-gray-600">Response Time</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-gray-900 mb-1">100%</div>
                <div className="text-sm text-gray-600">Call Coverage</div>
              </div>
            </div>
          </div>

          {/* Right Column - Visual */}
          <div className="relative lg:block hidden">
            <div className="relative">
              {/* Main illustration container */}
              <div className="relative bg-gradient-to-br from-blue-50 to-indigo-50 rounded-3xl p-8 shadow-2xl">
                <img 
                  src="https://readdy.ai/api/search-image?query=Professional%20business%20woman%20wearing%20headset%20working%20at%20modern%20office%20desk%20with%20computer%20screens%20showing%20customer%20service%20dashboard%20analytics%20charts%20and%20appointment%20calendar%2C%20bright%20clean%20office%20environment%20with%20plants%2C%20natural%20lighting%2C%20professional%20corporate%20photography%20style%2C%20high%20quality%20business%20stock%20photo%20aesthetic&width=800&height=900&seq=hero-professional-receptionist&orientation=portrait"
                  alt="AI Assistant"
                  className="w-full h-auto rounded-2xl shadow-lg object-cover"
                  style={{ objectPosition: 'center' }}
                />
                
                {/* Floating cards */}
                <div className="absolute -left-6 top-1/4 bg-white rounded-xl shadow-xl p-4 max-w-xs animate-float">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                      <i className="ri-phone-line text-green-600"></i>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Incoming Call</p>
                      <p className="text-xs text-gray-600">John Smith</p>
                    </div>
                  </div>
                </div>

                <div className="absolute -right-6 top-1/2 bg-white rounded-xl shadow-xl p-4 max-w-xs animate-float-delayed">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                      <i className="ri-calendar-check-line text-blue-600"></i>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Appointment Booked</p>
                      <p className="text-xs text-gray-600">Tomorrow at 2:00 PM</p>
                    </div>
                  </div>
                </div>

                <div className="absolute -left-6 bottom-1/4 bg-white rounded-xl shadow-xl p-4 max-w-xs animate-float">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                      <i className="ri-message-3-line text-purple-600"></i>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">Chat Message</p>
                      <p className="text-xs text-gray-600">Question answered</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

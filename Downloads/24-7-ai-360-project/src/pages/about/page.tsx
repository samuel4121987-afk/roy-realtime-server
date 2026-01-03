import Navigation from '../home/components/Navigation';
import Footer from '../home/components/Footer';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Navigation />
      
      <div className="pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Hero Section */}
          <div className="text-center mb-20">
            <h1 className="text-5xl font-bold text-gray-900 mb-6">
              About 24/7 AI 360
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              We're revolutionizing business communication with AI-powered phone assistants that never sleep, never miss a call, and always deliver exceptional customer service.
            </p>
          </div>

          {/* Mission Section */}
          <div className="grid md:grid-cols-2 gap-12 items-center mb-20">
            <div>
              <h2 className="text-4xl font-bold text-gray-900 mb-6">
                Our Mission
              </h2>
              <p className="text-lg text-gray-600 mb-4">
                Every missed call is a missed opportunity. We believe that businesses of all sizes deserve enterprise-level phone support without the enterprise-level costs.
              </p>
              <p className="text-lg text-gray-600 mb-4">
                Our AI-powered receptionist ensures that every customer interaction is handled professionally, efficiently, and with the personal touch your business deserves.
              </p>
              <p className="text-lg text-gray-600">
                We're not just building technology – we're building relationships between businesses and their customers, one conversation at a time.
              </p>
            </div>
            <div className="bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl p-12 text-white">
              <div className="space-y-8">
                <div>
                  <div className="text-5xl font-bold mb-2">99.9%</div>
                  <p className="text-white/90">Uptime Guarantee</p>
                </div>
                <div>
                  <div className="text-5xl font-bold mb-2">500+</div>
                  <p className="text-white/90">Happy Businesses</p>
                </div>
                <div>
                  <div className="text-5xl font-bold mb-2">50K+</div>
                  <p className="text-white/90">Calls Handled Monthly</p>
                </div>
                <div>
                  <div className="text-5xl font-bold mb-2">24/7</div>
                  <p className="text-white/90">Always Available</p>
                </div>
              </div>
            </div>
          </div>

          {/* Values Section */}
          <div className="mb-20">
            <h2 className="text-4xl font-bold text-gray-900 text-center mb-12">
              Our Core Values
            </h2>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-200">
                <div className="w-16 h-16 bg-gradient-to-r from-teal-500 to-cyan-600 rounded-2xl flex items-center justify-center mb-6">
                  <i className="ri-customer-service-2-line text-white text-3xl"></i>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">
                  Customer First
                </h3>
                <p className="text-gray-600">
                  Every decision we make is guided by what's best for our customers. Your success is our success, and we're committed to helping you grow.
                </p>
              </div>

              <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-200">
                <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-2xl flex items-center justify-center mb-6">
                  <i className="ri-lightbulb-line text-white text-3xl"></i>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">
                  Innovation
                </h3>
                <p className="text-gray-600">
                  We're constantly pushing the boundaries of what's possible with AI technology, ensuring you always have access to cutting-edge solutions.
                </p>
              </div>

              <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-200">
                <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center mb-6">
                  <i className="ri-shield-check-line text-white text-3xl"></i>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-4">
                  Reliability
                </h3>
                <p className="text-gray-600">
                  Your business depends on us, and we take that responsibility seriously. Our 99.9% uptime guarantee means you can count on us, always.
                </p>
              </div>
            </div>
          </div>

          {/* Story Section */}
          <div className="bg-white rounded-2xl p-12 shadow-xl mb-20">
            <h2 className="text-4xl font-bold text-gray-900 mb-8 text-center">
              Our Story
            </h2>
            <div className="max-w-4xl mx-auto space-y-6 text-lg text-gray-600">
              <p>
                24/7 AI 360 was born from a simple observation: small and medium-sized businesses were losing customers because they couldn't afford 24/7 phone support. Meanwhile, large enterprises had entire call centers, but even they struggled with consistency and efficiency.
              </p>
              <p>
                Our founders, a team of AI researchers and business owners, saw an opportunity to level the playing field. By combining advanced natural language processing with deep business intelligence, we created an AI assistant that could handle customer calls with the same care and professionalism as a trained receptionist.
              </p>
              <p>
                Today, we're proud to serve hundreds of businesses across industries, from healthcare clinics to law firms, from restaurants to real estate agencies. Each one trusts us to be their first point of contact with customers, and we don't take that trust lightly.
              </p>
              <p>
                We're just getting started. Our vision is a world where every business, regardless of size, can provide world-class customer service around the clock.
              </p>
            </div>
          </div>

          {/* Team Section */}
          <div className="mb-20">
            <h2 className="text-4xl font-bold text-gray-900 text-center mb-12">
              Meet Our Leadership Team
            </h2>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-200 text-center">
                <div className="w-32 h-32 bg-gradient-to-r from-teal-500 to-cyan-600 rounded-full mx-auto mb-6 flex items-center justify-center">
                  <i className="ri-user-line text-white text-5xl"></i>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Sarah Johnson</h3>
                <p className="text-teal-600 font-semibold mb-4">CEO & Co-Founder</p>
                <p className="text-gray-600">
                  Former VP of Product at a leading AI company. 15+ years in tech innovation and business strategy.
                </p>
              </div>

              <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-200 text-center">
                <div className="w-32 h-32 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-full mx-auto mb-6 flex items-center justify-center">
                  <i className="ri-user-line text-white text-5xl"></i>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Michael Chen</h3>
                <p className="text-purple-600 font-semibold mb-4">CTO & Co-Founder</p>
                <p className="text-gray-600">
                  PhD in Machine Learning from MIT. Previously led AI research teams at Google and Amazon.
                </p>
              </div>

              <div className="bg-white rounded-2xl p-8 shadow-lg border border-gray-200 text-center">
                <div className="w-32 h-32 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full mx-auto mb-6 flex items-center justify-center">
                  <i className="ri-user-line text-white text-5xl"></i>
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Emily Rodriguez</h3>
                <p className="text-green-600 font-semibold mb-4">Head of Customer Success</p>
                <p className="text-gray-600">
                  20+ years in customer service and operations. Passionate about helping businesses grow.
                </p>
              </div>
            </div>
          </div>

          {/* CTA Section */}
          <div className="bg-gradient-to-r from-teal-500 to-cyan-600 rounded-2xl p-12 text-center">
            <h2 className="text-3xl font-bold text-white mb-4">
              Join Our Growing Family
            </h2>
            <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
              Discover how 24/7 AI 360 can transform your business communication and help you never miss another opportunity.
            </p>
            <div className="flex items-center justify-center gap-4">
              <a 
                href="/get-started"
                className="bg-white text-teal-600 px-8 py-4 rounded-lg font-semibold hover:bg-gray-50 transition-all whitespace-nowrap cursor-pointer"
              >
                Get Started
              </a>
              <a 
                href="/pricing"
                className="bg-transparent border-2 border-white text-white px-8 py-4 rounded-lg font-semibold hover:bg-white/10 transition-all whitespace-nowrap cursor-pointer"
              >
                View Pricing
              </a>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}

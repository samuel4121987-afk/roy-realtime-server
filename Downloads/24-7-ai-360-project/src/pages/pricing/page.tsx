import { Link } from 'react-router-dom';
import Navigation from '../home/components/Navigation';
import Footer from '../home/components/Footer';

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Navigation />
      
      <div className="pt-32 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center mb-16">
            <h1 className="text-5xl font-bold text-gray-900 mb-6">
              Simple, Transparent Pricing
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Choose the plan that fits your business needs. All plans include 24/7 AI support and can be canceled anytime.
            </p>
          </div>

          {/* Pricing Cards */}
          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto mb-20">
            {/* Starter Plan */}
            <div className="bg-white rounded-2xl p-8 shadow-lg border-2 border-gray-200 hover:border-teal-500 transition-all hover:shadow-2xl">
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-gray-500 to-gray-600 rounded-2xl mb-4">
                  <i className="ri-rocket-line text-white text-2xl"></i>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Starter</h3>
                <p className="text-gray-600 mb-6">Perfect for small businesses</p>
                <div className="flex items-baseline justify-center mb-2">
                  <span className="text-5xl font-bold text-gray-900">$299</span>
                  <span className="text-gray-600 ml-2">/month</span>
                </div>
              </div>
              <ul className="space-y-4 mb-8">
                <li className="flex items-start">
                  <i className="ri-check-line text-green-500 mr-3 mt-0.5 text-xl"></i>
                  <span className="text-gray-700">500 AI conversations/month</span>
                </li>
                <li className="flex items-start">
                  <i className="ri-check-line text-green-500 mr-3 mt-0.5 text-xl"></i>
                  <span className="text-gray-700">Basic calendar integration</span>
                </li>
                <li className="flex items-start">
                  <i className="ri-check-line text-green-500 mr-3 mt-0.5 text-xl"></i>
                  <span className="text-gray-700">Email support</span>
                </li>
                <li className="flex items-start">
                  <i className="ri-check-line text-green-500 mr-3 mt-0.5 text-xl"></i>
                  <span className="text-gray-700">Standard AI prompts</span>
                </li>
                <li className="flex items-start">
                  <i className="ri-check-line text-green-500 mr-3 mt-0.5 text-xl"></i>
                  <span className="text-gray-700">Basic analytics dashboard</span>
                </li>
                <li className="flex items-start">
                  <i className="ri-check-line text-green-500 mr-3 mt-0.5 text-xl"></i>
                  <span className="text-gray-700">Call transcripts</span>
                </li>
              </ul>
              <Link 
                to="/get-started"
                className="block w-full bg-gray-900 text-white px-6 py-4 rounded-lg font-semibold hover:bg-gray-800 transition-all whitespace-nowrap cursor-pointer text-center"
              >
                Get Started
              </Link>
            </div>

            {/* Professional Plan */}
            <div className="bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl p-8 shadow-2xl border-2 border-teal-400 transform scale-105 relative">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                <div className="bg-yellow-400 text-gray-900 px-6 py-2 rounded-full text-sm font-bold shadow-lg">
                  MOST POPULAR
                </div>
              </div>
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 rounded-2xl mb-4">
                  <i className="ri-vip-crown-line text-white text-2xl"></i>
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Professional</h3>
                <p className="text-white/90 mb-6">For growing businesses</p>
                <div className="flex items-baseline justify-center mb-2">
                  <span className="text-5xl font-bold text-white">$599</span>
                  <span className="text-white/90 ml-2">/month</span>
                </div>
              </div>
              <ul className="space-y-4 mb-8">
                <li className="flex items-start">
                  <i className="ri-check-line text-yellow-300 mr-3 mt-0.5 text-xl"></i>
                  <span className="text-white">2,500 AI conversations/month</span>
                </li>
                <li className="flex items-start">
                  <i className="ri-check-line text-yellow-300 mr-3 mt-0.5 text-xl"></i>
                  <span className="text-white">Advanced calendar & CRM integration</span>
                </li>
                <li className="flex items-start">
                  <i className="ri-check-line text-yellow-300 mr-3 mt-0.5 text-xl"></i>
                  <span className="text-white">Priority support (24/7)</span>
                </li>
                <li className="flex items-start">
                  <i className="ri-check-line text-yellow-300 mr-3 mt-0.5 text-xl"></i>
                  <span className="text-white">Custom AI prompts & training</span>
                </li>
                <li className="flex items-start">
                  <i className="ri-check-line text-yellow-300 mr-3 mt-0.5 text-xl"></i>
                  <span className="text-white">Advanced analytics & reporting</span>
                </li>
                <li className="flex items-start">
                  <i className="ri-check-line text-yellow-300 mr-3 mt-0.5 text-xl"></i>
                  <span className="text-white">Multi-language support</span>
                </li>
                <li className="flex items-start">
                  <i className="ri-check-line text-yellow-300 mr-3 mt-0.5 text-xl"></i>
                  <span className="text-white">API access</span>
                </li>
              </ul>
              <Link 
                to="/get-started"
                className="block w-full bg-white text-teal-600 px-6 py-4 rounded-lg font-semibold hover:bg-gray-50 transition-all whitespace-nowrap cursor-pointer text-center"
              >
                Get Started
              </Link>
            </div>

            {/* Enterprise Plan */}
            <div className="bg-white rounded-2xl p-8 shadow-lg border-2 border-gray-200 hover:border-teal-500 transition-all hover:shadow-2xl">
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-purple-500 to-indigo-600 rounded-2xl mb-4">
                  <i className="ri-building-line text-white text-2xl"></i>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Enterprise</h3>
                <p className="text-gray-600 mb-6">For large organizations</p>
                <div className="flex items-baseline justify-center mb-2">
                  <span className="text-5xl font-bold text-gray-900">$999</span>
                  <span className="text-gray-600 ml-2">/month</span>
                </div>
              </div>
              <ul className="space-y-4 mb-8">
                <li className="flex items-start">
                  <i className="ri-check-line text-green-500 mr-3 mt-0.5 text-xl"></i>
                  <span className="text-gray-700">Unlimited AI conversations</span>
                </li>
                <li className="flex items-start">
                  <i className="ri-check-line text-green-500 mr-3 mt-0.5 text-xl"></i>
                  <span className="text-gray-700">Full integration suite</span>
                </li>
                <li className="flex items-start">
                  <i className="ri-check-line text-green-500 mr-3 mt-0.5 text-xl"></i>
                  <span className="text-gray-700">Dedicated account manager</span>
                </li>
                <li className="flex items-start">
                  <i className="ri-check-line text-green-500 mr-3 mt-0.5 text-xl"></i>
                  <span className="text-gray-700">Custom AI training & optimization</span>
                </li>
                <li className="flex items-start">
                  <i className="ri-check-line text-green-500 mr-3 mt-0.5 text-xl"></i>
                  <span className="text-gray-700">Real-time analytics & insights</span>
                </li>
                <li className="flex items-start">
                  <i className="ri-check-line text-green-500 mr-3 mt-0.5 text-xl"></i>
                  <span className="text-gray-700">White-label options</span>
                </li>
                <li className="flex items-start">
                  <i className="ri-check-line text-green-500 mr-3 mt-0.5 text-xl"></i>
                  <span className="text-gray-700">SLA guarantees</span>
                </li>
              </ul>
              <Link 
                to="/get-started"
                className="block w-full bg-gray-900 text-white px-6 py-4 rounded-lg font-semibold hover:bg-gray-800 transition-all whitespace-nowrap cursor-pointer text-center"
              >
                Contact Sales
              </Link>
            </div>
          </div>

          {/* Comparison Table */}
          <div className="bg-white rounded-2xl shadow-xl p-8 mb-20">
            <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">
              Compare All Features
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left py-4 px-6 text-gray-900 font-semibold">Feature</th>
                    <th className="text-center py-4 px-6 text-gray-900 font-semibold">Starter</th>
                    <th className="text-center py-4 px-6 text-teal-600 font-semibold">Professional</th>
                    <th className="text-center py-4 px-6 text-gray-900 font-semibold">Enterprise</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  <tr>
                    <td className="py-4 px-6 text-gray-700">AI Conversations</td>
                    <td className="text-center py-4 px-6 text-gray-600">500/month</td>
                    <td className="text-center py-4 px-6 text-gray-900 font-semibold">2,500/month</td>
                    <td className="text-center py-4 px-6 text-gray-600">Unlimited</td>
                  </tr>
                  <tr>
                    <td className="py-4 px-6 text-gray-700">Calendar Integration</td>
                    <td className="text-center py-4 px-6"><i className="ri-check-line text-green-500 text-xl"></i></td>
                    <td className="text-center py-4 px-6"><i className="ri-check-line text-green-500 text-xl"></i></td>
                    <td className="text-center py-4 px-6"><i className="ri-check-line text-green-500 text-xl"></i></td>
                  </tr>
                  <tr>
                    <td className="py-4 px-6 text-gray-700">CRM Integration</td>
                    <td className="text-center py-4 px-6"><i className="ri-close-line text-gray-300 text-xl"></i></td>
                    <td className="text-center py-4 px-6"><i className="ri-check-line text-green-500 text-xl"></i></td>
                    <td className="text-center py-4 px-6"><i className="ri-check-line text-green-500 text-xl"></i></td>
                  </tr>
                  <tr>
                    <td className="py-4 px-6 text-gray-700">Custom AI Training</td>
                    <td className="text-center py-4 px-6"><i className="ri-close-line text-gray-300 text-xl"></i></td>
                    <td className="text-center py-4 px-6"><i className="ri-check-line text-green-500 text-xl"></i></td>
                    <td className="text-center py-4 px-6"><i className="ri-check-line text-green-500 text-xl"></i></td>
                  </tr>
                  <tr>
                    <td className="py-4 px-6 text-gray-700">Multi-language Support</td>
                    <td className="text-center py-4 px-6"><i className="ri-close-line text-gray-300 text-xl"></i></td>
                    <td className="text-center py-4 px-6"><i className="ri-check-line text-green-500 text-xl"></i></td>
                    <td className="text-center py-4 px-6"><i className="ri-check-line text-green-500 text-xl"></i></td>
                  </tr>
                  <tr>
                    <td className="py-4 px-6 text-gray-700">API Access</td>
                    <td className="text-center py-4 px-6"><i className="ri-close-line text-gray-300 text-xl"></i></td>
                    <td className="text-center py-4 px-6"><i className="ri-check-line text-green-500 text-xl"></i></td>
                    <td className="text-center py-4 px-6"><i className="ri-check-line text-green-500 text-xl"></i></td>
                  </tr>
                  <tr>
                    <td className="py-4 px-6 text-gray-700">Dedicated Account Manager</td>
                    <td className="text-center py-4 px-6"><i className="ri-close-line text-gray-300 text-xl"></i></td>
                    <td className="text-center py-4 px-6"><i className="ri-close-line text-gray-300 text-xl"></i></td>
                    <td className="text-center py-4 px-6"><i className="ri-check-line text-green-500 text-xl"></i></td>
                  </tr>
                  <tr>
                    <td className="py-4 px-6 text-gray-700">White-label Options</td>
                    <td className="text-center py-4 px-6"><i className="ri-close-line text-gray-300 text-xl"></i></td>
                    <td className="text-center py-4 px-6"><i className="ri-close-line text-gray-300 text-xl"></i></td>
                    <td className="text-center py-4 px-6"><i className="ri-check-line text-green-500 text-xl"></i></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* FAQ Section */}
          <div className="mb-20">
            <h2 className="text-3xl font-bold text-gray-900 text-center mb-12">
              Frequently Asked Questions
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
              <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-200">
                <h4 className="font-bold text-gray-900 mb-3 flex items-start text-lg">
                  <i className="ri-question-line text-teal-600 mr-3 mt-1"></i>
                  Can I change plans later?
                </h4>
                <p className="text-gray-600">
                  Yes! You can upgrade or downgrade your plan at any time. Changes take effect at the start of your next billing cycle.
                </p>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-200">
                <h4 className="font-bold text-gray-900 mb-3 flex items-start text-lg">
                  <i className="ri-question-line text-teal-600 mr-3 mt-1"></i>
                  What happens if I exceed my conversation limit?
                </h4>
                <p className="text-gray-600">
                  We'll notify you when you're approaching your limit. You can upgrade your plan or purchase additional conversations as needed.
                </p>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-200">
                <h4 className="font-bold text-gray-900 mb-3 flex items-start text-lg">
                  <i className="ri-question-line text-teal-600 mr-3 mt-1"></i>
                  Is there a setup fee?
                </h4>
                <p className="text-gray-600">
                  No setup fees for any plan. We handle all the technical configuration and get you up and running within 24 hours.
                </p>
              </div>

              <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-200">
                <h4 className="font-bold text-gray-900 mb-3 flex items-start text-lg">
                  <i className="ri-question-line text-teal-600 mr-3 mt-1"></i>
                  Do you offer refunds?
                </h4>
                <p className="text-gray-600">
                  We offer a 14-day money-back guarantee. If you're not satisfied, we'll refund your first month's payment, no questions asked.
                </p>
              </div>
            </div>
          </div>

          {/* CTA Section */}
          <div className="bg-gradient-to-r from-teal-500 to-cyan-600 rounded-2xl p-12 text-center">
            <h2 className="text-3xl font-bold text-white mb-4">
              Ready to Transform Your Business?
            </h2>
            <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
              Join hundreds of businesses that never miss a call. Start your free trial today.
            </p>
            <Link 
              to="/get-started"
              className="inline-block bg-white text-teal-600 px-8 py-4 rounded-lg font-semibold hover:bg-gray-50 transition-all whitespace-nowrap cursor-pointer text-lg"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}

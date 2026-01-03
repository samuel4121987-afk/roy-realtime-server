import { useState } from 'react';

export default function ContactSection() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    phone: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [charCount, setCharCount] = useState(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const formBody = new URLSearchParams();
      Object.entries(formData).forEach(([key, value]) => {
        formBody.append(key, value);
      });

      const response = await fetch('https://readdy.ai/api/form/d5c3papdn6dhfpiabp1g', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formBody.toString()
      });

      if (response.ok) {
        setSubmitStatus('success');
        setFormData({ name: '', email: '', company: '', phone: '', message: '' });
        setCharCount(0);
      } else {
        setSubmitStatus('error');
      }
    } catch (error) {
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
      setTimeout(() => setSubmitStatus('idle'), 5000);
    }
  };

  const handleMessageChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    if (value.length <= 500) {
      setFormData({ ...formData, message: value });
      setCharCount(value.length);
    }
  };

  return (
    <section className="py-32 bg-white relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left Column - Info */}
          <div>
            <div className="inline-block px-4 py-2 bg-gradient-to-r from-teal-100 to-cyan-100 rounded-full mb-6">
              <span className="text-sm font-semibold bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent">
                GET IN TOUCH
              </span>
            </div>
            
            <h2 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
              Ready to Transform Your
              <span className="bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent"> Customer Service?</span>
            </h2>
            
            <p className="text-xl text-gray-600 mb-12 leading-relaxed">
              Get started with a free trial or schedule a demo to see how 247 AI 360 can revolutionize your business.
            </p>

            {/* Contact Info */}
            <div className="space-y-6">
              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-xl flex items-center justify-center flex-shrink-0">
                  <i className="ri-mail-line text-white text-xl"></i>
                </div>
                <div>
                  <div className="font-bold text-gray-900 mb-1">Email Us</div>
                  <a href="mailto:hello@247ai360.com" className="text-gray-600 hover:text-teal-600 transition-colors cursor-pointer">
                    hello@247ai360.com
                  </a>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
                  <i className="ri-phone-line text-white text-xl"></i>
                </div>
                <div>
                  <div className="font-bold text-gray-900 mb-1">Call Us</div>
                  <a href="tel:+1-800-247-AI60" className="text-gray-600 hover:text-teal-600 transition-colors cursor-pointer">
                    +1 (800) 247-AI60
                  </a>
                </div>
              </div>

              <div className="flex items-start space-x-4">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
                  <i className="ri-customer-service-2-line text-white text-xl"></i>
                </div>
                <div>
                  <div className="font-bold text-gray-900 mb-1">Live Chat</div>
                  <button 
                    onClick={() => document.querySelector('#vapi-widget-floating-button')?.click()}
                    className="text-gray-600 hover:text-teal-600 transition-colors cursor-pointer"
                  >
                    Chat with our AI assistant
                  </button>
                </div>
              </div>
            </div>

            {/* Trust Badges */}
            <div className="mt-12 flex flex-wrap gap-4">
              <div className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-teal-50 to-cyan-50 rounded-full">
                <i className="ri-shield-check-line text-teal-600"></i>
                <span className="text-sm font-semibold text-gray-700">SOC 2 Certified</span>
              </div>
              <div className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-cyan-50 to-blue-50 rounded-full">
                <i className="ri-lock-line text-cyan-600"></i>
                <span className="text-sm font-semibold text-gray-700">HIPAA Compliant</span>
              </div>
              <div className="flex items-center space-x-2 px-4 py-2 bg-gradient-to-r from-blue-50 to-purple-50 rounded-full">
                <i className="ri-star-fill text-blue-600"></i>
                <span className="text-sm font-semibold text-gray-700">4.9/5 Rating</span>
              </div>
            </div>
          </div>

          {/* Right Column - Form */}
          <div className="bg-white rounded-3xl p-8 border-2 border-gray-100 shadow-xl">
            <form id="contact-form" data-readdy-form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="name" className="block text-sm font-semibold text-gray-900 mb-2">
                  Full Name *
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-teal-500 focus:bg-white focus:outline-none transition-all duration-300 text-sm"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-gray-900 mb-2">
                  Email Address *
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-teal-500 focus:bg-white focus:outline-none transition-all duration-300 text-sm"
                  placeholder="john@company.com"
                />
              </div>

              <div>
                <label htmlFor="company" className="block text-sm font-semibold text-gray-900 mb-2">
                  Company Name
                </label>
                <input
                  type="text"
                  id="company"
                  name="company"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-teal-500 focus:bg-white focus:outline-none transition-all duration-300 text-sm"
                  placeholder="Your Company"
                />
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-semibold text-gray-900 mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-teal-500 focus:bg-white focus:outline-none transition-all duration-300 text-sm"
                  placeholder="+1 (555) 000-0000"
                />
              </div>

              <div>
                <label htmlFor="message" className="block text-sm font-semibold text-gray-900 mb-2">
                  Message *
                </label>
                <textarea
                  id="message"
                  name="message"
                  required
                  rows={4}
                  maxLength={500}
                  value={formData.message}
                  onChange={handleMessageChange}
                  className="w-full px-4 py-3 bg-gray-50 border-2 border-gray-200 rounded-xl focus:border-teal-500 focus:bg-white focus:outline-none transition-all duration-300 resize-none text-sm"
                  placeholder="Tell us about your needs..."
                ></textarea>
                <div className="text-right text-xs text-gray-500 mt-1">
                  {charCount}/500 characters
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || charCount > 500}
                className="w-full py-4 bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-semibold rounded-xl hover:shadow-xl hover:shadow-teal-500/50 transform hover:scale-105 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
              >
                {isSubmitting ? 'Sending...' : 'Send Message'}
              </button>

              {submitStatus === 'success' && (
                <div className="p-4 bg-green-50 border-2 border-green-200 rounded-xl text-green-700 text-sm text-center">
                  ✓ Message sent successfully! We'll get back to you soon.
                </div>
              )}

              {submitStatus === 'error' && (
                <div className="p-4 bg-red-50 border-2 border-red-200 rounded-xl text-red-700 text-sm text-center">
                  ✗ Something went wrong. Please try again.
                </div>
              )}
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}

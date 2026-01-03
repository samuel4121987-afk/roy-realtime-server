import { useState } from 'react';

export default function ContactForm() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    phone: '',
    businessType: '',
    currentSolution: '',
    timeline: '',
    message: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus('idle');

    try {
      // Save to Supabase database
      const response = await fetch(`${import.meta.env.VITE_PUBLIC_SUPABASE_URL}/functions/v1/save-client-lead`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          company: formData.company,
          business_type: formData.businessType,
          current_solution: formData.currentSolution,
          timeline: formData.timeline,
          message: formData.message,
          source: 'integration_form',
          metadata: {
            form_type: 'integration_request',
            page: 'integration'
          }
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setSubmitStatus('success');
        setFormData({
          name: '',
          email: '',
          company: '',
          phone: '',
          businessType: '',
          currentSolution: '',
          timeline: '',
          message: ''
        });
      } else {
        console.error('Failed to save lead:', result);
        setSubmitStatus('error');
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="mb-20">
      <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-8">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-white mb-4 font-orbitron">
            Ready to Get <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">Started?</span>
          </h2>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            Let's discuss your specific needs and create a custom integration plan for your business.
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          <form id="business-integration-contact-form" onSubmit={handleSubmit} data-readdy-form>
            <div className="grid md:grid-cols-2 gap-6 mb-6">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
                  Full Name *
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500 transition-colors text-sm"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
                  Email Address *
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500 transition-colors text-sm"
                  placeholder="john@company.com"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-6">
              <div>
                <label htmlFor="company" className="block text-sm font-medium text-gray-300 mb-2">
                  Company Name *
                </label>
                <input
                  type="text"
                  id="company"
                  name="company"
                  value={formData.company}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500 transition-colors text-sm"
                  placeholder="Your Company"
                />
              </div>
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-300 mb-2">
                  Phone Number
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500 transition-colors text-sm"
                  placeholder="+1 (555) 123-4567"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6 mb-6">
              <div>
                <label htmlFor="businessType" className="block text-sm font-medium text-gray-300 mb-2">
                  Business Type *
                </label>
                <select
                  id="businessType"
                  name="businessType"
                  value={formData.businessType}
                  onChange={handleInputChange}
                  required
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500 transition-colors text-sm pr-8"
                >
                  <option value="">Select business type</option>
                  <option value="hotel">Hotels & Hospitality</option>
                  <option value="clinic">Medical Clinics</option>
                  <option value="law">Law Offices</option>
                  <option value="retail">Retail & E-commerce</option>
                  <option value="professional">Professional Services</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label htmlFor="currentSolution" className="block text-sm font-medium text-gray-300 mb-2">
                  Current Solution
                </label>
                <select
                  id="currentSolution"
                  name="currentSolution"
                  value={formData.currentSolution}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500 transition-colors text-sm pr-8"
                >
                  <option value="">Select current solution</option>
                  <option value="none">No current solution</option>
                  <option value="manual">Manual phone handling</option>
                  <option value="voicemail">Voicemail system</option>
                  <option value="competitor">Competitor solution</option>
                  <option value="inhouse">In-house system</option>
                </select>
              </div>
              <div>
                <label htmlFor="timeline" className="block text-sm font-medium text-gray-300 mb-2">
                  Implementation Timeline
                </label>
                <select
                  id="timeline"
                  name="timeline"
                  value={formData.timeline}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-cyan-500 transition-colors text-sm pr-8"
                >
                  <option value="">Select timeline</option>
                  <option value="immediate">Immediate (within 1 week)</option>
                  <option value="month">Within 1 month</option>
                  <option value="quarter">Within 3 months</option>
                  <option value="exploring">Just exploring options</option>
                </select>
              </div>
            </div>

            <div className="mb-6">
              <label htmlFor="message" className="block text-sm font-medium text-gray-300 mb-2">
                Tell us about your specific needs
              </label>
              <textarea
                id="message"
                name="message"
                value={formData.message}
                onChange={handleInputChange}
                rows={4}
                maxLength={500}
                className="w-full px-4 py-3 bg-gray-700/50 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500 transition-colors text-sm resize-none"
                placeholder="Describe your current challenges, integration requirements, expected call volume, etc..."
              ></textarea>
              <div className="text-right text-xs text-gray-400 mt-1">
                {formData.message.length}/500 characters
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                type="submit"
                disabled={isSubmitting}
                className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:from-cyan-600 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <i className="ri-loader-4-line mr-2 animate-spin"></i>
                    Sending Request...
                  </>
                ) : (
                  <>
                    <i className="ri-send-plane-line mr-2"></i>
                    Request Integration Setup
                  </>
                )}
              </button>
              
              <button
                type="button"
                className="border border-gray-600 text-gray-300 px-8 py-4 rounded-lg text-lg font-medium hover:border-gray-500 hover:text-white transition-all whitespace-nowrap cursor-pointer"
              >
                <i className="ri-calendar-line mr-2"></i>
                Schedule Demo Call
              </button>
            </div>

            {/* Status Messages */}
            {submitStatus === 'success' && (
              <div className="mt-6 p-4 bg-green-500/20 border border-green-500/30 rounded-lg text-green-400 text-center">
                <i className="ri-check-circle-line mr-2"></i>
                Thank you! Our integration team will contact you within 24 hours to discuss your setup.
              </div>
            )}

            {submitStatus === 'error' && (
              <div className="mt-6 p-4 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-center">
                <i className="ri-error-warning-line mr-2"></i>
                Something went wrong. Please try again or contact us directly at integration@247ai360.com
              </div>
            )}
          </form>
        </div>
      </div>
    </section>
  );
}
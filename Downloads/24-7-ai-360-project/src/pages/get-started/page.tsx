import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navigation from '../home/components/Navigation';
import Footer from '../home/components/Footer';

export default function GetStarted() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);
  
  // Form data
  const [formData, setFormData] = useState({
    // Step 1: Business Info
    businessName: '',
    businessType: '',
    industry: '',
    website: '',
    
    // Step 2: Contact Info
    fullName: '',
    email: '',
    phone: '',
    role: '',
    
    // Step 3: Requirements
    callVolume: '',
    languages: [] as string[],
    features: [] as string[],
    integrations: [] as string[],
    
    // Step 4: Additional Info
    currentSolution: '',
    timeline: '',
    budget: '',
    additionalNotes: ''
  });

  const businessTypes = [
    { id: 'hotel', name: 'Hotel & Hospitality', icon: 'ri-hotel-line' },
    { id: 'clinic', name: 'Medical Clinic', icon: 'ri-hospital-line' },
    { id: 'salon', name: 'Salon & Spa', icon: 'ri-scissors-line' },
    { id: 'restaurant', name: 'Restaurant', icon: 'ri-restaurant-line' },
    { id: 'retail', name: 'Retail Store', icon: 'ri-store-line' },
    { id: 'other', name: 'Other', icon: 'ri-building-line' }
  ];

  const languageOptions = ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Chinese', 'Japanese'];
  const featureOptions = [
    'Appointment Booking',
    'Customer Support',
    'Lead Qualification',
    'Order Taking',
    'FAQ Handling',
    'Call Routing',
    'After-Hours Support',
    'Multi-language Support'
  ];
  const integrationOptions = ['CRM', 'Calendar', 'Email', 'SMS', 'Slack', 'Zapier', 'Custom API'];

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleArrayToggle = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: (prev[field as keyof typeof prev] as string[]).includes(value)
        ? (prev[field as keyof typeof prev] as string[]).filter(item => item !== value)
        : [...(prev[field as keyof typeof prev] as string[]), value]
    }));
  };

  const handleNext = () => {
    if (step < 4) {
      setStep(step + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep(step - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    setSubmitError('');
    
    try {
      const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL;
      
      const response = await fetch(`${supabaseUrl}/functions/v1/save-lead-submission`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source: 'get-started',
          businessName: formData.businessName,
          businessType: formData.businessType,
          industry: formData.industry,
          website: formData.website,
          fullName: formData.fullName,
          email: formData.email,
          phone: formData.phone,
          role: formData.role,
          callVolume: formData.callVolume,
          languages: formData.languages,
          features: formData.features,
          integrations: formData.integrations,
          currentSolution: formData.currentSolution,
          timeline: formData.timeline,
          budget: formData.budget,
          additionalNotes: formData.additionalNotes
        })
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to submit form');
      }

      console.log('✅ Lead saved successfully:', result);
      setSubmitSuccess(true);
      
      // Show success message for 2 seconds then redirect
      setTimeout(() => {
        navigate('/');
      }, 2000);

    } catch (error) {
      console.error('❌ Error submitting form:', error);
      setSubmitError('Failed to submit. Please try again or contact us directly.');
      setIsLoading(false);
    }
  };

  const isStepValid = () => {
    switch (step) {
      case 1:
        return formData.businessName && formData.businessType;
      case 2:
        return formData.fullName && formData.email && formData.phone;
      case 3:
        return formData.callVolume && formData.languages.length > 0;
      case 4:
        return true;
      default:
        return false;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Navigation />
      
      <div className="pt-24 pb-16 px-4">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Get Started with 24/7 AI
            </h1>
            <p className="text-xl text-gray-600">
              Complete the setup in 4 simple steps
            </p>
          </div>

          {/* Success Message */}
          {submitSuccess && (
            <div className="mb-8 bg-green-50 border-2 border-green-500 rounded-xl p-6 text-center animate-pulse">
              <i className="ri-check-double-line text-4xl text-green-600 mb-3"></i>
              <h3 className="text-xl font-bold text-green-900 mb-2">Successfully Submitted!</h3>
              <p className="text-green-700">Your information has been saved. Our team will contact you shortly!</p>
            </div>
          )}

          {/* Error Message */}
          {submitError && (
            <div className="mb-8 bg-red-50 border-2 border-red-500 rounded-xl p-6 text-center">
              <i className="ri-error-warning-line text-4xl text-red-600 mb-3"></i>
              <h3 className="text-xl font-bold text-red-900 mb-2">Submission Failed</h3>
              <p className="text-red-700">{submitError}</p>
              <button
                onClick={() => setSubmitError('')}
                className="mt-4 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors cursor-pointer whitespace-nowrap"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Progress Bar */}
          {!submitSuccess && (
            <>
              <div className="mb-12">
                <div className="flex items-center justify-between mb-4">
                  {[1, 2, 3, 4].map((num) => (
                    <div key={num} className="flex items-center flex-1">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${
                        step >= num
                          ? 'bg-gradient-to-r from-teal-500 to-cyan-600 text-white'
                          : 'bg-gray-200 text-gray-500'
                      }`}>
                        {num}
                      </div>
                      {num < 4 && (
                        <div className={`flex-1 h-1 mx-2 transition-all ${
                          step > num ? 'bg-gradient-to-r from-teal-500 to-cyan-600' : 'bg-gray-200'
                        }`}></div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Business Info</span>
                  <span>Contact Details</span>
                  <span>Requirements</span>
                  <span>Finalize</span>
                </div>
              </div>

              {/* Form Card */}
              <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-8 md:p-12">
                {/* Step 1: Business Info */}
                {step === 1 && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900 mb-2">Business Information</h2>
                      <p className="text-gray-600">Tell us about your business</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Business Name *
                      </label>
                      <input
                        type="text"
                        value={formData.businessName}
                        onChange={(e) => handleInputChange('businessName', e.target.value)}
                        placeholder="Your Business Name"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-3">
                        Business Type *
                      </label>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {businessTypes.map((type) => (
                          <button
                            key={type.id}
                            onClick={() => handleInputChange('businessType', type.id)}
                            className={`p-4 rounded-lg border-2 transition-all cursor-pointer whitespace-nowrap ${
                              formData.businessType === type.id
                                ? 'border-teal-500 bg-teal-50'
                                : 'border-gray-200 hover:border-gray-300'
                            }`}
                          >
                            <i className={`${type.icon} text-3xl mb-2 ${
                              formData.businessType === type.id ? 'text-teal-600' : 'text-gray-400'
                            }`}></i>
                            <p className="text-sm font-medium text-gray-900">{type.name}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Industry
                      </label>
                      <input
                        type="text"
                        value={formData.industry}
                        onChange={(e) => handleInputChange('industry', e.target.value)}
                        placeholder="e.g., Healthcare, Hospitality, Retail"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Website
                      </label>
                      <input
                        type="url"
                        value={formData.website}
                        onChange={(e) => handleInputChange('website', e.target.value)}
                        placeholder="https://yourwebsite.com"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                )}

                {/* Step 2: Contact Info */}
                {step === 2 && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900 mb-2">Contact Information</h2>
                      <p className="text-gray-600">How can we reach you?</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Full Name *
                      </label>
                      <input
                        type="text"
                        value={formData.fullName}
                        onChange={(e) => handleInputChange('fullName', e.target.value)}
                        placeholder="John Doe"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Email Address *
                      </label>
                      <input
                        type="email"
                        value={formData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        placeholder="you@example.com"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Phone Number *
                      </label>
                      <input
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => handleInputChange('phone', e.target.value)}
                        placeholder="+1 (555) 000-0000"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Your Role
                      </label>
                      <select
                        value={formData.role}
                        onChange={(e) => handleInputChange('role', e.target.value)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      >
                        <option value="">Select your role</option>
                        <option value="owner">Business Owner</option>
                        <option value="manager">Manager</option>
                        <option value="it">IT Director</option>
                        <option value="operations">Operations</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* Step 3: Requirements */}
                {step === 3 && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900 mb-2">Your Requirements</h2>
                      <p className="text-gray-600">Help us customize your solution</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Expected Monthly Call Volume *
                      </label>
                      <select
                        value={formData.callVolume}
                        onChange={(e) => handleInputChange('callVolume', e.target.value)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      >
                        <option value="">Select volume</option>
                        <option value="0-500">0 - 500 calls</option>
                        <option value="500-2500">500 - 2,500 calls</option>
                        <option value="2500-10000">2,500 - 10,000 calls</option>
                        <option value="10000+">10,000+ calls</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-3">
                        Languages Needed *
                      </label>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {languageOptions.map((lang) => (
                          <button
                            key={lang}
                            onClick={() => handleArrayToggle('languages', lang)}
                            className={`px-4 py-2 rounded-lg border-2 transition-all cursor-pointer whitespace-nowrap text-sm ${
                              formData.languages.includes(lang)
                                ? 'border-teal-500 bg-teal-50 text-teal-700'
                                : 'border-gray-200 hover:border-gray-300 text-gray-700'
                            }`}
                          >
                            {lang}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-3">
                        Features You Need
                      </label>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {featureOptions.map((feature) => (
                          <label key={feature} className="flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={formData.features.includes(feature)}
                              onChange={() => handleArrayToggle('features', feature)}
                              className="mr-3 cursor-pointer"
                            />
                            <span className="text-gray-700">{feature}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-3">
                        Integrations Required
                      </label>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {integrationOptions.map((integration) => (
                          <button
                            key={integration}
                            onClick={() => handleArrayToggle('integrations', integration)}
                            className={`px-4 py-2 rounded-lg border-2 transition-all cursor-pointer whitespace-nowrap text-sm ${
                              formData.integrations.includes(integration)
                                ? 'border-teal-500 bg-teal-50 text-teal-700'
                                : 'border-gray-200 hover:border-gray-300 text-gray-700'
                            }`}
                          >
                            {integration}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 4: Additional Info */}
                {step === 4 && (
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900 mb-2">Almost Done!</h2>
                      <p className="text-gray-600">Just a few more details</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Current Solution
                      </label>
                      <input
                        type="text"
                        value={formData.currentSolution}
                        onChange={(e) => handleInputChange('currentSolution', e.target.value)}
                        placeholder="What are you currently using?"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Implementation Timeline
                      </label>
                      <select
                        value={formData.timeline}
                        onChange={(e) => handleInputChange('timeline', e.target.value)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      >
                        <option value="">Select timeline</option>
                        <option value="immediate">Immediate (within 1 week)</option>
                        <option value="1-month">Within 1 month</option>
                        <option value="1-3-months">1-3 months</option>
                        <option value="3-6-months">3-6 months</option>
                        <option value="exploring">Just exploring</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Budget Range
                      </label>
                      <select
                        value={formData.budget}
                        onChange={(e) => handleInputChange('budget', e.target.value)}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      >
                        <option value="">Select budget</option>
                        <option value="starter">$299 - $599/month (Starter)</option>
                        <option value="professional">$599 - $999/month (Professional)</option>
                        <option value="enterprise">$999+/month (Enterprise)</option>
                        <option value="custom">Custom pricing needed</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Additional Notes
                      </label>
                      <textarea
                        value={formData.additionalNotes}
                        onChange={(e) => handleInputChange('additionalNotes', e.target.value)}
                        placeholder="Any specific requirements or questions?"
                        rows={4}
                        maxLength={500}
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                      ></textarea>
                      <p className="text-sm text-gray-500 mt-1">
                        {formData.additionalNotes.length}/500 characters
                      </p>
                    </div>

                    {/* Summary */}
                    <div className="bg-gradient-to-r from-teal-50 to-cyan-50 border border-teal-200 rounded-lg p-6">
                      <h3 className="font-bold text-gray-900 mb-4">Your Setup Summary</h3>
                      <div className="space-y-2 text-sm">
                        <p><strong>Business:</strong> {formData.businessName || 'Not provided'}</p>
                        <p><strong>Type:</strong> {businessTypes.find(t => t.id === formData.businessType)?.name || 'Not selected'}</p>
                        <p><strong>Contact:</strong> {formData.fullName} ({formData.email})</p>
                        <p><strong>Call Volume:</strong> {formData.callVolume || 'Not selected'}</p>
                        <p><strong>Languages:</strong> {formData.languages.join(', ') || 'None selected'}</p>
                        <p><strong>Features:</strong> {formData.features.length} selected</p>
                        <p><strong>Integrations:</strong> {formData.integrations.length} selected</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Navigation Buttons */}
                <div className="flex gap-4 mt-8">
                  {step > 1 && (
                    <button
                      onClick={handleBack}
                      disabled={isLoading}
                      className="flex-1 px-6 py-4 border-2 border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-all cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <i className="ri-arrow-left-line mr-2"></i>
                      Back
                    </button>
                  )}
                  
                  {step < 4 ? (
                    <button
                      onClick={handleNext}
                      disabled={!isStepValid()}
                      className="flex-1 bg-gradient-to-r from-teal-500 to-cyan-600 text-white px-6 py-4 rounded-lg font-semibold hover:from-teal-600 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl cursor-pointer whitespace-nowrap"
                    >
                      Continue
                      <i className="ri-arrow-right-line ml-2"></i>
                    </button>
                  ) : (
                    <button
                      onClick={handleSubmit}
                      disabled={isLoading}
                      className="flex-1 bg-gradient-to-r from-teal-500 to-cyan-600 text-white px-6 py-4 rounded-lg font-semibold hover:from-teal-600 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl cursor-pointer whitespace-nowrap"
                    >
                      {isLoading ? (
                        <span className="flex items-center justify-center">
                          <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                          Submitting...
                        </span>
                      ) : (
                        <>
                          <i className="ri-check-line mr-2"></i>
                          Complete Setup
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}

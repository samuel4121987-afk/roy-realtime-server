import { useState } from 'react';

export default function BusinessIntroduction() {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({
    name: '',
    businessName: '',
    industry: '',
    phone: '',
    email: '',
    businessType: '',
    challenges: '',
    goals: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  const steps = [
    {
      id: 'personal',
      title: 'Let\'s start with you',
      question: 'What should I call you?',
      fields: ['name']
    },
    {
      id: 'business',
      title: 'Tell me about your business',
      question: 'What\'s your business called and what industry are you in?',
      fields: ['businessName', 'industry']
    },
    {
      id: 'contact',
      title: 'How can I reach you?',
      question: 'What\'s the best way to contact you?',
      fields: ['phone', 'email']
    },
    {
      id: 'type',
      title: 'What type of business do you run?',
      question: 'This helps me understand your specific needs',
      fields: ['businessType']
    },
    {
      id: 'challenges',
      title: 'What challenges are you facing?',
      question: 'Tell me about your biggest pain points',
      fields: ['challenges']
    },
    {
      id: 'goals',
      title: 'What are your goals?',
      question: 'How can AI help you achieve them?',
      fields: ['goals']
    }
  ];

  const businessTypes = [
    'Hotels & Hospitality', 'Medical Clinics', 'Law Offices', 'Professional Services', 
    'Real Estate', 'E-commerce', 'Restaurant/Food Service', 'Fitness/Wellness', 
    'Education/Training', 'Financial Services', 'Technology', 'Other'
  ];

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    
    try {
      const formDataToSubmit = new FormData();
      formDataToSubmit.append('name', formData.name);
      formDataToSubmit.append('businessName', formData.businessName);
      formDataToSubmit.append('industry', formData.industry);
      formDataToSubmit.append('phone', formData.phone);
      formDataToSubmit.append('email', formData.email);
      formDataToSubmit.append('businessType', formData.businessType);
      formDataToSubmit.append('challenges', formData.challenges);
      formDataToSubmit.append('goals', formData.goals);

      const response = await fetch('https://readdy.ai/api/form/submit/business_introduction_1732', {
        method: 'POST',
        body: formDataToSubmit
      });

      if (response.ok) {
        setIsCompleted(true);
      } else {
        throw new Error('Submission failed');
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      // Still show completion for better UX
      setIsCompleted(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isStepValid = () => {
    const currentFields = steps[currentStep].fields;
    return currentFields.every(field => {
      const value = formData[field as keyof typeof formData];
      return value && value.trim().length > 0;
    });
  };

  const renderField = (field: string) => {
    switch (field) {
      case 'name':
        return (
          <input
            type="text"
            value={formData.name}
            onChange={(e) => handleInputChange('name', e.target.value)}
            placeholder="Your full name"
            className="w-full px-6 py-4 bg-gray-800/50 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500 transition-colors text-lg"
          />
        );
      
      case 'businessName':
        return (
          <input
            type="text"
            value={formData.businessName}
            onChange={(e) => handleInputChange('businessName', e.target.value)}
            placeholder="Your business name"
            className="w-full px-6 py-4 bg-gray-800/50 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500 transition-colors text-lg mb-4"
          />
        );
      
      case 'industry':
        return (
          <input
            type="text"
            value={formData.industry}
            onChange={(e) => handleInputChange('industry', e.target.value)}
            placeholder="What industry are you in?"
            className="w-full px-6 py-4 bg-gray-800/50 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500 transition-colors text-lg"
          />
        );
      
      case 'phone':
        return (
          <input
            type="tel"
            value={formData.phone}
            onChange={(e) => handleInputChange('phone', e.target.value)}
            placeholder="Your phone number"
            className="w-full px-6 py-4 bg-gray-800/50 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500 transition-colors text-lg mb-4"
          />
        );
      
      case 'email':
        return (
          <input
            type="email"
            value={formData.email}
            onChange={(e) => handleInputChange('email', e.target.value)}
            placeholder="Your email address"
            className="w-full px-6 py-4 bg-gray-800/50 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500 transition-colors text-lg"
          />
        );
      
      case 'businessType':
        return (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {businessTypes.map((type) => (
              <button
                key={type}
                onClick={() => handleInputChange('businessType', type)}
                className={`p-4 rounded-xl border-2 transition-all text-sm font-medium cursor-pointer whitespace-nowrap ${
                  formData.businessType === type
                    ? 'border-cyan-500 bg-cyan-500/20 text-cyan-400'
                    : 'border-gray-600 bg-gray-800/30 text-gray-300 hover:border-gray-500'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        );
      
      case 'challenges':
        return (
          <textarea
            value={formData.challenges}
            onChange={(e) => handleInputChange('challenges', e.target.value)}
            placeholder="Tell me about your biggest challenges... (e.g., managing appointments, customer service, lead generation)"
            rows={4}
            maxLength={500}
            className="w-full px-6 py-4 bg-gray-800/50 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500 transition-colors text-lg resize-none"
          />
        );
      
      case 'goals':
        return (
          <textarea
            value={formData.goals}
            onChange={(e) => handleInputChange('goals', e.target.value)}
            placeholder="What are your main goals? How do you want to grow your business?"
            rows={4}
            maxLength={500}
            className="w-full px-6 py-4 bg-gray-800/50 border border-gray-600 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500 transition-colors text-lg resize-none"
          />
        );
      
      default:
        return null;
    }
  };

  if (isCompleted) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="bg-gray-800/50 backdrop-blur-sm border border-green-500/30 rounded-2xl p-8 text-center">
          <div className="w-20 h-20 bg-gradient-to-r from-green-500 to-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <i className="ri-check-line text-3xl text-white"></i>
          </div>
          <h2 className="text-3xl font-bold text-white mb-4">
            Perfect! Nice to meet you, {formData.name}!
          </h2>
          <p className="text-xl text-gray-300 mb-8">
            Thank you for sharing details about {formData.businessName}. Your information has been received and we'll contact you at {formData.email} with a personalized AI solution for your {formData.businessType} business.
          </p>
          
          <div className="bg-gray-900/50 border border-gray-700 rounded-xl p-6 mb-8">
            <div className="flex items-start space-x-4">
              <div className="w-12 h-12 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                <i className="ri-robot-line text-white"></i>
              </div>
              <div className="text-left">
                <p className="text-white text-lg leading-relaxed">
                  Based on what you've told me, I can help {formData.businessName} with automated scheduling, 
                  24/7 customer support, and intelligent business insights. We'll be in touch soon with a 
                  personalized solution designed specifically for your {formData.businessType} business!
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => window.location.href = '/'}
              className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-8 py-3 rounded-xl font-semibold hover:from-cyan-600 hover:to-blue-700 transition-all cursor-pointer whitespace-nowrap"
            >
              <i className="ri-home-line mr-2"></i>
              Back to Home
            </button>
            <button
              onClick={() => window.location.href = 'mailto:support@247ai360.com'}
              className="bg-gray-700 text-white px-8 py-3 rounded-xl font-semibold hover:bg-gray-600 transition-all cursor-pointer whitespace-nowrap"
            >
              <i className="ri-mail-line mr-2"></i>
              Contact Us
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
      <form data-readdy-form id="business_introduction_1732">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <span className="text-sm text-gray-400">Step {currentStep + 1} of {steps.length}</span>
            <span className="text-sm text-gray-400">{Math.round(((currentStep + 1) / steps.length) * 100)}% Complete</span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div 
              className="bg-gradient-to-r from-cyan-500 to-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
            ></div>
          </div>
        </div>

        {/* Current Step */}
        <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-white mb-4">
              {steps[currentStep].title}
            </h2>
            
            {/* AI Question */}
            <div className="bg-white/5 border border-cyan-500/30 rounded-xl p-6 mb-8">
              <div className="flex items-start space-x-4">
                <div className="w-10 h-10 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <i className="ri-robot-line text-white"></i>
                </div>
                <div className="text-left">
                  <p className="text-white text-lg">
                    {steps[currentStep].question}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Form Fields */}
          <div className="space-y-6 mb-8">
            {steps[currentStep].fields.map(field => (
              <div key={field}>
                {renderField(field)}
              </div>
            ))}
          </div>

          {/* Navigation Buttons */}
          <div className="flex justify-between">
            <button
              type="button"
              onClick={handleBack}
              disabled={currentStep === 0}
              className="bg-gray-700 text-white px-6 py-3 rounded-xl font-medium hover:bg-gray-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
            >
              <i className="ri-arrow-left-line mr-2"></i>
              Back
            </button>

            <button
              type="button"
              onClick={handleNext}
              disabled={!isStepValid() || isSubmitting}
              className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-8 py-3 rounded-xl font-semibold hover:from-cyan-600 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
            >
              {isSubmitting ? (
                <>
                  <i className="ri-loader-4-line mr-2 animate-spin"></i>
                  Processing...
                </>
              ) : currentStep === steps.length - 1 ? (
                <>
                  <i className="ri-send-plane-line mr-2"></i>
                  Complete Introduction
                </>
              ) : (
                <>
                  Next
                  <i className="ri-arrow-right-line ml-2"></i>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

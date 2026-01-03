import { useState } from 'react';

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const faqs = [
    {
      question: 'How quickly can I get started with 247 AI 360?',
      answer: 'You can be up and running in less than 15 minutes. Simply sign up, configure your AI assistant with our intuitive dashboard, connect your existing systems, and go live. No technical expertise required.'
    },
    {
      question: 'Does the AI sound natural and human-like?',
      answer: 'Yes! Our AI uses advanced natural language processing and text-to-speech technology to create conversations that sound remarkably human. You can even customize the voice, tone, and personality to match your brand.'
    },
    {
      question: 'Can the AI handle multiple conversations simultaneously?',
      answer: 'Absolutely. Unlike human staff, our AI can handle unlimited conversations at the same time. Whether you have 1 customer or 10,000 customers calling simultaneously, every conversation gets instant attention.'
    },
    {
      question: 'What happens if the AI doesn\'t understand a question?',
      answer: 'Our AI is trained to handle complex queries, but if it encounters something it can\'t answer, it will gracefully transfer the conversation to a human team member or collect information for follow-up. You maintain full control.'
    },
    {
      question: 'Is my customer data secure and private?',
      answer: 'Security is our top priority. We\'re SOC 2 certified and HIPAA compliant. All data is encrypted in transit and at rest. We never share or sell customer data, and you maintain full ownership of all conversation records.'
    },
    {
      question: 'Can I integrate with my existing CRM and tools?',
      answer: 'Yes! We integrate seamlessly with popular CRMs (Salesforce, HubSpot, Zoho), calendars (Google Calendar, Outlook), communication tools (Twilio, Slack), and more. Custom integrations are available for Enterprise plans.'
    },
    {
      question: 'What languages does the AI support?',
      answer: 'Our AI supports 50+ languages including English, Spanish, French, German, Chinese, Japanese, and many more. It can automatically detect the customer\'s language and respond accordingly.'
    },
    {
      question: 'Can I cancel anytime?',
      answer: 'Yes, you can cancel your subscription at any time with no penalties or fees. We also offer a 30-day money-back guarantee if you\'re not completely satisfied with our service.'
    }
  ];

  return (
    <section className="py-32 bg-gradient-to-br from-gray-50 to-teal-50 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute top-20 right-10 w-96 h-96 bg-cyan-400/10 rounded-full blur-3xl"></div>
      <div className="absolute bottom-20 left-10 w-96 h-96 bg-teal-400/10 rounded-full blur-3xl"></div>

      <div className="relative z-10 max-w-4xl mx-auto px-6">
        <div className="text-center mb-20">
          <div className="inline-block px-4 py-2 bg-white rounded-full shadow-lg mb-6">
            <span className="text-sm font-semibold bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent">
              FAQ
            </span>
          </div>
          <h2 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Frequently Asked
            <span className="bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent"> Questions</span>
          </h2>
          <p className="text-xl text-gray-600">
            Everything you need to know about 247 AI 360
          </p>
        </div>

        <div className="space-y-4">
          {faqs.map((faq, index) => (
            <div 
              key={index}
              className="bg-white rounded-2xl border-2 border-gray-100 hover:border-teal-500 transition-all duration-300 overflow-hidden"
            >
              <button
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                className="w-full px-8 py-6 flex items-center justify-between text-left cursor-pointer"
              >
                <span className="text-lg font-bold text-gray-900 pr-8">{faq.question}</span>
                <div className={`w-8 h-8 rounded-full bg-gradient-to-r from-teal-500 to-cyan-600 flex items-center justify-center flex-shrink-0 transform transition-transform duration-300 ${
                  openIndex === index ? 'rotate-180' : ''
                }`}>
                  <i className="ri-arrow-down-s-line text-white text-xl"></i>
                </div>
              </button>
              
              <div className={`overflow-hidden transition-all duration-300 ${
                openIndex === index ? 'max-h-96' : 'max-h-0'
              }`}>
                <div className="px-8 pb-6">
                  <p className="text-gray-600 leading-relaxed">{faq.answer}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Still Have Questions CTA */}
        <div className="text-center mt-16">
          <p className="text-gray-600 mb-6">Still have questions?</p>
          <button 
            onClick={() => document.querySelector('#vapi-widget-floating-button')?.click()}
            className="px-8 py-4 bg-gradient-to-r from-teal-500 to-cyan-600 text-white text-lg font-semibold rounded-full hover:shadow-2xl hover:shadow-teal-500/50 transform hover:scale-105 transition-all duration-300 whitespace-nowrap cursor-pointer"
          >
            Chat with Our AI Assistant
          </button>
        </div>
      </div>
    </section>
  );
}

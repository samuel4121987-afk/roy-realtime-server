import Navigation from './components/Navigation';
import BusinessTypeSelector from './components/BusinessTypeSelector';
import BusinessIntroduction from './components/BusinessIntroduction';
import CustomPromptSetup from './components/CustomPromptSetup';
import CalendarIntegration from './components/CalendarIntegration';
import CRMIntegration from './components/CRMIntegration';
import ContactForm from './components/ContactForm';
import PricingTiers from './components/PricingTiers';
import WebhookConfiguration from './components/WebhookConfiguration';

export default function Integration() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900">
      <Navigation />
      
      <div className="pt-24 pb-16 px-4">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-16">
            <h1 className="text-5xl font-bold text-white mb-4">
              Integration Settings
            </h1>
            <p className="text-xl text-gray-300">
              Configure your AI assistant and connect your tools
            </p>
          </div>

          {/* Webhook Configuration - FIRST AND MOST IMPORTANT */}
          <div className="mb-16">
            <WebhookConfiguration />
          </div>

          {/* Business Type */}
          <div className="mb-16">
            <BusinessTypeSelector />
          </div>

          {/* Business Introduction */}
          <div className="mb-16">
            <BusinessIntroduction />
          </div>

          {/* Custom Prompt */}
          <div className="mb-16">
            <CustomPromptSetup />
          </div>

          {/* Calendar Integration */}
          <div className="mb-16">
            <CalendarIntegration />
          </div>

          {/* CRM Integration */}
          <div className="mb-16">
            <CRMIntegration />
          </div>

          {/* Contact Form */}
          <div className="mb-16">
            <ContactForm />
          </div>

          {/* Pricing */}
          <div className="mb-16">
            <PricingTiers />
          </div>
        </div>
      </div>
    </div>
  );
}


import { useState } from 'react';
import Navigation from '../home/components/Navigation';
import Footer from '../home/components/Footer';
import WebhookConfiguration from '../integration/components/WebhookConfiguration';
import BusinessTypeSelector from '../integration/components/BusinessTypeSelector';
import BusinessIntroduction from '../integration/components/BusinessIntroduction';
import CustomPromptSetup from '../integration/components/CustomPromptSetup';

export default function AdminSetup() {
  const [activeSection, setActiveSection] = useState('webhook');

  const sections = [
    { id: 'webhook', name: 'Webhook Setup', icon: 'ri-link' },
    { id: 'business', name: 'Business Type', icon: 'ri-building-line' },
    { id: 'introduction', name: 'Business Info', icon: 'ri-information-line' },
    { id: 'prompt', name: 'AI Personality', icon: 'ri-robot-line' },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Navigation />
      
      <div className="pt-24 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-r from-teal-500 to-cyan-600 rounded-2xl mb-4">
              <i className="ri-settings-3-line text-white text-2xl"></i>
            </div>
            <h1 className="text-4xl font-bold text-gray-900 mb-4">
              Admin Setup
            </h1>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Configure your AI phone assistant system
            </p>
          </div>

          {/* Navigation Tabs */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 mb-8 overflow-hidden">
            <div className="flex overflow-x-auto">
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`flex-1 min-w-max px-6 py-4 font-medium transition-all whitespace-nowrap cursor-pointer ${
                    activeSection === section.id
                      ? 'bg-gradient-to-r from-teal-500 to-cyan-600 text-white'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <i className={`${section.icon} mr-2`}></i>
                  {section.name}
                </button>
              ))}
            </div>
          </div>

          {/* Content Sections */}
          <div className="space-y-8">
            {activeSection === 'webhook' && (
              <div className="animate-fadeIn">
                <WebhookConfiguration />
              </div>
            )}

            {activeSection === 'business' && (
              <div className="animate-fadeIn">
                <BusinessTypeSelector />
              </div>
            )}

            {activeSection === 'introduction' && (
              <div className="animate-fadeIn">
                <BusinessIntroduction />
              </div>
            )}

            {activeSection === 'prompt' && (
              <div className="animate-fadeIn">
                <CustomPromptSetup />
              </div>
            )}
          </div>

          {/* Quick Links */}
          <div className="mt-12 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-8 border border-blue-200">
            <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center">
              <i className="ri-links-line mr-2 text-blue-600"></i>
              Quick Links
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <a
                href="/backoffice"
                className="flex items-center p-4 bg-white rounded-lg border border-gray-200 hover:border-blue-500 hover:shadow-md transition-all cursor-pointer"
              >
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                  <i className="ri-dashboard-line text-blue-600"></i>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Backoffice</p>
                  <p className="text-sm text-gray-600">Manage leads &amp; calls</p>
                </div>
              </a>

              <a
                href="/get-started"
                className="flex items-center p-4 bg-white rounded-lg border border-gray-200 hover:border-green-500 hover:shadow-md transition-all cursor-pointer"
              >
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mr-3">
                  <i className="ri-user-add-line text-green-600"></i>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Client Signup</p>
                  <p className="text-sm text-gray-600">View client page</p>
                </div>
              </a>

              <a
                href="https://railway.app"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center p-4 bg-white rounded-lg border border-gray-200 hover:border-purple-500 hover:shadow-md transition-all cursor-pointer"
              >
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
                  <i className="ri-train-line text-purple-600"></i>
                </div>
                <div>
                  <p className="font-medium text-gray-900">Railway</p>
                  <p className="text-sm text-gray-600">Manage deployment</p>
                </div>
              </a>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}

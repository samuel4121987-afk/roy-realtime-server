
import { useState } from 'react';

export default function CustomPromptSetup() {
  const [selectedTemplate, setSelectedTemplate] = useState('professional');
  const [customPrompt, setCustomPrompt] = useState('');

  const templates = [
    {
      id: 'professional',
      name: 'Professional Assistant',
      icon: 'ri-briefcase-line',
      description: 'Formal, detailed responses for business environments',
      prompt: 'You are a professional AI assistant. Provide clear, concise, and helpful responses while maintaining a formal tone.'
    },
    {
      id: 'friendly',
      name: 'Friendly Helper',
      icon: 'ri-emotion-happy-line',
      description: 'Warm, conversational tone for customer service',
      prompt: 'You are a friendly and approachable AI assistant. Use a warm, conversational tone while being helpful and understanding.'
    },
    {
      id: 'technical',
      name: 'Technical Expert',
      icon: 'ri-code-s-slash-line',
      description: 'Detailed technical explanations and solutions',
      prompt: 'You are a technical expert AI assistant. Provide detailed, accurate technical information and solutions.'
    },
    {
      id: 'sales',
      name: 'Sales Consultant',
      icon: 'ri-line-chart-line',
      description: 'Persuasive, benefit-focused communication',
      prompt: 'You are a sales-focused AI assistant. Highlight benefits, address concerns, and guide users toward solutions.'
    }
  ];

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setCustomPrompt(template.prompt);
    }
  };

  return (
    <div className="bg-gray-800/30 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-8">
      <div className="flex items-center mb-6">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-600 rounded-full mr-4">
          <i className="ri-robot-line text-xl text-white"></i>
        </div>
        <div>
          <h3 className="text-2xl font-bold text-white font-orbitron">AI Assistant Setup</h3>
          <p className="text-gray-400">Configure your AI's personality</p>
        </div>
      </div>

      {/* AI Personality Templates */}
      <div className="mb-8">
        <h4 className="text-lg font-semibold text-white mb-4">Choose AI Personality Template</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((template) => (
            <button
              key={template.id}
              onClick={() => handleTemplateSelect(template.id)}
              className={`p-6 rounded-xl border-2 transition-all text-left ${
                selectedTemplate === template.id
                  ? 'border-purple-500 bg-purple-500/10'
                  : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
              }`}
            >
              <div className="flex items-start mb-3">
                <i className={`${template.icon} text-2xl text-purple-400 mr-3`}></i>
                <div>
                  <h5 className="text-white font-semibold mb-1">{template.name}</h5>
                  <p className="text-sm text-gray-400">{template.description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Custom Prompt Editor */}
      <div>
        <h4 className="text-lg font-semibold text-white mb-4">Custom System Prompt</h4>
        <p className="text-sm text-gray-400 mb-4">
          Customize how your AI assistant behaves and responds to users
        </p>
        <textarea
          value={customPrompt}
          onChange={(e) => setCustomPrompt(e.target.value)}
          placeholder="Enter your custom system prompt here..."
          className="w-full h-40 px-4 py-3 bg-gray-900/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors resize-none"
        />
        <div className="flex justify-between items-center mt-4">
          <p className="text-sm text-gray-500">
            {customPrompt.length} characters
          </p>
          <button className="px-6 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg hover:from-purple-600 hover:to-pink-700 transition-all whitespace-nowrap">
            <i className="ri-save-line mr-2"></i>
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
}

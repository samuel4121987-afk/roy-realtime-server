import { useState } from 'react';

export default function BusinessConfiguration() {
  const [businessType, setBusinessType] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessDescription, setBusinessDescription] = useState('');
  const [services, setServices] = useState('');
  const [hours, setHours] = useState('');
  const [location, setLocation] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    // Save to localStorage or Supabase
    const config = {
      businessType,
      businessName,
      businessDescription,
      services,
      hours,
      location,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem('businessConfig', JSON.stringify(config));
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Business Configuration</h2>
          <p className="text-gray-600 mt-1">Configure your business information for the AI assistant</p>
        </div>
        <button
          onClick={handleSave}
          className="px-6 py-2.5 bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-lg hover:from-teal-600 hover:to-cyan-700 transition-all shadow-lg whitespace-nowrap flex items-center gap-2"
        >
          <i className="ri-save-line"></i>
          Save Configuration
        </button>
      </div>

      {saved && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
          <i className="ri-check-circle-fill text-green-600 text-xl"></i>
          <p className="text-green-800 font-medium">Configuration saved successfully!</p>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8 space-y-6">
        {/* Business Type */}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Business Type
          </label>
          <select
            value={businessType}
            onChange={(e) => setBusinessType(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
          >
            <option value="">Select your business type</option>
            <option value="medical">Medical Practice</option>
            <option value="dental">Dental Office</option>
            <option value="legal">Law Firm</option>
            <option value="salon">Salon/Spa</option>
            <option value="restaurant">Restaurant</option>
            <option value="retail">Retail Store</option>
            <option value="realestate">Real Estate</option>
            <option value="automotive">Automotive Service</option>
            <option value="fitness">Fitness Center</option>
            <option value="consulting">Consulting</option>
            <option value="other">Other</option>
          </select>
        </div>

        {/* Business Name */}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Business Name
          </label>
          <input
            type="text"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="Enter your business name"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
          />
        </div>

        {/* Business Description */}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Business Description
          </label>
          <textarea
            value={businessDescription}
            onChange={(e) => setBusinessDescription(e.target.value)}
            placeholder="Describe what your business does..."
            rows={4}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm resize-none"
          />
        </div>

        {/* Services Offered */}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Services Offered
          </label>
          <textarea
            value={services}
            onChange={(e) => setServices(e.target.value)}
            placeholder="List your main services (one per line)"
            rows={4}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm resize-none"
          />
        </div>

        {/* Business Hours */}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Business Hours
          </label>
          <textarea
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            placeholder="Monday-Friday: 9:00 AM - 5:00 PM&#10;Saturday: 10:00 AM - 2:00 PM&#10;Sunday: Closed"
            rows={3}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm resize-none"
          />
        </div>

        {/* Location */}
        <div>
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Business Location
          </label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="123 Main St, City, State, ZIP"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent text-sm"
          />
        </div>
      </div>

      {/* Preview Section */}
      <div className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-xl border border-teal-200 p-8">
        <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
          <i className="ri-eye-line text-teal-600"></i>
          Configuration Preview
        </h3>
        <div className="space-y-3 text-sm">
          <div className="flex gap-2">
            <span className="font-semibold text-gray-700 min-w-32">Business Type:</span>
            <span className="text-gray-600">{businessType || 'Not set'}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-semibold text-gray-700 min-w-32">Business Name:</span>
            <span className="text-gray-600">{businessName || 'Not set'}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-semibold text-gray-700 min-w-32">Description:</span>
            <span className="text-gray-600">{businessDescription || 'Not set'}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-semibold text-gray-700 min-w-32">Services:</span>
            <span className="text-gray-600">{services || 'Not set'}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-semibold text-gray-700 min-w-32">Hours:</span>
            <span className="text-gray-600 whitespace-pre-line">{hours || 'Not set'}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-semibold text-gray-700 min-w-32">Location:</span>
            <span className="text-gray-600">{location || 'Not set'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

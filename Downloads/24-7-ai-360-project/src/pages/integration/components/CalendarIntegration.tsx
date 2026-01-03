interface CalendarIntegrationProps {
  selectedCalendar: string;
  onCalendarSelect: (calendar: string) => void;
}

export default function CalendarIntegration({ selectedCalendar, onCalendarSelect }: CalendarIntegrationProps) {
  const calendarOptions = [
    {
      id: 'google',
      name: 'Google Calendar',
      icon: 'ri-google-fill',
      description: 'Sync with Google Workspace and Gmail',
      features: ['Real-time sync', 'Multiple calendars', 'Smart scheduling', 'Conflict detection'],
      color: 'from-red-500 to-orange-500'
    },
    {
      id: 'outlook',
      name: 'Microsoft Outlook',
      icon: 'ri-microsoft-fill',
      description: 'Integrate with Office 365 and Exchange',
      features: ['Exchange sync', 'Teams integration', 'Shared calendars', 'Enterprise security'],
      color: 'from-blue-500 to-indigo-500'
    },
    {
      id: 'apple',
      name: 'Apple Calendar',
      icon: 'ri-apple-fill',
      description: 'Connect with iCloud and macOS',
      features: ['iCloud sync', 'Cross-device', 'Privacy focused', 'Native integration'],
      color: 'from-gray-600 to-gray-800'
    }
  ];

  return (
    <div className="bg-gray-800/30 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-8">
      <div className="flex items-center mb-6">
        <div className="inline-flex items-center justify-center w-12 h-12 bg-gradient-to-r from-green-500 to-emerald-600 rounded-full mr-4">
          <i className="ri-calendar-line text-xl text-white"></i>
        </div>
        <div>
          <h3 className="text-2xl font-bold text-white font-orbitron">Calendar Integration</h3>
          <p className="text-gray-400">Connect your calendar for seamless appointment scheduling</p>
        </div>
      </div>

      <div className="space-y-4">
        {calendarOptions.map((option) => (
          <div
            key={option.id}
            onClick={() => onCalendarSelect(option.id)}
            className={`relative p-4 border rounded-xl cursor-pointer transition-all duration-300 ${
              selectedCalendar === option.id
                ? 'border-cyan-500 bg-cyan-500/10'
                : 'border-gray-600 hover:border-gray-500 bg-gray-700/30'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start">
                <div className={`inline-flex items-center justify-center w-10 h-10 bg-gradient-to-r ${option.color} rounded-lg mr-4 mt-1`}>
                  <i className={`${option.icon} text-lg text-white`}></i>
                </div>
                <div className="flex-1">
                  <h4 className="text-lg font-semibold text-white mb-1">{option.name}</h4>
                  <p className="text-gray-400 text-sm mb-3">{option.description}</p>
                  <div className="flex flex-wrap gap-2">
                    {option.features.map((feature, index) => (
                      <span key={index} className="px-2 py-1 bg-gray-600/50 text-gray-300 text-xs rounded-full">
                        {feature}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              
              {selectedCalendar === option.id && (
                <div className="w-5 h-5 bg-cyan-500 rounded-full flex items-center justify-center">
                  <i className="ri-check-line text-white text-xs"></i>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {selectedCalendar && (
        <div className="mt-6 p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
          <div className="flex items-center text-cyan-400 mb-2">
            <i className="ri-information-line mr-2"></i>
            <span className="font-medium">Integration Setup</span>
          </div>
          <p className="text-gray-300 text-sm">
            After deployment, you'll receive setup instructions to connect your {calendarOptions.find(o => o.id === selectedCalendar)?.name} account securely.
          </p>
        </div>
      )}
    </div>
  );
}
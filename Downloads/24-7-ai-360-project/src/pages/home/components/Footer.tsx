export default function Footer() {
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <footer className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          {/* Company Info */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                <i className="ri-phone-line text-white text-2xl"></i>
              </div>
              <div>
                <h3 className="text-xl font-bold">24/7 AI 360</h3>
                <p className="text-sm text-white/80">Never Miss a Call</p>
              </div>
            </div>
            <p className="text-white/80 text-sm">
              Your AI-powered receptionist that works around the clock to capture every opportunity.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-bold text-lg mb-4">Quick Links</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <button
                  onClick={() => scrollToSection('how-it-works')}
                  className="text-white/80 hover:text-white transition-colors cursor-pointer"
                >
                  How It Works
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection('benefits')}
                  className="text-white/80 hover:text-white transition-colors cursor-pointer"
                >
                  Benefits
                </button>
              </li>
              <li>
                <button
                  onClick={() => scrollToSection('use-cases')}
                  className="text-white/80 hover:text-white transition-colors cursor-pointer"
                >
                  Use Cases
                </button>
              </li>
              <li>
                <a
                  href="/pricing"
                  className="text-white/80 hover:text-white transition-colors cursor-pointer"
                >
                  Pricing
                </a>
              </li>
            </ul>
          </div>

          {/* Services */}
          <div>
            <h4 className="font-bold text-lg mb-4">Services</h4>
            <ul className="space-y-2 text-sm text-white/80">
              <li>24/7 Call Answering</li>
              <li>Appointment Scheduling</li>
              <li>Lead Capture</li>
              <li>CRM Integration</li>
              <li>Call Analytics</li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-bold text-lg mb-4">Contact Us</h4>
            <ul className="space-y-3 text-sm">
              <li className="flex items-center gap-2">
                <i className="ri-mail-line text-white/80"></i>
                <span className="text-white/80">support@24-7ai360.com</span>
              </li>
              <li className="flex items-center gap-2">
                <i className="ri-phone-line text-white/80"></i>
                <span className="text-white/80">1-800-AI-CALLS</span>
              </li>
              <li className="flex items-center gap-2">
                <i className="ri-time-line text-white/80"></i>
                <span className="text-white/80">24/7 Support Available</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="border-t border-white/20 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-white/80">
            © 2024 24/7 AI 360. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <a href="https://readdy.ai/?ref=logo" target="_blank" rel="noopener noreferrer" className="text-sm text-white/80 hover:text-white transition-colors cursor-pointer">
              Powered by Readdy
            </a>
            <a href="#" className="text-sm text-white/80 hover:text-white transition-colors cursor-pointer">
              Privacy Policy
            </a>
            <a href="#" className="text-sm text-white/80 hover:text-white transition-colors cursor-pointer">
              Terms of Service
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

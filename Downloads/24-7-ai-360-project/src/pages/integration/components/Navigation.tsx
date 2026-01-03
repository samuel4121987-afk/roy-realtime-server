
import { useState } from 'react';

export default function Navigation() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <div className="flex items-center">
            <a href="/" className="flex items-center space-x-3 cursor-pointer">
              <div className="w-10 h-10 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center">
                <i className="ri-robot-2-line text-xl text-white"></i>
              </div>
              <span className="text-xl font-bold text-white font-orbitron">247 AI 360</span>
            </a>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            <a href="/" className="text-gray-300 hover:text-white transition-colors cursor-pointer">
              Home
            </a>
            <a href="/integration" className="text-cyan-400 font-medium cursor-pointer">
              AI Setup
            </a>
            <a href="/" className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:from-cyan-600 hover:to-blue-700 transition-all cursor-pointer whitespace-nowrap">
              Get Started
            </a>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="text-gray-300 hover:text-white transition-colors cursor-pointer"
            >
              <i className={`text-2xl ${isMenuOpen ? 'ri-close-line' : 'ri-menu-line'}`}></i>
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden py-4 border-t border-gray-800">
            <div className="flex flex-col space-y-4">
              <a href="/" className="text-gray-300 hover:text-white transition-colors cursor-pointer">
                Home
              </a>
              <a href="/integration" className="text-cyan-400 font-medium cursor-pointer">
                AI Setup
              </a>
              <a href="/" className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:from-cyan-600 hover:to-blue-700 transition-all cursor-pointer whitespace-nowrap w-fit">
                Get Started
              </a>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

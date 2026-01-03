import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function Navigation() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav className={`fixed w-full z-50 transition-all duration-300 ${
      isScrolled ? 'bg-white shadow-lg' : 'bg-transparent'
    }`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          <Link to="/" className="flex items-center space-x-3 cursor-pointer">
            <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
              <i className="ri-phone-line text-white text-2xl"></i>
            </div>
            <span className={`text-2xl font-bold ${isScrolled ? 'text-gray-900' : 'text-gray-900'}`}>
              24/7 AI 360
            </span>
          </Link>
          
          <div className="hidden md:flex items-center space-x-8">
            <Link 
              to="/pricing"
              className={`font-medium transition-colors cursor-pointer ${
                isScrolled ? 'text-gray-700 hover:text-blue-600' : 'text-gray-700 hover:text-blue-600'
              }`}
            >
              Pricing
            </Link>
            <Link 
              to="/about"
              className={`font-medium transition-colors cursor-pointer ${
                isScrolled ? 'text-gray-700 hover:text-blue-600' : 'text-gray-700 hover:text-blue-600'
              }`}
            >
              About Us
            </Link>
            <Link 
              to="/get-started"
              className={`font-medium transition-colors cursor-pointer ${
                isScrolled ? 'text-gray-700 hover:text-blue-600' : 'text-gray-700 hover:text-blue-600'
              }`}
            >
              Get Started
            </Link>
            <Link 
              to="/login"
              className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white px-6 py-3 rounded-lg font-semibold hover:from-blue-600 hover:to-indigo-700 transition-all whitespace-nowrap cursor-pointer"
            >
              Login / Sign Up
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}

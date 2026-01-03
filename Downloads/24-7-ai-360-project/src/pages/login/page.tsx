import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navigation from '../home/components/Navigation';
import Footer from '../home/components/Footer';
import { createClient } from '@supabase/supabase-js';

export default function Login() {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // ✅ CREATE SUPABASE CLIENT ONCE
  const getSupabaseClient = () => {
    const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('YOUR_') || supabaseKey.includes('YOUR_')) {
      throw new Error('⚠️ System configuration error. Please contact support.');
    }

    return createClient(supabaseUrl, supabaseKey);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (!email || !password) {
      setError('Please fill in all required fields');
      setIsLoading(false);
      return;
    }

    if (!isLogin && !name) {
      setError('Please enter your name');
      setIsLoading(false);
      return;
    }

    try {
      const supabase = getSupabaseClient();

      if (isLogin) {
        console.log('🔵 Attempting sign in with:', email);
        
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        console.log('🔵 Sign in response:', { data, error: signInError });

        if (signInError) {
          if (signInError.message.includes('Invalid login credentials')) {
            setError('Invalid email or password. Please try again.');
          } else if (signInError.message.includes('Email not confirmed')) {
            setError('Please verify your email address first.');
          } else {
            setError(signInError.message);
          }
          setIsLoading(false);
          return;
        }
        
        if (data.user) {
          window.location.href = '/backoffice';
        }
      } else {
        console.log('🔵 Attempting sign up with:', email);
        
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: name,
              company: company,
            },
            emailRedirectTo: `${window.location.origin}/backoffice`,
          },
        });

        console.log('🔵 Sign up response:', { data, error: signUpError });

        if (signUpError) {
          console.error('❌ Sign up error:', signUpError);
          throw signUpError;
        }

        if (data.user) {
          console.log('✅ Sign up successful');
          setError('');
          
          if (data.user.identities && data.user.identities.length === 0) {
            setError('Account created successfully! You can now sign in.');
            setIsLogin(true);
          } else {
            setError('Account created! Please check your email to verify your account before signing in.');
            setIsLogin(true);
          }
        }
      }
    } catch (err: any) {
      console.error('❌ Full error:', err);
      setError(err.message || 'Authentication failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSocialLogin = async (provider: 'google' | 'azure' | 'apple') => {
    setIsLoading(true);
    setError('');
    
    try {
      console.log('🔵 Starting OAuth with provider:', provider);
      
      const supabase = getSupabaseClient();
      
      // ✅ FIXED: Use the correct redirect URL format
      const redirectUrl = `${window.location.origin}/backoffice`;
      
      console.log('🔵 Redirect URL:', redirectUrl);
      
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: provider,
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: false,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
        },
      });

      console.log('🔵 OAuth Response:', data);

      if (oauthError) {
        console.error('❌ OAuth Error:', oauthError);
        
        // ✅ BETTER ERROR MESSAGES
        if (oauthError.message?.includes('403') || oauthError.message?.includes('access')) {
          setError(`Google Sign-In is not fully configured yet. Please use email/password login or contact support. Error: ${oauthError.message}`);
        } else {
          setError(`Social login failed: ${oauthError.message}`);
        }
        
        setIsLoading(false);
        return;
      }
      
      // ✅ If we get here, OAuth should redirect automatically
      
    } catch (err: any) {
      console.error('❌ Full Error:', err);
      
      let errorMessage = 'Social login failed. ';
      
      if (err.message?.includes('403')) {
        errorMessage = '⚠️ Google Sign-In requires additional setup in Supabase. Please use email/password login for now, or contact support to enable Google OAuth.';
      } else if (err.message?.includes('redirect_uri')) {
        errorMessage = 'OAuth configuration error. Please contact support.';
      } else {
        errorMessage += err.message || 'Please try again.';
      }
      
      setError(errorMessage);
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Navigation />
      
      <div className="pt-24 pb-16 px-4">
        <div className="max-w-md mx-auto">
          {/* Card */}
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-teal-500 to-cyan-600 px-8 py-10 text-center">
              <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-4">
                <i className="ri-user-line text-white text-3xl"></i>
              </div>
              <h1 className="text-3xl font-bold text-white mb-2">
                {isLogin ? 'Welcome Back' : 'Create Account'}
              </h1>
              <p className="text-teal-50">
                {isLogin ? 'Sign in to access your dashboard' : 'Join us and start automating'}
              </p>
            </div>

            {/* Form */}
            <div className="px-8 py-8">
              {error && (
                <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start">
                  <i className="ri-error-warning-line text-red-500 mr-2 mt-0.5"></i>
                  <p className="text-red-700 text-sm">{error}</p>
                </div>
              )}

              {/* Social Login First */}
              <div className="space-y-3 mb-8">
                <button
                  onClick={() => handleSocialLogin('google')}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center px-4 py-3.5 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap shadow-sm"
                >
                  <i className="ri-google-fill text-red-500 text-xl mr-3"></i>
                  <span className="font-semibold text-gray-700">Continue with Google</span>
                </button>

                <button
                  onClick={() => handleSocialLogin('azure')}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center px-4 py-3.5 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 hover:border-gray-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap shadow-sm"
                >
                  <i className="ri-microsoft-fill text-blue-500 text-xl mr-3"></i>
                  <span className="font-semibold text-gray-700">Continue with Microsoft</span>
                </button>

                <button
                  onClick={() => handleSocialLogin('apple')}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center px-4 py-3.5 bg-black border-2 border-black rounded-lg hover:bg-gray-900 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap shadow-sm"
                >
                  <i className="ri-apple-fill text-white text-xl mr-3"></i>
                  <span className="font-semibold text-white">Continue with Apple</span>
                </button>
              </div>

              {/* Divider */}
              <div className="relative my-8">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-white text-gray-500">Or use email</span>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {!isLogin && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Full Name *
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="John Doe"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                        required={!isLogin}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Company Name
                      </label>
                      <input
                        type="text"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        placeholder="Your Company"
                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Password *
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-all pr-12"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 cursor-pointer"
                    >
                      <i className={showPassword ? 'ri-eye-off-line' : 'ri-eye-line'}></i>
                    </button>
                  </div>
                </div>

                {isLogin && (
                  <div className="flex items-center justify-between text-sm">
                    <label className="flex items-center cursor-pointer">
                      <input type="checkbox" className="mr-2 cursor-pointer" />
                      <span className="text-gray-600">Remember me</span>
                    </label>
                    <button
                      type="button"
                      className="text-teal-600 hover:text-teal-700 font-medium cursor-pointer whitespace-nowrap"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-teal-500 to-cyan-600 text-white px-6 py-4 rounded-lg font-semibold hover:from-teal-600 hover:to-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl whitespace-nowrap cursor-pointer"
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                      Processing...
                    </span>
                  ) : (
                    <span>{isLogin ? 'Sign In' : 'Create Account'}</span>
                  )}
                </button>
              </form>

              {/* Toggle */}
              <div className="mt-8 text-center">
                <p className="text-gray-600">
                  {isLogin ? "Don't have an account?" : 'Already have an account?'}
                  <button
                    onClick={() => {
                      setIsLogin(!isLogin);
                      setError('');
                    }}
                    className="ml-2 text-teal-600 hover:text-teal-700 font-semibold cursor-pointer whitespace-nowrap"
                  >
                    {isLogin ? 'Sign Up' : 'Sign In'}
                  </button>
                </p>
              </div>
            </div>
          </div>

          {/* Trust Indicators */}
          <div className="mt-8 text-center">
            <div className="flex items-center justify-center gap-6 text-sm text-gray-600">
              <div className="flex items-center">
                <i className="ri-shield-check-line text-green-500 mr-1"></i>
                <span>Secure Login</span>
              </div>
              <div className="flex items-center">
                <i className="ri-lock-line text-green-500 mr-1"></i>
                <span>Encrypted</span>
              </div>
              <div className="flex items-center">
                <i className="ri-customer-service-line text-green-500 mr-1"></i>
                <span>24/7 Support</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}

export default function TestimonialsSection() {
  const testimonials = [
    {
      name: 'Sarah Johnson',
      role: 'CEO, HealthCare Plus',
      company: 'Healthcare',
      image: 'https://readdy.ai/api/search-image?query=professional%20business%20woman%20ceo%20in%20modern%20office%2C%20confident%20smile%2C%20business%20attire%2C%20natural%20lighting%2C%20corporate%20headshot%20portrait&width=200&height=200&seq=testimonial-001&orientation=squarish',
      quote: 'Our appointment no-shows dropped by 60% and patient satisfaction scores increased dramatically. The AI handles everything seamlessly.',
      rating: 5,
      gradient: 'from-teal-500 to-cyan-600'
    },
    {
      name: 'Michael Chen',
      role: 'Founder, TechStore Online',
      company: 'E-commerce',
      image: 'https://readdy.ai/api/search-image?query=professional%20asian%20businessman%20entrepreneur%20in%20modern%20startup%20office%2C%20friendly%20smile%2C%20casual%20business%20attire%2C%20natural%20lighting%2C%20corporate%20headshot%20portrait&width=200&height=200&seq=testimonial-002&orientation=squarish',
      quote: 'We cut customer service costs by 75% while improving response times. Our customers love the instant support, even at 3 AM.',
      rating: 5,
      gradient: 'from-cyan-500 to-blue-600'
    },
    {
      name: 'Emily Rodriguez',
      role: 'Owner, Bella Vista Restaurant',
      company: 'Hospitality',
      image: 'https://readdy.ai/api/search-image?query=professional%20latina%20businesswoman%20restaurant%20owner%20in%20elegant%20setting%2C%20warm%20smile%2C%20professional%20attire%2C%20natural%20lighting%2C%20corporate%20headshot%20portrait&width=200&height=200&seq=testimonial-003&orientation=squarish',
      quote: 'No more missed calls during dinner rush! The AI takes reservations perfectly and our staff can focus on serving guests.',
      rating: 5,
      gradient: 'from-blue-500 to-purple-600'
    },
    {
      name: 'David Thompson',
      role: 'Managing Partner, Thompson Law',
      company: 'Legal Services',
      image: 'https://readdy.ai/api/search-image?query=professional%20male%20lawyer%20attorney%20in%20law%20office%2C%20confident%20expression%2C%20business%20suit%2C%20natural%20lighting%2C%20corporate%20headshot%20portrait&width=200&height=200&seq=testimonial-004&orientation=squarish',
      quote: 'Client intake is now effortless. The AI qualifies leads and schedules consultations while we focus on casework. Game changer.',
      rating: 5,
      gradient: 'from-purple-500 to-pink-600'
    },
    {
      name: 'Jennifer Lee',
      role: 'Director, Premier Realty',
      company: 'Real Estate',
      image: 'https://readdy.ai/api/search-image?query=professional%20businesswoman%20real%20estate%20agent%20in%20modern%20office%2C%20friendly%20smile%2C%20professional%20attire%2C%20natural%20lighting%2C%20corporate%20headshot%20portrait&width=200&height=200&seq=testimonial-005&orientation=squarish',
      quote: 'We never miss a lead anymore. The AI qualifies prospects and books showings instantly. Our conversion rate doubled.',
      rating: 5,
      gradient: 'from-pink-500 to-rose-600'
    },
    {
      name: 'Robert Martinez',
      role: 'Service Manager, AutoCare Pro',
      company: 'Automotive',
      image: 'https://readdy.ai/api/search-image?query=professional%20male%20automotive%20service%20manager%20in%20clean%20workshop%2C%20confident%20smile%2C%20work%20uniform%2C%20natural%20lighting%2C%20corporate%20headshot%20portrait&width=200&height=200&seq=testimonial-006&orientation=squarish',
      quote: 'Our service bays are always full now. The AI books appointments 24/7 and answers customer questions perfectly.',
      rating: 5,
      gradient: 'from-rose-500 to-orange-600'
    }
  ];

  return (
    <section className="py-32 bg-gradient-to-br from-gray-50 to-cyan-50 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute top-20 left-10 w-96 h-96 bg-teal-400/10 rounded-full blur-3xl"></div>
      <div className="absolute bottom-20 right-10 w-96 h-96 bg-cyan-400/10 rounded-full blur-3xl"></div>

      <div className="relative z-10 max-w-7xl mx-auto px-6">
        <div className="text-center mb-20">
          <div className="inline-block px-4 py-2 bg-white rounded-full shadow-lg mb-6">
            <span className="text-sm font-semibold bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent">
              TESTIMONIALS
            </span>
          </div>
          <h2 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Loved by
            <span className="bg-gradient-to-r from-teal-600 to-cyan-600 bg-clip-text text-transparent"> 10,000+ Businesses</span>
          </h2>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto">
            See how businesses like yours are transforming customer service with AI.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {testimonials.map((testimonial, index) => (
            <div 
              key={index}
              className="bg-white rounded-3xl p-8 border-2 border-gray-100 hover:border-transparent hover:shadow-2xl transform hover:scale-105 transition-all duration-300 relative overflow-hidden"
            >
              {/* Gradient Overlay */}
              <div className={`absolute inset-0 bg-gradient-to-br ${testimonial.gradient} opacity-0 hover:opacity-5 transition-opacity duration-300`}></div>

              {/* Content */}
              <div className="relative z-10">
                {/* Rating */}
                <div className="flex space-x-1 mb-6">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <i key={i} className={`ri-star-fill text-xl bg-gradient-to-r ${testimonial.gradient} bg-clip-text text-transparent`}></i>
                  ))}
                </div>

                {/* Quote */}
                <p className="text-gray-700 leading-relaxed mb-8 text-lg">
                  "{testimonial.quote}"
                </p>

                {/* Author */}
                <div className="flex items-center space-x-4">
                  <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-gray-200">
                    <img 
                      src={testimonial.image} 
                      alt={testimonial.name}
                      className="w-full h-full object-cover object-top"
                    />
                  </div>
                  <div>
                    <div className="font-bold text-gray-900">{testimonial.name}</div>
                    <div className="text-sm text-gray-600">{testimonial.role}</div>
                    <div className={`text-xs font-semibold bg-gradient-to-r ${testimonial.gradient} bg-clip-text text-transparent`}>
                      {testimonial.company}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Trust Badges */}
        <div className="mt-20 flex flex-wrap items-center justify-center gap-8">
          <div className="flex items-center space-x-2 px-6 py-3 bg-white rounded-full shadow-lg">
            <i className="ri-shield-check-line text-2xl text-teal-600"></i>
            <span className="text-sm font-semibold text-gray-700">SOC 2 Certified</span>
          </div>
          <div className="flex items-center space-x-2 px-6 py-3 bg-white rounded-full shadow-lg">
            <i className="ri-lock-line text-2xl text-cyan-600"></i>
            <span className="text-sm font-semibold text-gray-700">HIPAA Compliant</span>
          </div>
          <div className="flex items-center space-x-2 px-6 py-3 bg-white rounded-full shadow-lg">
            <i className="ri-star-fill text-2xl text-blue-600"></i>
            <span className="text-sm font-semibold text-gray-700">4.9/5 Rating</span>
          </div>
          <div className="flex items-center space-x-2 px-6 py-3 bg-white rounded-full shadow-lg">
            <i className="ri-customer-service-2-line text-2xl text-purple-600"></i>
            <span className="text-sm font-semibold text-gray-700">24/7 Support</span>
          </div>
        </div>
      </div>
    </section>
  );
}

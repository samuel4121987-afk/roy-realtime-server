
import HeroSection from './components/HeroSection';
import HowItWorksSection from './components/HowItWorksSection';
import BenefitsSection from './components/BenefitsSection';
import UseCasesSection from './components/UseCasesSection';
import ContactSection from './components/ContactSection';
import TestimonialsSection from './components/TestimonialsSection';
import FAQSection from './components/FAQSection';
import Navigation from './components/Navigation';
import Footer from './components/Footer';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      <main>
        <HeroSection />
        <HowItWorksSection />
        <BenefitsSection />
        <UseCasesSection />
        <TestimonialsSection />
        <FAQSection />
        <ContactSection />
      </main>
      <Footer />
    </div>
  );
}

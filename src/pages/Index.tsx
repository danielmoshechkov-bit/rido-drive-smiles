import Header from "@/components/Header";
import Hero from "@/components/Hero";
import WhyRido from "@/components/WhyRido";
import ProsteModele from "@/components/ProsteModele";
import Wymagania from "@/components/Wymagania";
import JakZaczac from "@/components/JakZaczac";
import KartyPaliwowe from "@/components/KartyPaliwowe";
import FAQ from "@/components/FAQ";
import Kontakt from "@/components/Kontakt";
import SEOSection from "@/components/SEOSection";
import Footer from "@/components/Footer";
import ChatWidget from "@/components/ChatWidget";

const Index = () => {
  return (
    <div className="min-h-screen">
      <Header />
      <main>
        <Hero />
        <WhyRido />
        <ProsteModele />
        <Wymagania />
        <JakZaczac />
        <KartyPaliwowe />
        <FAQ />
        <Kontakt />
        <SEOSection />
      </main>
      <Footer />
      <ChatWidget />
    </div>
  );
};

export default Index;
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import ProsteCenniki from "@/components/ProsteCenniki";
import WhyRido from "@/components/WhyRido";
import JakZaczac from "@/components/JakZaczac";
import Cennik from "@/components/Cennik";
import Wymagania from "@/components/Wymagania";
import KartyPaliwowe from "@/components/KartyPaliwowe";
import FAQ from "@/components/FAQ";
import Kontakt from "@/components/Kontakt";
import SEOSection from "@/components/SEOSection";
import Footer from "@/components/Footer";
import ChatWidget from "@/components/ChatWidget";
import CallButton from "@/components/CallButton";

const Index = () => {
  return (
    <div className="min-h-screen">
      <Header />
      <main>
        <Hero />
        <ProsteCenniki />
        <WhyRido />
        <JakZaczac />
        <Cennik />
        <Wymagania />
        <KartyPaliwowe />
        <FAQ />
        <Kontakt />
        <SEOSection />
      </main>
      <Footer />
      <ChatWidget />
      <CallButton />
    </div>
  );
};

export default Index;
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
const Hero = () => {
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth'
      });
    }
  };
  return <section id="home" className="relative overflow-hidden bg-gradient-subtle">
      {/* Background Animation */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-32 h-32 bg-primary/10 rounded-full animate-float-slow"></div>
        <div className="absolute top-3/4 right-1/4 w-24 h-24 bg-accent/10 rounded-full animate-float-medium"></div>
        <div className="absolute top-1/2 left-3/4 w-16 h-16 bg-primary/15 rounded-full animate-float-fast"></div>
        <div className="absolute top-1/6 right-1/3 w-20 h-20 bg-accent/15 rounded-full animate-float-slow"></div>
      </div>

      {/* Top Bar */}
      <div className="bg-primary text-primary-foreground py-3 text-center text-sm font-medium relative z-10">
        Dwa modele rozliczeń - wybierz najlepszy dla siebie
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-5xl mx-auto space-y-8 pt-8 py-0">
          {/* Title with Mascot */}
          <div className="space-y-4 text-left relative">
            <div className="absolute top-0 right-0 hidden md:block">
              <img src="/lovable-uploads/a27439d2-e539-4826-82f2-2c73646d08cc.png" alt="Get RIDO Mascot" className="h-16 w-16 animate-bounce-gentle" />
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground leading-tight">
              <span className="text-primary">Get RIDO</span> — partner kierowców 
              <span className="block">
                <span className="text-black">Uber</span>, <span className="text-[#34D186]">Bolt</span>, <span className="text-red-600">FreeNow</span>
              </span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl">Zarabiaj więcej, rozliczaj się prosto. Wypłaty co tydzień. Zero ukrytych kosztów. WYPŁATA GOTÓWKI W KAZDY WTOREK U NAS W BIURZ</p>
          </div>

          {/* Two pricing models - Full width side by side */}
          <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {/* Model drugi - 39 zł (Left) */}
            <Card className="relative p-8 bg-gradient-accent shadow-gold border-accent/20">
              <div className="absolute top-2 right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded">
                PROMOCJA
              </div>
              <div className="text-center space-y-4">
                <h3 className="text-xl font-bold text-accent-foreground">
                  MODEL DRUGI
                </h3>
                <div className="flex items-center justify-center gap-3">
                  <span className="text-3xl line-through text-accent-foreground/60 font-semibold">50 zł</span>
                  <span className="text-xl text-accent-foreground">→</span>
                  <span className="text-5xl font-bold text-accent-foreground">39 zł + 8% podatku</span>
                </div>
                <p className="text-sm text-accent-foreground/80">Za tygodniowe rozliczenie za jedną i więcej aplikacji 
Dla pierwszych 50 kierowców</p>
              </div>
            </Card>

            {/* Model pierwszy - 159 zł (Right) */}
            <Card className="relative p-8 bg-gradient-accent shadow-gold border-accent/20">
              <div className="absolute top-2 right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded">
                PROMOCJA
              </div>
              <div className="text-center space-y-4">
                <h3 className="text-xl font-bold text-accent-foreground">
                  MODEL PIERWSZY
                </h3>
                <div className="text-5xl font-bold text-accent-foreground">159 zł + 0% podatku</div>
                <p className="text-sm text-accent-foreground/80">Za tygodniowe rozliczenie za jedną i więcej aplikacji 
Warunek: aktywne korzystanie z karty paliwowej</p>
              </div>
            </Card>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button variant="accent" size="lg" onClick={() => scrollToSection('kontakt')} className="text-lg px-8">
              Dołącz teraz
            </Button>
            <Button variant="outline" size="lg" onClick={() => scrollToSection('jak-zaczac')} className="text-lg px-8">
              Jak zacząć
            </Button>
          </div>
        </div>
      </div>
    </section>;
};
export default Hero;
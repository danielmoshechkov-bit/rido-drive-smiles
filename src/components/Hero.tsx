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
      {/* Background Animation with Mascots */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {/* Row 1 - Top */}
        <img src="/lovable-uploads/98af44ce-0003-4b10-a988-d8dd9a60f459.png" alt="Get RIDO Mascot" className="absolute top-[5%] left-[10%] h-8 w-8 animate-float-slow opacity-10" />
        <img src="/lovable-uploads/98af44ce-0003-4b10-a988-d8dd9a60f459.png" alt="Get RIDO Mascot" className="absolute top-[8%] left-[25%] h-6 w-6 animate-float-medium opacity-8" />
        <img src="/lovable-uploads/98af44ce-0003-4b10-a988-d8dd9a60f459.png" alt="Get RIDO Mascot" className="absolute top-[12%] left-[40%] h-10 w-10 animate-float-fast opacity-12" />
        <img src="/lovable-uploads/98af44ce-0003-4b10-a988-d8dd9a60f459.png" alt="Get RIDO Mascot" className="absolute top-[6%] left-[55%] h-7 w-7 animate-float-slow opacity-9" />
        <img src="/lovable-uploads/98af44ce-0003-4b10-a988-d8dd9a60f459.png" alt="Get RIDO Mascot" className="absolute top-[10%] left-[70%] h-9 w-9 animate-float-medium opacity-11" />
        <img src="/lovable-uploads/98af44ce-0003-4b10-a988-d8dd9a60f459.png" alt="Get RIDO Mascot" className="absolute top-[4%] left-[85%] h-8 w-8 animate-float-fast opacity-10" />
        
        {/* Row 2 - Upper Middle */}
        <img src="/lovable-uploads/98af44ce-0003-4b10-a988-d8dd9a60f459.png" alt="Get RIDO Mascot" className="absolute top-[20%] left-[5%] h-6 w-6 animate-float-medium opacity-8" />
        <img src="/lovable-uploads/98af44ce-0003-4b10-a988-d8dd9a60f459.png" alt="Get RIDO Mascot" className="absolute top-[25%] left-[30%] h-12 w-12 animate-float-slow opacity-15" />
        <img src="/lovable-uploads/98af44ce-0003-4b10-a988-d8dd9a60f459.png" alt="Get RIDO Mascot" className="absolute top-[22%] left-[60%] h-7 w-7 animate-float-fast opacity-9" />
        <img src="/lovable-uploads/98af44ce-0003-4b10-a988-d8dd9a60f459.png" alt="Get RIDO Mascot" className="absolute top-[28%] left-[80%] h-10 w-10 animate-float-medium opacity-12" />
        
        {/* Row 3 - Middle */}
        <img src="/lovable-uploads/98af44ce-0003-4b10-a988-d8dd9a60f459.png" alt="Get RIDO Mascot" className="absolute top-[40%] left-[15%] h-9 w-9 animate-float-fast opacity-11" />
        <img src="/lovable-uploads/98af44ce-0003-4b10-a988-d8dd9a60f459.png" alt="Get RIDO Mascot" className="absolute top-[45%] left-[35%] h-8 w-8 animate-float-slow opacity-10" />
        <img src="/lovable-uploads/98af44ce-0003-4b10-a988-d8dd9a60f459.png" alt="Get RIDO Mascot" className="absolute top-[42%] left-[50%] h-6 w-6 animate-float-medium opacity-8" />
        <img src="/lovable-uploads/98af44ce-0003-4b10-a988-d8dd9a60f459.png" alt="Get RIDO Mascot" className="absolute top-[48%] left-[75%] h-11 w-11 animate-float-fast opacity-13" />
        <img src="/lovable-uploads/98af44ce-0003-4b10-a988-d8dd9a60f459.png" alt="Get RIDO Mascot" className="absolute top-[38%] left-[90%] h-7 w-7 animate-float-slow opacity-9" />
        
        {/* Row 4 - Lower Middle */}
        <img src="/lovable-uploads/98af44ce-0003-4b10-a988-d8dd9a60f459.png" alt="Get RIDO Mascot" className="absolute top-[60%] left-[8%] h-10 w-10 animate-float-medium opacity-12" />
        <img src="/lovable-uploads/98af44ce-0003-4b10-a988-d8dd9a60f459.png" alt="Get RIDO Mascot" className="absolute top-[65%] left-[25%] h-8 w-8 animate-float-fast opacity-10" />
        <img src="/lovable-uploads/98af44ce-0003-4b10-a988-d8dd9a60f459.png" alt="Get RIDO Mascot" className="absolute top-[62%] left-[45%] h-9 w-9 animate-float-slow opacity-11" />
        <img src="/lovable-uploads/98af44ce-0003-4b10-a988-d8dd9a60f459.png" alt="Get RIDO Mascot" className="absolute top-[68%] left-[65%] h-7 w-7 animate-float-medium opacity-9" />
        
        {/* Row 5 - Bottom */}
        <img src="/lovable-uploads/98af44ce-0003-4b10-a988-d8dd9a60f459.png" alt="Get RIDO Mascot" className="absolute top-[80%] left-[12%] h-8 w-8 animate-float-slow opacity-10" />
        <img src="/lovable-uploads/98af44ce-0003-4b10-a988-d8dd9a60f459.png" alt="Get RIDO Mascot" className="absolute top-[85%] left-[35%] h-6 w-6 animate-float-fast opacity-8" />
        <img src="/lovable-uploads/98af44ce-0003-4b10-a988-d8dd9a60f459.png" alt="Get RIDO Mascot" className="absolute top-[82%] left-[55%] h-10 w-10 animate-float-medium opacity-12" />
        <img src="/lovable-uploads/98af44ce-0003-4b10-a988-d8dd9a60f459.png" alt="Get RIDO Mascot" className="absolute top-[88%] left-[78%] h-9 w-9 animate-float-slow opacity-11" />
        
        {/* Additional scattered mascots */}
        <img src="/lovable-uploads/98af44ce-0003-4b10-a988-d8dd9a60f459.png" alt="Get RIDO Mascot" className="absolute top-[15%] left-[50%] h-7 w-7 animate-float-medium opacity-9" />
        <img src="/lovable-uploads/98af44ce-0003-4b10-a988-d8dd9a60f459.png" alt="Get RIDO Mascot" className="absolute top-[35%] left-[20%] h-8 w-8 animate-float-fast opacity-10" />
        <img src="/lovable-uploads/98af44ce-0003-4b10-a988-d8dd9a60f459.png" alt="Get RIDO Mascot" className="absolute top-[55%] left-[40%] h-6 w-6 animate-float-slow opacity-8" />
        <img src="/lovable-uploads/98af44ce-0003-4b10-a988-d8dd9a60f459.png" alt="Get RIDO Mascot" className="absolute top-[75%] left-[60%] h-11 w-11 animate-float-medium opacity-13" />
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
              <img src="/lovable-uploads/98af44ce-0003-4b10-a988-d8dd9a60f459.png" alt="Get RIDO Mascot" className="h-24 w-24 animate-bounce-gentle" />
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground leading-tight">
              <span className="text-primary">Get RIDO</span> — partner kierowców 
              <span className="block">
                <span className="text-black">Uber</span>, <span className="text-[#34D186]">Bolt</span>, <span className="text-red-600">FreeNow</span>
              </span>
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl">Zarabiaj więcej, rozliczaj się prosto. Wypłaty co tydzień. Zero ukrytych kosztów.</p>
            <div className="bg-gradient-accent text-accent-foreground p-4 rounded-lg shadow-gold max-w-2xl">
              <p className="text-lg font-bold text-center">
                ODBIERZ SWOJĄ WYPŁATĘ GOTÓWKĄ KAŻDY WTOREK U NAS W BIURZE
              </p>
            </div>
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
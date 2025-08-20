import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const Hero = () => {
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <section id="home" className="relative overflow-hidden bg-gradient-subtle py-20">
      {/* Top Bar */}
      <div className="bg-primary text-primary-foreground py-3 text-center text-sm font-medium">
        Sam wybierasz model rozliczeń: 39 zł + 8% podatku lub 159 zł + 0% podatku.
      </div>

      <div className="container mx-auto px-4">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Content */}
          <div className="space-y-8">
            <div className="space-y-4">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-foreground leading-tight">
                <span className="text-primary">RIDO</span> — partner kierowców 
                <span className="block text-primary">Uber i Bolt</span>
              </h1>
              <p className="text-xl text-muted-foreground max-w-2xl">
                Zarabiaj więcej, rozliczaj się prosto. Wypłaty co tydzień. Zero ukrytych kosztów.
              </p>
            </div>

            {/* Promotion Card */}
            <Card className="p-6 bg-gradient-accent shadow-gold border-accent/20">
              <div className="space-y-4">
                <h3 className="text-2xl font-bold text-accent-foreground">
                  🎉 PROMOCJA
                </h3>
                <div className="space-y-2">
                  <p className="text-lg font-semibold text-accent-foreground">
                    <span className="line-through text-muted-foreground">50 zł</span> → 
                    <span className="text-2xl ml-2">39 zł + 8% podatku</span>
                  </p>
                  <p className="text-sm text-accent-foreground/80">
                    dla pierwszych 50 kierowców
                  </p>
                  <p className="text-base text-accent-foreground">
                    Alternatywa: <strong>159 zł + 0% podatku</strong> (z aktywną kartą paliwową RIDO)
                  </p>
                  <div className="flex items-center space-x-2 text-sm text-accent-foreground/80">
                    <span>⏰ Zostało: </span>
                    <span className="font-bold">42 miejsc</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                variant="accent" 
                size="lg"
                onClick={() => scrollToSection('kontakt')}
                className="text-lg px-8"
              >
                Dołącz teraz
              </Button>
              <Button 
                variant="outline" 
                size="lg"
                onClick={() => scrollToSection('jak-zaczac')}
                className="text-lg px-8"
              >
                Jak zacząć
              </Button>
            </div>
          </div>

          {/* Right Content - Mascot */}
          <div className="flex justify-center lg:justify-end">
            <div className="relative">
              <img 
                src="/lovable-uploads/a27439d2-e539-4826-82f2-2c73646d08cc.png"
                alt="RIDO maskotka - partner kierowców Uber"
                className="w-64 md:w-80 lg:w-96 h-auto animate-bounce-gentle"
              />
              {/* Pointing arrow to promotion */}
              <div className="absolute -left-8 top-1/2 transform -translate-y-1/2 hidden lg:block">
                <svg 
                  className="w-8 h-8 text-accent animate-pulse" 
                  fill="currentColor" 
                  viewBox="0 0 20 20"
                >
                  <path fillRule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
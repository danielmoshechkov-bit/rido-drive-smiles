import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check } from "lucide-react";
const ProsteCenniki = () => {
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth'
      });
    }
  };
  const benefits39 = ["Wypłaty co tydzień", "Przelewy w poniedziałek do 12:00", "Wsparcie 7 dni w tygodniu", "Przejrzysty cennik", "Proste rozliczenia", "Bez ukrytych kosztów"];
  const benefits159 = ["Wypłaty co tydzień", "Przelewy w poniedziałek do 12:00", "Wsparcie 7 dni w tygodniu", "Przejrzysty cennik", "Proste rozliczenia", "Karta paliwowa E100", "Realne zniżki na paliwo", "0% podatku"];
  return <section className="py-16 bg-background relative z-20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Proste modele rozliczeń
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Wybierz model, który najlepiej odpowiada Twoim potrzebom
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
          {/* Karta 159 zł - MODEL PIERWSZY */}
          <Card className="relative p-8 bg-white shadow-soft border hover:shadow-purple transition-all duration-300">
            <div className="text-center mb-8">
              <h3 className="text-xl font-bold text-primary mb-4">MODEL PIERWSZY</h3>
              <div className="text-5xl font-bold text-foreground mb-2">
                159 zł + 0% podatku
              </div>
              <div className="text-lg text-muted-foreground mb-4">
                z aktywną kartą paliwową E100
              </div>
            </div>

            <div className="space-y-4 mb-8">
              <h4 className="font-semibold text-foreground text-lg">Co otrzymujesz:</h4>
              {benefits159.map((benefit, index) => <div key={index} className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="text-muted-foreground">{benefit}</span>
                </div>)}
            </div>

            <Button variant="default" size="lg" className="w-full text-lg bg-primary hover:bg-primary-hover" onClick={() => scrollToSection('kontakt')}>
              Wybieram ten model
            </Button>
          </Card>

          {/* Karta 39 zł - MODEL DRUGI */}
          <Card className="relative p-8 bg-white shadow-soft border hover:shadow-gold transition-all duration-300">
            <div className="absolute top-4 right-4 bg-yellow-500 text-white text-xs font-bold px-3 py-1 rounded-full">
              PROMOCJA!
            </div>
            
            <div className="text-center mb-8">
              <h3 className="text-xl font-bold text-primary mb-4">MODEL DRUGI</h3>
              <div className="text-5xl font-bold text-foreground mb-2">
                39 zł + 8% podatku
              </div>
              <div className="text-lg text-muted-foreground mb-4">
                <span className="line-through">Normalnie: 50 zł + 8% podatku</span>
              </div>
              <div className="text-yellow-600 font-semibold text-lg">
                Dla pierwszych 50 kierowców
              </div>
            </div>

            <div className="space-y-4 mb-8">
              <h4 className="font-semibold text-foreground text-lg">Co otrzymujesz:</h4>
              {benefits39.map((benefit, index) => <div key={index} className="flex items-center gap-3">
                  <Check className="h-5 w-5 text-primary flex-shrink-0" />
                  <span className="text-muted-foreground">{benefit}</span>
                </div>)}
            </div>

            <Button variant="accent" size="lg" onClick={() => scrollToSection('kontakt')} className="w-full text-lg py-0 my-[37px]">
              Wybieram ten model
            </Button>
          </Card>
        </div>
      </div>
    </section>;
};
export default ProsteCenniki;
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Check } from "lucide-react";
const Cennik = () => {
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth'
      });
    }
  };
  return <section id="cennik" className="bg-gradient-subtle py-0">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Proste modele rozliczeń — wybierz, co Ci się opłaca
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Plan 2 - Stały - MODEL PIERWSZY */}
          <Card className="p-8 bg-white shadow-purple border-primary/20">
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-bold text-primary mb-4">MODEL PIERWSZY</h3>
                <div className="flex items-baseline space-x-2 mb-2">
                  <span className="text-3xl font-bold text-foreground">159 zł</span>
                  <span className="text-lg text-muted-foreground">+ 0% podatku</span>
                </div>
                <div className="text-sm font-medium text-primary">
                  z aktywną kartą paliwową E100
                </div>
              </div>

              <ul className="space-y-3">
                <li className="flex items-center space-x-2">
                  <Check className="h-5 w-5 text-primary" />
                  <span className="text-sm">Stała kwota, 0% podatku</span>
                </li>
                <li className="flex items-center space-x-2">
                  <Check className="h-5 w-5 text-primary" />
                  <span className="text-sm">Zniżki na paliwo (karta E100)</span>
                </li>
                <li className="flex items-center space-x-2">
                  <Check className="h-5 w-5 text-primary" />
                  <span className="text-sm">Maksymalna przewidywalność kosztów</span>
                </li>
                <li className="flex items-center space-x-2">
                  <Check className="h-5 w-5 text-primary" />
                  <span className="text-sm">Wszystkie benefity planu podstawowego</span>
                </li>
              </ul>

              <Button variant="default" className="w-full" onClick={() => scrollToSection('kontakt')}>
                Wybieram ten model
              </Button>
            </div>
          </Card>

          {/* Plan 1 - Promocyjny - MODEL DRUGI */}
          <Card className="p-8 relative overflow-hidden bg-white shadow-gold border-accent/20">
            {/* Promocja Badge */}
            <div className="absolute -top-4 -right-4 bg-accent text-accent-foreground px-6 py-2 rotate-12 text-sm font-bold shadow-lg my-[4px]">
              PROMOCJA!
            </div>
            
            <div className="space-y-6">
              <div>
                <h3 className="text-xl font-bold text-primary mb-4">MODEL DRUGI</h3>
                <div className="flex items-baseline space-x-2 mb-2">
                  <span className="text-3xl font-bold text-foreground">39 zł</span>
                  <span className="text-lg text-muted-foreground">+ 8% podatku</span>
                </div>
                <div className="text-sm text-muted-foreground line-through">
                  Normalnie: 50 zł + 8% podatku
                </div>
                <div className="text-sm font-medium text-accent">
                  Dla pierwszych 50 kierowców
                </div>
              </div>

              <ul className="space-y-3">
                <li className="flex items-center space-x-2">
                  <Check className="h-5 w-5 text-primary" />
                  <span className="text-sm">Pełna obsługa rozliczeń</span>
                </li>
                <li className="flex items-center space-x-2">
                  <Check className="h-5 w-5 text-primary" />
                  <span className="text-sm">Brak ukrytych kosztów</span>
                </li>
                <li className="flex items-center space-x-2">
                  <Check className="h-5 w-5 text-primary" />
                  <span className="text-sm">Wypłaty co tydzień</span>
                </li>
                <li className="flex items-center space-x-2">
                  <Check className="h-5 w-5 text-primary" />
                  <span className="text-sm">Wsparcie 7 dni w tygodniu</span>
                </li>
              </ul>

              <Button variant="accent" className="w-full" onClick={() => scrollToSection('kontakt')}>
                Wybieram ten model
              </Button>
            </div>
          </Card>
        </div>

        {/* Info pod kartami */}
        <div className="text-center mt-8 space-y-4">
          <p className="text-muted-foreground">
            Model rozliczeń wybierasz przy podpisaniu umowy. Możliwość zmiany raz w miesiącu. Wypłaty: raz w tygodniu.
          </p>
          
          {/* Mikro FAQ */}
          <div className="grid md:grid-cols-2 gap-4 max-w-2xl mx-auto mt-8">
            <Card className="p-4 bg-white">
              <h4 className="font-semibold text-foreground mb-2">Czy są inne opłaty?</h4>
              <p className="text-sm text-muted-foreground">Nie. Zero ukrytych opłat.</p>
            </Card>
            <Card className="p-4 bg-white">
              <h4 className="font-semibold text-foreground mb-2">Czy mogę przejść z innego partnera?</h4>
              <p className="text-sm text-muted-foreground">Tak, pomożemy w 24h.</p>
            </Card>
          </div>
        </div>
      </div>
    </section>;
};
export default Cennik;
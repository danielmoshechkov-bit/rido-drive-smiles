import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Fuel, Check, CreditCard } from "lucide-react";

const KartyPaliwowe = () => {
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const benefits = [
    "Zniżki na paliwo",
    "Prosta obsługa", 
    "Dodatkowe benefity partnerskie"
  ];

  return (
    <section id="karty-paliwowe" className="py-16 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Karty paliwowe RIDO — tankuj taniej
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Dla kierowców RIDO przygotowaliśmy karty paliwowe z realnymi zniżkami na wybranych stacjach.
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          {/* Benefits Box */}
          <Card className="p-8 mb-8 shadow-gold border-accent/20 bg-gradient-accent">
            <div className="flex items-center justify-center mb-6">
              <div className="w-16 h-16 bg-accent-foreground/10 rounded-full flex items-center justify-center">
                <Fuel className="h-8 w-8 text-accent-foreground" />
              </div>
            </div>
            
            <h3 className="text-2xl font-bold text-center text-accent-foreground mb-6">
              Korzyści karty RIDO
            </h3>
            
            <div className="grid md:grid-cols-3 gap-6">
              {benefits.map((benefit, index) => (
                <div key={index} className="flex items-center space-x-3">
                  <Check className="h-5 w-5 text-accent-foreground" />
                  <span className="text-accent-foreground font-medium">{benefit}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Model 159 Requirement */}
          <Card className="p-6 bg-primary/5 border-primary/20 mb-8">
            <div className="flex items-start space-x-4">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                <CreditCard className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h4 className="text-lg font-semibold text-foreground mb-2">
                  Warunek modelu 159 zł + 0% podatku
                </h4>
                <p className="text-muted-foreground">
                  Dostęp do modelu 159 zł + 0% podatku wymaga aktywnej karty paliwowej RIDO.
                </p>
              </div>
            </div>
          </Card>

          {/* Placeholder for stations */}
          <Card className="p-6 bg-muted/30 border-muted">
            <div className="text-center">
              <h4 className="text-lg font-semibold text-foreground mb-2">
                Partnerskie stacje paliw
              </h4>
              <p className="text-muted-foreground text-sm">
                Lista stacji i wysokości rabatów zostanie uzupełniona wkrótce.
              </p>
            </div>
          </Card>
        </div>

        {/* CTA */}
        <div className="text-center mt-8">
          <Button 
            variant="accent" 
            size="lg"
            onClick={() => scrollToSection('kontakt')}
          >
            Zamów kartę paliwową
          </Button>
        </div>
      </div>
    </section>
  );
};

export default KartyPaliwowe;
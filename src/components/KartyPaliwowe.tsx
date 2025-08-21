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
    <section id="karty-paliwowe" className="py-16 bg-background relative z-20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Karty paliwowe E100 — tankuj taniej
          </h2>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Dla kierowców Get RIDO przygotowaliśmy karty paliwowe E100 z realnymi zniżkami na wybranych stacjach.
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          {/* Benefits Box */}
          <Card className="p-8 mb-8 bg-white shadow-gold border-accent/20">
            <div className="flex items-center justify-center mb-6">
              <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center">
                <Fuel className="h-8 w-8 text-accent" />
              </div>
            </div>
            
            <h3 className="text-2xl font-bold text-center text-foreground mb-6">
              Korzyści karty E100
            </h3>
            
            <div className="grid md:grid-cols-3 gap-6">
              {benefits.map((benefit, index) => (
                <div key={index} className="flex items-center space-x-3">
                  <Check className="h-5 w-5 text-accent" />
                  <span className="text-foreground font-medium">{benefit}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Model 159 Requirement */}
          <Card className="p-6 bg-white border-primary/20 mb-8">
            <div className="flex items-start space-x-4">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                <CreditCard className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h4 className="text-lg font-semibold text-foreground mb-2">
                  Warunek modelu 159 zł + 0% podatku
                </h4>
                <p className="text-muted-foreground">
                  Dostęp do modelu 159 zł + 0% podatku wymaga aktywnej karty paliwowej E100.
                </p>
              </div>
            </div>
          </Card>

          {/* Partner Stations */}
          <Card className="p-6 bg-white border shadow-soft">
            <div className="mb-6">
              <h4 className="text-xl font-semibold text-foreground mb-2 text-center">
                Partnerskie stacje paliw
              </h4>
              <p className="text-sm text-muted-foreground text-center mb-6">
                Rabaty w PLN brutto na litr paliwa
              </p>
            </div>
            
            <div className="space-y-4">
              {/* MOL/Lotos, Amic, Moya - same discounts */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-muted/20 p-4 rounded-lg">
                  <div className="flex items-center space-x-2 mb-3">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <h5 className="font-semibold text-foreground">MOL/Lotos</h5>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>ON:</span>
                      <span className="font-medium text-green-600">-0,30 zł</span>
                    </div>
                    <div className="flex justify-between">
                      <span>PB95:</span>
                      <span className="font-medium text-green-600">-0,20 zł</span>
                    </div>
                    <div className="flex justify-between">
                      <span>LPG:</span>
                      <span className="font-medium text-green-600">-0,05 zł</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Myjnia:</span>
                      <span className="font-medium text-green-600">-5%</span>
                    </div>
                  </div>
                </div>

                <div className="bg-muted/20 p-4 rounded-lg">
                  <div className="flex items-center space-x-2 mb-3">
                    <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                    <h5 className="font-semibold text-foreground">Amic</h5>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>ON:</span>
                      <span className="font-medium text-green-600">-0,30 zł</span>
                    </div>
                    <div className="flex justify-between">
                      <span>PB95:</span>
                      <span className="font-medium text-green-600">-0,20 zł</span>
                    </div>
                    <div className="flex justify-between">
                      <span>LPG:</span>
                      <span className="font-medium text-green-600">-0,05 zł</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Myjnia:</span>
                      <span className="font-medium text-green-600">-5%</span>
                    </div>
                  </div>
                </div>

                <div className="bg-muted/20 p-4 rounded-lg">
                  <div className="flex items-center space-x-2 mb-3">
                    <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                    <h5 className="font-semibold text-foreground">Moya</h5>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>ON:</span>
                      <span className="font-medium text-green-600">-0,30 zł</span>
                    </div>
                    <div className="flex justify-between">
                      <span>PB95:</span>
                      <span className="font-medium text-green-600">-0,20 zł</span>
                    </div>
                    <div className="flex justify-between">
                      <span>LPG:</span>
                      <span className="font-medium text-green-600">-0,05 zł</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Myjnia:</span>
                      <span className="font-medium text-green-600">-5%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Orlen and Power Max */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-muted/20 p-4 rounded-lg">
                  <div className="flex items-center space-x-2 mb-3">
                    <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
                    <h5 className="font-semibold text-foreground">Orlen</h5>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>ON:</span>
                      <span className="font-medium text-green-600">-0,05 zł</span>
                    </div>
                    <div className="flex justify-between">
                      <span>PB95:</span>
                      <span className="font-medium text-green-600">-0,05 zł</span>
                    </div>
                    <div className="flex justify-between">
                      <span>LPG:</span>
                      <span className="font-medium text-green-600">-0,02 zł</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Myjnia:</span>
                      <span className="font-medium text-green-600">-5%</span>
                    </div>
                  </div>
                </div>

                <div className="bg-muted/20 p-4 rounded-lg">
                  <div className="flex items-center space-x-2 mb-3">
                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                    <h5 className="font-semibold text-foreground">Power Max</h5>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span>Spot Orlen:</span>
                      <span className="font-medium text-green-600">-0,12 zł</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Myjnia:</span>
                      <span className="font-medium text-green-600">-5%</span>
                    </div>
                  </div>
                </div>
              </div>
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
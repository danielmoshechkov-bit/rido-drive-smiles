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
    <section id="karty-paliwowe" className="py-16">
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
          {/* Unified E100 Card with all benefits and partner stations */}
          <Card className="p-8 mb-8 bg-gradient-accent shadow-gold border-accent/20">
            <h3 className="text-3xl font-bold text-center text-foreground mb-6">
              Korzyści karty paliwowej E100
            </h3>
            
            {/* Benefits Section */}
            <div className="bg-white rounded-lg p-8 mb-8 border-2 border-white/30 shadow-soft">
              <div className="grid md:grid-cols-3 gap-8">
                {benefits.map((benefit, index) => (
                  <div key={index} className="flex items-center space-x-4">
                    <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                      <Check className="h-5 w-5 text-white" />
                    </div>
                    <span className="text-foreground font-bold text-lg">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Partner Stations */}
            <div className="bg-white rounded-lg p-8 border-2 border-white/30 shadow-soft">
              <div className="mb-6">
                <h4 className="text-xl font-semibold text-foreground mb-2 text-center">
                  Partnerskie stacje paliw
                </h4>
                <p className="text-base text-foreground/70 text-center mb-6">
                  Rabaty w PLN brutto na litr paliwa
                </p>
              </div>
              
              <div className="space-y-4">
                {/* MOL/Lotos, Amic, Moya - same discounts */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white p-6 rounded-lg border-2 border-white/30 shadow-soft">
                    <div className="flex items-center space-x-2 mb-3">
                      <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                      <h5 className="font-semibold text-foreground text-base">MOL/Lotos</h5>
                    </div>
                    <div className="space-y-1 text-base text-foreground">
                      <div className="flex justify-between">
                        <span>ON:</span>
                        <span className="font-semibold text-green-600">-0,30 zł</span>
                      </div>
                      <div className="flex justify-between">
                        <span>PB95:</span>
                        <span className="font-semibold text-green-600">-0,20 zł</span>
                      </div>
                      <div className="flex justify-between">
                        <span>LPG:</span>
                        <span className="font-semibold text-green-600">-0,05 zł</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Myjnia:</span>
                        <span className="font-semibold text-green-600">-5%</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-lg border-2 border-white/30 shadow-soft">
                    <div className="flex items-center space-x-2 mb-3">
                      <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                      <h5 className="font-semibold text-foreground text-base">Amic</h5>
                    </div>
                    <div className="space-y-1 text-base text-foreground">
                      <div className="flex justify-between">
                        <span>ON:</span>
                        <span className="font-semibold text-green-600">-0,30 zł</span>
                      </div>
                      <div className="flex justify-between">
                        <span>PB95:</span>
                        <span className="font-semibold text-green-600">-0,20 zł</span>
                      </div>
                      <div className="flex justify-between">
                        <span>LPG:</span>
                        <span className="font-semibold text-green-600">-0,05 zł</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Myjnia:</span>
                        <span className="font-semibold text-green-600">-5%</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-lg border-2 border-white/30 shadow-soft">
                    <div className="flex items-center space-x-2 mb-3">
                      <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                      <h5 className="font-semibold text-foreground text-base">Moya</h5>
                    </div>
                    <div className="space-y-1 text-base text-foreground">
                      <div className="flex justify-between">
                        <span>ON:</span>
                        <span className="font-semibold text-green-600">-0,30 zł</span>
                      </div>
                      <div className="flex justify-between">
                        <span>PB95:</span>
                        <span className="font-semibold text-green-600">-0,20 zł</span>
                      </div>
                      <div className="flex justify-between">
                        <span>LPG:</span>
                        <span className="font-semibold text-green-600">-0,05 zł</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Myjnia:</span>
                        <span className="font-semibold text-green-600">-5%</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Orlen and Power Max */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white p-6 rounded-lg border-2 border-white/30 shadow-soft">
                    <div className="flex items-center space-x-2 mb-3">
                      <div className="w-3 h-3 bg-gray-500 rounded-full"></div>
                      <h5 className="font-semibold text-foreground text-base">Orlen</h5>
                    </div>
                    <div className="space-y-1 text-base text-foreground">
                      <div className="flex justify-between">
                        <span>ON:</span>
                        <span className="font-semibold text-green-600">-0,05 zł</span>
                      </div>
                      <div className="flex justify-between">
                        <span>PB95:</span>
                        <span className="font-semibold text-green-600">-0,05 zł</span>
                      </div>
                      <div className="flex justify-between">
                        <span>LPG:</span>
                        <span className="font-semibold text-green-600">-0,02 zł</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Myjnia:</span>
                        <span className="font-semibold text-green-600">-5%</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-lg border-2 border-white/30 shadow-soft">
                    <div className="flex items-center space-x-2 mb-3">
                      <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                      <h5 className="font-semibold text-foreground text-base">Power Max</h5>
                    </div>
                    <div className="space-y-1 text-base text-foreground">
                      <div className="flex justify-between">
                        <span>Spot Orlen:</span>
                        <span className="font-semibold text-green-600">-0,12 zł</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Myjnia:</span>
                        <span className="font-semibold text-green-600">-5%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Model 159 Requirement - Separate Purple Card */}
          <Card className="p-8 bg-primary text-primary-foreground shadow-purple border-2 border-white/30 mb-8">
            <div className="flex items-start space-x-4">
              <div className="w-12 h-12 bg-primary-foreground/20 rounded-full flex items-center justify-center flex-shrink-0">
                <CreditCard className="h-6 w-6 text-primary-foreground" />
              </div>
              <div>
                <h4 className="text-lg font-semibold text-primary-foreground mb-2">
                  Warunek modelu 159 zł + 0% podatku
                </h4>
                <p className="text-primary-foreground/80">
                  Dostęp do modelu 159 zł + 0% podatku wymaga aktywnej karty paliwowej E100.
                </p>
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
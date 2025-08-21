import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FileText, Car, AlertCircle } from "lucide-react";

const Wymagania = () => {
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const driverDocs = [
    "Prawo jazdy polskie",
    "Zaświadczenie o niekaralności",
    "Zaświadczenie lekarskie i psychotechniczne", 
    "Zdjęcie 4.5x3.5"
  ];

  const carDocs = [
    "Przegląd TAXI",
    "Ubezpieczenie OC.",
    "Oklejone zgodnie z przepisami"
  ];

  return (
    <section id="wymagania" className="py-16 bg-gradient-subtle relative z-20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Co jest potrzebne do rozpoczęcia?
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Dokumenty od kierowcy */}
          <Card className="p-6 bg-white shadow-soft">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                <FileText className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold text-foreground">
                Dokumenty dla kierowcy
              </h3>
            </div>
            
            <ul className="space-y-3">
              {driverDocs.map((doc, index) => (
                <li key={index} className="flex items-start space-x-2">
                  <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                  <span className="text-sm text-foreground">{doc}</span>
                </li>
              ))}
            </ul>
          </Card>

          {/* Dokumenty od samochodu */}
          <Card className="p-6 bg-white shadow-soft">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                <Car className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold text-foreground">
                Wymagania do auta
              </h3>
            </div>
            
            <ul className="space-y-3">
              {carDocs.map((doc, index) => (
                <li key={index} className="flex items-start space-x-2">
                  <div className="w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0"></div>
                  <span className="text-sm text-foreground">{doc}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* Uwaga - Nie masz auta */}
        <Card className="max-w-2xl mx-auto mt-8 p-6 bg-white border-accent/20">
          <div className="flex items-start space-x-3">
            <AlertCircle className="h-6 w-6 text-accent mt-1 flex-shrink-0" />
            <div>
              <h4 className="font-semibold text-foreground mb-2">
                Nie masz auta?
              </h4>
              <p className="text-sm text-muted-foreground">
                Daj znać, pomożemy dobrać rozwiązanie.
              </p>
            </div>
          </div>
        </Card>

        {/* CTA */}
        <div className="text-center mt-8 space-x-4">
          <Button 
            variant="accent" 
            size="lg"
            onClick={() => scrollToSection('kontakt')}
          >
            Chcę dołączyć
          </Button>
          <Button 
            variant="outline" 
            size="lg"
            onClick={() => scrollToSection('kontakt')}
          >
            Zapytaj nas na czacie
          </Button>
        </div>
      </div>
    </section>
  );
};

export default Wymagania;
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const JakZaczac = () => {
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const steps = [
    {
      number: "1",
      title: "Zgłoszenie online",
      description: "wypełnij formularz (imię, telefon, e-mail, miasto, czy masz auto)"
    },
    {
      number: "2", 
      title: "Dokumenty",
      description: "wyślij skany; pomożemy wszystko skompletować"
    },
    {
      number: "3",
      title: "Weryfikacja i podpis",
      description: "umowa elektroniczna, bez biegania po urzędach"
    },
    {
      number: "4",
      title: "Aktywacja w Uber/Bolt",
      description: "start nawet w 24h"
    }
  ];

  return (
    <section id="jak-zaczac" className="py-16 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Jak dołączyć do RIDO i zacząć jeździć?
          </h2>
        </div>

        <div className="max-w-4xl mx-auto">
          {/* Steps */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {steps.map((step, index) => (
              <Card key={index} className="p-6 text-center shadow-soft hover:shadow-purple transition-all duration-300">
                <div className="w-12 h-12 bg-gradient-hero text-primary-foreground rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
                  {step.number}
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {step.title}  
                </h3>
                <p className="text-sm text-muted-foreground">
                  {step.description}
                </p>
              </Card>
            ))}
          </div>

          {/* CTA */}
          <div className="text-center space-x-4">
            <Button 
              variant="accent" 
              size="lg"
              onClick={() => scrollToSection('kontakt')}
            >
              Zgłoś się teraz
            </Button>
            <Button 
              variant="outline" 
              size="lg"
              onClick={() => scrollToSection('wymagania')}
            >
              Lista dokumentów → Wymagania
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default JakZaczac;
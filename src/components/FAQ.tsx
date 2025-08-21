import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const FAQ = () => {
  const faqs = [
    {
      question: "Kiedy są wypłaty?",
      answer: "Wypłaty realizujemy raz w tygodniu (docelowo planujemy opcję codziennych)."
    },
    {
      question: "Czy są ukryte opłaty?",
      answer: "Nie. Masz przejrzysty cennik i zero ukrytych kosztów."
    },
    {
      question: "Czy muszę mieć działalność?",
      answer: "Nie. Jeździsz przez Get RIDO — rozliczamy Cię jako partnera."
    },
    {
      question: "Czy mogę przejść z innego partnera?",
      answer: "Tak. Pomożemy w 24h przenieść rozliczenia i aktywację."
    },
    {
      question: "Jakie dokumenty są wymagane?",
      answer: "Prawo jazdy (min. 1 rok), niekaralność (≤30 dni), badania lekarskie i psychotechniczne, zdjęcie. Samochód z przeglądem TAXI (jeśli wymagane)."
    },
    {
      question: "Czy mogę zmienić model rozliczeń?",
      answer: "Tak — raz w miesiącu."
    },
    {
      question: "Na czym polega karta paliwowa Get RIDO?",
      answer: "To karta z rabatem na paliwo na partnerskich stacjach. Jest wymagana, by skorzystać z modelu 159 zł + 0% podatku."
    },
    {
      question: "Czy Get RIDO pomaga w formalnościach?",
      answer: "Tak — przeprowadzimy Cię przez cały proces, krok po kroku."
    }
  ];

  return (
    <section id="faq" className="py-16 bg-gradient-subtle relative z-20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Najczęściej zadawane pytania
          </h2>
        </div>

        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="space-y-4">
            {faqs.map((faq, index) => (
              <AccordionItem 
                key={index} 
                value={`item-${index}`}
                className="bg-white rounded-lg border shadow-soft"
              >
                <AccordionTrigger className="px-6 py-4 text-left hover:no-underline hover:bg-muted/30 rounded-lg">
                  <span className="font-semibold text-foreground">
                    {faq.question}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="px-6 pb-4 pt-0">
                  <p className="text-muted-foreground">
                    {faq.answer}
                  </p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
};

export default FAQ;
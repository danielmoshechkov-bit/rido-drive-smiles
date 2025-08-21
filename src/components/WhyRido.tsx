import { Card } from "@/components/ui/card";

const WhyRido = () => {
  const benefits = [
    {
      icon: "💸",
      title: "Przejrzyście",
      description: "jeden cennik, bez ukrytych opłat"
    },
    {
      icon: "📆",
      title: "Wypłaty co tydzień",
      description: "przelew wysylamy w poniedzialek do godziny 12"
    },
    {
      icon: "☎️",
      title: "Wsparcie 7 dni w tygodniu",
      description: "zawsze możesz na nas liczyć"
    },
    {
      icon: "⛽",
      title: "Karta paliwowa",
      description: "realne zniżki na stacjach"
    }
  ];

  return (
    <section className="py-16 bg-background">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Dlaczego Get RIDO?
          </h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {benefits.map((benefit, index) => (
            <Card key={index} className="p-6 text-center shadow-soft hover:shadow-purple transition-all duration-300">
              <div className="text-4xl mb-4">{benefit.icon}</div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {benefit.title}
              </h3>
              <p className="text-muted-foreground text-sm">
                {benefit.description}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

export default WhyRido;
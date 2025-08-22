import { Card } from "@/components/ui/card";
const WhyRido = () => {
  const benefits = [{
    icon: "💸",
    title: "Przejrzyście",
    description: "jeden cennik, bez ukrytych opłat"
  }, {
    icon: "📆",
    title: "Wypłaty co tydzień",
    description: "przelewy wysyłamy w poniedziałek do godziny 12 i tego samego dnia są już na twoim koncie"
  }, {
    icon: "💰",
    title: "Wypłata gotówką",
    description: "możliwość odebrania swojej wypłaty gotówką w każdy wtorek u nas w biurze"
  }, {
    icon: "☎️",
    title: "Wsparcie 7 dni w tygodniu",
    description: "zawsze możesz na nas liczyć"
  }, {
    icon: "⛽",
    title: "Karta paliwowa",
    description: "realne zniżki na stacjach"
  }];
  return <section className="bg-background py-0">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Dlaczego Get RIDO?
          </h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-6">
          {benefits.map((benefit, index) => <Card key={index} className="p-8 text-center !bg-white border-2 border-white/30 shadow-soft hover:shadow-purple transition-all duration-300">
              <div className="text-5xl mb-6">{benefit.icon}</div>
              <h3 className="text-xl font-bold text-foreground mb-3">
                {benefit.title}
              </h3>
              <p className="text-muted-foreground text-base">
                {benefit.description}
              </p>
            </Card>)}
        </div>
      </div>
    </section>;
};
export default WhyRido;
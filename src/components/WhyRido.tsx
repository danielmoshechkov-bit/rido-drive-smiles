import { Card } from "@/components/ui/card";
import { useTranslation } from "react-i18next";

const WhyRido = () => {
  const { t } = useTranslation();
  const benefits = [
    {
      icon: "💸",
      title: t('whyRido.benefits.transparency.title'),
      description: t('whyRido.benefits.transparency.description')
    },
    {
      icon: "📆", 
      title: t('whyRido.benefits.weeklyPayouts.title'),
      description: t('whyRido.benefits.weeklyPayouts.description')
    },
    {
      icon: "💰",
      title: t('whyRido.benefits.cashPayout.title'), 
      description: t('whyRido.benefits.cashPayout.description')
    },
    {
      icon: "☎️",
      title: t('whyRido.benefits.support.title'),
      description: t('whyRido.benefits.support.description')
    },
    {
      icon: "⛽",
      title: t('whyRido.benefits.fuelCard.title'),
      description: t('whyRido.benefits.fuelCard.description')
    }
  ];
  return <section className="bg-background py-0">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            {t('whyRido.title')}
          </h2>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-6">
          {benefits.map((benefit, index) => <Card key={index} className="p-8 text-center bg-white border-2 border-white/30 shadow-soft hover:shadow-purple transition-all duration-300">
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
import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Check, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

type Plan = {
  name: string;
  price: string;
  period?: string;
  description: string;
  features: string[];
  highlighted?: boolean;
  badge?: string;
  cta?: string;
};

type ServiceSection = {
  id: string;
  label: string;
  title: string;
  subtitle: string;
  plans: Plan[];
  note?: string;
};

const sections: ServiceSection[] = [
  {
    id: "warsztat",
    label: "Warsztat / ERP",
    title: "Cennik GetRido dla Warsztatów",
    subtitle: "Wybierz plan dopasowany do skali Twojego serwisu.",
    plans: [
      {
        name: "Start",
        price: "0 zł",
        period: "/ mies.",
        description: "Na rozpoczęcie cyfryzacji warsztatu.",
        features: [
          "Do 20 zleceń / miesiąc",
          "Kalendarz wizyt",
          "Baza klientów i pojazdów",
          "Wysyłka SMS przypomnień (limit)",
        ],
        cta: "Zacznij za darmo",
      },
      {
        name: "Warsztat",
        price: "99 zł",
        period: "/ mies.",
        description: "Podstawowy plan dla aktywnych warsztatów.",
        features: [
          "Bez limitu zleceń",
          "Wyszukiwarka części (Inter Cars, Auto Partner)",
          "Magazyn z FIFO",
          "Faktury VAT i KSeF",
          "Portal klienta z podpisem online",
        ],
        cta: "Wybieram Warsztat",
      },
      {
        name: "Pro",
        price: "175 zł",
        period: "/ mies.",
        description: "Dla wielostanowiskowych serwisów.",
        features: [
          "Wszystko z planu Warsztat",
          "Wielu pracowników i workstationy",
          "Śledzenie roboczogodzin (0.25h)",
          "Checklisty i szablony procesów",
          "Raporty rentowności",
        ],
        highlighted: true,
        badge: "Najpopularniejszy",
        cta: "Wybieram Pro",
      },
      {
        name: "GetRido AI",
        price: "249 zł",
        period: "/ mies.",
        description: "Pełna automatyzacja z asystentem AI.",
        features: [
          "Wszystko z planu Pro",
          "RidoAI – wycena i diagnoza",
          "Automatyczne zamawianie z hurtowni (wkrótce)",
          "Transkrypcja rozmów (wkrótce)",
          "AI asystent telefoniczny (wkrótce)",
        ],
        badge: "AI",
        cta: "Wybieram GetRido AI",
      },
    ],
    note: "14 dni okresu próbnego na każdym planie. Bez karty kredytowej.",
  },
  {
    id: "flota",
    label: "Flota / Kierowcy",
    title: "Cennik dla Flot Uber / Bolt",
    subtitle: "Dwa proste modele rozliczeń tygodniowych z kierowcą.",
    plans: [
      {
        name: "Model Pierwszy",
        price: "159 zł",
        period: "+ 0% podatku / tyg.",
        description: "Z aktywną kartą paliwową E100.",
        features: [
          "Stała kwota, 0% podatku",
          "Zniżki na paliwo (karta E100)",
          "Maksymalna przewidywalność",
          "Wypłaty co tydzień",
        ],
        cta: "Wybieram ten model",
      },
      {
        name: "Model Drugi",
        price: "50 zł",
        period: "+ 8% podatku / tyg.",
        description: "Elastyczny model bez karty paliwowej.",
        features: [
          "Pełna obsługa rozliczeń",
          "Brak ukrytych kosztów",
          "Wypłaty co tydzień",
          "Wsparcie 7 dni w tygodniu",
        ],
        highlighted: true,
        cta: "Wybieram ten model",
      },
    ],
    note: "Model wybierasz przy podpisaniu umowy. Zmiana raz w miesiącu.",
  },
  {
    id: "marketplace",
    label: "Marketplace",
    title: "Cennik Marketplace (Auto / Nieruchomości / Usługi)",
    subtitle: "Wystawiaj ogłoszenia samochodowe, nieruchomości i usługi.",
    plans: [
      {
        name: "Free",
        price: "0 zł",
        description: "Dla użytkowników prywatnych.",
        features: [
          "Do 3 aktywnych ogłoszeń",
          "Standardowa widoczność",
          "Wiadomości w portalu",
          "Galeria do 10 zdjęć",
        ],
        cta: "Zacznij za darmo",
      },
      {
        name: "Pro Sprzedawca",
        price: "49 zł",
        period: "/ mies.",
        description: "Dla osób sprzedających regularnie.",
        features: [
          "Do 20 ogłoszeń",
          "Wyróżnienia w wyszukiwarce",
          "Statystyki ogłoszeń",
          "AI optymalizacja opisów",
        ],
        highlighted: true,
        badge: "Polecane",
        cta: "Wybieram Pro",
      },
      {
        name: "Biznes",
        price: "199 zł",
        period: "/ mies.",
        description: "Dla komisów, biur i firm usługowych.",
        features: [
          "Bez limitu ogłoszeń",
          "Profil sprzedawcy z logo",
          "Integracja z CRM",
          "Priorytetowe wsparcie",
        ],
        cta: "Wybieram Biznes",
      },
    ],
  },
  {
    id: "ksiegowosc",
    label: "Księgowość / Faktury",
    title: "Cennik modułu Księgowość i KSeF",
    subtitle: "Faktury VAT, KSeF FA(3), automatyczne księgowanie.",
    plans: [
      {
        name: "Faktury Start",
        price: "0 zł",
        period: "/ mies.",
        description: "Do 10 faktur miesięcznie.",
        features: [
          "Faktury VAT i pro forma",
          "Numeracja automatyczna",
          "Wysyłka e-mail",
          "Eksport PDF",
        ],
        cta: "Zacznij za darmo",
      },
      {
        name: "Księgowość Pro",
        price: "79 zł",
        period: "/ mies.",
        description: "Pełna obsługa faktur z KSeF.",
        features: [
          "Bez limitu faktur",
          "Integracja KSeF FA(3)",
          "Faktury korygujące",
          "Biała Lista weryfikacja",
          "AI Asystent Księgowy",
        ],
        highlighted: true,
        badge: "AI",
        cta: "Wybieram Pro",
      },
    ],
  },
  {
    id: "ai",
    label: "AI Pro / Asystenci",
    title: "Cennik AI Pro i Asystentów AI",
    subtitle: "Dodatki AI do każdego planu portalu.",
    plans: [
      {
        name: "RidoAI Lite",
        price: "29 zł",
        period: "/ mies.",
        description: "Podstawowy asystent AI w aplikacji.",
        features: [
          "Limit 100 zapytań / mies.",
          "Wsparcie po polsku",
          "Wbudowane skróty",
        ],
        cta: "Aktywuj",
      },
      {
        name: "AI Pro",
        price: "99 zł",
        period: "/ mies.",
        description: "Pełen pakiet AI dla profesjonalistów.",
        features: [
          "Bez limitu zapytań",
          "Generowanie opisów ogłoszeń",
          "AI SEO Agent",
          "Marketing ROI Dashboard",
        ],
        highlighted: true,
        cta: "Wybieram AI Pro",
      },
      {
        name: "AI Voice",
        price: "Wycena",
        description: "AI asystent telefoniczny + reklamowy.",
        features: [
          "Odbieranie połączeń przez AI",
          "Transkrypcje rozmów",
          "AI Sales Agent (Meta Ads)",
          "Indywidualne wdrożenie",
        ],
        badge: "Wkrótce",
        cta: "Zapytaj o ofertę",
      },
    ],
  },
];

const CennikPage = () => {
  const [tab, setTab] = useState("warsztat");
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        {/* Hero */}
        <section className="bg-gradient-hero py-16">
          <div className="container mx-auto px-4 text-center text-primary-foreground">
            <Badge className="mb-4 bg-white/20 text-white border-white/30 hover:bg-white/30">
              <Sparkles className="h-3 w-3 mr-1" />
              Cennik GetRido
            </Badge>
            <h1 className="text-3xl md:text-5xl font-bold mb-3">
              Przejrzysty cennik wszystkich naszych usług
            </h1>
            <p className="text-lg md:text-xl text-primary-foreground/90 max-w-2xl mx-auto">
              Wybierz portal, którego potrzebujesz — zapłacisz tylko za to, czego używasz.
            </p>
          </div>
        </section>

        {/* Tabs */}
        <section className="py-12">
          <div className="container mx-auto px-4">
            <Tabs value={tab} onValueChange={setTab} className="w-full">
              <div className="overflow-x-auto scrollbar-hide mb-8">
                <TabsList className="w-max mx-auto flex gap-2 bg-muted p-1">
                  {sections.map((s) => (
                    <TabsTrigger key={s.id} value={s.id} className="whitespace-nowrap">
                      {s.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              {sections.map((section) => (
                <TabsContent key={section.id} value={section.id} className="mt-0">
                  <div className="text-center mb-10">
                    <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-3">
                      {section.title}
                    </h2>
                    <p className="text-muted-foreground max-w-2xl mx-auto">{section.subtitle}</p>
                  </div>

                  <div
                    className={`grid gap-6 max-w-6xl mx-auto ${
                      section.plans.length === 2
                        ? "md:grid-cols-2"
                        : section.plans.length === 3
                        ? "md:grid-cols-3"
                        : "md:grid-cols-2 lg:grid-cols-4"
                    }`}
                  >
                    {section.plans.map((plan) => (
                      <Card
                        key={plan.name}
                        className={`p-6 flex flex-col relative transition-all duration-300 hover:shadow-purple ${
                          plan.highlighted
                            ? "border-2 border-primary shadow-purple"
                            : "border border-border"
                        }`}
                      >
                        {plan.badge && (
                          <Badge
                            className={`absolute -top-3 left-1/2 -translate-x-1/2 ${
                              plan.badge === "AI"
                                ? "bg-gradient-hero text-primary-foreground"
                                : plan.badge === "Wkrótce"
                                ? "bg-muted text-muted-foreground"
                                : "bg-accent text-accent-foreground"
                            }`}
                          >
                            {plan.badge}
                          </Badge>
                        )}
                        <div className="mb-4">
                          <h3 className="text-lg font-bold text-primary mb-2">{plan.name}</h3>
                          <div className="flex items-baseline gap-1 mb-2">
                            <span className="text-3xl font-bold text-foreground">{plan.price}</span>
                            {plan.period && (
                              <span className="text-sm text-muted-foreground">{plan.period}</span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">{plan.description}</p>
                        </div>
                        <ul className="space-y-2 mb-6 flex-1">
                          {plan.features.map((f) => (
                            <li key={f} className="flex items-start gap-2 text-sm">
                              <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                              <span className="text-foreground">{f}</span>
                            </li>
                          ))}
                        </ul>
                        <Button
                          variant={plan.highlighted ? "default" : "outline"}
                          className="w-full"
                          onClick={() => navigate("/kontakt")}
                        >
                          {plan.cta || "Wybieram"}
                        </Button>
                      </Card>
                    ))}
                  </div>

                  {section.note && (
                    <p className="text-center text-sm text-muted-foreground mt-8">{section.note}</p>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </section>

        {/* CTA bottom */}
        <section className="bg-muted py-12">
          <div className="container mx-auto px-4 text-center">
            <h3 className="text-2xl font-bold text-foreground mb-3">
              Masz pytania o cennik?
            </h3>
            <p className="text-muted-foreground mb-6">
              Skontaktuj się z nami — przygotujemy ofertę dopasowaną do Twojej firmy.
            </p>
            <Button variant="accent" size="lg" onClick={() => navigate("/kontakt")}>
              Skontaktuj się z nami
            </Button>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default CennikPage;

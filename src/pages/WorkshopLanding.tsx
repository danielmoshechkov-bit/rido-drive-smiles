import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Wrench,
  Calendar,
  MessageSquare,
  Search,
  Camera,
  Sparkles,
  Check,
  ArrowRight,
  Brain,
  Shield,
  Clock,
  Users,
  Zap,
  Package,
  Receipt,
  TrendingUp,
  Droplets,
  Phone,
  Megaphone,
} from "lucide-react";
import { AuthModal } from "@/components/auth/AuthModal";
import { UniversalHomeButton } from "@/components/UniversalHomeButton";
import tileWorkshop from "@/assets/tile-workshop.jpg";

export default function WorkshopLanding() {
  const navigate = useNavigate();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginMode, setLoginMode] = useState<"login" | "register">("register");
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);

  const handleStartTrial = (plan: string) => {
    setSelectedPlan(plan);
    setLoginMode("register");
    setShowLoginModal(true);
  };

  const features = [
    { icon: Calendar, title: "Terminarz online", description: "Inteligentny kalendarz z automatycznymi przypomnieniami SMS dla klientów (24h i 2h przed wizytą)." },
    { icon: Wrench, title: "Zlecenia i kosztorysy", description: "Pełna obsługa zleceń – od przyjęcia auta, przez wycenę, po wydanie. Status w czasie rzeczywistym." },
    { icon: Brain, title: "Wyceny AI", description: "Inteligentne sugestie cen części i robocizny na bazie tysięcy historycznych zleceń.", ai: true },
    { icon: Search, title: "Sprawdzanie aut po nr rejestracyjnym", description: "Pobieranie danych pojazdu z CEPiK/RegCheck — VIN, model, pojemność, moc, rok.", ai: true },
    { icon: Package, title: "Magazyn części z OCR", description: "Skanuj faktury zakupowe — AI rozpoznaje pozycje i automatycznie aktualizuje magazyn.", ai: true },
    { icon: MessageSquare, title: "SMS do klientów", description: "Powiadomienia o gotowości, przypomnienia, ankiety satysfakcji. Własny nadawca." },
    { icon: Camera, title: "Zdjęcia przyjęcia auta", description: "Dokumentacja stanu pojazdu przy odbiorze – zabezpieczenie przed reklamacjami." },
    { icon: Receipt, title: "Faktury i KSeF", description: "Integracja z modułem księgowym – jednym kliknięciem wystawiasz fakturę FA(3)." },
    { icon: Droplets, title: "Moduł Detailing & PPF", description: "Specjalne workflow dla studiów detailingu, ceramiki i folii ochronnych." },
    { icon: TrendingUp, title: "Analiza rentowności", description: "Marże, czasy pracy mechaników, najlepsi klienci – pełne statystyki biznesu." },
    { icon: Package, title: "Automatyczne zamówienia z hurtowni", description: "Zamawianie części z wielu hurtowni jednym kliknięciem (Inter Cars, Hart, Auto Partner).", ai: true, soon: true },
    { icon: MessageSquare, title: "Transkrypcja rozmów AI", description: "Automatyczna transkrypcja i podsumowania rozmów telefonicznych z klientami.", ai: true, soon: true },
    { icon: Phone, title: "AI asystent telefoniczny", description: "Sztuczna inteligencja odbiera połączenia, umawia wizyty i odpowiada na pytania klientów.", ai: true, soon: true },
    { icon: Megaphone, title: "AI asystent reklamowy", description: "Generuje kampanie Meta/Google Ads, teksty, kreacje i optymalizuje budżet.", ai: true, soon: true },
  ];

  const benefits = [
    { icon: Zap, text: "14 dni za darmo, bez karty" },
    { icon: Shield, text: "Bezpieczne dane w polskiej chmurze" },
    { icon: Clock, text: "Dostęp 24/7 z każdego urządzenia" },
    { icon: Users, text: "Nieograniczona liczba klientów" },
  ];

  const plans = [
    {
      id: "start",
      name: "Start",
      badge: "Darmowy",
      price: "0",
      period: "/mies.",
      description: "Na start, dla małych warsztatów i jednoosobowych studiów detailingu.",
      features: ["20 zleceń/mc", "Klienci + pojazdy", "Terminarz", "Zdjęcia przy przyjęciu", "10 sprawdzeń VIN", "3 pytania AI/mc"],
      cta: "Zacznij za darmo",
    },
    {
      id: "warsztat",
      name: "Warsztat",
      popular: true,
      badge: "Najpopularniejszy",
      price: "99",
      period: "netto/mies.",
      description: "Najczęściej wybierany. Dla rozwijających się warsztatów.",
      features: ["Zlecenia bez limitu", "Magazyn + przechowalnia", "Sprzedaż + faktury", "Raporty + marża live", "KSeF basic", "20 pytań AI/mc"],
      cta: "Wypróbuj 14 dni za darmo",
    },
    {
      id: "pro",
      name: "Warsztat Pro",
      badge: "Pro",
      price: "175",
      period: "netto/mies.",
      description: "Pełne dane naprawcze, czas pracy mechanika i zaawansowane raporty.",
      features: ["Dane naprawcze (TecRMI)", "Czas pracy mechanika", "50 pytań AI/mc", "KSeF pełny + wysyłka", "Zaawansowane raporty", "Priorytetowy support"],
      cta: "Wypróbuj 14 dni za darmo",
    },
    {
      id: "ai",
      name: "GetRido AI",
      badge: "AI Business",
      price: "249",
      period: "netto/mies.",
      description: "Pełna automatyzacja z księgowością i nieograniczonym AI.",
      features: ["Księgowość AI", "30 faktur/mc auto-odczyt", "Doradca podatkowy AI", "Nieograniczone AI", "KSeF monitor + alerty", "Dedykowany opiekun"],
      cta: "Wypróbuj 14 dni za darmo",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <UniversalHomeButton />
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setLoginMode("login"); setShowLoginModal(true); }}>
              Zaloguj się
            </Button>
            <Button size="sm" onClick={() => handleStartTrial("pro")}>Zarejestruj się</Button>
          </div>
        </div>
      </header>

      {/* Hero with background image */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-10 bg-cover bg-center pointer-events-none"
          style={{ backgroundImage: `url(${tileWorkshop})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/50 to-background pointer-events-none" />
        <div className="relative container mx-auto px-4 py-12 md:py-20">
          <div className="max-w-4xl mx-auto text-center">
            <Badge className="mb-4 bg-primary/10 text-primary border-primary/20 text-sm px-4 py-1">
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              14 dni za darmo · bez karty
            </Badge>

            <h1 className="text-3xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-primary via-purple-600 to-primary bg-clip-text text-transparent">
              System do zarządzania
              <br />
              warsztatem i detailingiem
            </h1>

            <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Zlecenia, terminy, przypomnienia SMS, magazyn z OCR, wyceny AI i sprawdzanie aut po
              numerze rejestracyjnym — wszystko w jednym miejscu.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
              <Button
                size="lg"
                className="w-full sm:w-auto gap-2 text-lg px-8 py-6 bg-gradient-to-r from-primary to-purple-600 hover:opacity-90"
                onClick={() => handleStartTrial("pro")}
              >
                <Wrench className="h-5 w-5" />
                Wypróbuj 14 dni za darmo
                <ArrowRight className="h-5 w-5" />
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground">
              {benefits.map((benefit, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <benefit.icon className="h-4 w-4 text-emerald-500" />
                  {benefit.text}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 py-12 md:py-16">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-bold mb-3">Wszystko, czego potrzebuje warsztat</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Kompletny ERP dla warsztatu i studia detailingu z funkcjami AI, które oszczędzają godziny pracy każdego dnia.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
          {features.map((feature, idx) => {
            const Icon = feature.icon;
            return (
              <Card key={idx} className="hover:shadow-lg transition-shadow">
                <CardContent className="p-5 flex gap-4">
                  <div
                    className={`p-2.5 rounded-xl shrink-0 ${
                      feature.ai
                        ? "bg-gradient-to-br from-purple-500/20 to-primary/20"
                        : "bg-primary/10"
                    }`}
                  >
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold">{feature.title}</h3>
                      {feature.ai && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-purple-100 text-purple-700">
                          AI
                        </Badge>
                      )}
                      {(feature as any).soon && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700">
                          Wkrótce
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{feature.description}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Pricing */}
      <section className="container mx-auto px-4 py-12 md:py-16 bg-muted/30 rounded-3xl">
        <div className="text-center mb-10">
          <h2 className="text-3xl md:text-4xl font-bold mb-3">Wybierz pakiet</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Każdy pakiet zaczyna się od 14-dniowego darmowego okresu próbnego. Bez karty kredytowej.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {plans.map((plan) => (
            <Card
              key={plan.id}
              className={`relative ${
                plan.popular ? "border-primary border-2 shadow-xl scale-[1.02]" : ""
              }`}
            >
              {plan.popular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">
                  Najpopularniejszy
                </Badge>
              )}
              <CardContent className="p-6">
                <h3 className="text-2xl font-bold mb-1">{plan.name}</h3>
                <p className="text-sm text-muted-foreground mb-4 min-h-[40px]">{plan.description}</p>
                <div className="mb-6">
                  <span className="text-4xl font-bold">{plan.price} zł</span>
                  <span className="text-muted-foreground">{plan.period}</span>
                </div>
                <Button
                  className="w-full mb-6"
                  variant={plan.popular ? "default" : "outline"}
                  onClick={() => handleStartTrial(plan.id)}
                >
                  {plan.cta}
                </Button>
                <ul className="space-y-2">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-4 py-12 md:py-16">
        <Card className="bg-gradient-to-r from-primary to-purple-600 border-0 text-primary-foreground">
          <CardContent className="p-8 md:p-12 text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-3">
              Zacznij oszczędzać czas już dziś
            </h2>
            <p className="mb-6 opacity-90 max-w-xl mx-auto">
              14 dni za darmo, pełen dostęp do wszystkich funkcji. Bez karty, bez zobowiązań.
            </p>
            <Button
              size="lg"
              variant="secondary"
              onClick={() => handleStartTrial("pro")}
              className="gap-2"
            >
              <Wrench className="h-5 w-5" />
              Rozpocznij darmowy okres próbny
              <ArrowRight className="h-5 w-5" />
            </Button>
          </CardContent>
        </Card>
      </section>

      <AuthModal
        open={showLoginModal}
        onOpenChange={setShowLoginModal}
        initialMode={loginMode}
        redirectAfterLogin={`/uslugi?activate=warsztat${selectedPlan ? `&plan=${selectedPlan}` : ""}`}
      />
    </div>
  );
}

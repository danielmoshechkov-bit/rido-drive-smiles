import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wrench, Calculator, Truck, User, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { AuthModal } from "@/components/auth/AuthModal";

interface ProgramTile {
  icon: React.ElementType;
  title: string;
  description: string;
  features: string[];
  cta: string;
  redirect: string;
  color: string;
}

const programs: ProgramTile[] = [
  {
    icon: Wrench,
    title: "Warsztat i Detailing",
    description: "Pełny ERP serwisowy: zlecenia, magazyn części, terminarz, SMS do klientów. Także detailing.",
    features: ["Zlecenia i kosztorysy", "Magazyn z OCR faktur", "Terminarz online", "SMS i powiadomienia"],
    cta: "Zarejestruj warsztat",
    redirect: "/warsztat",
    color: "from-blue-500/10 to-blue-600/5",
  },
  {
    icon: Calculator,
    title: "Księgowość",
    description: "Faktury, KSeF (FA(3)), JPK_V7, rejestr VAT i automatyczne rozliczenia.",
    features: ["Faktury VAT i KSeF", "JPK_V7 i rejestr VAT", "Faktury zakupowe AI", "Korekty i noty"],
    cta: "Załóż konto księgowe",
    redirect: "/ksiegowosc",
    color: "from-emerald-500/10 to-emerald-600/5",
  },
  {
    icon: Truck,
    title: "Zarządzanie Flotą",
    description: "Rozliczenia kierowców Uber/Bolt, paliwo, długi tygodniowe, przelewy Santander.",
    features: ["Rozliczenia tygodniowe", "Import Uber/Bolt", "Karty paliwowe", "Przelewy bankowe"],
    cta: "Zarejestruj flotę",
    redirect: "/flota",
    color: "from-orange-500/10 to-orange-600/5",
  },
  {
    icon: User,
    title: "Portal Kierowcy",
    description: "Dla kierowców taxi/Uber/Bolt — rozliczenia, długi, dokumenty, wypłaty.",
    features: ["Twoje rozliczenia", "Historia wypłat", "Dokumenty i umowa", "Komunikacja z flotą"],
    cta: "Zarejestruj się jako kierowca",
    redirect: "/kierowca",
    color: "from-purple-500/10 to-purple-600/5",
  },
  {
    icon: Sparkles,
    title: "Wszystko-w-jednym (GetRido AI)",
    description: "Pełny ekosystem: CRM, nieruchomości, marketplace, marketing AI w jednym pakiecie.",
    features: ["CRM i sprzedaż", "Nieruchomości i ASARI", "RidoMarket", "Marketing & SEO AI"],
    cta: "Wypróbuj wszystko 14 dni",
    redirect: "/klient",
    color: "from-indigo-500/10 to-indigo-600/5",
  },
];

const NaszeProgramy = () => {
  const navigate = useNavigate();
  const [authOpen, setAuthOpen] = useState(false);
  const [redirectAfter, setRedirectAfter] = useState<string>("/klient");

  const handleClick = (redirect: string) => {
    setRedirectAfter(redirect);
    setAuthOpen(true);
  };

  return (
    <section id="programy" className="py-16 bg-gradient-to-b from-background to-muted/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Nasze programy do zarządzania firmą
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Wszystko w jednym ekosystemie GetRido — warsztat, księgowość, CRM, nieruchomości i marketing AI.
            Zarejestruj się i wybierz moduł, którego potrzebujesz.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {programs.map((p) => {
            const Icon = p.icon;
            return (
              <Card
                key={p.title}
                className={`group relative p-6 bg-gradient-to-br ${p.color} border-2 border-border/40 hover:border-primary/40 hover:shadow-lg transition-all duration-300 flex flex-col`}
              >
                <div className="flex items-start gap-3 mb-4">
                  <div className="p-3 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">{p.title}</h3>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-4">{p.description}</p>
                <ul className="space-y-1.5 mb-6 flex-1">
                  {p.features.map((f) => (
                    <li key={f} className="text-sm text-foreground flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Button
                  variant="default"
                  className="w-full"
                  onClick={() => handleClick(p.redirect)}
                >
                  {p.cta}
                </Button>
              </Card>
            );
          })}
        </div>

        <div className="text-center mt-10">
          <p className="text-sm text-muted-foreground">
            Masz już konto?{" "}
            <button
              onClick={() => handleClick("/klient")}
              className="text-primary font-semibold hover:underline"
            >
              Zaloguj się
            </button>
          </p>
        </div>
      </div>

      <AuthModal open={authOpen} onOpenChange={setAuthOpen} redirectAfterLogin={redirectAfter} />
    </section>
  );
};

export default NaszeProgramy;

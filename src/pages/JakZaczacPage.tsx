import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  UserPlus,
  LayoutGrid,
  Megaphone,
  HandCoins,
  Car,
  Home,
  Wrench,
  Briefcase,
  ShoppingCart,
  FileText,
  Sparkles,
} from "lucide-react";

const steps = [
  {
    n: 1,
    icon: UserPlus,
    title: "Załóż konto",
    desc: "Rejestracja w 1 minutę — e-mail lub numer telefonu. Bez karty kredytowej.",
  },
  {
    n: 2,
    icon: LayoutGrid,
    title: "Wybierz co chcesz robić",
    desc: "Wystaw ogłoszenie (auto, nieruchomość, przedmiot) lub dodaj swoją usługę.",
  },
  {
    n: 3,
    icon: Megaphone,
    title: "Publikuj i promuj",
    desc: "Wystaw za darmo lub wybierz pakiet z podbiciami. Klienci widzą Cię od razu.",
  },
  {
    n: 4,
    icon: HandCoins,
    title: "Zarabiaj",
    desc: "Rozliczasz transakcje w panelu. W usługach płacisz tylko 5% od zarobku.",
  },
];

const paths = [
  {
    icon: Car,
    title: "Sprzedaj auto",
    desc: "Wystaw ogłoszenie samochodowe od 25 zł / 30 dni z oceną AI ceny.",
    to: "/gielda",
    cta: "Wystaw auto",
  },
  {
    icon: Home,
    title: "Sprzedaj / wynajmij nieruchomość",
    desc: "Plany dla osób prywatnych i agencji. AI Wycena, Voice Tour 360°.",
    to: "/nieruchomosci",
    cta: "Dodaj nieruchomość",
  },
  {
    icon: Briefcase,
    title: "Wystaw usługę",
    desc: "Za darmo. Płacisz tylko 5% od zarobku gdy zrealizujesz zlecenie z platformy.",
    to: "/uslugi",
    cta: "Dodaj usługę",
  },
  {
    icon: Wrench,
    title: "Prowadzisz warsztat?",
    desc: "System ERP do warsztatu — kalendarz, części, faktury, KSeF, AI wycena.",
    to: "/cennik",
    cta: "Zobacz plany",
  },
  {
    icon: ShoppingCart,
    title: "Sprzedaj rzeczy",
    desc: "Marketplace lokalny — pierwsze 5 ogłoszeń miesięcznie za darmo.",
    to: "/gielda",
    cta: "Sprzedaj coś",
  },
  {
    icon: FileText,
    title: "Faktury i KSeF",
    desc: "Moduł księgowości z integracją KSeF FA(3) i AI asystentem.",
    to: "/faktury",
    cta: "Otwórz faktury",
  },
];

const JakZaczacPage = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        {/* Hero */}
        <section className="bg-gradient-hero py-14">
          <div className="container mx-auto px-4 text-center text-primary-foreground">
            <Badge className="mb-4 bg-white/20 text-white border-white/30 hover:bg-white/30">
              <Sparkles className="h-3 w-3 mr-1" />
              Jak zacząć z GetRido
            </Badge>
            <h1 className="text-3xl md:text-5xl font-bold mb-3">
              Zacznij w 4 prostych krokach
            </h1>
            <p className="text-lg md:text-xl text-primary-foreground/90 max-w-2xl mx-auto">
              Platforma ogłoszeniowo-usługowa: sprzedawaj, wynajmuj, świadcz usługi
              i zarządzaj swoim biznesem w jednym miejscu.
            </p>
          </div>
        </section>

        {/* 4 steps */}
        <section className="py-14">
          <div className="container mx-auto px-4">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
              {steps.map((s) => {
                const Icon = s.icon;
                return (
                  <Card
                    key={s.n}
                    className="p-6 text-center hover:shadow-purple transition-all duration-300 hover:-translate-y-1"
                  >
                    <div className="w-14 h-14 rounded-full bg-gradient-hero text-primary-foreground flex items-center justify-center mx-auto mb-4">
                      <Icon className="h-7 w-7" />
                    </div>
                    <div className="text-xs font-semibold text-primary mb-1">
                      KROK {s.n}
                    </div>
                    <h3 className="font-bold text-foreground mb-2">{s.title}</h3>
                    <p className="text-sm text-muted-foreground">{s.desc}</p>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Choose your path */}
        <section className="py-14 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="text-center mb-10">
              <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-2">
                Wybierz swoją ścieżkę
              </h2>
              <p className="text-muted-foreground">
                GetRido łączy kilka portali w jednym koncie — wybierz to, czego potrzebujesz.
              </p>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
              {paths.map((p) => {
                const Icon = p.icon;
                return (
                  <Card
                    key={p.title}
                    className="p-6 flex flex-col hover:shadow-purple transition-all duration-300 hover:-translate-y-1"
                  >
                    <div className="w-12 h-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4">
                      <Icon className="h-6 w-6" />
                    </div>
                    <h3 className="font-bold text-foreground mb-2">{p.title}</h3>
                    <p className="text-sm text-muted-foreground mb-4 flex-1">{p.desc}</p>
                    <Button asChild variant="outline" className="w-full">
                      <Link to={p.to}>{p.cta}</Link>
                    </Button>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Why GetRido */}
        <section className="py-14">
          <div className="container mx-auto px-4 max-w-4xl">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground text-center mb-8">
              Dlaczego GetRido?
            </h2>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { t: "Tańsze niż konkurencja", d: "Auta 50% taniej niż Otomoto, agencje nieruchomości 87% taniej niż Otodom." },
                { t: "Płacisz tylko gdy zarobisz", d: "W usługach nie ma abonamentu — tylko 5% prowizji od zrealizowanego zlecenia." },
                { t: "Jedno konto, wszystkie portale", d: "Auta, nieruchomości, usługi, marketplace, księgowość — w jednym miejscu." },
                { t: "Wbudowane AI", d: "AI wycena, ocena zdjęć, opisy, raporty dzielnic, asystent telefoniczny." },
              ].map((b) => (
                <Card key={b.t} className="p-5">
                  <h3 className="font-bold text-foreground mb-1">✓ {b.t}</h3>
                  <p className="text-sm text-muted-foreground">{b.d}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-muted py-12">
          <div className="container mx-auto px-4 text-center">
            <h3 className="text-2xl font-bold text-foreground mb-3">
              Gotowy żeby zacząć?
            </h3>
            <p className="text-muted-foreground mb-6">
              Załóż darmowe konto i wystaw pierwsze ogłoszenie w kilka minut.
            </p>
            <div className="flex flex-wrap gap-3 justify-center">
              <Button asChild variant="accent" size="lg">
                <Link to="/auth">Załóż darmowe konto</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/cennik">Zobacz cennik</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
};

export default JakZaczacPage;

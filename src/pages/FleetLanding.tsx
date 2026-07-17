import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Car,
  FileText,
  Users,
  Bell,
  Shield,
  Calculator,
  BarChart3,
  Clock,
  Building2,
  Check,
  ArrowRight,
  Sparkles,
  Zap,
  ChevronDown,
  Star,
  Wallet,
  Fuel,
  Receipt,
} from "lucide-react";
import { UniversalHomeButton } from "@/components/UniversalHomeButton";
import tileFleet from "@/assets/tile-fleet.jpg";
import tileDriver from "@/assets/tile-driver.jpg";

const mascot = "/mascot-getrido.png";

type Feature = { icon: any; title: string; description: string; img: string; ai?: boolean };

export default function FleetLanding() {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setIsLoggedIn(!!session));
  }, []);

  const features: Feature[] = [
    { icon: Calculator, title: "Automatyczne rozliczenia", description: "Import CSV z Uber/Bolt/FreeNow, tygodniowe rozliczenia z każdym kierowcą, historia płatności.", img: tileFleet, ai: true },
    { icon: Users, title: "Kierowcy i umowy", description: "Baza kierowców z umowami najmu, historia wynajmu, generator dokumentów.", img: tileDriver },
    { icon: Car, title: "Pojazdy i historia napraw", description: "Pełna dokumentacja serwisowa każdego auta — zawsze udowodnisz co i kiedy było robione.", img: tileFleet },
    { icon: FileText, title: "Dokumenty w chmurze", description: "OC, przeglądy, dowody rejestracyjne, umowy — zawsze pod ręką, nigdy nie zgubisz.", img: tileFleet },
    { icon: Bell, title: "Przypomnienia OC/przeglądów", description: "Nigdy nie zapomnisz o przeglądzie, ubezpieczeniu czy końcu umowy z kierowcą.", img: tileFleet },
    { icon: Shield, title: "Oferty OC/AC od agentów", description: "Gdy zbliża się koniec OC, agenci z całej Polski konkurują o Twoje zlecenie. Średnio 15% oszczędności.", img: tileFleet },
    { icon: Fuel, title: "Karty paliwowe", description: "Import transakcji, mapowanie do kierowców i pojazdów, kontrola nadużyć.", img: tileDriver },
    { icon: Wallet, title: "Długi i wpłaty kierowców", description: "Automatyczne opening_debt, historia rozliczeń, transparentne salda tygodniowe.", img: tileFleet },
    { icon: Receipt, title: "B2B faktury dla kierowców", description: "System sam generuje faktury VAT dla kierowców-B2B (JDG) — zero ręcznej pracy.", img: tileDriver, ai: true },
    { icon: BarChart3, title: "Statystyki i rentowność", description: "Przychody, koszty, marża na każdym aucie — decyzje oparte na danych, nie na przeczuciu.", img: tileFleet },
    { icon: Clock, title: "Koniec z Excelem", description: "Wszystko w jednym miejscu — koniec z papierologią i 20 arkuszami kalkulacyjnymi.", img: tileFleet },
    { icon: Building2, title: "Partnerzy i podflocy", description: "Zarządzanie partnerami flotowymi z izolacją danych i osobnymi rozliczeniami.", img: tileFleet },
  ];

  const wowStats = [
    { icon: Calculator, badge: "AUTO", value: "Rozliczenia Uber/Bolt", label: "Import CSV — tygodniowe rozliczenie z każdym kierowcą gotowe w minutę." },
    { icon: Shield, badge: "OSZCZĘDNOŚĆ", value: "Oferty OC od agentów", label: "Średnio 15% mniej na ubezpieczeniu — agenci konkurują o Twoją flotę." },
    { icon: Receipt, badge: "B2B", value: "Faktury dla kierowców", label: "Automatyczne wystawianie faktur VAT dla kierowców-JDG z NIP-em." },
    { icon: BarChart3, badge: "MARŻA", value: "Rentowność na aucie", label: "Widzisz, które auto zarabia, a które dokłada — nie zgadujesz." },
  ];

  const benefits = [
    { icon: Zap, text: "Rejestracja bezpłatna" },
    { icon: Shield, text: "Polska chmura, RODO" },
    { icon: Clock, text: "Dostęp 24/7, każde urządzenie" },
    { icon: Users, text: "Bez limitu kierowców" },
  ];

  const faq = [
    { q: "Ile kosztuje Portal Flot?", a: "Rejestracja i podstawowe funkcje zarządzania flotą są bezpłatne. Płatne pakiety pojawiają się dopiero przy zaawansowanych automatyzacjach i modułach AI." },
    { q: "Czy importuje rozliczenia z Uber, Bolt i FreeNow?", a: "Tak. Wrzucasz CSV z panelu przewoźnika — system dopasowuje kierowców po driver_platform_ids, tworzy tygodniowe rozliczenia i faktury B2B." },
    { q: "Jak działają oferty OC/AC?", a: "Na ~30 dni przed końcem ubezpieczenia Twoje auto trafia do sieci agentów. Dostajesz oferty od kilku firm, wybierasz najkorzystniejszą. Średnio 15% taniej." },
    { q: "Czy dane są bezpieczne?", a: "Tak. Polska chmura zgodna z RODO, szyfrowanie w spoczynku i transporcie, codzienne backupy, RLS na poziomie bazy danych." },
    { q: "Mogę mieć wielu partnerów flotowych?", a: "Tak. System obsługuje strukturę partnerów i podflot z pełną izolacją danych i osobnymi rozliczeniami." },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <UniversalHomeButton />
          <div className="flex items-center gap-2">
            {isLoggedIn ? (
              <>
                <Button variant="ghost" size="sm" onClick={() => navigate("/klient")}>Moje konto</Button>
                <Button size="sm" onClick={() => navigate("/fleet/rejestracja")}>Zarejestruj flotę</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => navigate("/auth")}>Zaloguj się</Button>
                <Button size="sm" onClick={() => navigate("/fleet/rejestracja")}>Zarejestruj flotę</Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-purple-500/5 to-background">
        <div className="absolute inset-0 opacity-[0.07] bg-cover bg-center pointer-events-none" style={{ backgroundImage: `url(${tileFleet})` }} />
        <div className="relative container mx-auto px-4 py-12 md:py-20">
          <div className="grid md:grid-cols-2 gap-8 items-center max-w-6xl mx-auto">
            <div className="text-center md:text-left order-2 md:order-1">
              <Badge className="mb-4 bg-primary/10 text-primary border-primary/20 text-sm px-4 py-1">
                <Sparkles className="h-3.5 w-3.5 mr-1" />
                Rejestracja bezpłatna
              </Badge>

              <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold mb-5 leading-tight">
                <span>Zarządzanie flotą</span>
                <br />
                <span className="bg-gradient-to-r from-primary via-purple-600 to-primary bg-clip-text text-transparent">
                  pod pełną kontrolą
                </span>
              </h1>

              <p className="text-xl md:text-2xl font-medium text-slate-800 dark:text-slate-100 mb-6 leading-relaxed">
                Za wszystkim stoi <strong className="font-bold text-primary">RidoAI</strong> — importuje rozliczenia z Uber/Bolt/FreeNow, wystawia faktury B2B kierowcom, przypomina o OC i podsuwa najlepsze oferty ubezpieczeń. Koniec z Excelem.
              </p>

              <div className="flex flex-wrap items-center gap-4 mb-6 justify-center md:justify-start">
                <div className="flex items-center gap-1 text-amber-500">
                  {[0, 1, 2, 3, 4].map((i) => <Star key={i} className="h-4 w-4 fill-current" />)}
                </div>
                <span className="text-sm text-muted-foreground">
                  <strong className="text-foreground">4.9/5</strong> · zaufały nam floty w całej Polsce
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center md:justify-start gap-3">
                <Button size="lg" className="w-full sm:w-auto gap-2 text-base px-8 py-6 bg-gradient-to-r from-primary to-purple-600 hover:opacity-90" onClick={() => navigate("/fleet/rejestracja")}>
                  <Building2 className="h-5 w-5" />
                  Zarejestruj flotę
                  <ArrowRight className="h-5 w-5" />
                </Button>
                <Button size="lg" variant="ghost" className="w-full sm:w-auto" onClick={() => document.getElementById("funkcje")?.scrollIntoView({ behavior: "smooth" })}>
                  Zobacz funkcje
                </Button>
              </div>
            </div>

            <div className="order-1 md:order-2 flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-purple-500/20 blur-3xl rounded-full" />
                <img src={mascot} alt="GetRido Fleet" className="relative w-72 md:w-[26rem] lg:w-[32rem] drop-shadow-2xl" />
              </div>
            </div>
          </div>

          <div className="max-w-6xl mx-auto mt-12">
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">To nas wyróżnia</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {wowStats.map((s, i) => (
                <div key={i} className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-purple-950 border border-primary/30 shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all">
                  <div className="absolute -top-16 -right-16 h-40 w-40 rounded-full bg-primary/20 blur-3xl group-hover:bg-primary/30 transition-colors" />
                  <div className="relative p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center shadow-lg shadow-primary/30">
                        <s.icon className="h-6 w-6 text-white" />
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-primary-foreground bg-primary/90 px-2.5 py-1 rounded-full">{s.badge}</span>
                    </div>
                    <div className="text-xl md:text-2xl font-extrabold text-white leading-tight mb-2">{s.value}</div>
                    <div className="text-base font-medium text-slate-200 leading-relaxed">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-base font-semibold text-slate-700 dark:text-slate-200 mt-8">
            {benefits.map((b, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <b.icon className="h-5 w-5 text-emerald-500" />
                {b.text}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="funkcje" className="container mx-auto px-4 py-16 md:py-24">
        <div className="text-center mb-12">
          <Badge variant="secondary" className="mb-3">Funkcje</Badge>
          <h2 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight">Wszystko, czego potrzebuje flota</h2>
          <p className="text-lg md:text-xl font-medium text-slate-700 dark:text-slate-200 max-w-2xl mx-auto leading-relaxed">
            Kompletny system dla właścicieli flot rideshare, wynajmu i flot firmowych.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
          {features.map((feature, idx) => {
            const Icon = feature.icon;
            return (
              <div key={idx} className="group relative rounded-2xl overflow-hidden border bg-card shadow-sm hover:shadow-xl transition-all hover:-translate-y-1 flex flex-col">
                <div className="relative aspect-[16/10] overflow-hidden">
                  <img src={feature.img} alt={feature.title} className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
                  {feature.ai && (
                    <Badge className="absolute top-2 right-2 bg-purple-600 hover:bg-purple-600 text-white border-0 shadow-md text-[10px] px-2 py-0.5">
                      <Sparkles className="h-3 w-3 mr-1" /> AI
                    </Badge>
                  )}
                </div>
                <div className="p-4 bg-white dark:bg-card border-t">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                    <h3 className="font-extrabold text-base md:text-lg text-slate-900 dark:text-foreground leading-tight">{feature.title}</h3>
                  </div>
                  <p className="text-sm md:text-base font-medium text-slate-700 dark:text-slate-100 leading-snug">{feature.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Insurance highlight */}
      <section className="bg-gradient-to-br from-primary/5 via-purple-500/5 to-background py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="text-center">
            <Badge className="mb-3 bg-primary text-primary-foreground">Tylko u nas</Badge>
            <h2 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight">
              Nigdy nie <span className="bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">przepłacisz za OC</span>
            </h2>
            <p className="text-lg md:text-xl font-medium text-slate-700 dark:text-slate-200 mb-8 leading-relaxed">
              Gdy zbliża się koniec ubezpieczenia Twojego auta, automatycznie otrzymujesz oferty od agentów z całej Polski. Ty wybierasz — oni konkurują o Twoje zlecenie.
            </p>
            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { icon: Shield, title: "~15% oszczędności", text: "Średnia różnica między najdroższą a najtańszą ofertą" },
                { icon: Zap, title: "Automatyczne oferty", text: "System sam wysyła zapytania do sieci agentów" },
                { icon: Check, title: "Ty decydujesz", text: "Widzisz wszystkie oferty w jednym miejscu i wybierasz" },
              ].map((f, i) => (
                <Card key={i} className="border-primary/10">
                  <CardContent className="p-5 text-center">
                    <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center mb-3 mx-auto">
                      <f.icon className="h-6 w-6 text-white" />
                    </div>
                    <h3 className="font-extrabold text-lg mb-1">{f.title}</h3>
                    <p className="text-sm text-slate-700 dark:text-slate-200">{f.text}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-muted/30 py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="text-center mb-10">
            <Badge variant="secondary" className="mb-3">FAQ</Badge>
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight">Najczęściej zadawane pytania</h2>
          </div>
          <div className="space-y-2">
            {faq.map((item, i) => (
              <Card key={i} className="border">
                <button className="w-full text-left p-5 flex items-center justify-between gap-3" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  <span className="font-bold text-base md:text-lg text-slate-900 dark:text-foreground">{item.q}</span>
                  <ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${openFaq === i ? "rotate-180" : ""}`} />
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-5 text-base font-medium text-slate-700 dark:text-slate-200 leading-relaxed">{item.a}</div>
                )}
              </Card>
            ))}
          </div>

          <div className="mt-12 text-center">
            <Button size="lg" onClick={() => navigate("/fleet/rejestracja")} className="gap-3 h-16 md:h-20 px-8 md:px-14 text-lg md:text-2xl font-extrabold rounded-2xl bg-gradient-to-r from-primary via-purple-600 to-primary text-primary-foreground shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all">
              <Building2 className="h-6 w-6 md:h-7 md:w-7" />
              Zarejestruj flotę
              <ArrowRight className="h-6 w-6 md:h-7 md:w-7" />
            </Button>
            <p className="mt-4 text-sm md:text-base font-medium text-slate-600 dark:text-slate-300">
              Rejestracja bezpłatna · aktywacja w minutę
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

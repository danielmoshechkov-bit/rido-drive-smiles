import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { activateWorkshopTrial } from "@/services/authService";
import { toast } from "sonner";
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
  PhoneCall,
  Megaphone,
  Star,
  ChevronDown,
  History,
  FileText,
  Store,
} from "lucide-react";
import { AuthModal } from "@/components/auth/AuthModal";
import { UniversalHomeButton } from "@/components/UniversalHomeButton";
import tileWorkshop from "@/assets/tile-workshop.jpg";
import tileDetailing from "@/assets/tile-detailing.jpg";
import tilePpf from "@/assets/tile-ppf.jpg";
import tileZlecenia from "@/assets/workshop/tile-zlecenia.jpg";
import tileTerminarz from "@/assets/workshop/tile-terminarz.jpg";
import tileMagazyn from "@/assets/workshop/tile-magazyn.jpg";
import tileKlienci from "@/assets/workshop/tile-klienci.jpg";
import tilePojazdy from "@/assets/workshop/tile-pojazdy.jpg";
import tileRaporty from "@/assets/workshop/tile-raporty.jpg";
import tileSprzedaz from "@/assets/workshop/tile-sprzedaz.jpg";
import tileDaneNaprawcze from "@/assets/workshop/tile-dane-naprawcze.jpg";
import tilePracownicy from "@/assets/workshop/tile-pracownicy.jpg";
import tileKsef from "@/assets/accounting/tile-ksef.jpg";
import tileFaktury from "@/assets/accounting/tile-faktury.jpg";

const mascot = "/mascot-getrido.png";
const mascotMechanic = "/mascot-mechanic.png";
const mascotDetailer = "/mascot-detailer.png";

type Feature = {
  icon: any;
  title: string;
  description: string;
  img: string;
  ai?: boolean;
  soon?: boolean;
};

export default function WorkshopLanding() {
  const navigate = useNavigate();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginMode, setLoginMode] = useState<"login" | "register">("register");
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isProvider, setIsProvider] = useState(false);
  const [activating, setActivating] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setIsProvider(false);
      return;
    }
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", session.user.id)
      .eq("role", "service_provider")
      .maybeSingle()
      .then(({ data }) => setIsProvider(!!data));
  }, [session]);

  const handleStartTrial = async (plan: string) => {
    setSelectedPlan(plan);
    if (!session) {
      setLoginMode("register");
      setShowLoginModal(true);
      return;
    }
    if (isProvider) {
      navigate("/uslugi/panel");
      return;
    }
    setActivating(true);
    try {
      const result = await activateWorkshopTrial(plan);
      if (result.success) {
        toast.success("Moduł warsztatowy aktywowany! Trwa 14-dniowy okres próbny.");
        navigate("/uslugi/panel");
      } else {
        toast.error(result.error);
      }
    } finally {
      setActivating(false);
    }
  };

  const features: Feature[] = [
    { icon: Wrench, title: "Zlecenia i kosztorysy", description: "Pełna obsługa zlecenia – od przyjęcia auta, przez wycenę, po wydanie. Podpis cyfrowy klienta.", img: tileZlecenia },
    { icon: Brain, title: "Wyceny AI", description: "Inteligentne sugestie cen części i robocizny na bazie tysięcy historycznych zleceń.", ai: true, img: tileDaneNaprawcze },
    { icon: PhoneCall, title: "Wirtualny asystent AI", description: "Odbiera telefon, prowadzi rozmowę, umawia klienta w Twoim terminarzu i zapisuje skrypt — działa 24/7, kiedy jesteś zajęty.", ai: true, img: tileKlienci },
    { icon: Calendar, title: "Inteligentna rezerwacja", description: "Kalendarz ze stanowiskami, auto-SMS 24h i 2h przed wizytą, link ICS do kalendarza klienta.", img: tileTerminarz },
    { icon: History, title: "Historia napraw i dokumentów", description: "Każde auto ma pełną historię: zlecenia, części, faktury zakupowe. Koniec ze sporami — zawsze udowodnisz co i kiedy było robione.", img: tilePojazdy },
    { icon: Store, title: "Portal usług GetRido — nowi klienci", description: "Twój warsztat trafia do klientów szukających usług na portalu GetRido. Dostajesz leady, których wcześniej nie miałeś.", img: tileSprzedaz },
    { icon: Search, title: "Sprawdzanie aut po nr rej.", description: "VIN, model, pojemność, moc, rok — automatycznie z RegCheck jednym kliknięciem.", ai: true, img: tilePojazdy },
    { icon: Package, title: "Magazyn części z OCR", description: "Skanuj faktury zakupowe — AI rozpoznaje pozycje i aktualizuje magazyn.", ai: true, img: tileMagazyn },
    { icon: Camera, title: "Zdjęcia przyjęcia auta", description: "Dokumentacja stanu pojazdu przy odbiorze – zabezpieczenie przed reklamacjami.", img: tileWorkshop },
    { icon: Receipt, title: "Faktury i KSeF", description: "Integracja z modułem księgowym – jednym kliknięciem wystawiasz fakturę FA(3).", img: tileFaktury },
    { icon: Droplets, title: "Detailing & PPF", description: "Dedykowane workflow dla studiów detailingu, ceramiki i folii ochronnych.", img: tileDetailing },
    { icon: TrendingUp, title: "Analiza rentowności", description: "Marże, czasy pracy mechaników, najlepsi klienci – pełne statystyki biznesu.", img: tileRaporty },
    { icon: Users, title: "Pracownicy i uprawnienia", description: "Rozliczaj mechaników z 15-minutową dokładnością. Role, dostęp, prowizje.", img: tilePracownicy },
  ];

  const soonFeatures = [
    { icon: Package, title: "Auto-zamówienia z hurtowni", description: "Zamawianie części Inter Cars, Hart, Auto Partner jednym klikiem." },
    { icon: Megaphone, title: "AI asystent reklamowy", description: "Generuje kampanie Meta/Google Ads i optymalizuje budżet." },
  ];

  const benefits = [
    { icon: Zap, text: "14 dni za darmo, bez karty" },
    { icon: Shield, text: "Polska chmura, RODO" },
    { icon: Clock, text: "Dostęp 24/7, każde urządzenie" },
    { icon: Users, text: "Bez limitu klientów" },
  ];

  // "Efekt WOW" — to nas wyróżnia, nie suche procenty
  const wowStats = [
    { icon: PhoneCall, badge: "NOWOŚĆ", value: "Wirtualny asystent AI", label: "Odbiera telefon, umawia klienta, prowadzi rozmowę — 24/7." },
    { icon: Store, badge: "TYLKO U NAS", value: "Portal klientów GetRido", label: "Dostarczamy Ci klientów z naszego portalu usług." },
    { icon: History, badge: "KONIEC SPORÓW", value: "Historia napraw i faktur", label: "Zawsze sprawdzisz co, kiedy i z jakiej faktury poszło w auto." },
    { icon: FileText, badge: "AI", value: "Skrypty rozmów zapisane", label: "Nagrania i transkrypcje rozmów zawsze pod ręką." },
  ];

  const testimonials = [
    { name: "Marcin K.", role: "Właściciel warsztatu, Warszawa", text: "Od miesiąca korzystamy z GetRido — magazyn i terminarz sam się prowadzi. Klienci są w szoku, że dostają SMS-a dzień wcześniej." },
    { name: "Studio DetailPro", role: "Detailing, Kraków", text: "Wreszcie system, który rozumie detailing. Zdjęcia przed/po, checklisty ceramiki — wszystko jest." },
    { name: "Ania M.", role: "Recepcja, serwis Kia", text: "Przeszliśmy z Excela na GetRido w 2 dni. Nikt nie chce wracać." },
  ];

  const faq = [
    { q: "Czy potrzebuję karty kredytowej, żeby wypróbować?", a: "Nie. Pełne 14 dni bez karty, bez zobowiązań. Po okresie próbnym decydujesz, czy chcesz kontynuować." },
    { q: "Czy moje dane są bezpieczne?", a: "Tak. Dane są przechowywane w polskiej chmurze zgodnej z RODO, szyfrowane w spoczynku i w transporcie. Codzienne backupy." },
    { q: "Czy mogę importować dane z innego systemu?", a: "Tak. Wspieramy import klientów, pojazdów i historii z plików CSV/Excel. W razie potrzeby pomożemy przy migracji." },
    { q: "Czy KSeF jest już wbudowany?", a: "Tak. Wystawianie i wysyłka FA(3), monitoring statusów oraz alerty MF są dostępne od pakietu Warsztat." },
    { q: "Ile kosztuje SMS do klienta?", a: "SMS-y rozliczane są z Twojego pakietu SMS (kupujesz osobno). System pokazuje saldo i historię wysyłek." },
  ];

  const plans = [
    { id: "start", name: "Start", price: "0", period: "/mies.", description: "Na start — dla małych warsztatów i jednoosobowych studiów.", features: ["20 zleceń/mc", "Klienci + pojazdy", "Terminarz", "Zdjęcia przy przyjęciu", "10 sprawdzeń VIN", "3 pytania AI/mc"], cta: "Zacznij za darmo" },
    { id: "warsztat", name: "Warsztat", popular: true, price: "99", period: "netto/mies.", description: "Najczęściej wybierany. Dla rozwijających się warsztatów.", features: ["Zlecenia bez limitu", "Magazyn + przechowalnia", "Sprzedaż + faktury", "Raporty + marża live", "KSeF basic", "20 pytań AI/mc"], cta: "Wypróbuj 14 dni" },
    { id: "pro", name: "Warsztat Pro", price: "175", period: "netto/mies.", description: "Dane naprawcze, czas pracy mechanika i zaawansowane raporty.", features: ["Dane naprawcze (TecRMI)", "Czas pracy mechanika", "50 pytań AI/mc", "KSeF pełny + wysyłka", "Zaawansowane raporty", "Priorytetowy support"], cta: "Wypróbuj 14 dni" },
    { id: "ai", name: "GetRido AI", price: "249", period: "netto/mies.", description: "Pełna automatyzacja z księgowością i nieograniczonym AI.", features: ["Księgowość AI", "30 faktur/mc auto-odczyt", "Doradca podatkowy AI", "Nieograniczone AI", "KSeF monitor + alerty", "Dedykowany opiekun"], cta: "Wypróbuj 14 dni" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <UniversalHomeButton />
          <div className="flex items-center gap-2">
            {session ? (
              isProvider ? (
                <Button size="sm" onClick={() => navigate("/uslugi/panel")}>Przejdź do panelu</Button>
              ) : (
                <>
                  <Button variant="ghost" size="sm" onClick={() => navigate("/klient")}>Moje konto</Button>
                  <Button size="sm" disabled={activating} onClick={() => handleStartTrial("pro")}>
                    {activating ? "Aktywuję..." : "Aktywuj 14 dni"}
                  </Button>
                </>
              )
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => { setLoginMode("login"); setShowLoginModal(true); }}>Zaloguj się</Button>
                <Button size="sm" onClick={() => handleStartTrial("pro")}>Zarejestruj się</Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-purple-500/5 to-background">
        <div
          className="absolute inset-0 opacity-[0.07] bg-cover bg-center pointer-events-none"
          style={{ backgroundImage: `url(${tileWorkshop})` }}
        />
        <div className="relative container mx-auto px-4 py-12 md:py-20">
          <div className="grid md:grid-cols-2 gap-8 items-center max-w-6xl mx-auto">
            <div className="text-center md:text-left order-2 md:order-1">
              <Badge className="mb-4 bg-primary/10 text-primary border-primary/20 text-sm px-4 py-1">
                <Sparkles className="h-3.5 w-3.5 mr-1" />
                14 dni za darmo · bez karty
              </Badge>

              <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold mb-5 leading-tight">
                Warsztat i detailing<br />
                <span className="bg-gradient-to-r from-primary via-purple-600 to-primary bg-clip-text text-transparent">
                  pod pełną kontrolą
                </span>
              </h1>

              <p className="text-xl md:text-2xl font-medium text-slate-800 dark:text-slate-100 mb-6 leading-relaxed">
                Za wszystkim stoi <strong className="font-bold text-primary">RidoAI</strong> — nasza sztuczna inteligencja, która pomaga Ci na każdym kroku. Zlecenia, terminy, SMS-y do klientów, magazyn z OCR, wyceny AI i sprawdzanie aut po numerze rejestracyjnym — wszystko w jednym systemie stworzonym w Polsce.
              </p>

              <div className="flex flex-wrap items-center gap-4 mb-6 justify-center md:justify-start">
                <div className="flex items-center gap-1 text-amber-500">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Star key={i} className="h-4 w-4 fill-current" />
                  ))}
                </div>
                <span className="text-sm text-muted-foreground">
                  <strong className="text-foreground">4.9/5</strong> · zaufali nam warsztaty w całej Polsce
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center md:justify-start gap-3">
                <Button
                  size="lg"
                  className="w-full sm:w-auto gap-2 text-base px-8 py-6 bg-gradient-to-r from-primary to-purple-600 hover:opacity-90"
                  disabled={activating}
                  onClick={() => handleStartTrial("pro")}
                >
                  <Wrench className="h-5 w-5" />
                  {activating ? "Aktywuję..." : session && isProvider ? "Przejdź do panelu" : "Wypróbuj 14 dni za darmo"}
                  <ArrowRight className="h-5 w-5" />
                </Button>
                <Button size="lg" variant="ghost" className="w-full sm:w-auto" onClick={() => {
                  document.getElementById("funkcje")?.scrollIntoView({ behavior: "smooth" });
                }}>
                  Zobacz funkcje
                </Button>
              </div>
            </div>

            <div className="order-1 md:order-2 flex justify-center">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-purple-500/20 blur-3xl rounded-full" />
                <img
                  src={mascotMechanic}
                  alt="GetRido mechanik"
                  className="relative w-56 md:w-80 lg:w-96 drop-shadow-2xl"
                />
              </div>
            </div>
          </div>

          {/* Efekt WOW — to nas wyróżnia */}
          <div className="max-w-6xl mx-auto mt-12">
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                Nowość · tego nie ma nikt inny
              </span>
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
                      <span className="text-[10px] font-bold uppercase tracking-widest text-primary-foreground bg-primary/90 px-2.5 py-1 rounded-full">
                        {s.badge}
                      </span>
                    </div>
                    <div className="text-xl md:text-2xl font-extrabold text-white leading-tight mb-2">
                      {s.value}
                    </div>
                    <div className="text-base font-medium text-slate-200 leading-relaxed">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* benefits chips */}
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-base font-semibold text-slate-700 dark:text-slate-200 mt-8">
            {benefits.map((benefit, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <benefit.icon className="h-5 w-5 text-emerald-500" />
                {benefit.text}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features with real photo tiles */}
      <section id="funkcje" className="container mx-auto px-4 py-16 md:py-24">
        <div className="text-center mb-12">
          <Badge variant="secondary" className="mb-3">Funkcje</Badge>
          <h2 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight">Wszystko, czego potrzebuje warsztat</h2>
          <p className="text-lg md:text-xl font-medium text-slate-700 dark:text-slate-200 max-w-2xl mx-auto leading-relaxed">
            Kompletny ERP dla warsztatu i studia detailingu z funkcjami AI, które oszczędzają godziny pracy każdego dnia.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-6xl mx-auto">
          {features.map((feature, idx) => {
            const Icon = feature.icon;
            return (
              <div
                key={idx}
                className="group relative rounded-2xl overflow-hidden border bg-card shadow-sm hover:shadow-xl transition-all hover:-translate-y-1 flex flex-col"
              >
                <div className="relative aspect-[16/10] overflow-hidden">
                  <img
                    src={feature.img}
                    alt={feature.title}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    loading="lazy"
                  />
                  {feature.ai && (
                    <Badge className="absolute top-3 right-3 bg-purple-600 hover:bg-purple-600 text-white border-0 shadow-md">
                      <Sparkles className="h-3 w-3 mr-1" /> AI
                    </Badge>
                  )}
                </div>

                <div className="p-5 bg-white dark:bg-card border-t">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="font-extrabold text-lg md:text-xl text-slate-900 dark:text-foreground">{feature.title}</h3>
                  </div>
                  <p className="text-base font-medium text-slate-700 dark:text-slate-200 leading-relaxed">{feature.description}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Wkrótce */}
        <div className="mt-12 max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <Badge variant="secondary" className="bg-amber-100 text-amber-700 hover:bg-amber-100">Wkrótce</Badge>
            <h3 className="text-lg font-semibold">Na horyzoncie</h3>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {soonFeatures.map((f, i) => (
              <Card key={i} className="border-dashed">
                <CardContent className="p-4">
                  <f.icon className="h-5 w-5 text-primary mb-2" />
                  <h4 className="font-semibold text-sm mb-1">{f.title}</h4>
                  <p className="text-xs text-muted-foreground">{f.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Modules showcase — visual */}
      <section className="bg-muted/30 py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <Badge variant="secondary" className="mb-3">Jak to działa</Badge>
            <h2 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight">Cały warsztat w kilku kliknięciach</h2>
            <p className="text-lg md:text-xl font-medium text-slate-700 dark:text-slate-200 max-w-2xl mx-auto leading-relaxed">
              Od telefonu klienta, przez przyjęcie auta, po wystawienie faktury KSeF — wszystko w jednym miejscu.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
            {[
              { img: tileTerminarz, step: "1", title: "Terminarz", text: "Klient rezerwuje wizytę online lub przez telefon — pojawia się w kalendarzu ze stanowiskiem." },
              { img: tileZlecenia, step: "2", title: "Zlecenie", text: "Przyjmujesz auto, robisz zdjęcia, klient podpisuje cyfrowo. Wycena AI podpowiada ceny." },
              { img: tileMagazyn, step: "3", title: "Magazyn OCR", text: "Skanujesz fakturę zakupową — części pojawiają się w magazynie i na zleceniu." },
              { img: tileKsef, step: "4", title: "KSeF & Sprzedaż", text: "Kończysz zlecenie — jedno kliknięcie i faktura FA(3) leci do KSeF." },
            ].map((m, i) => (
              <div key={i} className="relative rounded-2xl overflow-hidden border bg-card shadow-sm">
                <div className="aspect-video relative">
                  <img src={m.img} alt={m.title} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                  <div className="absolute top-3 left-3 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold shadow-lg">
                    {m.step}
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-extrabold text-lg mb-1 text-slate-900 dark:text-foreground">{m.title}</h3>
                  <p className="text-base font-medium text-slate-700 dark:text-slate-200 leading-relaxed">{m.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Detailing / PPF spotlight */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <div className="grid md:grid-cols-2 gap-8 items-center max-w-6xl mx-auto">
          <div className="relative flex justify-center">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-primary/20 blur-3xl rounded-full" />
            <img
              src={mascotDetailer}
              alt="GetRido detailing"
              className="relative w-60 md:w-80 drop-shadow-2xl"
              loading="lazy"
              width={1024}
              height={1024}
            />
          </div>
          <div>
            <Badge className="mb-3 bg-purple-500/10 text-purple-700 border-purple-500/20">Detailing & PPF</Badge>
            <h2 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight">Dla studiów detailingu i myjni premium</h2>
            <p className="text-lg font-medium text-slate-700 dark:text-slate-200 mb-6 leading-relaxed">
              Ten sam silnik co warsztat — z modułami, które przydają się przy długich zleceniach detailingowych. Cyfrowy protokół odbioru z podpisem klienta, zdjęcia stanu auta przy przyjęciu i wydaniu, terminarz zaprojektowany pod całodniowe usługi.
            </p>
            <ul className="space-y-3 mb-4">
              {[
                "Cyfrowy podpis klienta na protokole odbioru",
                "Zdjęcia przyjęcia i wydania auta — koniec z reklamacjami",
                "Terminarz ze stanowiskami — pod długie detale",
                "SMS-y do klienta na każdym etapie usługi",
              ].map((t, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Check className="h-6 w-6 text-emerald-500 shrink-0 mt-0.5" />
                  <span className="text-base font-semibold text-slate-800 dark:text-slate-100">{t}</span>
                </li>
              ))}
            </ul>
            <div className="flex items-start gap-2 text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg p-3">
              <Sparkles className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                <strong className="text-amber-900">Wkrótce:</strong> dedykowane checklisty ceramiki i PPF krok po kroku oraz automatyczny watermark na galeriach przed/po.
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Tylko u nas — wszystko w jednym */}
      <section className="bg-gradient-to-br from-primary/5 via-purple-500/5 to-background py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="text-center mb-12">
            <Badge className="mb-3 bg-primary text-primary-foreground">Tylko u nas</Badge>
            <h2 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight">
              Wszystko w jednym systemie — <span className="bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent">to nas wyróżnia</span>
            </h2>
            <p className="text-lg md:text-xl font-medium text-slate-700 dark:text-slate-200 max-w-2xl mx-auto leading-relaxed">
              Konkurencja daje Ci kawałki: jedni terminarz, drudzy magazyn, trzeci fakturę. My łączymy wszystko — z <strong className="text-primary font-bold">RidoAI</strong>, które faktycznie pracuje za Ciebie.
            </p>
          </div>

          {/* USP grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
            {[
              { icon: Phone, title: "Asystent AI 24/7", text: "Odbiera telefony, pisze do klientów na SMS i czacie, umawia wizyty w Twoim terminarzu. Pracuje w nocy, w weekend i święta." },
              { icon: Brain, title: "Rido AI — wyceny i porady", text: "Podpowiada ceny części i robocizny na bazie tysięcy historycznych zleceń. Pytasz — dostajesz odpowiedź." },
              { icon: Package, title: "OCR faktur → magazyn", text: "Skanujesz fakturę zakupową telefonem, części same lądują w magazynie z cenami i stanami." },
              { icon: MessageSquare, title: "Auto-SMS + kalendarz ICS", text: "Automatyczne przypomnienia 24h i 2h przed wizytą. Klient dostaje link do dodania wizyty w swoim kalendarzu." },
              { icon: Wrench, title: "Zintegrowane hurtownie części", text: "Szukasz części u dostawców z poziomu zlecenia. Kolejne integracje wdrażamy stopniowo." },
              { icon: Zap, title: "Web app na każdym urządzeniu", text: "Działa na telefonie, tablecie i komputerze bez instalacji. Natywna aplikacja mobilna już wkrótce." },
            ].map((item, i) => (
              <Card key={i} className="border-primary/10 hover:border-primary/30 transition-colors">
                <CardContent className="p-5">
                  <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center mb-3">
                    <item.icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="font-extrabold text-lg mb-1 text-slate-900 dark:text-foreground">{item.title}</h3>
                  <p className="text-base font-medium text-slate-700 dark:text-slate-200 leading-relaxed">{item.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Comparison table */}
          <div className="rounded-2xl border bg-card shadow-lg overflow-hidden">
            <div className="p-5 md:p-6 border-b bg-muted/30">
              <h3 className="font-bold text-lg md:text-xl">Porównanie z konkurencją</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Konkurencja A/B/C to popularne polskie systemy warsztatowe. Każdy z nich robi swój kawałek dobrze — ale żaden nie ma wszystkiego naraz.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/20">
                    <th className="text-left p-3 md:p-4 font-semibold">Funkcja</th>
                    <th className="p-3 md:p-4 font-semibold text-center min-w-[110px]">
                      <div className="inline-flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full bg-primary" />
                        GetRido
                      </div>
                    </th>
                    <th className="p-3 md:p-4 font-semibold text-center min-w-[110px]">
                      <div className="inline-flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full bg-red-500" />
                        Konkurencja A
                      </div>
                    </th>
                    <th className="p-3 md:p-4 font-semibold text-center min-w-[110px]">
                      <div className="inline-flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full bg-emerald-500" />
                        Konkurencja B
                      </div>
                    </th>
                    <th className="p-3 md:p-4 font-semibold text-center min-w-[110px]">
                      <div className="inline-flex items-center gap-2">
                        <span className="h-3 w-3 rounded-full bg-blue-500" />
                        Konkurencja C
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Terminarz + SMS 24h/2h", true, true, true, true],
                    ["Zlecenia + kosztorysy", true, true, true, true],
                    ["Magazyn + OCR faktur zakupowych", true, false, "częściowo", false],
                    ["Wyceny AI (Rido AI)", true, false, false, false],
                    ["Asystent AI odbierający telefony", true, false, false, false],
                    ["Sprawdzanie aut po nr rej. (RegCheck)", true, false, "częściowo", false],
                    ["KSeF FA(3) wbudowane", true, false, false, "częściowo"],
                    ["Księgowość + doradca podatkowy AI", true, false, false, false],
                    ["Detailing / PPF workflow", true, false, false, false],
                    ["Web app + PWA na telefonie", true, "częściowo", true, "częściowo"],
                  ].map(([label, ...cells], i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="p-3 md:p-4 font-medium">{label as string}</td>
                      {cells.map((cell, ci) => (
                        <td key={ci} className="p-3 md:p-4 text-center">
                          {cell === true ? (
                            <Check className="h-5 w-5 text-emerald-500 inline" />
                          ) : cell === "częściowo" ? (
                            <span className="text-xs text-amber-600 font-medium">częściowo</span>
                          ) : (
                            <span className="text-muted-foreground/40">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 text-xs text-muted-foreground bg-muted/10 border-t">
              Zestawienie na podstawie publicznie dostępnych informacji o polskich systemach do zarządzania warsztatem samochodowym (stan: 2026). Nazwy własne pominięto.
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-muted/30 py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <Badge variant="secondary" className="mb-3">Opinie</Badge>
            <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight">Co mówią właściciele warsztatów</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {testimonials.map((t, i) => (
              <Card key={i} className="border shadow-sm">
                <CardContent className="p-6">
                  <div className="flex gap-1 text-amber-500 mb-3">
                    {[0, 1, 2, 3, 4].map((s) => <Star key={s} className="h-4 w-4 fill-current" />)}
                  </div>
                  <p className="text-base font-medium text-slate-800 dark:text-slate-100 mb-4 italic leading-relaxed">„{t.text}"</p>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-white font-semibold">
                      {t.name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-semibold text-sm">{t.name}</div>
                      <div className="text-xs text-muted-foreground">{t.role}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <div className="text-center mb-12">
          <Badge variant="secondary" className="mb-3">Cennik</Badge>
          <h2 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight">Wybierz pakiet</h2>
          <p className="text-lg md:text-xl font-medium text-slate-700 dark:text-slate-200 max-w-2xl mx-auto leading-relaxed">
            Każdy pakiet zaczyna się od 14 dni za darmo. Bez karty kredytowej. Bez zobowiązań.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 max-w-6xl mx-auto">
          {plans.map((plan) => (
            <Card
              key={plan.id}
              className={`relative flex flex-col ${plan.popular ? "border-primary border-2 shadow-xl lg:scale-[1.03]" : ""}`}
            >
              {plan.popular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">Najpopularniejszy</Badge>
              )}
              <CardContent className="p-6 flex flex-col flex-1">
                <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
                <p className="text-sm text-muted-foreground mb-4 min-h-[48px]">{plan.description}</p>
                <div className="mb-5">
                  <span className="text-4xl font-bold">{plan.price} zł</span>
                  <span className="text-muted-foreground text-sm"> {plan.period}</span>
                </div>
                <Button
                  className={`w-full mb-5 ${plan.popular ? "bg-gradient-to-r from-primary to-purple-600" : ""}`}
                  variant={plan.popular ? "default" : "outline"}
                  onClick={() => handleStartTrial(plan.id)}
                >
                  {plan.cta}
                </Button>
                <ul className="space-y-2 flex-1">
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
                <button
                  className="w-full text-left p-5 flex items-center justify-between gap-3"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className="font-semibold">{item.q}</span>
                  <ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${openFaq === i ? "rotate-180" : ""}`} />
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-5 text-sm text-muted-foreground">{item.a}</div>
                )}
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <Card className="relative overflow-hidden bg-gradient-to-br from-primary via-purple-600 to-primary border-0 text-primary-foreground">
          <div className="absolute -right-8 -bottom-8 opacity-30 hidden md:block">
            <img src={mascot} alt="" className="w-64" />
          </div>
          <CardContent className="relative p-8 md:p-14 text-center md:text-left max-w-2xl">
            <h2 className="text-3xl md:text-4xl font-bold mb-3">
              Zacznij oszczędzać czas już dziś
            </h2>
            <p className="mb-6 opacity-90">
              14 dni za darmo, pełen dostęp do wszystkich funkcji. Bez karty, bez zobowiązań.
              Aktywacja zajmuje mniej niż minutę.
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
        signupContext={{ module: "warsztat", plan: selectedPlan ?? undefined }}
      />
    </div>
  );
}

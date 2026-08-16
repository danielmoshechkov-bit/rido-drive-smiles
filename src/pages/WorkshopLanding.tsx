import { Fragment, useState, useEffect } from "react";
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
import { usePublicPricing, type PublicPlan } from "@/hooks/usePublicPricing";
import { planPriceLabels, planCtaLabel, trialDaysFor } from "@/lib/pricingCards";
import { usePlanAction } from "@/hooks/usePlanAction";
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

type CompareVal = boolean | "częściowo";

type CompareRow = {
  grupa: string;
  funkcja: string;
  getrido: CompareVal;
  a: CompareVal;
  b: CompareVal;
  c: CompareVal;
  tylkoMy?: boolean;
};

const COMPARISON_ROWS: CompareRow[] = [
  // — Zarządzanie warsztatem —
  { grupa: "Zarządzanie warsztatem", funkcja: "Terminarz + przypomnienia SMS 24h / 2h", getrido: true, a: "częściowo", b: true, c: true },
  { grupa: "Zarządzanie warsztatem", funkcja: "Zlecenia + kosztorysy z e-podpisem klienta", getrido: true, a: "częściowo", b: true, c: true },
  { grupa: "Zarządzanie warsztatem", funkcja: "Dynamiczne statusy zleceń (per warsztat, auto-SMS)", getrido: true, a: false, b: "częściowo", c: "częściowo" },
  { grupa: "Zarządzanie warsztatem", funkcja: "Obieg zlecenia pracownik ↔ biuro (panel mechanika)", getrido: true, a: false, b: false, c: "częściowo" },
  { grupa: "Zarządzanie warsztatem", funkcja: "Zdjęcia aut przy zleceniu (prywatny bucket)", getrido: true, a: false, b: "częściowo", c: "częściowo" },
  { grupa: "Zarządzanie warsztatem", funkcja: "Magazyn + OCR faktur zakupowych", getrido: true, a: false, b: false, c: "częściowo" },
  { grupa: "Zarządzanie warsztatem", funkcja: "Baza klientów / pojazdów + historia + transfer VIN", getrido: true, a: "częściowo", b: true, c: true },
  { grupa: "Zarządzanie warsztatem", funkcja: "Sprawdzanie aut po nr rej. / dekoder VIN", getrido: true, a: true, b: "częściowo", c: true },
  { grupa: "Zarządzanie warsztatem", funkcja: "Faktury + KSeF FA(3) wbudowane", getrido: true, a: false, b: "częściowo", c: "częściowo" },
  { grupa: "Zarządzanie warsztatem", funkcja: "Księgowość + doradca podatkowy AI", getrido: true, a: false, b: false, c: false },
  { grupa: "Zarządzanie warsztatem", funkcja: "Detailing / PPF workflow", getrido: true, a: false, b: false, c: false },
  // — Sztuczna inteligencja —
  { grupa: "Sztuczna inteligencja", funkcja: "Asystent AI odbierający telefony (voicebot 24/7)", getrido: true, a: true, b: "częściowo", c: false },
  { grupa: "Sztuczna inteligencja", funkcja: "Bot po godzinach / gdy nie odbierasz", getrido: true, a: true, b: false, c: false },
  { grupa: "Sztuczna inteligencja", funkcja: "Transkrypcje rozmów w karcie zlecenia", getrido: true, a: true, b: true, c: false },
  { grupa: "Sztuczna inteligencja", funkcja: "Asystent mechanika (notatki głosowe z hali)", getrido: true, a: true, b: false, c: false },
  { grupa: "Sztuczna inteligencja", funkcja: "Wyceny AI (Rido AI) + dobór części do naprawy", getrido: true, a: "częściowo", b: false, c: "częściowo" },
  { grupa: "Sztuczna inteligencja", funkcja: "Wysyłka wyceny do akceptacji online", getrido: true, a: "częściowo", b: true, c: "częściowo" },
  { grupa: "Sztuczna inteligencja", funkcja: "Proaktywny CRM + marketing SMS / e-mail", getrido: true, a: true, b: true, c: "częściowo" },
  // — Platforma i giełda —
  { grupa: "Platforma i giełda", funkcja: "Własna giełda / portal dostarczający klientów", getrido: true, a: false, b: false, c: false, tylkoMy: true },
  { grupa: "Platforma i giełda", funkcja: "Marketplace ogłoszeń (auta, części, usługi)", getrido: true, a: false, b: false, c: false, tylkoMy: true },
  { grupa: "Platforma i giełda", funkcja: "Rezerwacje online (strona / Google + OTP SMS)", getrido: true, a: true, b: true, c: "częściowo" },
  { grupa: "Platforma i giełda", funkcja: "Płatności online (Przelewy24)", getrido: true, a: false, b: false, c: "częściowo" },
  { grupa: "Platforma i giełda", funkcja: "Web app + PWA na telefonie", getrido: true, a: "częściowo", b: true, c: "częściowo" },
  { grupa: "Platforma i giełda", funkcja: "Kanały: SMS / e-mail / Telegram / in-app", getrido: true, a: "częściowo", b: "częściowo", c: "częściowo" },
];

type Feature = {
  icon: any;
  title: string;
  description: string;
  img: string;
  ai?: boolean;
  soon?: boolean;
};

/**
 * Wyróżnienie karty — decyzja marketingowa, nie dana z cennika. Klucz to kod
 * planu z billing_plans.
 */
const HIGHLIGHTED = new Set(["warsztat_standard", "agent_pro"]);

/**
 * Plan przypisywany przy rejestracji z OGÓLNEGO przycisku („Zarejestruj się",
 * „Aktywuj", hero, CTA pod FAQ) — czyli wtedy, gdy człowiek nie kliknął
 * konkretnej karty. Landing obiecuje w okresie próbnym „pełny program
 * w zakresie Pro", więc to Pro jest planem, ku któremu potem nakłaniamy.
 *
 * ⚠️ MUSI BYĆ PEŁNYM KODEM z `billing_plans`. Wcześniej stało tu `"pro"` —
 * skrót, którego billing nie zna. Trafiał do `user_metadata.plan` i do trialu,
 * a `TrialPlanBanner` szukał planu po kodzie, nie znajdował i milczał.
 * Nie było to obcięcie prefiksu: ten literał nigdy nie był pełnym kodem.
 */
const PLAN_PROMOWANY = "warsztat_pro";

/**
 * Zapowiedzi „wkrótce" — obietnice, nie zakres planu. Funkcja, która jeszcze
 * nie działa, nie ma prawa siedzieć w macierzy plan × funkcja, bo natychmiast
 * dałaby do niej dostęp.
 */
const COMING_SOON: Record<string, string[]> = {
  warsztat_pro: ["Dane naprawcze (TecRMI) + czas pracy mechanika"],
};

export default function WorkshopLanding() {
  // Wejście z panelu idzie pod #plany — React Router sam nie przewija do
  // kotwicy, więc robimy to tu. Bez tego „Wybierz plan" wyrzucałoby na samą
  // górę strony i pakietów trzeba by szukać.
  useEffect(() => {
    if (window.location.hash !== '#plany') return;
    const cel = document.getElementById('plany');
    if (cel) requestAnimationFrame(() => cel.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, []);

  const navigate = useNavigate();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginMode, setLoginMode] = useState<"login" | "register">("register");
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isProvider, setIsProvider] = useState(false);
  const [activating, setActivating] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  // Cennik z bazy — te same dane co /cennik. Zmiana ceny w panelu wchodzi tu
  // bez deployu, a obie strony nie mają jak się rozjechać.
  const { plans, loading: pricingLoading, error: pricingError } = usePublicPricing();
  const warsztatPlans = plans.filter((p) => p.product_line === "warsztat");
  const agentPlans = plans.filter((p) => p.product_line === "agent");
  const trialDays = trialDaysFor(plans, "warsztat");

  // Klik w kartę planu: indywidualny → kontakt, darmowy albo niezalogowany →
  // rejestracja z zapamiętanym planem, reszta → checkout.
  const { klik: klikPlan, pending: planPending } = usePlanAction((plan) => {
    setSelectedPlan(plan.code);
    setLoginMode("register");
    setShowLoginModal(true);
  });
  const trialLabel = trialDays > 0 ? `${trialDays} dni` : null;

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

  /**
   * Kod planu dla ogólnych przycisków, sprawdzony względem tego, co naprawdę
   * jest w cenniku. Gdyby plan zmienił kod albo zniknął, wolimy NIE zapisać
   * niczego niż zapisać kod, którego billing nie rozpozna — cichy rozjazd
   * jest gorszy niż brak wartości.
   */
  const planPromowany = warsztatPlans.some((p) => p.code === PLAN_PROMOWANY)
    ? PLAN_PROMOWANY
    : undefined;

  const handleStartTrial = async (plan?: string) => {
    setSelectedPlan(plan ?? null);
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
        toast.success(
          trialLabel
            ? `Moduł warsztatowy aktywowany! Okres próbny trwa ${trialLabel}.`
            : "Moduł warsztatowy aktywowany!",
        );
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
    { icon: Search, title: "Sprawdzanie aut po nr rej.", description: "VIN, model, pojemność, moc, rok — pełne dane pojazdu jednym kliknięciem.", ai: true, img: tilePojazdy },
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
    { icon: Zap, text: trialLabel ? `${trialLabel} za darmo, bez karty` : "Bez karty, bez zobowiązań" },
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
    { q: "Czy potrzebuję karty kredytowej, żeby wypróbować?", a: `Nie. ${trialLabel ? `Pełne ${trialLabel}` : "Okres próbny"} bez karty, bez zobowiązań. Po okresie próbnym decydujesz, czy chcesz kontynuować.` },
    { q: "Czy moje dane są bezpieczne?", a: "Tak. Dane są przechowywane w polskiej chmurze zgodnej z RODO, szyfrowane w spoczynku i w transporcie. Codzienne backupy." },
    { q: "Czy mogę importować dane z innego systemu?", a: "Tak. Wspieramy import klientów, pojazdów i historii z plików CSV/Excel. W razie potrzeby pomożemy przy migracji." },
    { q: "Czy KSeF jest już wbudowany?", a: "Tak. Wystawianie i wysyłka FA(3), monitoring statusów oraz alerty MF są dostępne od pakietu Warsztat." },
    { q: "Ile kosztuje SMS do klienta?", a: "SMS-y rozliczane są z Twojego pakietu SMS (kupujesz osobno). System pokazuje saldo i historię wysyłek." },
  ];

  const renderPlanCard = (plan: PublicPlan) => {
    const price = planPriceLabels(plan);
    const popular = HIGHLIGHTED.has(plan.code);
    const comingSoon = COMING_SOON[plan.code];
    return (
      <Card
        key={plan.code}
        className={`relative flex flex-col ${popular ? "border-primary border-2 shadow-xl lg:scale-[1.03]" : ""}`}
      >
        {popular && (
          <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">Najpopularniejszy</Badge>
        )}
        <CardContent className="p-6 flex flex-col flex-1">
          <h3 className="text-xl font-bold mb-1">{plan.name}</h3>
          <div className="mb-5 mt-3">
            <span className="text-4xl font-bold">{price.price}</span>
            <span className="text-muted-foreground text-sm"> {price.period}</span>
            {price.target && (
              <span className="text-muted-foreground text-sm line-through ml-2">{price.target}</span>
            )}
            {price.note && <div className="text-xs text-muted-foreground mt-1">{price.note}</div>}
          </div>
          <Button
            className={`w-full mb-5 ${popular ? "bg-gradient-to-r from-primary to-purple-600" : ""}`}
            variant={popular ? "default" : "outline"}
            disabled={!!planPending}
            onClick={() => klikPlan(plan)}
          >
            {planPending === plan.code ? "Otwieram płatność…" : planCtaLabel(plan)}
          </Button>
          <ul className="space-y-2 flex-1">
            {plan.features.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <Check className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          {comingSoon && comingSoon.length > 0 && (
            <ul className="space-y-2 mt-3 pt-3 border-t">
              {comingSoon.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground/60">
                  <Clock className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    {f}
                    <Badge variant="outline" className="ml-1.5 text-[10px] px-1.5 py-0 align-middle text-muted-foreground/70">
                      wkrótce
                    </Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderPlanGrid = (group: PublicPlan[], gridClass: string, emptyHint: string) => {
    if (pricingLoading) {
      return (
        <div className={`grid gap-5 mx-auto ${gridClass}`}>
          {[0, 1, 2, 3].slice(0, Math.max(2, group.length || 4)).map((i) => (
            <Card key={i} className="h-80 animate-pulse bg-muted/40" />
          ))}
        </div>
      );
    }
    // Przy błędzie i przy pustej odpowiedzi NIE pokazujemy zapasowych kwot —
    // zła cena na stronie, na którą kierujemy ruch, jest gorsza niż jej brak.
    if (pricingError || group.length === 0) {
      return (
        <Card className="max-w-2xl mx-auto">
          <CardContent className="p-6 text-center">
            <p className="text-sm mb-4">{emptyHint}</p>
            <Button onClick={() => navigate("/kontakt")}>Skontaktuj się z nami</Button>
          </CardContent>
        </Card>
      );
    }
    return (
      <div className={`grid gap-5 mx-auto ${gridClass}`}>
        {group.map((plan) => renderPlanCard(plan))}
      </div>
    );
  };

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
                  <Button size="sm" disabled={activating} onClick={() => handleStartTrial(planPromowany)}>
                    {activating ? "Aktywuję..." : trialLabel ? `Aktywuj ${trialLabel}` : "Aktywuj"}
                  </Button>
                </>
              )
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => { setLoginMode("login"); setShowLoginModal(true); }}>Zaloguj się</Button>
                <Button size="sm" onClick={() => handleStartTrial(planPromowany)}>Zarejestruj się</Button>
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
                {trialLabel ? `${trialLabel} za darmo · bez karty` : "Bez karty · bez zobowiązań"}
              </Badge>

              <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold mb-5 leading-tight">
                <span className="whitespace-nowrap">Warsztat i detailing</span>
                <br />
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
                  onClick={() => handleStartTrial(planPromowany)}
                >
                  <Wrench className="h-5 w-5" />
                  {activating ? "Aktywuję..." : session && isProvider ? "Przejdź do panelu" : trialLabel ? `Wypróbuj ${trialLabel} za darmo` : "Zacznij za darmo"}
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
                  className="relative w-72 md:w-[26rem] lg:w-[32rem] drop-shadow-2xl"
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

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
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
                  {COMPARISON_ROWS.map((row, i) => (
                    <Fragment key={i}>
                      {(i === 0 || COMPARISON_ROWS[i - 1].grupa !== row.grupa) && (
                        <tr className="border-b bg-muted/20">
                          <td colSpan={5} className="p-3 md:p-4 font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                            {row.grupa}
                          </td>
                        </tr>
                      )}
                      <tr className="border-b hover:bg-muted/20">
                        <td className="p-3 md:p-4 font-medium">
                          {row.funkcja}
                          {row.tylkoMy && (
                            <Badge className="ml-2 bg-primary text-primary-foreground text-[10px] px-1.5 py-0 align-middle">
                              tylko my
                            </Badge>
                          )}
                        </td>
                        {[row.getrido, row.a, row.b, row.c].map((cell, ci) => (
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
                    </Fragment>
                  ))}
                  <tr className="bg-muted/30 font-semibold">
                    <td className="p-3 md:p-4">Liczba „TAK"</td>
                    {(["getrido", "a", "b", "c"] as const).map((col) => (
                      <td key={col} className="p-3 md:p-4 text-center">
                        {COMPARISON_ROWS.filter((row) => row[col] === true).length}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="p-4 text-xs text-muted-foreground bg-muted/10 border-t">
              A = AI-asystent telefoniczny · B = program z AI · C = klasyczne programy. Nazwy własne pominięto.
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
      <section id="plany" className="container mx-auto px-4 py-16 md:py-24">
        <div className="text-center mb-8">
          <Badge variant="secondary" className="mb-3">Cennik</Badge>
          <h2 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight">Wybierz pakiet</h2>
        </div>

        {/* Trial banner — znika, gdy plany nie obiecują okresu próbnego */}
        {trialLabel && (
          <div className="max-w-3xl mx-auto mb-14">
            <Card className="border-primary/30 bg-gradient-to-r from-primary/10 via-purple-500/10 to-primary/10">
              <CardContent className="p-6 text-center">
                <h3 className="text-xl md:text-2xl font-extrabold mb-2">
                  {trialLabel} — pełny dostęp do programu
                </h3>
                <p className="text-base font-medium text-slate-700 dark:text-slate-200 leading-relaxed">
                  Na start dostajesz pełny program w zakresie Pro. Bez karty. Wdrożenie, migracja danych
                  z obecnego programu, konfiguracja kasy fiskalnej i KSeF — 0 zł (wartość 690 zł).
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Product 1 — GetRido Warsztat */}
        <div className="text-center mb-8">
          <h3 className="text-2xl md:text-3xl font-extrabold mb-2">GetRido Warsztat</h3>
          <p className="text-base md:text-lg font-medium text-slate-700 dark:text-slate-200 max-w-2xl mx-auto leading-relaxed">
            Dla warsztatów, które chcą tylko dobry program. Taniej i z większym zakresem niż popularne systemy.
          </p>
        </div>
        {renderPlanGrid(
          warsztatPlans,
          "sm:grid-cols-2 lg:grid-cols-4 max-w-6xl",
          "Nie udało się wczytać aktualnego cennika programu. Odśwież stronę albo napisz do nas — podamy ceny od ręki.",
        )}
        <p className="text-center text-sm text-muted-foreground mt-6 max-w-2xl mx-auto">
          Magazyn, integracje i panel pracowników — u nas w cenie Pro. SMS i sprawdzanie VIN — pakiety dokupowane.
        </p>
        <div className="max-w-2xl mx-auto mt-4 mb-16">
          <p className="text-sm text-slate-700 dark:text-slate-200 bg-primary/5 border border-primary/20 rounded-lg p-4 text-center leading-relaxed">
            <span className="font-semibold">Pomoc AI przy naprawie:</span> asystent techniczny (Claude) w oknie zlecenia odpowiada na pytania serwisowe, eksploatacyjne i naprawcze dla konkretnego auta ze zlecenia — usterki, procedury, momenty, płyny, interwały.
          </p>
        </div>

        {/* Product 2 — GetRido Agent AI */}
        <div className="text-center mb-8">
          <h3 className="text-2xl md:text-3xl font-extrabold mb-2">GetRido Agent AI</h3>
          <p className="text-base md:text-lg font-medium text-slate-700 dark:text-slate-200 max-w-2xl mx-auto leading-relaxed">
            Odbiera telefon 24/7, umawia wizyty, tworzy zlecenia. Działa samodzielnie, a najlepiej wpięty w program GetRido.
          </p>
        </div>
        {renderPlanGrid(
          agentPlans,
          "sm:grid-cols-2 max-w-3xl",
          "Nie udało się wczytać aktualnego cennika Agenta AI. Odśwież stronę albo napisz do nas — podamy ceny od ręki.",
        )}
        <p className="text-center text-sm text-muted-foreground mt-6 max-w-2xl mx-auto">
          Powyżej limitu minut: 0,60 zł/min netto albo pakiet 100 / 250 / 500 minut.
          Agent nigdy nie przestaje odbierać telefonu — po wyczerpaniu minut przechodzi
          w tryb awaryjny i przekazuje wiadomość do warsztatu.
        </p>
        <p className="text-center text-sm text-muted-foreground mt-4 max-w-2xl mx-auto">
          Ceny startowe obowiązują przy uruchomieniu konta do 31.12.2026 i są gwarantowane
          przez 12 miesięcy od aktywacji — o zmianie informujemy 30 dni wcześniej.
          Funkcje AI bez podanego limitu działają w ramach uczciwego użycia.
        </p>
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
                  <span className="font-bold text-base md:text-lg text-slate-900 dark:text-foreground">{item.q}</span>
                  <ChevronDown className={`h-5 w-5 shrink-0 transition-transform ${openFaq === i ? "rotate-180" : ""}`} />
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-5 text-base font-medium text-slate-700 dark:text-slate-200 leading-relaxed">{item.a}</div>
                )}
              </Card>
            ))}
          </div>


          {/* Big CTA button directly under FAQ */}
          <div className="mt-12 text-center">
            <Button
              size="lg"
              onClick={() => handleStartTrial(planPromowany)}
              className="gap-3 h-16 md:h-20 px-8 md:px-14 text-lg md:text-2xl font-extrabold rounded-2xl bg-gradient-to-r from-primary via-purple-600 to-primary text-primary-foreground shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all"
            >
              <Wrench className="h-6 w-6 md:h-7 md:w-7" />
              Rozpocznij darmowy okres próbny
              <ArrowRight className="h-6 w-6 md:h-7 md:w-7" />
            </Button>
            <p className="mt-4 text-sm md:text-base font-medium text-slate-600 dark:text-slate-300">
              {trialLabel ? `${trialLabel} za darmo · bez karty · aktywacja w minutę` : "Bez karty · aktywacja w minutę"}
            </p>
          </div>
        </div>
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

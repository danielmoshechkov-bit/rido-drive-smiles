import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Calculator,
  FileText,
  Car,
  Clock,
  Check,
  ArrowRight,
  Sparkles,
  Shield,
  Users,
  Zap,
  Fuel,
  Wrench,
  CreditCard,
  Smartphone,
  Receipt,
  BarChart3,
  Wallet,
  UserPlus,
  ChevronDown,
  Star,
  MessageCircle,
} from "lucide-react";
import { AuthModal } from "@/components/auth/AuthModal";
import { UniversalHomeButton } from "@/components/UniversalHomeButton";
import tileDriver from "@/assets/tile-driver.jpg";
import tileFleet from "@/assets/tile-fleet.jpg";
import tileCars from "@/assets/tile-cars.jpg";
import tileInvoicing from "@/assets/tile-invoicing.jpg";
import tileClientPortal from "@/assets/tile-client-portal.jpg";
import tileFaktury from "@/assets/accounting/tile-faktury.jpg";
import tilePlatnosci from "@/assets/accounting/tile-platnosci.jpg";
import tileDokumenty from "@/assets/accounting/tile-dokumenty.jpg";
import tileMagazyn from "@/assets/accounting/tile-magazyn.jpg";
import tilePrzeglad from "@/assets/accounting/tile-przeglad.jpg";

const mascot = "/ludzik-getrido.png";

type Feature = { icon: any; title: string; description: string; img: string; ai?: boolean };

export default function DriverInfoLanding() {
  const navigate = useNavigate();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginMode, setLoginMode] = useState<"login" | "register">("register");
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const handleLogin = () => { setLoginMode("login"); setShowLoginModal(true); };
  const handleRegister = () => { setLoginMode("register"); setShowLoginModal(true); };

  const features: Feature[] = [
    { icon: Calculator, title: "Dokładne rozliczenia tygodniowe", description: "Zarobki z Uber, Bolt i FreeNow — szczegółowo, co tydzień, z pełną przejrzystością.", img: tileInvoicing },
    { icon: Clock, title: "Wiesz, ile dostaniesz", description: "Rozliczenia gotowe każdego tygodnia — wiesz ile zarobisz zanim przyjdzie przelew.", img: tilePrzeglad },
    { icon: FileText, title: "Automatyczne faktury B2B", description: "System sam generuje faktury VAT dla Twojego partnera flotowego. Zero ręcznej pracy.", ai: true, img: tileFaktury },
    { icon: CreditCard, title: "Dokumenty do przelewu", description: "Gotowe zestawienia do wypłaty — bez dodatkowej pracy Twojej i partnera.", img: tileDokumenty },
    { icon: Fuel, title: "Historia kart paliwowych", description: "Pełny wgląd w tankowania, koszty paliwa i oszczędności. Każda transakcja jak na dłoni.", img: tilePlatnosci },
    { icon: Wrench, title: "Historia napraw pojazdu", description: "Kompletna dokumentacja napraw, przeglądów i wymiany części — zawsze pod ręką.", img: tileCars },
    { icon: Receipt, title: "Wszystkie dokumenty w jednym miejscu", description: "Faktury, umowy, rozliczenia — uporządkowane i dostępne 24/7 z telefonu.", img: tileClientPortal },
    { icon: BarChart3, title: "Statystyki i analizy", description: "Trendy zarobków, porównanie platform, optymalizacja pracy oparta na danych.", ai: true, img: tileMagazyn },
  ];

  const wowStats = [
    { icon: FileText, badge: "AUTO", value: "Faktury B2B same się piszą", label: "Prowadzisz JDG? System sam wystawia faktury VAT do partnera flotowego." },
    { icon: Calculator, badge: "TYGODNIOWO", value: "Rozliczenia bez tajemnic", label: "Wiesz co do grosza, ile zarobiłeś zanim dostaniesz przelew." },
    { icon: Sparkles, badge: "100%", value: "Portal darmowy", label: "Pełen dostęp do rozliczeń, faktur i historii — bez żadnych opłat." },
    { icon: Smartphone, badge: "24/7", value: "Wszystko z telefonu", label: "Rozliczenia, dokumenty i historia auta zawsze pod ręką." },
  ];

  const benefits = [
    { icon: Zap, text: "100% za darmo" },
    { icon: Shield, text: "Bezpieczne dane, RODO" },
    { icon: Smartphone, text: "Dostęp z telefonu 24/7" },
    { icon: Users, text: "Zero ukrytych opłat" },
  ];

  const platforms = [
    { name: "Uber", color: "bg-black" },
    { name: "Bolt", color: "bg-green-500" },
    { name: "FreeNow", color: "bg-red-500" },
  ];

  const faq = [
    { q: "Czy Portal Kierowcy naprawdę jest darmowy?", a: "Tak. Dostęp do rozliczeń, faktur, historii paliwa i napraw jest całkowicie bezpłatny dla kierowców." },
    { q: "Co jeśli mój partner flotowy nie korzysta z GetRido?", a: "Powiedz mu o nas — dołączenie do GetRido dla flot jest darmowe i bez zobowiązań. Bez tego nie zobaczysz swoich rozliczeń w portalu." },
    { q: "Skąd biorą się dane o rozliczeniach?", a: "Twój partner flotowy importuje raporty CSV z Uber/Bolt/FreeNow, a system dopasowuje je do Twojego konta po identyfikatorach z platform." },
    { q: "Czy faktury B2B są zgodne z KSeF?", a: "Tak. Faktury generowane są w formacie FA(3), gotowe do wysyłki do Krajowego Systemu e-Faktur." },
    { q: "Czy moje dane są bezpieczne?", a: "Tak. Polska chmura zgodna z RODO, szyfrowanie danych, dostęp tylko dla Ciebie i Twojego partnera flotowego." },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <UniversalHomeButton />
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleLogin}>Zaloguj się</Button>
            <Button size="sm" onClick={handleRegister}>Zarejestruj się</Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-purple-500/5 to-background">
        <div className="absolute inset-0 opacity-[0.07] bg-cover bg-center pointer-events-none" style={{ backgroundImage: `url(${tileDriver})` }} />
        <div className="relative container mx-auto px-4 py-12 md:py-20">
          <div className="grid md:grid-cols-2 gap-8 items-center max-w-6xl mx-auto">
            <div className="text-center md:text-left order-2 md:order-1">
              <Badge className="mb-4 bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-sm px-4 py-1">
                <Sparkles className="h-3.5 w-3.5 mr-1" />
                100% darmowy Portal Kierowcy
              </Badge>

              <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold mb-5 leading-tight">
                <span>Rozliczenia Uber, Bolt i FreeNow</span>
                <br />
                <span className="bg-gradient-to-r from-primary via-purple-600 to-primary bg-clip-text text-transparent">
                  pod pełną kontrolą
                </span>
              </h1>

              <p className="text-xl md:text-2xl font-medium text-slate-800 dark:text-slate-100 mb-6 leading-relaxed">
                Pełna kontrola nad zarobkami, automatyczne faktury B2B, historia paliwa i napraw. Za wszystkim stoi <strong className="font-bold text-primary">RidoAI</strong> — wszystko w jednym miejscu, kompletnie za darmo.
              </p>

              <div className="flex items-center gap-3 mb-6 justify-center md:justify-start">
                {platforms.map((p) => (
                  <Badge key={p.name} className={`${p.color} text-white text-sm px-4 py-1.5 hover:opacity-90`}>{p.name}</Badge>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-4 mb-6 justify-center md:justify-start">
                <div className="flex items-center gap-1 text-amber-500">
                  {[0, 1, 2, 3, 4].map((i) => <Star key={i} className="h-4 w-4 fill-current" />)}
                </div>
                <span className="text-sm text-muted-foreground">
                  <strong className="text-foreground">4.9/5</strong> · zaufali nam kierowcy w całej Polsce
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center md:justify-start gap-3">
                <Button size="lg" className="w-full sm:w-auto gap-2 text-base px-8 py-6 bg-gradient-to-r from-primary to-purple-600 hover:opacity-90" onClick={handleRegister}>
                  <UserPlus className="h-5 w-5" />
                  Załóż darmowe konto
                  <ArrowRight className="h-5 w-5" />
                </Button>
                <Button size="lg" variant="ghost" className="w-full sm:w-auto" onClick={() => document.getElementById("funkcje")?.scrollIntoView({ behavior: "smooth" })}>
                  Zobacz funkcje
                </Button>
              </div>
            </div>

            <div className="order-1 md:order-2 flex justify-center md:justify-end">
              <img src={mascot} alt="GetRido Kierowca" className="w-64 md:w-[22rem] lg:w-[28rem] drop-shadow-2xl object-contain" />
            </div>
          </div>

          <div className="max-w-6xl mx-auto mt-12">
            <div className="flex items-center justify-center gap-2 mb-4">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider text-primary">Co Cię wyróżnia z GetRido</span>
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
          <h2 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight">Co zyskujesz jako kierowca</h2>
          <p className="text-lg md:text-xl font-medium text-slate-700 dark:text-slate-200 max-w-2xl mx-auto leading-relaxed">
            Kompletny system rozliczeń stworzony specjalnie dla kierowców Uber, Bolt i FreeNow.
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

      {/* How to join */}
      <section className="bg-muted/30 py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="text-center mb-12">
            <Badge variant="secondary" className="mb-3">Jak dołączyć</Badge>
            <h2 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight">Trzy kroki do własnego portalu</h2>
            <p className="text-lg md:text-xl font-medium text-slate-700 dark:text-slate-200 max-w-2xl mx-auto leading-relaxed">
              Dostęp do portalu kierowcy jest <strong>całkowicie darmowy</strong>. Aby mieć swoje rozliczenia — Twój partner flotowy musi być w systemie GetRido.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4 mb-8">
            {[
              { step: "1", title: "Zapytaj partnera", text: "Sprawdź, czy Twoja flota korzysta z GetRido." },
              { step: "2", title: "Poleć GetRido", text: "Jeśli nie — powiedz mu o nas. Dołączenie jest darmowe." },
              { step: "3", title: "Korzystaj z aplikacji", text: "Pełen dostęp do rozliczeń, faktur i historii — za darmo." },
            ].map((s, i) => (
              <Card key={i} className="border">
                <CardContent className="p-6">
                  <div className="h-11 w-11 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-white font-bold text-lg mb-3">
                    {s.step}
                  </div>
                  <h3 className="font-extrabold text-lg mb-1 text-slate-900 dark:text-foreground">{s.title}</h3>
                  <p className="text-base font-medium text-slate-700 dark:text-slate-200 leading-relaxed">{s.text}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <Card className="bg-background border-primary/20">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-full bg-primary/10">
                  <MessageCircle className="h-6 w-6 text-primary" />
                </div>
                <div className="text-left">
                  <h3 className="font-bold mb-1">Powiedz swojemu partnerowi flotowemu:</h3>
                  <p className="text-base font-medium text-slate-700 dark:text-slate-200 italic leading-relaxed">
                    „Chcę korzystać z GetRido — darmowego systemu rozliczeń dla kierowców. Dołączenie dla flot jest całkowicie za darmo i bez zobowiązań. Sprawdź na getrido.pl"
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* For fleet partners */}
      <section className="container mx-auto px-4 py-16 md:py-24">
        <div className="max-w-4xl mx-auto text-center">
          <Badge className="mb-3 bg-primary text-primary-foreground">Dla partnerów flotowych</Badge>
          <h2 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight">Zarządzasz flotą? Też za darmo</h2>
          <p className="text-lg md:text-xl font-medium text-slate-700 dark:text-slate-200 mb-8 leading-relaxed">
            GetRido to kompletny system rozliczeń — również <strong>całkowicie za darmo</strong> na start.
          </p>

          <div className="grid sm:grid-cols-3 gap-4 mb-8">
            {[
              { icon: Car, label: "Zarządzanie flotą" },
              { icon: Wallet, label: "Automatyczne rozliczenia" },
              { icon: Check, label: "Zero opłat na start" },
            ].map((f, i) => (
              <Card key={i} className="border">
                <CardContent className="p-5">
                  <div className="h-11 w-11 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center mx-auto mb-3">
                    <f.icon className="h-6 w-6 text-white" />
                  </div>
                  <div className="font-bold text-base">{f.label}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <Button variant="outline" size="lg" onClick={() => navigate("/fleet-info")} className="gap-2">
            Portal flotowy — zobacz szczegóły
            <ArrowRight className="h-4 w-4" />
          </Button>
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
            <Button size="lg" onClick={handleRegister} className="gap-3 h-16 md:h-20 px-8 md:px-14 text-lg md:text-2xl font-extrabold rounded-2xl bg-gradient-to-r from-primary via-purple-600 to-primary text-primary-foreground shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all">
              <UserPlus className="h-6 w-6 md:h-7 md:w-7" />
              Załóż darmowe konto
              <ArrowRight className="h-6 w-6 md:h-7 md:w-7" />
            </Button>
            <p className="mt-4 text-sm md:text-base font-medium text-slate-600 dark:text-slate-300">
              100% za darmo · aktywacja w minutę
            </p>
          </div>
        </div>
      </section>

      <AuthModal open={showLoginModal} onOpenChange={setShowLoginModal} initialMode={loginMode} />
    </div>
  );
}

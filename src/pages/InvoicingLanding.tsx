import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  Calculator,
  Package,
  BarChart3,
  Brain,
  Receipt,
  Check,
  ArrowRight,
  Sparkles,
  Shield,
  Clock,
  Users,
  Zap,
  Camera,
  TrendingUp,
  ChevronDown,
  Star,
  Mail,
  CreditCard,
  Search,
} from "lucide-react";
import { AuthModal } from "@/components/auth/AuthModal";
import { UniversalHomeButton } from "@/components/UniversalHomeButton";
import tileFaktury from "@/assets/accounting/tile-faktury.jpg";
import tileKsef from "@/assets/accounting/tile-ksef.jpg";
import tileMagazyn from "@/assets/accounting/tile-magazyn.jpg";
import tileDokumenty from "@/assets/accounting/tile-dokumenty.jpg";
import tileEmail from "@/assets/accounting/tile-email.jpg";
import tilePlatnosci from "@/assets/accounting/tile-platnosci.jpg";
import tilePrzeglad from "@/assets/accounting/tile-przeglad.jpg";
import tileSprawdzenia from "@/assets/accounting/tile-sprawdzenia.jpg";
import tileZakupy from "@/assets/accounting/tile-zakupy.jpg";
import tileCykliczne from "@/assets/accounting/tile-cykliczne.jpg";

const mascot = "/mascot-getrido.png";

type Feature = {
  icon: any;
  title: string;
  description: string;
  img: string;
  ai?: boolean;
};

export default function InvoicingLanding() {
  const navigate = useNavigate();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginMode, setLoginMode] = useState<"login" | "register">("register");
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const handleIssueInvoice = () => navigate("/faktury");
  const handleLogin = () => { setLoginMode("login"); setShowLoginModal(true); };
  const handleRegister = () => { setLoginMode("register"); setShowLoginModal(true); };

  const features: Feature[] = [
    { icon: FileText, title: "Faktury VAT i rachunki", description: "Wystawiaj faktury VAT, proformy, zaliczkowe i rachunki w kilka sekund.", img: tileFaktury },
    { icon: Receipt, title: "KSeF FA(3) wbudowany", description: "Wystawianie i wysyłka FA(3) do KSeF, monitoring statusów i alerty MF.", img: tileKsef },
    { icon: Camera, title: "OCR faktur zakupowych", description: "Wgraj zdjęcie lub PDF — AI rozpozna wszystkie pozycje i wprowadzi dane.", ai: true, img: tileZakupy },
    { icon: Brain, title: "Inteligentne mapowanie", description: "System uczy się Twoich dostawców i sam przyporządkowuje pozycje do magazynu.", ai: true, img: tileDokumenty },
    { icon: Package, title: "Moduł magazynowy", description: "Stany magazynowe, produkty i przepływ towarów w czasie rzeczywistym.", img: tileMagazyn },
    { icon: TrendingUp, title: "Analiza marży i zysków", description: "System ostrzega, gdy sprzedajesz poniżej kosztów zakupu.", ai: true, img: tilePrzeglad },
    { icon: Calculator, title: "Automatyczne obliczenia", description: "System sam liczy VAT, kwoty netto i brutto dla różnych stawek.", img: tileFaktury },
    { icon: Mail, title: "Wysyłka email z systemu", description: "Faktury lecą bezpośrednio do klienta z Twojego adresu — z załącznikiem PDF.", img: tileEmail },
    { icon: CreditCard, title: "Płatności i przelewy", description: "Podpięcie płatności online, statusy opłacenia, przypomnienia o niezapłaconych.", img: tilePlatnosci },
    { icon: Search, title: "NIP → dane firmy", description: "Wpisz NIP — pobierzemy dane z GUS i Białej Listy MF automatycznie.", ai: true, img: tileSprawdzenia },
    { icon: BarChart3, title: "Raporty i JPK_V7", description: "Zestawienia VAT, podsumowania sprzedaży, raporty dla księgowości.", img: tilePrzeglad },
    { icon: Clock, title: "Faktury cykliczne", description: "Ustaw raz — system sam wystawia i wysyła co miesiąc.", img: tileCykliczne },
  ];

  const wowStats = [
    { icon: Sparkles, badge: "100%", value: "Program darmowy", label: "Wystawiaj faktury i zarządzaj magazynem bez żadnych opłat." },
    { icon: Brain, badge: "AI", value: "OCR faktur zakupowych", label: "Wgraj zdjęcie faktury — AI wpisze wszystkie pozycje za Ciebie." },
    { icon: Receipt, badge: "KSeF", value: "FA(3) i alerty MF", label: "Wbudowane wystawianie i monitoring statusów w KSeF." },
    { icon: TrendingUp, badge: "MARŻA LIVE", value: "Alert poniżej kosztu", label: "Ostrzeżenie, gdy sprzedajesz taniej niż kupiłeś." },
  ];

  const benefits = [
    { icon: Zap, text: "100% darmowy program" },
    { icon: Shield, text: "Polska chmura, RODO" },
    { icon: Clock, text: "Dostęp 24/7, każde urządzenie" },
    { icon: Users, text: "Bez limitu kontrahentów" },
  ];

  const faq = [
    { q: "Czy program naprawdę jest darmowy?", a: "Tak, moduł księgowo-magazynowy jest w pełni darmowy — wystawianie faktur, magazyn, OCR i raporty bez opłat i bez limitu kontrahentów." },
    { q: "Czy KSeF FA(3) jest wbudowany?", a: "Tak. Wystawianie i wysyłka FA(3) do KSeF, monitoring statusów i alerty z Ministerstwa Finansów są w standardzie." },
    { q: "Czy mogę importować dane z innego programu?", a: "Tak — wspieramy import kontrahentów, produktów i faktur z plików CSV/Excel. Pomożemy przy migracji." },
    { q: "Czy dane są bezpieczne?", a: "Tak. Polska chmura, RODO, szyfrowanie w spoczynku i w transporcie, codzienne backupy." },
    { q: "Czy AI naprawdę uczy się moich dostawców?", a: "Tak. Po kilku fakturach od tego samego dostawcy system automatycznie rozpoznaje układ i wypełnia pozycje bez Twojej pomocy." },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/90 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <UniversalHomeButton />
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleLogin}>Zaloguj się</Button>
            <Button size="sm" onClick={handleIssueInvoice}>Wystaw fakturę</Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-purple-500/5 to-background">
        <div className="absolute inset-0 opacity-[0.07] bg-cover bg-center pointer-events-none" style={{ backgroundImage: `url(${tileFaktury})` }} />
        <div className="relative container mx-auto px-4 py-12 md:py-20">
          <div className="grid md:grid-cols-2 gap-8 items-center max-w-6xl mx-auto">
            <div className="text-center md:text-left order-2 md:order-1">
              <Badge className="mb-4 bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-sm px-4 py-1">
                <Sparkles className="h-3.5 w-3.5 mr-1" />
                100% darmowy · bez karty
              </Badge>

              <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold mb-5 leading-tight">
                <span>Faktury, KSeF i magazyn</span>
                <br />
                <span className="bg-gradient-to-r from-primary via-purple-600 to-primary bg-clip-text text-transparent">
                  z inteligentnym AI
                </span>
              </h1>

              <p className="text-xl md:text-2xl font-medium text-slate-800 dark:text-slate-100 mb-6 leading-relaxed">
                Za wszystkim stoi <strong className="font-bold text-primary">RidoAI</strong> — czyta faktury zakupowe, uczy się Twoich dostawców i automatyzuje 80% pracy księgowej. FA(3) do KSeF, magazyn z OCR i raporty JPK_V7 w jednym miejscu.
              </p>

              <div className="flex flex-wrap items-center gap-4 mb-6 justify-center md:justify-start">
                <div className="flex items-center gap-1 text-amber-500">
                  {[0, 1, 2, 3, 4].map((i) => <Star key={i} className="h-4 w-4 fill-current" />)}
                </div>
                <span className="text-sm text-muted-foreground">
                  <strong className="text-foreground">4.9/5</strong> · zaufali nam przedsiębiorcy w całej Polsce
                </span>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center md:justify-start gap-3">
                <Button size="lg" className="w-full sm:w-auto gap-2 text-base px-8 py-6 bg-gradient-to-r from-primary to-purple-600 hover:opacity-90" onClick={handleIssueInvoice}>
                  <FileText className="h-5 w-5" />
                  Wystaw fakturę za darmo
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
                <img src={mascot} alt="GetRido" className="relative w-72 md:w-[26rem] lg:w-[32rem] drop-shadow-2xl" />
              </div>
            </div>
          </div>

          {/* WOW stats */}
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
          <h2 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight">Wszystko, czego potrzebuje księgowość</h2>
          <p className="text-lg md:text-xl font-medium text-slate-700 dark:text-slate-200 max-w-2xl mx-auto leading-relaxed">
            Kompletny system do fakturowania, KSeF i magazynu z funkcjami AI, które oszczędzają godziny pracy każdego dnia.
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

      {/* How it works */}
      <section className="bg-muted/30 py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <Badge variant="secondary" className="mb-3">Jak to działa</Badge>
            <h2 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight">System, który się uczy</h2>
            <p className="text-lg md:text-xl font-medium text-slate-700 dark:text-slate-200 max-w-2xl mx-auto leading-relaxed">
              Wgrywasz pierwsze faktury, potwierdzasz dane — a AI zapamiętuje układ każdego dostawcy. Kolejne wpisują się same.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl mx-auto">
            {[
              { img: tileZakupy, step: "1", title: "Wgraj fakturę", text: "Zdjęcie lub PDF — nawet z telefonu, prosto z warsztatu." },
              { img: tileDokumenty, step: "2", title: "Zweryfikuj dane", text: "AI podpowiada pozycje i kwoty, Ty tylko klikasz akceptuj." },
              { img: tileMagazyn, step: "3", title: "Magazyn się aktualizuje", text: "Pozycje trafiają do magazynu z cenami i stanami — bez ręcznej pracy." },
              { img: tileKsef, step: "4", title: "KSeF & raporty", text: "Wystawiasz FA(3) do KSeF jednym kliknięciem. JPK_V7 gotowy." },
            ].map((m, i) => (
              <div key={i} className="relative rounded-2xl overflow-hidden border bg-card shadow-sm">
                <div className="aspect-video relative">
                  <img src={m.img} alt={m.title} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                  <div className="absolute top-3 left-3 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold shadow-lg">{m.step}</div>
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
            <Button size="lg" onClick={handleIssueInvoice} className="gap-3 h-16 md:h-20 px-8 md:px-14 text-lg md:text-2xl font-extrabold rounded-2xl bg-gradient-to-r from-primary via-purple-600 to-primary text-primary-foreground shadow-xl hover:shadow-2xl hover:scale-[1.02] transition-all">
              <FileText className="h-6 w-6 md:h-7 md:w-7" />
              Wystaw pierwszą fakturę
              <ArrowRight className="h-6 w-6 md:h-7 md:w-7" />
            </Button>
            <p className="mt-4 text-sm md:text-base font-medium text-slate-600 dark:text-slate-300">
              100% za darmo · bez karty · aktywacja w minutę
            </p>
          </div>
        </div>
      </section>

      <AuthModal open={showLoginModal} onOpenChange={setShowLoginModal} initialMode={loginMode} />
    </div>
  );
}

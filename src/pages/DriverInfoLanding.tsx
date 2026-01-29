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
  TrendingUp,
  ChevronRight,
  MessageCircle,
  Smartphone,
  Receipt,
  BarChart3,
  Wallet,
  FileCheck,
  PiggyBank,
  HandCoins,
  UserPlus
} from "lucide-react";
import { LoginModal } from "@/components/LoginModal";
import { UniversalHomeButton } from "@/components/UniversalHomeButton";

export default function DriverInfoLanding() {
  const navigate = useNavigate();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginMode, setLoginMode] = useState<'login' | 'register'>('register');

  const handleLogin = () => {
    setLoginMode('login');
    setShowLoginModal(true);
  };

  const handleRegister = () => {
    setLoginMode('register');
    setShowLoginModal(true);
  };

  const features = [
    {
      icon: Calculator,
      title: "Dokładne rozliczenia tygodniowe",
      description: "Zobacz swoje zarobki z Uber, Bolt i FreeNow. Szczegółowe rozliczenia co tydzień z pełną przejrzystością.",
      free: true
    },
    {
      icon: Clock,
      title: "Szybkie rozliczenia co tydzień",
      description: "Rozliczenia gotowe każdego tygodnia. Wiesz ile zarobisz zanim dostaniesz przelew.",
      free: true
    },
    {
      icon: FileText,
      title: "Automatyczne faktury B2B",
      description: "System sam generuje faktury VAT dla Twojego partnera flotowego. Zero ręcznej pracy, zero błędów.",
      free: true,
      highlight: true
    },
    {
      icon: CreditCard,
      title: "Automatyczne przelewy",
      description: "Generowanie dokumentów przelewów i rozliczeń. Wszystko gotowe do wypłaty bez dodatkowej pracy.",
      free: true
    },
    {
      icon: Fuel,
      title: "Historia kart paliwowych",
      description: "Pełny wgląd w tankowania, koszty paliwa i oszczędności. Śledź każdą transakcję.",
      free: true
    },
    {
      icon: Wrench,
      title: "Historia napraw i serwisów",
      description: "Kompletna dokumentacja wszystkich napraw, przeglądów i wymiany części Twojego pojazdu.",
      free: true
    },
    {
      icon: Receipt,
      title: "Wszystkie dokumenty w jednym miejscu",
      description: "Faktury, umowy, rozliczenia - wszystko uporządkowane i dostępne 24/7 z telefonu.",
      free: true
    },
    {
      icon: BarChart3,
      title: "Statystyki i analizy",
      description: "Zobacz trendy zarobków, porównaj platformy i optymalizuj swoją pracę na podstawie danych.",
      free: true
    }
  ];

  const benefits = [
    { icon: Check, text: "100% za darmo" },
    { icon: Zap, text: "Szybkie rozliczenia" },
    { icon: Shield, text: "Bezpieczne dane" },
    { icon: Smartphone, text: "Dostęp z telefonu 24/7" },
    { icon: FileCheck, text: "Automatyczne faktury" },
    { icon: PiggyBank, text: "Zero ukrytych opłat" }
  ];

  const platforms = [
    { name: "Uber", color: "bg-black" },
    { name: "Bolt", color: "bg-green-500" },
    { name: "FreeNow", color: "bg-red-500" }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <UniversalHomeButton />
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleLogin}>
              Zaloguj się
            </Button>
            <Button size="sm" onClick={handleRegister}>
              Zarejestruj się
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-12 md:py-20">
        <div className="max-w-4xl mx-auto text-center">
          <Badge className="mb-4 bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-sm px-4 py-1">
            <Sparkles className="h-3.5 w-3.5 mr-1" />
            100% Darmowy Portal Kierowcy
          </Badge>
          
      <h1 className="text-3xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-primary via-purple-600 to-primary bg-clip-text text-transparent">
            Twoje rozliczenia z Uber, Bolt i FreeNow
          </h1>
          
          <p className="text-lg md:text-xl text-muted-foreground mb-6 max-w-2xl mx-auto">
            Pełna kontrola nad zarobkami, automatyczne faktury B2B, historia paliwa i napraw. 
            Wszystko w jednym miejscu - kompletnie za darmo.
          </p>

          {/* Platform Badges */}
          <div className="flex items-center justify-center gap-3 mb-8">
            {platforms.map((platform) => (
              <Badge 
                key={platform.name}
                className={`${platform.color} text-white text-sm px-4 py-1.5`}
              >
                {platform.name}
              </Badge>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground">
            {benefits.slice(0, 3).map((benefit, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <benefit.icon className="h-4 w-4 text-emerald-500" />
                <span>{benefit.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="container mx-auto px-4 py-8">
        <div className="text-center mb-6">
          <h2 className="text-2xl md:text-3xl font-bold mb-2">
            Co zyskujesz jako kierowca?
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Kompletny system rozliczeń stworzony specjalnie dla kierowców Uber, Bolt i FreeNow
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {features.map((feature, idx) => (
            <Card 
              key={idx} 
              className={`group hover:shadow-lg transition-all duration-300 border-border/50 hover:border-primary/20 ${feature.highlight ? 'ring-2 ring-primary/20 bg-primary/5' : ''}`}
            >
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className={`p-2.5 rounded-xl ${feature.highlight ? 'bg-gradient-to-br from-primary/20 to-purple-500/20' : 'bg-primary/10'} shrink-0`}>
                    <feature.icon className={`h-5 w-5 ${feature.highlight ? 'text-primary' : 'text-primary'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm mb-1">{feature.title}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {feature.description}
                    </p>
                    {feature.free && (
                      <Badge variant="outline" className="mt-2 text-[10px] text-emerald-600 border-emerald-200 bg-emerald-50">
                        Darmowe
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* How to Join Section */}
      <section className="container mx-auto px-4 py-12">
        <Card className="bg-gradient-to-br from-purple-500/5 via-primary/5 to-purple-500/5 border-purple-200/50">
          <CardContent className="p-8 md:p-12">
            <div className="max-w-3xl mx-auto text-center">
              <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-gradient-to-br from-purple-500/20 to-primary/20 mb-6">
                <UserPlus className="h-8 w-8 text-purple-600" />
              </div>
              
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                Jak dołączyć do GetRido?
              </h2>
              
              <p className="text-muted-foreground mb-8 leading-relaxed max-w-2xl mx-auto">
                Dostęp do portalu kierowcy jest <strong>całkowicie darmowy</strong>. 
                Żeby korzystać z pełni funkcji, Twój partner flotowy musi być w systemie GetRido.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="p-5 rounded-xl bg-background/80 border">
                  <div className="text-3xl font-bold text-primary mb-2">1</div>
                  <div className="text-sm font-semibold mb-1">Zapytaj partnera</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    Sprawdź czy Twój partner flotowy korzysta z GetRido
                  </div>
                </div>
                <div className="p-5 rounded-xl bg-background/80 border">
                  <div className="text-3xl font-bold text-primary mb-2">2</div>
                  <div className="text-sm font-semibold mb-1">Poleć GetRido</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    Jeśli nie korzysta - powiedz mu o nas! Dołączenie jest darmowe
                  </div>
                </div>
                <div className="p-5 rounded-xl bg-background/80 border">
                  <div className="text-3xl font-bold text-primary mb-2">3</div>
                  <div className="text-sm font-semibold mb-1">Ciesz się apką</div>
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    Pełen dostęp do rozliczeń, faktur i historii - za darmo!
                  </div>
                </div>
              </div>

              <Card className="bg-background/90 border-primary/20">
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="p-2 rounded-full bg-primary/10">
                      <MessageCircle className="h-6 w-6 text-primary" />
                    </div>
                    <div className="text-left">
                      <h3 className="font-semibold mb-1">Powiedz partnerowi flotowemu:</h3>
                      <p className="text-sm text-muted-foreground italic">
                        "Chcę korzystać z GetRido - darmowego systemu rozliczeń dla kierowców. 
                        Dołączenie dla flot jest całkowicie za darmo i bez zobowiązań. 
                        Sprawdź na getrido.pl"
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* For Fleet Partners Section */}
      <section className="container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-bold mb-4">
            Dla partnerów flotowych
          </h2>
          <p className="text-muted-foreground mb-6">
            Zarządzasz flotą? GetRido to kompletny system rozliczeń - również <strong>całkowicie za darmo</strong>.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/50">
              <div className="p-2 rounded-lg bg-primary/10">
                <Car className="h-5 w-5 text-primary" />
              </div>
              <span className="font-medium text-sm">Zarządzanie flotą</span>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/50">
              <div className="p-2 rounded-lg bg-primary/10">
                <Wallet className="h-5 w-5 text-primary" />
              </div>
              <span className="font-medium text-sm">Automatyczne rozliczenia</span>
            </div>
            <div className="flex items-center gap-3 p-4 rounded-xl bg-muted/50">
              <div className="p-2 rounded-lg bg-primary/10">
                <HandCoins className="h-5 w-5 text-primary" />
              </div>
              <span className="font-medium text-sm">Zero opłat</span>
            </div>
          </div>

          <Button 
            variant="outline" 
            size="lg"
            asChild
            className="gap-2"
          >
            <a href="/fleet-info">
              Portal flotowy - rozliczaj kierowców i zarządzaj flotą
              <ChevronRight className="h-4 w-4" />
            </a>
          </Button>
        </div>
      </section>

      {/* Benefits List */}
      <section className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8">
            Dlaczego kierowcy wybierają GetRido?
          </h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {benefits.map((benefit, idx) => (
              <div 
                key={idx} 
                className="flex items-center gap-3 p-4 rounded-xl bg-muted/50 hover:bg-muted transition-colors"
              >
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <benefit.icon className="h-5 w-5 text-emerald-600" />
                </div>
                <span className="font-medium text-sm">{benefit.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-12 pb-20">
        <Card className="bg-gradient-to-r from-primary to-purple-600 border-0">
          <CardContent className="p-8 md:p-12 text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-4 text-white drop-shadow-md">
              Dołącz do tysięcy kierowców!
            </h2>
            <p className="text-white/90 mb-8 max-w-xl mx-auto drop-shadow-sm">
              Zapytaj swojego partnera flotowego czy korzysta z GetRido. 
              Jeśli nie - powiedz mu o nas. Dla Was obu jest to całkowicie darmowe!
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button 
                size="lg" 
                variant="secondary"
                className="w-full sm:w-auto gap-2 text-lg px-8"
                onClick={handleRegister}
              >
                <UserPlus className="h-5 w-5" />
                Załóż darmowe konto
                <ArrowRight className="h-5 w-5" />
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                className="w-full sm:w-auto gap-2 bg-white/10 border-white/20 text-white hover:bg-white/20"
                onClick={handleLogin}
              >
                Mam już konto
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Login Modal */}
      <LoginModal 
        open={showLoginModal} 
        onOpenChange={setShowLoginModal}
      />
    </div>
  );
}

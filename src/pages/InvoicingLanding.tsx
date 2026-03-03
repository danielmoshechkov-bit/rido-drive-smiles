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
  ChevronRight
} from "lucide-react";
import { AuthModal } from "@/components/auth/AuthModal";
import { UniversalHomeButton } from "@/components/UniversalHomeButton";

export default function InvoicingLanding() {
  const navigate = useNavigate();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginMode, setLoginMode] = useState<'login' | 'register'>('register');

  const handleIssueInvoice = () => {
    navigate('/faktury');
  };

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
      icon: FileText,
      title: "Faktury VAT i rachunki",
      description: "Wystawiaj profesjonalne faktury VAT, proformy, faktury zaliczkowe i rachunki w kilka sekund.",
      free: true
    },
    {
      icon: Calculator,
      title: "Automatyczne obliczenia",
      description: "System automatycznie oblicza VAT, kwoty netto i brutto dla różnych stawek podatkowych.",
      free: true
    },
    {
      icon: Package,
      title: "Moduł magazynowy",
      description: "Śledź stany magazynowe, zarządzaj produktami i kontroluj przepływ towarów w czasie rzeczywistym.",
      free: true
    },
    {
      icon: Camera,
      title: "OCR - skanowanie faktur",
      description: "Wgraj zdjęcie lub PDF faktury - AI automatycznie rozpozna i wprowadzi wszystkie dane.",
      free: true,
      ai: true
    },
    {
      icon: Brain,
      title: "Inteligentne mapowanie",
      description: "System uczy się Twoich dostawców i automatycznie przyporządkowuje pozycje do produktów w magazynie.",
      free: true,
      ai: true
    },
    {
      icon: TrendingUp,
      title: "Analiza marży i zysków",
      description: "Monitoruj rentowność każdej sprzedaży - system ostrzega gdy sprzedajesz poniżej kosztów zakupu.",
      free: true,
      ai: true
    },
    {
      icon: BarChart3,
      title: "Raporty i zestawienia",
      description: "Generuj zestawienia VAT, podsumowania sprzedaży i raporty dla księgowości.",
      free: true
    },
    {
      icon: Receipt,
      title: "Inwentaryzacja",
      description: "Przeprowadzaj inwentaryzację z telefonu - skanuj kody kreskowe i porównuj z stanem systemowym.",
      free: true
    }
  ];

  const benefits = [
    { icon: Check, text: "100% darmowy program" },
    { icon: Zap, text: "Błyskawiczne wystawianie faktur" },
    { icon: Shield, text: "Bezpieczne przechowywanie danych" },
    { icon: Clock, text: "Dostęp 24/7 z każdego urządzenia" },
    { icon: Users, text: "Nieograniczona liczba kontrahentów" },
    { icon: Brain, text: "AI która uczy się Twojego biznesu" }
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
            100% Darmowy program do faktur
          </Badge>
          
          <h1 className="text-3xl md:text-5xl font-bold mb-6 bg-gradient-to-r from-primary via-purple-600 to-primary bg-clip-text text-transparent">
            Fakturowanie i magazyn
            <br />
            z inteligentnym AI
          </h1>
          
          <p className="text-lg md:text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Wystawiaj faktury, zarządzaj magazynem i analizuj zyski. 
            Nasz system AI uczy się Twojego biznesu i automatyzuje 80% pracy.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
            <Button 
              size="lg" 
              className="w-full sm:w-auto gap-2 text-lg px-8 py-6 bg-gradient-to-r from-primary to-purple-600 hover:from-primary/90 hover:to-purple-600/90"
              onClick={handleIssueInvoice}
            >
              <FileText className="h-5 w-5" />
              Wystaw fakturę za darmo
              <ArrowRight className="h-5 w-5" />
            </Button>
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
      <section className="container mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <h2 className="text-2xl md:text-3xl font-bold mb-3">
            Wszystko, czego potrzebujesz
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Kompletny system do fakturowania i zarządzania magazynem z funkcjami AI
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((feature, idx) => (
            <Card 
              key={idx} 
              className="group hover:shadow-lg transition-all duration-300 border-border/50 hover:border-primary/20"
            >
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className={`p-2.5 rounded-xl ${feature.ai ? 'bg-gradient-to-br from-purple-500/20 to-primary/20' : 'bg-primary/10'} shrink-0`}>
                    <feature.icon className={`h-5 w-5 ${feature.ai ? 'text-purple-600' : 'text-primary'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-sm">{feature.title}</h3>
                      {feature.ai && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-purple-100 text-purple-700">
                          AI
                        </Badge>
                      )}
                    </div>
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

      {/* AI Learning Section */}
      <section className="container mx-auto px-4 py-12">
        <Card className="bg-gradient-to-br from-purple-500/5 via-primary/5 to-purple-500/5 border-purple-200/50">
          <CardContent className="p-8 md:p-12">
            <div className="max-w-3xl mx-auto text-center">
              <div className="inline-flex items-center justify-center p-3 rounded-2xl bg-gradient-to-br from-purple-500/20 to-primary/20 mb-6">
                <Brain className="h-8 w-8 text-purple-600" />
              </div>
              
              <h2 className="text-2xl md:text-3xl font-bold mb-4">
                System, który się uczy
              </h2>
              
              <p className="text-muted-foreground mb-6 leading-relaxed">
                Na początku wgrywasz faktury i pomagasz systemowi zrozumieć, gdzie są dane sprzedawcy, 
                pozycje i kwoty. Z czasem AI uczy się rozpoznawać formaty Twoich dostawców i <strong>automatycznie 
                wprowadza wszystkie dane</strong> bez Twojej pomocy.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
                <div className="p-4 rounded-xl bg-background/80 border">
                  <div className="text-2xl font-bold text-primary mb-1">1</div>
                  <div className="text-sm font-medium">Wgraj fakturę</div>
                  <div className="text-xs text-muted-foreground mt-1">Zdjęcie lub PDF</div>
                </div>
                <div className="p-4 rounded-xl bg-background/80 border">
                  <div className="text-2xl font-bold text-primary mb-1">2</div>
                  <div className="text-sm font-medium">Zweryfikuj dane</div>
                  <div className="text-xs text-muted-foreground mt-1">AI podpowiada, Ty zatwierdzasz</div>
                </div>
                <div className="p-4 rounded-xl bg-background/80 border">
                  <div className="text-2xl font-bold text-primary mb-1">3</div>
                  <div className="text-sm font-medium">Automatyzacja</div>
                  <div className="text-xs text-muted-foreground mt-1">Następne faktury same się wprowadzą</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Benefits List */}
      <section className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-2xl font-bold text-center mb-8">
            Dlaczego warto?
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
            <h2 className="text-2xl md:text-3xl font-bold mb-4 text-white">
              Zacznij już teraz - za darmo!
            </h2>
            <p className="text-white/90 mb-8 max-w-xl mx-auto">
              Nie wymagamy karty kredytowej. Wystawiaj faktury, zarządzaj magazynem 
              i korzystaj z AI bez żadnych opłat.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button 
                size="lg" 
                variant="secondary"
                className="w-full sm:w-auto gap-2 text-lg px-8"
                onClick={handleIssueInvoice}
              >
                <FileText className="h-5 w-5" />
                Wystaw pierwszą fakturę
                <ChevronRight className="h-5 w-5" />
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                className="w-full sm:w-auto gap-2 bg-white/10 border-white/20 text-white hover:bg-white/20"
                onClick={handleRegister}
              >
                Utwórz konto
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Auth Modal */}
      <AuthModal 
        open={showLoginModal} 
        onOpenChange={setShowLoginModal}
        initialMode={loginMode}
      />
    </div>
  );
}

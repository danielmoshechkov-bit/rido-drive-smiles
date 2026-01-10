import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  ArrowLeft, 
  Car, 
  FileText, 
  Users, 
  Bell, 
  Shield, 
  Calculator, 
  BarChart3, 
  Clock,
  Building2,
  CheckCircle2
} from 'lucide-react';
import tileFleet from '@/assets/tile-fleet.jpg';

const benefits = [
  {
    icon: Car,
    title: 'Historia napraw',
    description: 'Pełna dokumentacja serwisowa każdego pojazdu w jednym miejscu'
  },
  {
    icon: FileText,
    title: 'Dokumenty w chmurze',
    description: 'OC, przeglądy, umowy - zawsze pod ręką, nigdy nie zgubisz'
  },
  {
    icon: Users,
    title: 'Historia wynajmu',
    description: 'Kto, kiedy i jak długo jeździł autem - pełna przejrzystość'
  },
  {
    icon: Bell,
    title: 'Przypomnienia',
    description: 'Nigdy nie zapomnisz o przeglądzie czy ubezpieczeniu'
  },
  {
    icon: Shield,
    title: 'Najlepsze oferty OC/AC',
    description: 'Gdy zbliża się koniec ubezpieczenia, agenci z całej Polski wyślą Ci oferty'
  },
  {
    icon: Calculator,
    title: 'Rozliczenia z kierowcami',
    description: 'Automatyczne rozliczenia, raporty, historia płatności'
  },
  {
    icon: BarChart3,
    title: 'Statystyki i analizy',
    description: 'Przychody, koszty, rentowność każdego auta na wyciągnięcie ręki'
  },
  {
    icon: Clock,
    title: 'Oszczędność czasu',
    description: 'Wszystko w jednym miejscu - koniec z papierologią i Excelem'
  }
];

const targetAudience = [
  'Właściciele flot rideshare (Uber, Bolt, FreeNow)',
  'Firmy wynajmujące auta na minuty i długoterminowo',
  'Zarządcy flot firmowych',
  'Osoby z kilkoma autami na wynajem'
];

export default function FleetLanding() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate('/easy')}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Easy
            </Button>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              <span className="font-semibold text-lg">Portal Flot</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate('/auth')}
            >
              Zaloguj
            </Button>
            <Button 
              size="sm"
              onClick={() => navigate('/auth')}
            >
              Zarejestruj
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${tileFleet})` }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/95 to-background/80" />
        
        <div className="relative container mx-auto px-4 py-16 md:py-24">
          <div className="max-w-2xl">
            <h1 className="text-3xl md:text-5xl font-bold mb-4">
              Zarządzaj swoją flotą
              <span className="text-primary block">w jednym miejscu</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-8">
              Wynajem, serwis, dokumenty, przypomnienia - wszystko pod kontrolą. 
              Dołącz do setek właścicieli flot, którzy już oszczędzają czas i pieniądze.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button 
                size="lg" 
                className="gap-2"
                onClick={() => navigate('/auth')}
              >
                <Building2 className="h-5 w-5" />
                Zarejestruj flotę
              </Button>
              <Button 
                size="lg" 
                variant="outline"
                onClick={() => navigate('/auth')}
              >
                Mam już konto
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Grid */}
      <section className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-4">
            Wszystko czego potrzebujesz
          </h2>
          <p className="text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
            Portal Flot RIDO to kompleksowe narzędzie do zarządzania pojazdami, kierowcami i dokumentami
          </p>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
            {benefits.map((benefit, index) => (
              <Card key={index} className="border-border/50 hover:border-primary/50 transition-colors">
                <CardContent className="p-5">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <benefit.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="font-semibold mb-2">{benefit.title}</h3>
                  <p className="text-sm text-muted-foreground">{benefit.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Insurance Highlight */}
      <section className="py-16 bg-primary/5 border-y border-primary/20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <Shield className="h-12 w-12 text-primary mx-auto mb-4" />
            <h2 className="text-2xl md:text-3xl font-bold mb-4">
              Nigdy nie przepłacisz za ubezpieczenie
            </h2>
            <p className="text-lg text-muted-foreground mb-6">
              Gdy zbliża się koniec Twojego OC lub AC, automatycznie otrzymasz najlepsze oferty 
              od agentów ubezpieczeniowych z całej Polski. Ty wybierasz - oni konkurują o Twoje zlecenie.
            </p>
            <div className="flex items-center justify-center gap-2 text-primary font-medium">
              <CheckCircle2 className="h-5 w-5" />
              <span>Średnio 15% oszczędności na ubezpieczeniu</span>
            </div>
          </div>
        </div>
      </section>

      {/* Target Audience */}
      <section className="py-16">
        <div className="container mx-auto px-4">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-12">
            Dla kogo jest Portal Flot?
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
            {targetAudience.map((audience, index) => (
              <div 
                key={index}
                className="flex items-center gap-3 p-4 rounded-lg bg-muted/50"
              >
                <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0" />
                <span>{audience}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-primary/10">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-2xl md:text-3xl font-bold mb-4">
            Dołącz do nas już dziś
          </h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            Rejestracja jest bezpłatna. Zacznij zarządzać flotą profesjonalnie.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button 
              size="lg" 
              className="gap-2 min-w-[200px]"
              onClick={() => navigate('/auth')}
            >
              <Building2 className="h-5 w-5" />
              Zarejestruj flotę
            </Button>
          </div>
          
          <p className="mt-6 text-muted-foreground">
            Masz już konto?{' '}
            <Link to="/auth" className="text-primary hover:underline font-medium">
              Zaloguj się
            </Link>
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate('/easy')}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Wróć do GetRido Easy
            </Button>
            <p className="text-sm text-muted-foreground">
              © 2025 RIDO. Wszystkie prawa zastrzeżone.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

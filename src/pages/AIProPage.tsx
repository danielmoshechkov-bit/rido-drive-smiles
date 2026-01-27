import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAIPro } from '@/hooks/useAIPro';
import { toast } from 'sonner';
import { 
  Sparkles, 
  TrendingUp, 
  FileSearch, 
  Package, 
  PenTool, 
  Shield, 
  Calculator,
  Check,
  ArrowRight,
  Clock,
  Gift,
  Zap,
  Loader2
} from 'lucide-react';

export default function AIProPage() {
  const navigate = useNavigate();
  const [entityId, setEntityId] = useState<string | undefined>(undefined);
  
  // Load user's first entity
  useEffect(() => {
    const loadEntity = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: entities } = await supabase
          .from('entities')
          .select('id')
          .eq('owner_user_id', user.id)
          .limit(1);
        if (entities && entities.length > 0) {
          setEntityId(entities[0].id);
        }
      }
    };
    loadEntity();
  }, []);
  
  const {
    subscription, 
    exemption, 
    pricing, 
    loading, 
    hasAccess,
    isTrialAvailable,
    isTrialActive,
    isTrialExpired,
    trialEndsAt,
    startTrial 
  } = useAIPro(entityId);
  const [isStartingTrial, setIsStartingTrial] = useState(false);

  const handleStartTrial = async () => {
    if (!entityId) {
      toast.error('Najpierw dodaj firmę w ustawieniach');
      return;
    }

    setIsStartingTrial(true);
    const result = await startTrial();
    setIsStartingTrial(false);

    if (result.success) {
      toast.success(`Trial AI PRO aktywowany na ${pricing?.trial_days || 14} dni!`);
    } else {
      toast.error('Nie udało się aktywować trial: ' + result.error);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('pl-PL', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  };

  const features = [
    {
      icon: <TrendingUp className="h-6 w-6" />,
      title: 'Analiza zysku i marży',
      description: 'Automatyczne ostrzeżenia przy sprzedaży poniżej kosztu. Orientacyjne wyliczenia zysku po podatkach.',
      badge: 'Kluczowe'
    },
    {
      icon: <FileSearch className="h-6 w-6" />,
      title: 'OCR faktur zakupowych',
      description: 'Zrób zdjęcie faktury, a AI wyciągnie wszystkie pozycje, kwoty i stawki VAT do zatwierdzenia.',
      badge: 'Oszczędność czasu'
    },
    {
      icon: <Package className="h-6 w-6" />,
      title: 'Asystent magazynowy',
      description: 'Sugestie mapowań nazw produktów z faktur. Propozycje cen sprzedaży na bazie historii.',
      badge: 'Automatyzacja'
    },
    {
      icon: <PenTool className="h-6 w-6" />,
      title: 'Opisy sprzedażowe',
      description: 'Generowanie profesjonalnych opisów produktów i usług jednym kliknięciem.',
      badge: 'Marketing'
    },
    {
      icon: <Shield className="h-6 w-6" />,
      title: 'Kontrola zgodności',
      description: 'Sprawdzanie NIP-ów, walidacja sum, kontrola braków na dokumentach. Wykrywanie potencjalnych ryzyk.',
      badge: 'Bezpieczeństwo'
    },
    {
      icon: <Calculator className="h-6 w-6" />,
      title: 'Doradca podatkowy',
      description: 'Szacunkowe porady dotyczące optymalizacji podatkowej. Przypomnienia o terminach.',
      badge: 'PRO'
    }
  ];

  const faqs = [
    {
      question: 'Czy AI automatycznie księguje dokumenty?',
      answer: 'Nie. AI tylko SUGERUJE i POMAGA. Każda operacja wymaga Twojego zatwierdzenia kliknięciem.'
    },
    {
      question: 'Czy AI wysyła dane do urzędów?',
      answer: 'Nie. AI nie ma dostępu do zewnętrznych systemów. Działa wyłącznie w obrębie Twojego konta.'
    },
    {
      question: 'Czy mogę wyłączyć AI PRO?',
      answer: 'Tak, w każdej chwili. Po wyłączeniu tracisz dostęp do funkcji AI, ale Twoje dane pozostają.'
    },
    {
      question: 'Czy trial jest bezpłatny?',
      answer: `Tak. ${pricing?.trial_days || 14} dni testów bez żadnych opłat. Nie wymagamy karty kredytowej.`
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero section */}
      <div className="bg-gradient-to-br from-primary/10 via-background to-primary/5 py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6">
              <Sparkles className="h-4 w-4" />
              <span className="text-sm font-medium">GetRido AI PRO</span>
            </div>
            
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              Twój inteligentny asystent księgowy
            </h1>
            
            <p className="text-xl text-muted-foreground mb-8">
              AI PRO to Twój pomocnik, który <strong>sugeruje</strong> i <strong>ostrzega</strong> — ale nigdy nie decyduje za Ciebie.
              Każda operacja wymaga Twojego zatwierdzenia.
            </p>

            {/* Status & CTA */}
            {loading ? (
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Ładowanie...</span>
              </div>
            ) : exemption ? (
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/20 inline-block">
                <div className="flex items-center gap-2 text-primary">
                  <Gift className="h-5 w-5" />
                  <span className="font-semibold">
                    AI PRO — dostęp {exemption.valid_until ? `do ${formatDate(exemption.valid_until)}` : 'bezterminowy'}
                  </span>
                </div>
                {exemption.note && (
                  <p className="text-sm text-muted-foreground mt-1">{exemption.note}</p>
                )}
              </div>
            ) : isTrialActive ? (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-primary/10 border border-primary/20 inline-block">
                  <div className="flex items-center gap-2 text-primary">
                    <Clock className="h-5 w-5" />
                    <span className="font-semibold">
                      Trial aktywny — do {trialEndsAt && formatDate(trialEndsAt)}
                    </span>
                  </div>
                </div>
                <div>
                  <Button size="lg" className="gap-2">
                    <Zap className="h-5 w-5" />
                    Aktywuj AI PRO ({pricing?.price_pln_monthly || 99} zł/mies.)
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : isTrialExpired ? (
              <div className="space-y-4">
                <p className="text-destructive font-medium">Trial wygasł</p>
                <Button size="lg" className="gap-2">
                  <Zap className="h-5 w-5" />
                  Aktywuj AI PRO ({pricing?.price_pln_monthly || 99} zł/mies.)
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            ) : isTrialAvailable ? (
              <div className="space-y-4">
                <Button 
                  size="lg" 
                  onClick={handleStartTrial}
                  disabled={isStartingTrial || !entityId}
                  className="gap-2"
                >
                  {isStartingTrial ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <Gift className="h-5 w-5" />
                  )}
                  Testuj za darmo ({pricing?.trial_days || 14} dni)
                </Button>
                <p className="text-sm text-muted-foreground">
                  Bez karty kredytowej • Pełny dostęp • Anuluj kiedy chcesz
                </p>
              </div>
            ) : (
              <Button size="lg" className="gap-2">
                <Zap className="h-5 w-5" />
                Aktywuj AI PRO ({pricing?.price_pln_monthly || 99} zł/mies.)
                <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Features grid */}
      <div className="py-16 container mx-auto px-4">
        <h2 className="text-3xl font-bold text-center mb-12">Co oferuje AI PRO?</h2>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {features.map((feature, index) => (
            <Card key={index} className="relative overflow-hidden">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="p-3 rounded-lg bg-primary/10 text-primary">
                    {feature.icon}
                  </div>
                  <Badge variant="secondary">{feature.badge}</Badge>
                </div>
                <CardTitle className="mt-4">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">{feature.description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* How it works */}
      <div className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">Jak to działa?</h2>
          
          <div className="max-w-3xl mx-auto">
            <div className="space-y-6">
              {[
                'AI analizuje Twoje dane i przygotowuje sugestie',
                'Ty widzisz propozycje i decydujesz co zatwierdzić',
                'Każda operacja wymaga Twojego kliknięcia',
                'Pełna historia i audyt wszystkich działań AI'
              ].map((step, index) => (
                <div key={index} className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                    {index + 1}
                  </div>
                  <p className="text-lg">{step}</p>
                </div>
              ))}
            </div>
            
            <div className="mt-12 p-6 rounded-lg bg-primary/5 border border-primary/10">
              <div className="flex items-start gap-3">
                <Shield className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-semibold mb-1">Bezpieczeństwo i kontrola</h4>
                  <p className="text-muted-foreground">
                    AI nigdy nie wykonuje operacji automatycznie. Nie księguje, nie wysyła maili, nie zmienia statusów.
                    Wszystko robisz Ty — AI tylko pomaga i sugeruje.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* For who */}
      <div className="py-16 container mx-auto px-4">
        <h2 className="text-3xl font-bold text-center mb-12">Dla kogo?</h2>
        
        <div className="grid md:grid-cols-4 gap-6 max-w-4xl mx-auto">
          {['JDG', 'Spółki', 'Usługi', 'Handel'].map((type) => (
            <Card key={type} className="text-center">
              <CardContent className="pt-6">
                <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
                  <Check className="h-6 w-6" />
                </div>
                <h3 className="font-semibold">{type}</h3>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* FAQ */}
      <div className="py-16 bg-muted/30">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">Często zadawane pytania</h2>
          
          <div className="max-w-2xl mx-auto space-y-6">
            {faqs.map((faq, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="text-lg">{faq.question}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{faq.answer}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* Final CTA */}
      <div className="py-16 container mx-auto px-4">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-6">Gotowy na inteligentną księgowość?</h2>
          <p className="text-lg text-muted-foreground mb-8">
            Zacznij od darmowego trial i przekonaj się sam, jak AI może Ci pomóc.
          </p>
          
          {isTrialAvailable && !hasAccess && (
            <Button 
              size="lg" 
              onClick={handleStartTrial}
              disabled={isStartingTrial || !entityId}
              className="gap-2"
            >
              {isStartingTrial ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Gift className="h-5 w-5" />
              )}
              Testuj AI PRO za darmo
            </Button>
          )}
          
          <div className="mt-8">
            <Button variant="outline" onClick={() => navigate('/klient')}>
              Wróć do panelu
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

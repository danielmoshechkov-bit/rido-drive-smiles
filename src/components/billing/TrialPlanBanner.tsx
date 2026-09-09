import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ShieldCheck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { usePublicPricing } from '@/hooks/usePublicPricing';
import { useZakup } from '@/components/billing/ZakupProvider';
import { formatMoneyPLN } from '@/utils/formatters';

/**
 * Baner po rejestracji z cennika: „wybrałeś plan X, masz trial, kup i zachowaj
 * cenę startową".
 *
 * Powstał, żeby zamknąć wyciek konwersji: klient klikał „Kup Standard", przechodził
 * rejestrację i lądował w panelu — bez płatności i bez śladu po swoim wyborze.
 * Wysyłanie go od razu na checkout byłoby gorsze (właśnie dostał 30 dni gratis
 * i płatność wyglądałaby na pomyłkę systemu), więc zamiast tego przypominamy
 * wybór i dajemy powód, żeby kupić wcześniej.
 *
 * Wybrany plan czytamy z `user_metadata`, nie z adresu URL: parametr znika po
 * pierwszym przeładowaniu, a baner ma zostać przez cały okres próbny. Zapisuje
 * go `register-marketplace-user` przy rejestracji i `activate-workshop-trial`
 * przy aktywacji na istniejącym koncie.
 */
export function TrialPlanBanner({ providerId }: { providerId: string | null | undefined }) {
  const [planCode, setPlanCode] = useState<string | null>(null);
  const [maSubskrypcje, setMaSubskrypcje] = useState<boolean | null>(null);
  const { plans } = usePublicPricing();
  /**
   * Zakup prowadzi przez OKNO ZAKUPU, nie wprost do `billing-checkout`.
   *
   * 🔴 Ten przycisk wołał funkcję brzegową bezpośrednio i tym samym OMIJAŁ krok
   * „Dane do faktury". Warsztat bez tych danych — 25 z 30 kont na produkcji —
   * dostawał odmowę 409, którą front pokazywał jako „Edge Function returned
   * a non-2xx status code". Okno pyta o dane przed metodą płatności, więc
   * odmowa w ogóle nie ma jak powstać.
   */
  const { otworzZakup } = useZakup();

  useEffect(() => {
    let anulowane = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (anulowane) return;
      const wybrany = (user?.user_metadata as Record<string, unknown> | undefined)?.plan;
      setPlanCode(typeof wybrany === 'string' && wybrany ? wybrany : null);
    })();
    return () => { anulowane = true; };
  }, []);

  useEffect(() => {
    if (!providerId) { setMaSubskrypcje(null); return; }
    let anulowane = false;
    (async () => {
      // Kupił już — baner nie ma czego przypominać.
      const { data } = await supabase
        .from('billing_subscriptions' as any)
        .select('id')
        .eq('subscriber_type', 'service_provider')
        .eq('subscriber_id', providerId)
        .in('status', ['active', 'past_due'])
        .limit(1);
      if (!anulowane) setMaSubskrypcje(Array.isArray(data) && data.length > 0);
    })();
    return () => { anulowane = true; };
  }, [providerId]);

  const plan = plans.find((p) => p.code === planCode);

  // Milczymy, dopóki nie wiemy wszystkiego: bez planu, bez warsztatu, przy
  // planie darmowym lub indywidualnym, i gdy subskrypcja już jest.
  if (!plan || !providerId || maSubskrypcje !== false) return null;
  if (plan.is_custom || Number(plan.price_net) === 0) return null;

  const cena = formatMoneyPLN(plan.price_net);
  const docelowa = plan.price_net_target != null ? formatMoneyPLN(plan.price_net_target) : null;

  return (
    <Card className="border-primary/30 bg-gradient-to-r from-primary/5 via-purple-500/5 to-primary/5">
      <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            Wybrałeś plan {plan.name} — masz 30 dni pełnego dostępu za darmo.
          </p>
          <p className="text-sm text-muted-foreground">
            {docelowa
              ? `Kup teraz, żeby zachować cenę startową ${cena} netto miesięcznie zamiast ${docelowa}.`
              : `Kup teraz, żeby zachować cenę startową ${cena} netto miesięcznie.`}
          </p>
        </div>
        <Button
          size="sm"
          className="shrink-0"
          onClick={() => otworzZakup({ planCode: plan.code, providerId })}
        >
          Kup plan {plan.name}
        </Button>
      </CardContent>
    </Card>
  );
}

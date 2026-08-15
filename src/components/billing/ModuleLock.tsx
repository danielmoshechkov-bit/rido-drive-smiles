import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Lock, Loader2 } from 'lucide-react';
import { useCheckout } from '@/hooks/useCheckout';
import { usePublicPricing } from '@/hooks/usePublicPricing';
import type { PowodBlokady } from '@/hooks/useSubscriptionAccess';

/**
 * Nakładka blokująca moduł bez opłaconej subskrypcji.
 *
 * Dane ZOSTAJĄ widoczne pod spodem, przyciemnione. To nie jest ozdoba: warsztat
 * ma widzieć, co traci, i nie czuć, że zabraliśmy mu jego własność. Blokujemy
 * pracę, nie dostęp do informacji.
 *
 * Nakładka odcina wskaźnik myszy ORAZ klawiaturę (`inert`). Samo przyciemnienie
 * zostawiłoby formularze pod spodem osiągalne tabulatorem — blokada, którą da
 * się obejść klawiszem, nie jest blokadą.
 *
 * To warstwa wyglądu. Właściwym zabezpieczeniem jest RLS i bramka w edge
 * functions; ktoś z narzędziami deweloperskimi ma trafić na odmowę z bazy.
 */
export function ModuleLock({
  zablokowane,
  powod,
  children,
}: {
  zablokowane: boolean;
  powod: PowodBlokady;
  children: ReactNode;
}) {
  const { kup, pending } = useCheckout();
  const { plans } = usePublicPricing();

  if (!zablokowane) return <>{children}</>;

  // Do odblokowania proponujemy najtańszy płatny plan warsztatowy — klient
  // i tak zmieni go w checkoucie, a wybór „od czegoś" jest lepszy niż lista.
  const plan = plans
    .filter((p) => p.product_line === 'warsztat' && !p.is_custom && Number(p.price_net) > 0)
    .sort((a, b) => Number(a.price_net) - Number(b.price_net))[0];

  const platnosc = powod === 'platnosc';

  return (
    <div className="relative">
      {/* `inert` wyłącza cały poddrzewo z interakcji i z nawigacji klawiaturą. */}
      <div className="pointer-events-none select-none blur-[2px] opacity-40" {...({ inert: '' } as any)}>
        {children}
      </div>

      <div className="absolute inset-0 z-10 flex items-start justify-center pt-16 px-4">
        <div className="max-w-md w-full rounded-xl border bg-background/95 backdrop-blur shadow-xl p-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>

          <h3 className="text-lg font-bold mb-2">
            {platnosc ? 'Nie udało się pobrać płatności' : 'Subskrypcja wygasła'}
          </h3>

          <p className="text-sm text-muted-foreground mb-5">
            {platnosc
              ? 'Zaktualizuj kartę albo opłać abonament, aby odblokować dostęp. Twoje dane są bezpieczne — nic nie zostało usunięte.'
              : 'Wykup plan, aby wrócić do pracy. Twoje dane są bezpieczne — nic nie zostało usunięte.'}
          </p>

          {plan && (
            <Button
              className="w-full"
              disabled={!!pending}
              onClick={() => kup(plan.code)}
            >
              {pending === plan.code ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {platnosc ? 'Opłać abonament' : `Wykup plan od ${Number(plan.price_net)} zł netto`}
            </Button>
          )}

          <p className="mt-4 text-xs text-muted-foreground">
            Podgląd danych i eksport do CSV oraz PDF działają bez przerwy,
            niezależnie od stanu subskrypcji.
          </p>
        </div>
      </div>
    </div>
  );
}

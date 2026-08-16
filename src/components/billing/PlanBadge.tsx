import { Link } from 'react-router-dom';
import { Sparkles, AlertTriangle } from 'lucide-react';
import { useSubscriptionAccess } from '@/hooks/useSubscriptionAccess';
import { useSubscriptionDetails } from '@/hooks/useSubscriptionDetails';

/**
 * Plan i stan subskrypcji przy nazwie firmy, na stałe widoczne.
 *
 * Baner na Pulpicie łatwo przewinąć i przestaje być zauważany po drugim
 * wejściu. Licznik dni w pasku widać za każdym razem, a to on decyduje, czy
 * ktoś kupi przed końcem okresu próbnego, czy dowie się o końcu z blokady.
 *
 * Świadomie NIE pokazujemy niczego przy aktywnej subskrypcji bez daty końca
 * blisko — pasek ma nieść informację, a nie stale przypominać o płaceniu
 * komuś, kto już zapłacił.
 */
const dniDo = (iso: string | null): number | null => {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
};

// Po polsku odmienia się tylko jedynka: „1 dzień", reszta to „dni".
const odmianaDni = (n: number) => (n === 1 ? 'dzień' : 'dni');

export function PlanBadge({ providerId }: { providerId: string | null | undefined }) {
  const dostep = useSubscriptionAccess(providerId, 'warsztat');
  const { data: szczegoly } = useSubscriptionDetails(providerId);

  if (!providerId || dostep.loading) return null;

  const nazwa = szczegoly?.nazwaPlanu;

  // ── Blokada ────────────────────────────────────────────────────────
  if (!dostep.moznaPracowac) {
    return (
      <Link
        to="/cennik"
        className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/15"
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        {dostep.powod === 'platnosc' ? 'Płatność nieudana' : 'Brak aktywnego planu'}
      </Link>
    );
  }

  // ── Okres próbny ───────────────────────────────────────────────────
  // `stan === 'aktywna'` bez wiersza subskrypcji płatnej znaczy trial:
  // `useSubscriptionAccess` schodzi do niego dopiero przy braku tego wiersza.
  const wTrialu = !szczegoly && dostep.koniecOkresu;
  if (wTrialu) {
    const dni = dniDo(dostep.koniecOkresu);
    if (dni === null) return null;

    // Ostatni tydzień wyróżniamy kolorem — to moment, w którym decyzja
    // o zakupie albo zapada, albo klient znika.
    const pilne = dni <= 7;
    return (
      <Link
        to="/cennik"
        className={
          'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ' +
          (pilne
            ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20'
            : 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/15')
        }
        title="Kliknij, aby wybrać plan"
      >
        <Sparkles className="h-3.5 w-3.5" />
        {nazwa ? `${nazwa} · ` : ''}okres próbny, {dni} {odmianaDni(dni)}
      </Link>
    );
  }

  // ── Subskrypcja opłacona ───────────────────────────────────────────
  if (!nazwa) return null;
  return (
    <Link
      to="/uslugi/panel?tab=account"
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
      title="Twój plan"
    >
      {nazwa}
      {dostep.stan === 'karencja' && (
        <span className="text-destructive">· płatność nieudana</span>
      )}
    </Link>
  );
}

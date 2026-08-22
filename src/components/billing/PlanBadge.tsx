import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * Dokąd prowadzi „Wybierz plan".
 *
 * Prowadziło na /cennik — wspólną stronę wszystkich linii produktowych, gdzie
 * warsztat trafiał na zakładki innych modułów i musiał szukać swoich planów.
 * Ta plakietka z definicji dotyczy warsztatu (pyta o dostęp dla linii
 * 'warsztat'), więc kieruje na sekcję z pakietami warsztatu — tam karty
 * planów prowadzą wprost do płatności (wspólne `usePlanAction`).
 */
const SCIEZKA_PAKIETOW = '/warsztat-info#plany';
import { Sparkles, AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSubscriptionAccess } from '@/hooks/useSubscriptionAccess';
import { useSubscriptionDetails } from '@/hooks/useSubscriptionDetails';
import { usePublicPricing } from '@/hooks/usePublicPricing';
import { useCheckout } from '@/hooks/useCheckout';

/**
 * Plan i stan subskrypcji przy nazwie firmy, na stałe widoczne.
 *
 * Baner na Pulpicie łatwo przewinąć i przestaje być zauważany po drugim
 * wejściu — a widać go tylko na jednej zakładce. Licznik w pasku jest przy
 * każdym ekranie i to on decyduje, czy ktoś kupi przed końcem okresu próbnego,
 * czy dowie się o końcu dopiero z blokady.
 *
 * Nazwa planu w okresie próbnym pochodzi z `user_metadata.plan`, nie
 * z `billing_subscriptions` — tam wiersz pojawia się dopiero po zakupie.
 */
const dniDo = (iso: string | null): number | null => {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
};

// Po polsku odmienia się tylko jedynka: „1 dzień", reszta to „dni".
const odmianaDni = (n: number) => (n === 1 ? 'dzień' : 'dni');

/**
 * Powyżej tylu dni licznik przestaje nieść informację.
 *
 * „Okres próbny, 503 dni" nie mówi nic użytecznego — a wygląda jak usterka.
 * Licznik ma znaczenie wtedy, gdy zbliża się decyzja o zakupie, czyli
 * w ostatnich tygodniach. Dłuższe okresy to dostęp nadany ręcznie (jak trzem
 * warsztatom przed uruchomieniem bramkowania) i tam liczba dni to szum.
 */
const PROG_LICZNIKA_DNI = 90;

export function PlanBadge({ providerId }: { providerId: string | null | undefined }) {
  const dostep = useSubscriptionAccess(providerId, 'warsztat');
  const { data: szczegoly } = useSubscriptionDetails(providerId);
  const { plans } = usePublicPricing();
  const { kup, pending } = useCheckout();

  const [kodPlanuZKonta, setKodPlanuZKonta] = useState<string | null>(null);

  useEffect(() => {
    let anulowane = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (anulowane) return;
      const wybrany = (data.user?.user_metadata as Record<string, unknown> | undefined)?.plan;
      setKodPlanuZKonta(typeof wybrany === 'string' && wybrany ? wybrany : null);
    })();
    return () => { anulowane = true; };
  }, []);

  if (!providerId || dostep.loading) return null;

  const planZKonta = plans.find((p) => p.code === kodPlanuZKonta);

  // ── Tryb dokończenia ───────────────────────────────────────────────
  // MUSI stać przed blokadą: `moznaPracowac` jest tu fałszem, więc bez tej
  // gałęzi plakietka pokazywałaby „Brak aktywnego planu" — nieprawdę, bo
  // warsztat wciąż domyka rozpoczęte zlecenia.
  //
  // Pasek na dole ekranu mówi to samo szerzej. Plakietka nie powtarza jego
  // treści, tylko niesie tę jedną liczbę, która jest istotna wszędzie: ile dni.
  if (dostep.stan === 'dokanczanie') {
    const dni = dostep.dniDoBloku;
    return (
      <Link
        to={SCIEZKA_PAKIETOW}
        className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/15"
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        {dni !== null && dni > 0
          ? `Dokończenie · ${dni} ${odmianaDni(dni)}`
          : 'Dokończenie · ostatnie godziny'}
      </Link>
    );
  }

  // ── Blokada ────────────────────────────────────────────────────────
  if (!dostep.moznaPracowac) {
    return (
      <Link
        to={SCIEZKA_PAKIETOW}
        className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/15"
      >
        <AlertTriangle className="h-3.5 w-3.5" />
        {dostep.powod === 'platnosc' ? 'Płatność nieudana' : 'Brak aktywnego planu'}
      </Link>
    );
  }

  // ── Okres próbny ───────────────────────────────────────────────────
  //
  // 🔴 NAPRAWIONE 22.08.2026. Warunek brzmiał `!szczegoly && dostep.koniecOkresu`,
  // czyli „brak wiersza w `billing_subscriptions` znaczy okres próbny". Była to
  // prawda dokładnie do wariantu A, który dał wiersz KAŻDEMU warsztatowi —
  // i licznik dni zniknął z paska wszystkim w okresie próbnym, bez śladu błędu.
  //
  // Stan czytamy teraz ze STATUSU. Obecność wiersza przestała cokolwiek znaczyć.
  if (dostep.okresProbny && dostep.koniecOkresu) {
    const dni = dniDo(dostep.koniecOkresu);
    if (dni === null) return null;

    // Ostatni tydzień na bursztynowo — to moment, w którym decyzja o zakupie
    // albo zapada, albo klient znika.
    const pilne = dni <= 7;
    const pokazLicznik = dni <= PROG_LICZNIKA_DNI;
    const mozliwyZakup = planZKonta && !planZKonta.is_custom && Number(planZKonta.price_net) > 0;

    return (
      <span
        className={
          'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium ' +
          (pilne
            ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400'
            : 'border-primary/40 bg-primary/10 text-primary')
        }
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0" />
        <span>
          {/* Nazwa planu z `user_metadata` — to, co klient wybrał przy rejestracji.
              NIE z subskrypcji: po wariancie A stoi tam `trial_warsztat`, plan
              techniczny spoza cennika, więc „Okres próbny — Warsztat · okres
              próbny" brzmiałoby jak usterka. */}
          {planZKonta ? `${planZKonta.name} · ` : ''}okres próbny
          {pokazLicznik ? `, ${dni} ${odmianaDni(dni)}` : ''}
        </span>

        {/* „Przedłuż" prowadzi wprost do płatności za wybrany plan. Gdy planu
            nie znamy (rejestracja bez wyboru karty), kierujemy na cennik —
            nie zgadujemy, za co klient miałby zapłacić. */}
        {mozliwyZakup ? (
          <button
            type="button"
            disabled={!!pending}
            onClick={() => kup(planZKonta!.code)}
            className="inline-flex items-center gap-1 rounded-full bg-current/10 px-2 py-0.5 underline underline-offset-2 hover:bg-current/20 disabled:opacity-60"
          >
            {pending === planZKonta!.code && <Loader2 className="h-3 w-3 animate-spin" />}
            Przedłuż
          </button>
        ) : (
          <Link
            to={SCIEZKA_PAKIETOW}
            className="rounded-full bg-current/10 px-2 py-0.5 underline underline-offset-2 hover:bg-current/20"
          >
            Wybierz plan
          </Link>
        )}
      </span>
    );
  }

  // ── Subskrypcja opłacona ───────────────────────────────────────────
  // Bez licznika i bez zachęty: pasek ma nieść informację, a nie przypominać
  // o płaceniu komuś, kto już zapłacił.
  if (!szczegoly?.nazwaPlanu) return null;
  return (
    <Link
      to="/uslugi/panel?tab=account"
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
      title="Twój plan"
    >
      {szczegoly.nazwaPlanu}
      {dostep.stan === 'karencja' && <span className="text-destructive">· płatność nieudana</span>}
    </Link>
  );
}

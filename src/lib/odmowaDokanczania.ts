/**
 * Rozpoznanie odmowy z trybu dokończenia i zamiana jej na komunikat,
 * który mówi, CO ZROBIĆ — nie tylko, że się nie da.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SKĄD BIORĄ SIĘ TE ODMOWY
 * ═══════════════════════════════════════════════════════════════════════════
 * Z dwóch różnych miejsc w bazie i wyglądają zupełnie inaczej:
 *
 *  1. WYZWALACZ przy podmianie klienta albo auta rzuca wyjątek z prefiksem
 *     `TRYB_DOKONCZENIA:`. Ma treść, którą da się pokazać wprost.
 *
 *  2. POLITYKA RLS przy zakładaniu nowego zlecenia zwraca suche
 *     „new row violates row-level security policy". Dla klienta to nie znaczy
 *     nic — i to jest gorszy przypadek, bo częstszy.
 *
 * Rozpoznajemy oba i mówimy to samo: co się stało, co dalej.
 *
 * Sprawdzenie po TREŚCI, nie po kodzie błędu: PostgREST zwraca `42501` zarówno
 * przy polityce, jak i przy braku uprawnień do tabeli, a te dwie rzeczy znaczą
 * dla klienta co innego.
 */

export interface OdmowaDokanczania {
  tytul: string;
  opis: string;
  cta: string;
}

const NOWE_ZLECENIE: OdmowaDokanczania = {
  tytul: 'Nie możesz teraz założyć nowego zlecenia',
  opis:
    'Twój okres rozliczeniowy się skończył. Możesz dokończyć zlecenia, które już masz — ' +
    'zmienić status, dopisać części, wystawić fakturę. Nowe zlecenia wracają po wykupieniu planu.',
  cta: 'Wybierz plan',
};

const PODMIANA: OdmowaDokanczania = {
  tytul: 'Nie możesz zmienić klienta ani pojazdu w tym zleceniu',
  opis:
    'Rozpoczęte zlecenia możesz dokończyć, ale ich dane pozostają takie, jakie były. ' +
    'Wykup plan, żeby wrócić do pełnej pracy.',
  cta: 'Wybierz plan',
};

/**
 * Zwraca komunikat, gdy błąd pochodzi z trybu dokończenia — albo `null`,
 * gdy to coś innego. `null` znaczy „nie moja sprawa": wywołujący ma wtedy
 * pokazać własny komunikat, a nie zgadywać.
 */
export function rozpoznajOdmowe(blad: unknown): OdmowaDokanczania | null {
  const tekst = [
    (blad as { message?: string })?.message,
    (blad as { details?: string })?.details,
    (blad as { hint?: string })?.hint,
    typeof blad === 'string' ? blad : '',
  ].filter(Boolean).join(' ').toLowerCase();

  if (!tekst) return null;

  if (tekst.includes('tryb_dokonczenia')) return PODMIANA;

  // Polityka RLS na `workshop_orders` przy zakładaniu — jedyny przypadek,
  // w którym warsztat w trybie dokończenia trafia na odmowę bez treści.
  if (tekst.includes('row-level security') && tekst.includes('workshop_orders')) {
    return NOWE_ZLECENIE;
  }

  return null;
}

/**
 * Pokazuje komunikat odmowy z przyciskiem prowadzącym do cennika.
 * Zwraca `true`, gdy odmowa pochodziła z trybu dokończenia i została obsłużona —
 * wtedy wywołujący NIE pokazuje swojego komunikatu.
 *
 * Przycisk zamiast samego tekstu, bo komunikat mówiący wyłącznie „nie da się"
 * zostawia człowieka w tym samym miejscu, w którym był.
 */
export function pokazOdmowe(
  blad: unknown,
  toast: { error: (t: string, o?: Record<string, unknown>) => void },
): boolean {
  const o = rozpoznajOdmowe(blad);
  if (!o) return false;

  toast.error(o.tytul, {
    description: o.opis,
    duration: 12_000,   // dłużej niż zwykły błąd — jest co przeczytać
    action: {
      label: o.cta,
      // `assign`, nie `useNavigate`: ta funkcja jest wołana z haków danych,
      // które nie muszą stać pod routerem.
      onClick: () => window.location.assign('/cennik'),
    },
  });
  return true;
}

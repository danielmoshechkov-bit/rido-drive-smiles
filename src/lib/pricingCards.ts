import { formatMoneyPLN } from '@/utils/formatters';
import type { PublicPlan } from '@/hooks/usePublicPricing';

/**
 * Etykiety karty cennika liczone z planu.
 *
 * Wspólne dla /cennik i /warsztat-info. Same liczby idą z bazy, ale sposób ich
 * pokazania musi być jeden: gdyby każda strona formatowała po swojemu, klient
 * porównujący obie zobaczyłby dwa różne komunikaty o tej samej ofercie — a to
 * dokładnie ten problem, dla którego cennik trafił do bazy.
 */
export interface PlanPriceLabels {
  /** Kwota główna albo „Wycena" dla planów indywidualnych. */
  price: string;
  /** Dopisek przy kwocie: „netto / mc", „/ mc", „indywidualna". */
  period: string;
  /** Cena docelowa do przekreślenia; undefined = cennik się nie zmienia. */
  target?: string;
  /** Druga linia pod ceną, np. kwota brutto. */
  note?: string;
}

export function planPriceLabels(plan: PublicPlan): PlanPriceLabels {
  if (plan.is_custom) {
    return { price: 'Wycena', period: 'indywidualna' };
  }

  const net = Number(plan.price_net ?? 0);
  return {
    price: formatMoneyPLN(net),
    period: net === 0 ? '/ mc' : 'netto / mc',
    // Cena docelowa jest widoczna od pierwszego dnia — nie ma podwyżki, jest
    // koniec promocji. Przekreślona obok startowej mówi to bez słów.
    target: plan.price_net_target != null ? formatMoneyPLN(plan.price_net_target) : undefined,
    note: net === 0 ? undefined : `${formatMoneyPLN(plan.price_gross)} brutto`,
  };
}

/**
 * Napis na przycisku. Liczba dni triala pochodzi z planu, nie z kodu.
 *
 * `jestKlientem` mówi, czy ten klient JUŻ korzysta z tej linii produktowej
 * — ma trial albo subskrypcję. Bez tego napis „Wypróbuj 30 dni" pokazywał się
 * komuś, kto jest w okresie próbnym od pół roku: przycisk prowadził do
 * płatności, a obiecywał darmowy okres. Klient mógł uznać, że przedłuża trial,
 * i nie kliknąć — albo kliknąć i zdziwić się płatnością.
 *
 * Domyślnie `false`, więc wywołania bez tego argumentu działają jak dotąd.
 */
export function planCtaLabel(
  plan: PublicPlan,
  stan?: { jestKlientem?: boolean },
): string {
  if (plan.is_custom) return 'Napisz do nas';
  if (Number(plan.price_net) === 0) return 'Zacznij za darmo';
  // Agent nie ma triala — zamiast niego jest numer demonstracyjny i rozmowa
  // na żywo przy sprzedaży (decyzja z rewizji cennika).
  if (plan.product_line === 'agent') return 'Posłuchaj agenta';

  // Kto już jest w tej linii, nie dostanie drugiego okresu próbnego —
  // jedyną sensowną akcją jest dla niego zapłata.
  if (stan?.jestKlientem) return 'Kup';

  if (plan.trial_days > 0) return `Wypróbuj ${plan.trial_days} dni`;
  return 'Wybieram plan';
}

/**
 * Ile dni triala obiecujemy w tekstach strony.
 *
 * Bierzemy maksimum z planów danej linii: trial jest jeden dla produktu, a
 * różne plany mogą mieć go ustawionego różnie albo wcale (Free, Sieci).
 * Zero znaczy „nie obiecujemy triala" i teksty o nim mają wtedy zniknąć,
 * zamiast pokazać „0 dni za darmo".
 */
export function trialDaysFor(plans: PublicPlan[], line: PublicPlan['product_line']): number {
  return plans
    .filter((p) => p.product_line === line)
    .reduce((max, p) => Math.max(max, Number(p.trial_days) || 0), 0);
}

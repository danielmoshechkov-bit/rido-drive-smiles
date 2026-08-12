/**
 * Jednostki liczników billingowych w polskiej odmianie.
 *
 * Klucz to `billing_features.unit` — dokładnie ten ciąg, który administrator
 * wpisał w panelu Funkcji. Nowa jednostka = jedna linia tutaj. Jednostka
 * nieznana wypisze się bez odmiany i bez dopisku okresu, więc brak wpisu nigdy
 * nie wywali karty cennika ani nie obieca czegoś, czego nie ma.
 *
 * `perMonth` odróżnia licznik miesięczny (zlecenia, pytania, minuty) od limitu
 * pojemnościowego (połączenia równoczesne, numery telefoniczne). Ten drugi nie
 * odnawia się co miesiąc — dopisek „/ mies." byłby przy nim po prostu nieprawdą.
 */
type UnitForms = { one: string; few: string; many: string; perMonth: boolean };

const UNITS: Record<string, UnitForms> = {
  zlecenie:    { one: 'zlecenie',    few: 'zlecenia',    many: 'zleceń',      perMonth: true },
  pytanie:     { one: 'pytanie',     few: 'pytania',     many: 'pytań',       perMonth: true },
  wycena:      { one: 'wycena',      few: 'wyceny',      many: 'wycen',       perMonth: true },
  minuta:      { one: 'minuta',      few: 'minuty',      many: 'minut',       perMonth: true },
  sprawdzenie: { one: 'sprawdzenie', few: 'sprawdzenia', many: 'sprawdzeń',   perMonth: true },
  sms:         { one: 'SMS',         few: 'SMS-y',       many: 'SMS-ów',      perMonth: true },
  połączenie:  { one: 'połączenie',  few: 'połączenia',  many: 'połączeń',    perMonth: false },
  numer:       { one: 'numer',       few: 'numery',      many: 'numerów',     perMonth: false },
  pojazd:      { one: 'pojazd',      few: 'pojazdy',     many: 'pojazdów',    perMonth: false },
};

const formsFor = (unit: string | null | undefined) =>
  unit ? UNITS[unit.trim().toLowerCase()] : undefined;

/** Odmiana jednostki przez liczbę wg reguły polskiej (1 / 2–4 / reszta). */
export function pluralUnit(n: number, unit: string | null | undefined): string {
  const f = formsFor(unit);
  if (!f) return unit ?? '';
  if (n === 1) return f.one;
  const d = n % 10;
  const h = n % 100;
  if (d >= 2 && d <= 4 && !(h >= 12 && h <= 14)) return f.few;
  return f.many;
}

/** Czy licznik odnawia się co miesiąc. Nieznana jednostka → nie twierdzimy nic. */
export function unitIsMonthly(unit: string | null | undefined): boolean {
  return formsFor(unit)?.perMonth ?? false;
}

const INT = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });

export interface LabelFeature {
  name: string;
  kind: 'boolean' | 'metered';
  unit: string | null;
}

export interface LabelRow {
  limit_value: number | null;
  soft_limit_value: number | null;
}

/**
 * Etykieta funkcji na karcie cennika.
 *
 * Próg miękki (fair use) NIE trafia na stronę — to nasza jednostka kosztowa,
 * nie jednostka wartości klienta. Ale skoro próg istnieje, nie wolno też pisać
 * „bez limitu": funkcja z progiem pokazuje samą nazwę.
 */
export function featureLabel(feature: LabelFeature, row: LabelRow): string {
  if (feature.kind !== 'metered') return feature.name;

  if (row.limit_value === null || row.limit_value === undefined) {
    return row.soft_limit_value === null || row.soft_limit_value === undefined
      ? `${feature.name} — bez limitu`
      : feature.name;
  }

  const n = Number(row.limit_value);
  if (!Number.isFinite(n)) return feature.name;

  const unit = pluralUnit(n, feature.unit);
  const period = unitIsMonthly(feature.unit) ? ' / mies.' : '';
  return unit
    ? `${feature.name} — ${INT.format(n)} ${unit}${period}`
    : `${feature.name} — ${INT.format(n)}${period}`;
}

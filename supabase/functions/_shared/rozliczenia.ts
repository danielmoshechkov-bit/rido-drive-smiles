// Wspólne źródło prawdy dla rozliczeń kierowców Uber / Bolt / FreeNow.
//
// Wzory pochodzą z arkusza, którym flota rozlicza się naprawdę
// (`fixtures/wzorzec-rozliczenia.csv`) i są sprawdzone co do grosza na czterech
// kierowcach z tego arkusza — patrz `rozliczenia_test.ts`.
//
// Ten plik jest importowany z DWÓCH stron:
//   - front:   src/lib/rozliczenia.ts (re-eksport, ten sam wzorzec co invoiceNumbering)
//   - Deno:    supabase/functions/settlements, supabase/functions/recalculate-week
// Nie wolno tu używać niczego z Deno ani z DOM — ma działać w obu środowiskach.

/** Paliwo w Polsce ma VAT 23%. Kwota z faktury jest brutto, więc VAT = brutto × 23/123. */
export const STAWKA_VAT_PALIWA_PROC = 23;

/** Przy aucie używanym także prywatnie odliczyć wolno połowę VAT-u od paliwa. */
export const UDZIAL_ODLICZENIA_VAT_PALIWA = 0.5;

export function zaokragl2(kwota: number): number {
  if (!Number.isFinite(kwota)) return 0;
  return Math.round((kwota + Number.EPSILON) * 100) / 100;
}

function liczba(wartosc: unknown): number {
  const n = typeof wartosc === "number" ? wartosc : Number(wartosc);
  return Number.isFinite(n) ? n : 0;
}

/** VAT zawarty w kwocie brutto wydanej na paliwo. */
export function vatOdPaliwa(wydanoNaPaliwo: number): number {
  const brutto = liczba(wydanoNaPaliwo);
  if (brutto <= 0) return 0;
  return brutto * STAWKA_VAT_PALIWA_PROC / (100 + STAWKA_VAT_PALIWA_PROC);
}

/** Połowa VAT-u od paliwa — tyle POMNIEJSZA podatek (nie: tyle wraca kierowcy). */
export function odliczenieVatOdPaliwa(wydanoNaPaliwo: number): number {
  return vatOdPaliwa(wydanoNaPaliwo) * UDZIAL_ODLICZENIA_VAT_PALIWA;
}

export interface SkladnikiPrzychodu {
  /** Uber, kolumna D „Wypłacono Ci" — przelew bezgotówkowy od Ubera. */
  uberWyplacono: number;
  /**
   * Uber, kolumna F „Odebrana gotówka" — w CSV UJEMNA, bo Uber potrąca ją
   * z wypłaty. To dalej zarobek kierowcy, więc do przychodu wchodzi wartością
   * bezwzględną. Pominięcie jej zaniża podatek dokładnie o 8% gotówki
   * (Dawid Czostek: 42,02 zamiast 49,22).
   */
  uberGotowka: number;
  /** Bolt, kolumna D „Zarobki brutto". */
  boltBrutto: number;
  /** FreeNow, kolumna S „Zarobki przed odliczeniem prowizji". */
  freeNowPrzedProwizja: number;
}

/** Przychód łączny = podstawa opodatkowania kierowcy za tydzień. */
export function przychodLaczny(s: SkladnikiPrzychodu): number {
  return (
    Math.max(0, liczba(s.uberWyplacono)) +
    Math.abs(liczba(s.uberGotowka)) +
    Math.max(0, liczba(s.boltBrutto)) +
    Math.max(0, liczba(s.freeNowPrzedProwizja))
  );
}

export interface WejscieDoPodatku {
  /** Przychód łączny (patrz `przychodLaczny`). */
  przychod: number;
  /** Stawka w procentach — z planu kierowcy, w razie jego braku z ustawień miasta. */
  stawkaProcent: number;
  /** Kwota brutto z faktur paliwowych za ten tydzień. */
  wydanoNaPaliwo: number;
  /**
   * `false` dla planu ryczałtowego („159 zł bez podatku") i dla kierowcy B2B,
   * który wystawia flocie fakturę — wtedy podatek NIE jest naliczany, a odliczenia
   * VAT-u od paliwa też nie ma (odliczenie pomniejsza podatek, nie jest zwrotem).
   */
  podatekNaliczany: boolean;
}

export interface WynikPodatku {
  /** Sam procent od przychodu, przed odliczeniem. Do rozbicia w podpowiedzi. */
  podatekOdPrzychodu: number;
  /** 50% VAT-u od paliwa — tyle odjęto od podatku. */
  odliczenieVatPaliwa: number;
  /** Kwota do potrącenia kierowcy. Nigdy ujemna. */
  podatek: number;
}

/**
 * Podatek = przychód × stawka − 50% VAT-u od paliwa, nigdy poniżej zera.
 *
 * Do 14.09.2026 aplikacja liczyła sam procent od przychodu, a połowę VAT-u
 * od paliwa dodawała OSOBNO do wypłaty jako „zwrot VAT". Wypłata wychodziła ta
 * sama, ale kolumna „Podatek" pokazywała kwotę o pół VAT-u za wysoką
 * (ASHRAF 400,08 zamiast 363,50) i nie dało się jej pogodzić z arkuszem.
 */
export function policzPodatek(w: WejscieDoPodatku): WynikPodatku {
  const podatekOdPrzychodu = Math.max(0, liczba(w.przychod)) * liczba(w.stawkaProcent) / 100;
  return pomniejszOPaliwo(podatekOdPrzychodu, w.wydanoNaPaliwo, w.podatekNaliczany);
}

/**
 * Ta sama zasada dla trybu „dwa podatki", gdzie procent liczy się z kilku podstaw
 * osobno i do tej funkcji trafia już gotowa suma.
 */
export function pomniejszOPaliwo(
  podatekOdPrzychodu: number,
  wydanoNaPaliwo: number,
  podatekNaliczany: boolean,
): WynikPodatku {
  if (!podatekNaliczany) {
    return { podatekOdPrzychodu: 0, odliczenieVatPaliwa: 0, podatek: 0 };
  }
  const brutto = Math.max(0, liczba(podatekOdPrzychodu));
  const odliczenieVatPaliwa = odliczenieVatOdPaliwa(wydanoNaPaliwo);
  return {
    podatekOdPrzychodu: brutto,
    odliczenieVatPaliwa,
    podatek: Math.max(0, brutto - odliczenieVatPaliwa),
  };
}

export interface SkladnikiWyplaty {
  /** Suma podstaw ze wszystkich platform (`total_base`). */
  przychodBazowy: number;
  /** Prowizje platform (Bolt D−G−S, FreeNow T). */
  prowizje: number;
  /** Gotówka pobrana od pasażerów — kierowca ma ją u siebie, więc wraca do floty. */
  gotowka: number;
  /** Wynik `policzPodatek().podatek`. */
  podatek: number;
  /** Drugi podatek (23% od kampanii/rekompensat) w trybie „dwa podatki". */
  podatekDodatkowy?: number;
  /** Opłata stała floty za tydzień. */
  oplataStala?: number;
  /** Opłaty dodatkowe (np. składka ZUS) razem. */
  oplatyDodatkowe?: number;
  /** Ręczna korekta tygodnia — dodatnia potrąca. */
  korektaReczna?: number;
  /** Wynajem auta za ten tydzień. */
  wynajem?: number;
  /** Paliwo brutto — potrącane w PEŁNEJ kwocie (odliczenie siedzi już w podatku). */
  paliwo?: number;
}

/**
 * Wypłata tygodniowa. W arkuszu zapisana jako
 * `S_BOLT + D_UBER + (S_FreeNow − T_FreeNow) − opłata − podatek − paliwo`,
 * co jest tym samym wyrażeniem — bo `bazowy − prowizje − gotówka` to dokładnie
 * suma wypłat platform. Test `rozliczenia_test.ts` sprawdza obie postacie na
 * tych samych danych.
 */
export function wyplataTygodniowa(s: SkladnikiWyplaty): number {
  return (
    liczba(s.przychodBazowy) -
    liczba(s.prowizje) -
    liczba(s.gotowka) -
    liczba(s.podatek) -
    liczba(s.podatekDodatkowy) -
    liczba(s.oplataStala) -
    liczba(s.oplatyDodatkowe) -
    liczba(s.korektaReczna) -
    liczba(s.wynajem) -
    liczba(s.paliwo)
  );
}

export interface PlanRozliczen {
  id?: string;
  name?: string;
  /** `false` = plan ryczałtowy: opłata stała zamiast procentu, zero podatku. */
  tax_enabled?: boolean | null;
  /** Stawka procentowa planu. NULL = bierzemy stawkę miasta/floty. */
  tax_percentage?: number | null;
  /** Opłata stała planu. NULL = bierzemy opłatę miasta/floty. */
  base_fee?: number | null;
  /** 'single_tax' | 'dual_tax'. NULL = tryb miasta/floty. */
  settlement_mode?: string | null;
}

/**
 * Plan kierowcy nadpisuje TYLKO to, co sam ustala. Pole puste w planie znaczy
 * „zostaw jak było" — czyli stawkę miasta kierowcy, a dla miasta bez własnego
 * wiersza stawkę floty. Dzięki temu przypisanie planu bez wypełnionych pól
 * niczego nie przelicza.
 */
export function stawkaZPlanu(plan: PlanRozliczen | null | undefined, stawkaMiasta: number): number {
  if (!plan) return stawkaMiasta;
  if (plan.tax_enabled === false) return 0;
  if (plan.tax_percentage === null || plan.tax_percentage === undefined) return stawkaMiasta;
  return liczba(plan.tax_percentage);
}

export function oplataZPlanu(plan: PlanRozliczen | null | undefined, oplataMiasta: number): number {
  if (!plan) return oplataMiasta;
  if (plan.base_fee === null || plan.base_fee === undefined) return oplataMiasta;
  return liczba(plan.base_fee);
}

export function trybZPlanu(plan: PlanRozliczen | null | undefined, trybMiasta: string): string {
  if (!plan || !plan.settlement_mode) return trybMiasta;
  return plan.settlement_mode;
}

/**
 * Czy kierowcy w ogóle naliczamy podatek.
 * Dwa niezależne powody, żeby go NIE naliczać:
 *   - plan ryczałtowy (`tax_enabled = false`),
 *   - B2B: kierowca wystawia flocie fakturę, VAT jest po jego stronie.
 * Sposób rozliczenia (gotówka / przelew) NIE ma z tym nic wspólnego.
 *
 * Stawka 0% NIE jest tu powodem i nie ma prawa nim być. W trybie „dwa podatki"
 * drugi podatek (23% od kampanii i rekompensat) ma własną stawkę, niezależną od
 * pierwszej — wciągnięcie „stawka = 0" do tej decyzji wyzerowałoby go po cichu
 * flocie, która pierwszej stawki nie nalicza. Zerowa stawka i tak daje zero
 * z samego mnożenia.
 */
export function czyNaliczacPodatek(
  plan: PlanRozliczen | null | undefined,
  opcje: { jestB2B?: boolean },
): boolean {
  if (plan?.tax_enabled === false) return false;
  if (opcje.jestB2B) return false;
  return true;
}

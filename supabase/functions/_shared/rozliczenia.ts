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

/**
 * Przychód łączny = podstawa opodatkowania kierowcy za tydzień.
 *
 * UJEMNA KWOTA OD PLATFORMY WCHODZI DO PODSTAWY ZE SWOIM ZNAKIEM.
 *
 * Do 14.09.2026 każdy składnik przechodził przez `Math.max(0, …)`, więc ujemna
 * kwota (korekta, zwrot, potrącenie platformy) znikała z podstawy podatku, choć
 * z wypłaty kierowcy była potrącana normalnie — `total_base` nigdy nie było
 * obcinane. Kierowca płacił więc podatek od przychodu, którego nie dostał.
 *
 * Gotówka Ubera (kolumna F) jest osobnym przypadkiem i zostaje przy wartości
 * bezwzględnej: w CSV bywa ujemna, bo Uber potrąca ją z przelewu, ale kierowca
 * ma te pieniądze u siebie — to zarobek, nie potrącenie.
 */
export function przychodLaczny(s: SkladnikiPrzychodu): number {
  return (
    liczba(s.uberWyplacono) +
    Math.abs(liczba(s.uberGotowka)) +
    liczba(s.boltBrutto) +
    liczba(s.freeNowPrzedProwizja)
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
  // Plan ryczałtowy (stawka 0%) nie daje podatku, więc nie ma czego pomniejszać.
  // Bez tego panel pokazywałby „odliczono 36,58 zł" przy podatku 0,00.
  if (brutto <= 0) {
    return { podatekOdPrzychodu: 0, odliczenieVatPaliwa: 0, podatek: 0 };
  }
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

export interface UstawieniaRozliczen {
  /** Stawka podatku w procentach. 0 = plan ryczałtowy (bez podatku). */
  vat_rate: number;
  /** 'single_tax' | 'dual_tax' */
  settlement_mode: string;
  /** Stawka drugiego podatku (kampanie, rekompensaty Bolta) w trybie „dwa podatki". */
  secondary_vat_rate: number;
  /** Dodatkowy procent od brutto w trybie „dwa podatki". */
  additional_percent_rate: number;
  /** Opłata stała floty za tydzień. */
  base_fee: number;
  /** 'netto' | 'brutto' | 'gross_total' — sposób liczenia podstawy Ubera. */
  uber_calculation_mode: string | null;
}

/** Skąd wzięły się stawki, którymi policzono kierowcę. Nie do ozdoby — patrz niżej. */
export type ZrodloUstawien = 'plan' | 'miasto' | 'flota';

export interface RozstrzygnieteUstawienia {
  ustawienia: UstawieniaRozliczen;
  zrodlo: ZrodloUstawien;
}

/**
 * Skąd kierowca bierze stawki w danym tygodniu.
 *
 * KOLEJNOŚĆ: plan przypisany na ten tydzień → ustawienia jego miasta → flota.
 *
 * Rozstrzygnięcie jest CAŁOŚCIOWE: wygrywa jedno źródło ze wszystkimi sześcioma
 * wartościami. Mieszanie pól między źródłami było przyczyną usterki z sierpnia
 * 2026 — kierowca z Wrocławia (dodatek 0%) liczył się dodatkiem floty (1%),
 * czyli 9% zamiast 8%, i nikt tego nie widział, bo fallback był cichy.
 *
 * Zwracane `zrodlo` NIE jest ozdobą: panel oznacza nim wiersz, gdy stawki
 * przyszły z floty, a nie z planu ani z miasta. Fallback ma być widoczny.
 */
export function ustawieniaKierowcy(
  plan: UstawieniaRozliczen | null | undefined,
  miasto: UstawieniaRozliczen | null | undefined,
  flota: UstawieniaRozliczen,
): RozstrzygnieteUstawienia {
  if (plan) return { ustawienia: plan, zrodlo: 'plan' };
  if (miasto) return { ustawienia: miasto, zrodlo: 'miasto' };
  return { ustawienia: flota, zrodlo: 'flota' };
}

/**
 * Czy kierowcy naliczamy podatek.
 *
 * Jedyny powód, żeby nie naliczać: B2B — kierowca wystawia flocie fakturę,
 * VAT jest po jego stronie. Plan ryczałtowy NIE jest tu wyjątkiem: to po prostu
 * plan ze stawką 0%, więc zero wychodzi z samego mnożenia i nie trzeba do tego
 * osobnej flagi.
 *
 * Sposób rozliczenia (gotówka / przelew) NIE ma z tym nic wspólnego — w arkuszu
 * wzorcowym Patryk Matusik ma przelew i podatek, a Dmytro Agafonov przelew
 * i zero podatku.
 */
export function czyNaliczacPodatek(opcje: { jestB2B?: boolean }): boolean {
  return !opcje.jestB2B;
}

export interface PodstawyPlatform {
  /** Uber: kolumna D razem z gotówką z kolumny F (czyli `amounts.uber_base`). */
  uberBase: number;
  /** Uber: kolumna G z CSV — kwota brutto razem z VAT-em pasażera. 0, gdy brak. */
  uberGrossTotal: number;
  /** Bolt: kolumna D (zarobki brutto). */
  boltBase: number;
  /** FreeNow: kolumna S (zarobki przed prowizją). */
  freeNowBase: number;
  /** Bolt: |kampanie| + |anulacje| + |rekompensaty| — podstawa DRUGIEGO podatku. */
  boltKampanie?: number;
}

export interface WynikPodatkuTygodnia extends WynikPodatku {
  /** Drugi podatek (tryb „dwa podatki"): procent od kampanii i rekompensat Bolta. */
  podatekDodatkowy: number;
}

/**
 * Podatek za tydzień — JEDNO miejsce, w którym żyje różnica między trybem
 * „jeden podatek" a „dwa podatki".
 *
 * Powstało 15.09.2026, gdy panel musiał przeliczyć wiersz po zmianie planu
 * BEZ pełnego przeładowania. Alternatywą była druga kopia tego rozgałęzienia
 * w obsłudze kliknięcia — czyli dokładnie to, co w tym module właśnie
 * zlikwidowaliśmy. Podstawy wchodzą ZE SWOIM ZNAKIEM (patrz `przychodLaczny`).
 */
export function podatekTygodnia(
  podstawy: PodstawyPlatform,
  ustawienia: UstawieniaRozliczen,
  opcje: { paliwo: number; podatekNaliczany: boolean },
): WynikPodatkuTygodnia {
  const stawka = liczba(ustawienia.vat_rate);
  const uberBase = liczba(podstawy.uberBase);
  const uberGross = liczba(podstawy.uberGrossTotal);
  const boltBase = liczba(podstawy.boltBase);
  const freeNow = liczba(podstawy.freeNowBase);

  let brutto: number;
  let podatekDodatkowy = 0;

  if (ustawienia.settlement_mode === 'dual_tax') {
    const stawkaLaczna = stawka + liczba(ustawienia.additional_percent_rate);
    const podatekBolta = boltBase * (stawkaLaczna / 100);
    // Uber: „od brutto" bierze kolumnę G, pozostałe tryby dokładają 25% do D+F.
    const podstawaUbera = ustawienia.uber_calculation_mode === 'brutto'
      ? (uberGross > 0 ? uberGross : uberBase * 1.25)
      : uberBase * 1.25;
    brutto = podatekBolta + (podstawaUbera + freeNow) * (stawka / 100);
    podatekDodatkowy = liczba(podstawy.boltKampanie) * (liczba(ustawienia.secondary_vat_rate) / 100);
  } else {
    // Jeden podatek. Podstawa Ubera to D RAZEM z gotówką (F), czyli `uberBase`.
    // Osobno zostaje 'gross_total' — kolumna G z CSV.
    const podstawaUbera = ustawienia.uber_calculation_mode === 'gross_total'
      ? (uberGross > 0 ? uberGross : uberBase * 1.25)
      : uberBase;
    brutto = (podstawaUbera + boltBase + freeNow) * (stawka / 100);
  }

  if (!opcje.podatekNaliczany) {
    return { podatekOdPrzychodu: 0, odliczenieVatPaliwa: 0, podatek: 0, podatekDodatkowy: 0 };
  }

  return { ...pomniejszOPaliwo(brutto, opcje.paliwo, true), podatekDodatkowy };
}

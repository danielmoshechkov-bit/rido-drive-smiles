/**
 * JEDNO MIEJSCE TRZYMAJĄCE ZGODY NA COOKIES.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PO CO TO JEST OSOBNO
 * ═══════════════════════════════════════════════════════════════════════════
 * Zgoda ma trzech odbiorców i będzie ich mieć czterech: baner (pokazuje stan),
 * Google (sygnały Consent Mode v2), piksel Meta (ładuje się albo nie) i —
 * niedługo — Conversions API po stronie serwera. Gdyby każdy z nich pytał
 * o zgodę po swojemu, po miesiącu jeden ładowałby się przy odmowie.
 *
 * Dlatego: TU jest stan, a wszyscy pozostali go czytają i subskrybują.
 * Nikt nie sięga po `localStorage` na własną rękę.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DLACZEGO CZTERY PARAMETRY GOOGLE, A NIE DWA
 * ═══════════════════════════════════════════════════════════════════════════
 * Consent Mode v2 (wymagany w EOG od marca 2024, egzekwowany ostrzej od 2025)
 * dołożył do `ad_storage` i `analytics_storage` dwa nowe: `ad_user_data`
 * i `ad_personalization`. Bez nich Google ogranicza listy remarketingowe,
 * audiencje niestandardowe, import konwersji offline i modelowanie — a baner
 * wygląda na poprawny, bo użytkownik niczego nie zauważy.
 *
 * Odwzorowanie naszych kategorii na parametry Google jest tutaj i tylko tutaj:
 *
 *   niezbędne     → security_storage, functionality_storage   (zawsze `granted`)
 *   analityczne   → analytics_storage
 *   marketingowe  → ad_storage, ad_user_data
 *   personalizacja→ ad_personalization, personalization_storage
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * STAN DOMYŚLNY TO ODMOWA
 * ═══════════════════════════════════════════════════════════════════════════
 * Do czasu wyboru wszystko poza niezbędnymi jest `denied`. Sygnał `default`
 * z odmową idzie do Google z `index.html`, ZANIM cokolwiek innego się załaduje
 * — inaczej pierwszy strzał poleciałby bez zgody i to on liczyłby się przy
 * kontroli. Ten plik wysyła już tylko `update`.
 */

/** Podbij przy KAŻDEJ zmianie treści banera — stara zgoda przestaje obowiązywać. */
export const WERSJA_ZGODY = "2026-09-13";

const KLUCZ = "getrido-zgody";

export type Kategoria = "niezbedne" | "analityczne" | "marketingowe" | "personalizacja";

export interface Wybor {
  niezbedne: true;
  analityczne: boolean;
  marketingowe: boolean;
  personalizacja: boolean;
}

export interface ZapisZgody {
  wybor: Wybor;
  /** Wersja treści, na którą człowiek się zgodził. */
  wersja: string;
  /** Kiedy — ISO 8601. Przy kontroli trzeba pokazać NA CO i KIEDY. */
  data: string;
}

/** Wszystko odrzucone — stan do czasu wyboru i po kliknięciu „Odrzuć". */
export const ODMOWA: Wybor = {
  niezbedne: true,
  analityczne: false,
  marketingowe: false,
  personalizacja: false,
};

export const ZGODA_PELNA: Wybor = {
  niezbedne: true,
  analityczne: true,
  marketingowe: true,
  personalizacja: true,
};

export const OPIS_KATEGORII: Record<Kategoria, { nazwa: string; opis: string }> = {
  niezbedne: {
    nazwa: "Niezbędne",
    opis:
      "Logowanie, koszyk, bezpieczeństwo sesji. Bez nich portal nie działa, więc nie da się ich wyłączyć.",
  },
  analityczne: {
    nazwa: "Analityczne",
    opis:
      "Google Analytics — ile osób wchodzi, czego szukają, gdzie się gubią. Dane zbiorcze, nie pokazują nam Ciebie.",
  },
  marketingowe: {
    nazwa: "Marketingowe",
    opis:
      "Piksel Meta i Google Ads — pozwalają zmierzyć, która reklama przyprowadziła klienta, i nie pokazywać jej ponownie.",
  },
  personalizacja: {
    nazwa: "Personalizacja",
    opis: "Dopasowanie ogłoszeń i reklam do tego, co Cię interesowało wcześniej.",
  },
};

// ---------------------------------------------------------------------------
// ODCZYT I ZAPIS
// ---------------------------------------------------------------------------

/**
 * Co człowiek wybrał — albo `null`, gdy jeszcze nie wybrał (baner ma się pokazać).
 *
 * Zapis ze STARSZEJ wersji treści traktujemy jak brak wyboru: zgoda dotyczy
 * konkretnego tekstu, a ten się zmienił.
 */
export function odczytajZgode(): ZapisZgody | null {
  try {
    const surowe = window.localStorage.getItem(KLUCZ);
    if (!surowe) return null;
    const zapis = JSON.parse(surowe) as ZapisZgody;
    if (!zapis?.wybor || zapis.wersja !== WERSJA_ZGODY) return null;
    return {
      wersja: zapis.wersja,
      data: zapis.data,
      // Odmowa jest podstawą: brakujące pole w starym zapisie ma znaczyć „nie",
      // nigdy „tak".
      wybor: { ...ODMOWA, ...zapis.wybor, niezbedne: true },
    };
  } catch {
    // Tryb prywatny albo zablokowane dane witryny — zachowujemy się jak przy
    // braku wyboru, czyli nic nie ładujemy.
    return null;
  }
}

/** Stan obowiązujący TERAZ — przy braku wyboru to odmowa, nie pustka. */
export function aktualnyWybor(): Wybor {
  return odczytajZgode()?.wybor ?? ODMOWA;
}

/** Czy dana kategoria jest dozwolona. Tego pytają piksel i analityka. */
export function czyWolno(kategoria: Kategoria): boolean {
  return aktualnyWybor()[kategoria] === true;
}

type Sluchacz = (wybor: Wybor) => void;
const sluchacze = new Set<Sluchacz>();

/**
 * Powiadomienie o zmianie zgody — także w trakcie sesji.
 *
 * Kluczowe dla piksela: człowiek może wejść, odmówić, a po pięciu minutach
 * zmienić zdanie w stopce. Sygnał musi pójść bez przeładowania strony.
 * Zwraca funkcję odsubskrybowania.
 */
export function subskrybujZgode(sluchacz: Sluchacz): () => void {
  sluchacze.add(sluchacz);
  return () => sluchacze.delete(sluchacz);
}

export function zapiszZgode(wybor: Wybor): ZapisZgody {
  const zapis: ZapisZgody = {
    wybor: { ...wybor, niezbedne: true },
    wersja: WERSJA_ZGODY,
    data: new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(KLUCZ, JSON.stringify(zapis));
  } catch {
    // Brak pamięci nie może zablokować wyboru — zgoda obowiązuje w tej sesji,
    // a przy następnej wizycie baner po prostu wróci.
  }
  wyslijSygnalyGoogle(zapis.wybor);
  sluchacze.forEach((s) => s(zapis.wybor));
  return zapis;
}

/** Wycofanie wszystkiego — z odnośnika „Ustawienia cookies" w stopce. */
export function wycofajZgode(): void {
  zapiszZgode(ODMOWA);
}

/**
 * Powtórzenie zapisanej zgody przy starcie aplikacji.
 *
 * 🔴 BEZ TEGO WRACAJĄCY UŻYTKOWNIK JEST TRAKTOWANY JAK ODMOWA. `index.html`
 * wysyła `default: denied` przy każdym wejściu — i słusznie, bo w tym momencie
 * nikt jeszcze nie wie, co ten człowiek wybrał. Dopiero tutaj, po odczytaniu
 * zapisu, można to poprawić na `update`.
 *
 * Pominięcie tego kroku nie rzuca błędem i nic nie psuje na ekranie: zgoda
 * po prostu przestaje działać dla wszystkich, którzy jej udzielili wcześniej.
 */
export function przywrocZgodeNaStarcie(): void {
  const zapis = odczytajZgode();
  if (!zapis) return;
  wyslijSygnalyGoogle(zapis.wybor);
  sluchacze.forEach((s) => s(zapis.wybor));
}

// ---------------------------------------------------------------------------
// SYGNAŁY DO GOOGLE (Consent Mode v2)
// ---------------------------------------------------------------------------

type StanGoogle = "granted" | "denied";
const gg = (czy: boolean): StanGoogle => (czy ? "granted" : "denied");

/** Odwzorowanie naszych czterech kategorii na sześć parametrów Google. */
export function sygnalyGoogle(wybor: Wybor): Record<string, StanGoogle> {
  return {
    // Niezbędne — zawsze. `security_storage` to m.in. ochrona przed nadużyciem
    // logowania; odmowa tego nie jest przewidziana przez Google.
    security_storage: "granted",
    functionality_storage: "granted",
    analytics_storage: gg(wybor.analityczne),
    ad_storage: gg(wybor.marketingowe),
    ad_user_data: gg(wybor.marketingowe),
    ad_personalization: gg(wybor.personalizacja),
    personalization_storage: gg(wybor.personalizacja),
  };
}

function wyslijSygnalyGoogle(wybor: Wybor): void {
  const w = window as unknown as { gtag?: (...a: unknown[]) => void };
  // `gtag` stawia `index.html` razem z sygnałem `default` = odmowa. Gdyby go
  // nie było (wycięty skrypt, bloker), nie robimy nic — cisza jest bezpieczna,
  // bo bez zgody i tak nic nie miało prawa polecieć.
  if (typeof w.gtag !== "function") return;
  w.gtag("consent", "update", sygnalyGoogle(wybor));
}

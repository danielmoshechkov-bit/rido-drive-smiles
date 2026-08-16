/**
 * Kontrola treści SMS przed wysłaniem.
 *
 * Po co: SMS-y wychodzą z NASZEGO konta u operatora bramki. Wulgarny albo
 * oszukańczy SMS wysłany przez klienta portalu obciąża konto portalu — grozi
 * odcięciem bramki dla wszystkich warsztatów naraz, a przy podszywaniu się pod
 * bank czy kuriera także odpowiedzialnością prawną. Blokada musi więc stać po
 * stronie serwera; ta sama lista jest po stronie ekranu tylko po to, żeby
 * powiedzieć wprost, co jest nie tak, zanim ktoś kliknie „wyślij".
 *
 * Czego NIE robimy: nie oceniamy, czy treść jest miła. Warsztat pisze do
 * swojego klienta i ma prawo napisać „auto niegotowe, przepraszamy za problem".
 * Blokujemy wyłącznie to, co realnie zagraża bramce albo klientowi końcowemu.
 *
 * Uwaga na fałszywe trafienia: reguły dopasowują CAŁE słowa (granice wyrazów),
 * bo inaczej „skurcz" czy „Chuja Góra" wyłapałoby niewinną treść. Dlatego też
 * porównujemy tekst po zdjęciu polskich znaków i po sklejeniu prób obejścia
 * typu „k u r w a" albo „ku.rwa".
 */

export type PowodBlokady = 'wulgaryzm' | 'podszywanie' | 'wyludzenie' | 'link_logowania';

export interface WynikModeracji {
  dozwolone: boolean;
  powod?: PowodBlokady;
  /** Co dokładnie zapaliło regułę — do komunikatu i do logu. */
  dopasowanie?: string;
  komunikat?: string;
}

/** Wulgaryzmy w formach podstawowych; dopasowanie obejmuje odmiany przez końcówki. */
const WULGARYZMY = [
  'kurwa', 'kurwy', 'chuj', 'chuja', 'chuje', 'pierdol', 'pierdal', 'jebac', 'jebał', 'jebie',
  'wypierdal', 'spierdal', 'zajeb', 'skurwysyn', 'cwel', 'debil', 'idiota', 'kretyn',
  'pizda', 'dziwka', 'szmata', 'gnoj', 'huj',
];

/** Podszywanie się pod instytucje — najczęstszy schemat oszustw SMS w Polsce. */
const PODSZYWANIE = [
  'twoj bank', 'twojego banku', 'blokada konta', 'konto zostalo zablokowane', 'zablokowalismy konto',
  'policja', 'prokuratura', 'urzad skarbowy', 'zus informuje', 'komornik',
  'twoja paczka', 'przesylka wstrzymana', 'doplata do przesylki', 'doplac do paczki',
  'kurier nie zastal', 'niedoplata',
];

/** Wyłudzenia pieniędzy i danych. */
const WYLUDZENIE = [
  'blik', 'kod blik', 'podaj kod', 'podaj haslo', 'podaj pin', 'numer karty', 'cvv',
  'przelej na konto', 'doplac', 'oplac zaleglosc', 'wygrales', 'nagroda czeka',
];

/** Linki do stron logowania — nawet w dobrej wierze wyglądają jak phishing. */
const WZORCE_LINKOW = [
  /\b(?:https?:\/\/)?[\w.-]*(?:login|signin|verify|weryfikacja|potwierdz)[\w.-]*\.[a-z]{2,}/i,
  /\bbit\.ly\/|\btinyurl\.com\/|\bcutt\.ly\//i,
];

/** „k u r w a", „ku.rwa", „kurwa!!!" → jedna forma do porównania. */
export function znormalizuj(tekst: string): string {
  return tekst
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .replace(/[^a-z0-9\s]/g, ' ')     // kropki, gwiazdki i myślniki między literami
    .replace(/\s+/g, ' ')
    .trim();
}

/** Wersja bez spacji — łapie rozbijanie słowa spacjami. */
const bezOdstepow = (tekst: string) => tekst.replace(/\s/g, '');

const trafienie = (tekst: string, slowa: string[]): string | null => {
  const sklejony = bezOdstepow(tekst);
  for (const slowo of slowa) {
    const wzorzec = new RegExp(`\\b${slowo.replace(/\s+/g, '\\s*')}\\w{0,3}\\b`);
    if (wzorzec.test(tekst)) return slowo;
    // to samo bez odstępów, żeby „k u r w a" nie przechodziło
    if (slowo.length >= 5 && sklejony.includes(slowo.replace(/\s+/g, ''))) return slowo;
  }
  return null;
};

const KOMUNIKATY: Record<PowodBlokady, string> = {
  wulgaryzm: 'Wiadomość zawiera wulgaryzm. SMS-y wychodzą z konta portalu u operatora — takie treści grożą odcięciem wysyłki dla całego serwisu.',
  podszywanie: 'Wiadomość wygląda na podszywanie się pod bank, urząd lub kuriera. Operator blokuje takie SMS-y, a nadawca odpowiada za nie prawnie.',
  wyludzenie: 'Wiadomość prosi o kod, hasło lub przelew — to schemat oszustwa. Nie wyślemy takiego SMS-a.',
  link_logowania: 'Wiadomość zawiera link wyglądający na stronę logowania lub skrócony odnośnik. Operatorzy odrzucają takie SMS-y jako phishing.',
};

export function sprawdzTrescSms(tresc: string): WynikModeracji {
  const tekst = znormalizuj(tresc || '');
  if (!tekst) return { dozwolone: true };

  const pary: Array<[PowodBlokady, string[]]> = [
    ['wulgaryzm', WULGARYZMY],
    ['podszywanie', PODSZYWANIE],
    ['wyludzenie', WYLUDZENIE],
  ];
  for (const [powod, slowa] of pary) {
    const dopasowanie = trafienie(tekst, slowa);
    if (dopasowanie) return { dozwolone: false, powod, dopasowanie, komunikat: KOMUNIKATY[powod] };
  }

  for (const wzorzec of WZORCE_LINKOW) {
    const m = (tresc || '').match(wzorzec);
    if (m) return { dozwolone: false, powod: 'link_logowania', dopasowanie: m[0], komunikat: KOMUNIKATY.link_logowania };
  }

  return { dozwolone: true };
}

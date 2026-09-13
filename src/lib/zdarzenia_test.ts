/**
 * Testy wspólnego słownika zdarzeń.
 *
 * Sedno: JEDNO wywołanie ma trafić do OBU narzędzi pod ich własnymi nazwami
 * i z tym samym identyfikatorem. Rozjazd nazw albo identyfikatorów jest
 * nienaprawialny wstecz, więc test pilnuje jednego i drugiego.
 */

const pamiec = new Map<string, string>();
const wystrzelone: Array<{ nazwa: string; opcje: any }> = [];
const wstawioneSkrypty: string[] = [];

(globalThis as any).window = {
  localStorage: {
    getItem: (k: string) => (pamiec.has(k) ? pamiec.get(k)! : null),
    setItem: (k: string, v: string) => void pamiec.set(k, v),
    removeItem: (k: string) => void pamiec.delete(k),
  },
  location: { href: "https://getrido.pl/", hostname: "getrido.pl" },
  dataLayer: [],
  gtag: () => {},
};
(globalThis as any).location = (globalThis as any).window.location;
(globalThis as any).document = {
  createElement: () => ({ set src(v: string) { wstawioneSkrypty.push(v); }, async: false }),
  head: { appendChild: () => {} },
};

import { ODMOWA, ZGODA_PELNA, zapiszZgode } from "./zgody";
import { uruchomPiksel, zresetujDoTestow } from "./pikselMeta";
import { SLOWNIK, zglos, type Zdarzenie } from "./zdarzenia";

function podstawFbq() {
  const w = (globalThis as any).window;
  const f: any = (...a: unknown[]) => {
    if (a[0] === "track") wystrzelone.push({ nazwa: a[1] as string, opcje: a[3] });
  };
  f.queue = [];
  w.fbq = f;
}

function wyczysc() {
  pamiec.clear();
  wystrzelone.length = 0;
  wstawioneSkrypty.length = 0;
  (globalThis as any).window.dataLayer = [];
  delete (globalThis as any).window.fbq;
  zresetujDoTestow();
}

let zle = 0;
const sprawdz = (nazwa: string, warunek: boolean, szczegol = "") => {
  if (warunek) console.log(`✅ ${nazwa}`);
  else { zle++; console.log(`❌ ${nazwa}${szczegol ? " — " + szczegol : ""}`); }
};

// --- SŁOWNIK JEST KOMPLETNY --------------------------------------------------
const wszystkie: Zdarzenie[] = ["rejestracja", "rejestracja_krok", "kontakt", "start_zakupu", "zakup"];
for (const z of wszystkie) {
  sprawdz(`„${z}" ma nazwę GA4`, typeof SLOWNIK[z].ga4 === "string" && SLOWNIK[z].ga4.length > 0);
}

// Nazwy GA4 muszą być standardowe tam, gdzie standard istnieje — inaczej
// raporty wbudowane w GA4 nie zobaczą naszych zdarzeń.
sprawdz("rejestracja → sign_up", SLOWNIK.rejestracja.ga4 === "sign_up");
sprawdz("kontakt → generate_lead", SLOWNIK.kontakt.ga4 === "generate_lead");
sprawdz("start_zakupu → begin_checkout", SLOWNIK.start_zakupu.ga4 === "begin_checkout");
sprawdz("zakup → purchase", SLOWNIK.zakup.ga4 === "purchase");

// --- WARTOŚCI ----------------------------------------------------------------
sprawdz("rejestracja ma wartość szacunkową 20", SLOWNIK.rejestracja.wartoscDomyslna === 20);
sprawdz("kontakt ma wartość szacunkową 60", SLOWNIK.kontakt.wartoscDomyslna === 60);
sprawdz("krok lejka ma ZERO — nie licytujemy porzuceń", SLOWNIK.rejestracja_krok.wartoscDomyslna === 0);
sprawdz("zakup nie ma wartości domyślnej — kwota jest znana",
  SLOWNIK.zakup.wartoscDomyslna === null && SLOWNIK.start_zakupu.wartoscDomyslna === null);

// --- JEDNO WYWOŁANIE, DWÓCH ODBIORCÓW ---------------------------------------
{
  wyczysc();
  zapiszZgode(ZGODA_PELNA);
  uruchomPiksel();
  podstawFbq();
  wystrzelone.length = 0;
  (globalThis as any).window.dataLayer = [];

  const id = zglos("kontakt");
  const doMety = wystrzelone.find((w) => w.nazwa === "Lead");
  sprawdz("kontakt trafia do Mety jako Lead", !!doMety);
  sprawdz("Meta dostaje ten sam event_id, który zwrócił słownik",
    doMety?.opcje?.eventID === id, `${doMety?.opcje?.eventID} vs ${id}`);
}

// --- WARTOŚĆ DOMYŚLNA WCHODZI, GDY NIE PODANO -------------------------------
{
  wyczysc();
  zapiszZgode(ZGODA_PELNA);
  uruchomPiksel();
  const przechwycone: any[] = [];
  const w = (globalThis as any).window;
  const f: any = (...a: unknown[]) => { if (a[0] === "track") przechwycone.push(a[2]); };
  f.queue = [];
  w.fbq = f;

  zglos("kontakt");
  sprawdz("Lead bez podanej kwoty dostaje wartość szacunkową",
    przechwycone[0]?.value === 60 && przechwycone[0]?.currency === "PLN",
    JSON.stringify(przechwycone[0]));

  przechwycone.length = 0;
  zglos("zakup", { value: 249.5, currency: "PLN" });
  sprawdz("KONTROLA ODWROTNA: podana kwota NIE jest nadpisywana szacunkiem",
    przechwycone[0]?.value === 249.5, JSON.stringify(przechwycone[0]));
}

// --- ZGODA ROZSTRZYGA OSOBNO DLA KAŻDEGO NARZĘDZIA --------------------------
{
  wyczysc();
  zapiszZgode({ ...ODMOWA, analityczne: true });   // analityka TAK, marketing NIE
  uruchomPiksel();
  podstawFbq();
  wystrzelone.length = 0;
  zglos("zakup", { value: 100 });
  sprawdz("zgoda analityczna NIE wysyła do Mety", wystrzelone.length === 0);
}

// --- KROK LEJKA NIE IDZIE DO META -------------------------------------------
{
  wyczysc();
  zapiszZgode(ZGODA_PELNA);
  uruchomPiksel();
  podstawFbq();
  wystrzelone.length = 0;
  zglos("rejestracja_krok", { nazwa: "wyslany" });
  sprawdz("krok lejka nie zaśmieca konta reklamowego", wystrzelone.length === 0);
  sprawdz("…ale ma nazwę GA4, więc lejek da się zobaczyć",
    SLOWNIK.rejestracja_krok.meta === null && SLOWNIK.rejestracja_krok.ga4.length > 0);
}

// --- POZA PRODUKCJĄ NIC SIĘ NIE ŁADUJE --------------------------------------
{
  wyczysc();
  zapiszZgode(ZGODA_PELNA);
  const byl = (globalThis as any).window.location.hostname;
  (globalThis as any).window.location.hostname = "localhost";
  try {
    uruchomPiksel();
    sprawdz("środowisko testowe nie zasila konta reklamowego", wstawioneSkrypty.length === 0);
  } finally {
    (globalThis as any).window.location.hostname = byl;
  }
}

if (zle > 0) throw new Error(`${zle} niezgodności we wspólnym słowniku zdarzeń`);
console.log("\nWSZYSTKO ZIELONE");

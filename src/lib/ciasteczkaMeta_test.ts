/**
 * Testy `fbp`/`fbc` — identyfikatorów, bez których serwerowa kopia zdarzenia
 * zakupu nie ma czego dopasować.
 *
 * Najważniejszy jest tu przypadek ODWROTNY. Zestaw samych „nie ma ciasteczka,
 * więc `null`" wypadłby zielono także wtedy, gdyby odczyt ciasteczek w ogóle
 * nie działał — bo wtedy wszystko jest `null`. Dlatego każdy blok ma parę:
 * brak i obecność.
 */

import { ciasteczkaDoZamowienia, ciasteczkaMeta, zapamietajKlikniecieReklamy } from "./ciasteczkaMeta";

// --- namiastka przeglądarki ---------------------------------------------
const pamiec = new Map<string, string>();
let ciastka = "";
let adres = "https://getrido.pl/";

(globalThis as any).document = {
  get cookie() { return ciastka; },
};
(globalThis as any).window = {
  sessionStorage: {
    getItem: (k: string) => (pamiec.has(k) ? pamiec.get(k)! : null),
    setItem: (k: string, v: string) => void pamiec.set(k, v),
    removeItem: (k: string) => void pamiec.delete(k),
  },
  get location() { return new URL(adres); },
};

function wyczysc(nowyAdres = "https://getrido.pl/") {
  pamiec.clear();
  ciastka = "";
  adres = nowyAdres;
}

// --- przypadki ------------------------------------------------------------
export const przypadki: Array<[string, () => void]> = [
  [
    "bez ciasteczek i bez reklamy: oba pola puste",
    () => {
      wyczysc();
      const { fbp, fbc } = ciasteczkaMeta();
      if (fbp !== null) throw new Error("fbp wzięło się znikąd");
      if (fbc !== null) throw new Error("fbc wzięło się znikąd");
    },
  ],
  [
    "KONTROLA ODWROTNA — istniejące ciasteczka SĄ odczytywane",
    () => {
      wyczysc();
      ciastka = "_ga=GA1.1.9; _fbp=fb.1.1757000000000.1234567890; _fbc=fb.1.1757000000000.PAxyz";
      const { fbp, fbc } = ciasteczkaMeta();
      if (fbp !== "fb.1.1757000000000.1234567890") throw new Error(`fbp odczytane źle: ${fbp}`);
      if (fbc !== "fb.1.1757000000000.PAxyz") throw new Error(`fbc odczytane źle: ${fbc}`);
    },
  ],
  [
    "ciasteczko o podobnej nazwie NIE jest brane za _fbp",
    () => {
      wyczysc();
      // `_fbp_stare` zawiera „_fbp" jako podciąg — dopasowanie bez granicy
      // wzięłoby je i wysłało do Meta identyfikator innego urządzenia.
      ciastka = "_fbp_stare=fb.1.1.SMIECI";
      if (ciasteczkaMeta().fbp !== null) throw new Error("dopasowanie złapało nie to ciasteczko");
    },
  ],
  [
    "wejście z reklamy bez piksela: fbc składamy z zapamiętanego fbclid",
    () => {
      wyczysc("https://getrido.pl/?utm_source=fb&fbclid=IwAR_TEST");
      zapamietajKlikniecieReklamy();
      // Piksel jeszcze nie wystartował (nie ma `_fbc`) — a mimo to konwersja
      // ma się dać powiązać z kampanią.
      const { fbc } = ciasteczkaMeta();
      if (!fbc) throw new Error("fbc nie powstało — konwersja z reklamy przepadłaby");
      if (!/^fb\.1\.\d+\.IwAR_TEST$/.test(fbc)) throw new Error(`zły format fbc: ${fbc}`);
    },
  ],
  [
    "ciasteczko _fbc WYGRYWA ze złożonym z fbclid",
    () => {
      wyczysc("https://getrido.pl/?fbclid=IwAR_NOWY");
      zapamietajKlikniecieReklamy();
      ciastka = "_fbc=fb.1.1757000000000.IwAR_OD_PIKSELA";
      // Ten od piksela jest tym, który Meta widziała w przeglądarce.
      if (ciasteczkaMeta().fbc !== "fb.1.1757000000000.IwAR_OD_PIKSELA") {
        throw new Error("złożony fbc przykrył ten prawdziwy");
      }
    },
  ],
  [
    "pierwsze kliknięcie wygrywa — druga reklama nie przejmuje konwersji",
    () => {
      wyczysc("https://getrido.pl/?fbclid=PIERWSZA");
      zapamietajKlikniecieReklamy();
      adres = "https://getrido.pl/cennik?fbclid=DRUGA";
      zapamietajKlikniecieReklamy();
      const { fbc } = ciasteczkaMeta();
      if (!fbc?.endsWith(".PIERWSZA")) throw new Error(`nadpisane drugą kampanią: ${fbc}`);
    },
  ],
  [
    "wejście bez fbclid niczego nie zapamiętuje",
    () => {
      wyczysc("https://getrido.pl/cennik");
      zapamietajKlikniecieReklamy();
      if (pamiec.size !== 0) throw new Error("zapisano coś mimo braku fbclid");
    },
  ],
  [
    "zablokowane dane witryny nie wywracają zakupu",
    () => {
      wyczysc("https://getrido.pl/?fbclid=IwAR_TEST");
      const oryginal = (globalThis as any).window.sessionStorage.setItem;
      (globalThis as any).window.sessionStorage.setItem = () => { throw new Error("tryb prywatny"); };
      try {
        zapamietajKlikniecieReklamy();   // nie ma prawa rzucić
        if (ciasteczkaMeta().fbc !== null) throw new Error("fbc powstało bez zapisu");
      } finally {
        (globalThis as any).window.sessionStorage.setItem = oryginal;
      }
    },
  ],
  [
    "kształt dla zamówienia używa NAZW KOLUMN, nie nazw Meta",
    () => {
      wyczysc();
      ciastka = "_fbp=fb.1.1757000000000.42";
      const ciało = ciasteczkaDoZamowienia();
      // Literówka tutaj daje ciche `null` w bazie i brak konwersji — bez
      // śladu w jakimkolwiek dzienniku. Stąd test na same nazwy pól.
      if (!("meta_fbp" in ciało) || !("meta_fbc" in ciało)) {
        throw new Error(`złe nazwy pól: ${Object.keys(ciało).join(", ")}`);
      }
      if (ciało.meta_fbp !== "fb.1.1757000000000.42") throw new Error("meta_fbp nie niesie wartości");
      if (ciało.meta_fbc !== null) throw new Error("meta_fbc miało być puste");
    },
  ],
];

// --- przebieg -------------------------------------------------------------
// Wynik oddajemy WYJĄTKIEM, nie `process.exit` — wyjście z importowanego modułu
// ubiłoby cały przebieg, także pliki, które jeszcze nie ruszyły, i to z kodem 0.
let zle = 0;
for (const [nazwa, przypadek] of przypadki) {
  try {
    przypadek();
    console.log(`✅ ${nazwa}`);
  } catch (e) {
    zle++;
    console.log(`❌ ${nazwa} — ${(e as Error).message}`);
  }
}
if (zle > 0) throw new Error(`${zle} niezgodności w ciasteczkach Meta`);
console.log("\nWSZYSTKO ZIELONE");

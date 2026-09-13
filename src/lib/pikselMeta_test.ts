/**
 * Testy piksela Meta.
 *
 * Sedno: piksel NIE MOŻE się załadować ani nic wysłać bez zgody marketingowej,
 * a po zgodzie MUSI. Sam zestaw „nic nie poszło" wypadłby zielono także wtedy,
 * gdyby piksel był zepsuty — stąd para do każdego przypadku.
 */

// --- namiastka przeglądarki (przed importem modułów) ----------------------
const pamiec = new Map<string, string>();
const wystrzelone: Array<{ nazwa: string; dane: unknown; opcje: unknown }> = [];
const wstawioneSkrypty: string[] = [];

(globalThis as any).window = {
  localStorage: {
    getItem: (k: string) => (pamiec.has(k) ? pamiec.get(k)! : null),
    setItem: (k: string, v: string) => void pamiec.set(k, v),
    removeItem: (k: string) => void pamiec.delete(k),
  },
  gtag: () => {},
};
(globalThis as any).location = { href: "https://getrido.pl/gielda" };
(globalThis as any).document = {
  createElement: () => ({ set src(v: string) { wstawioneSkrypty.push(v); }, async: false }),
  head: { appendChild: () => {} },
};

import { ODMOWA, ZGODA_PELNA, zapiszZgode } from "./zgody";
import {
  ID_PIKSELA,
  licznikOdslon,
  nowyIdZdarzenia,
  sledzOdslone,
  sledzZdarzenie,
  uruchomPiksel,
  zresetujDoTestow,
} from "./pikselMeta";

/** Podstawia atrapę `fbq`, którą normalnie postawiłby `fbevents.js`. */
function podstawFbq() {
  const w = (globalThis as any).window;
  const f: any = (...a: unknown[]) => {
    if (a[0] === "track") wystrzelone.push({ nazwa: a[1] as string, dane: a[2], opcje: a[3] });
  };
  f.queue = [];
  w.fbq = f;
  w._fbq = f;
}

function wyczysc() {
  pamiec.clear();
  wystrzelone.length = 0;
  wstawioneSkrypty.length = 0;
  delete (globalThis as any).window.fbq;
  delete (globalThis as any).window._fbq;
  zresetujDoTestow();
}

const przypadki: Array<[string, () => void]> = [
  [
    "bez zgody piksel się NIE ładuje i nie wstawia skryptu",
    () => {
      wyczysc();
      uruchomPiksel();
      if ((globalThis as any).window.fbq) throw new Error("fbq powstało bez zgody");
      if (wstawioneSkrypty.length !== 0) throw new Error("wstawiono skrypt bez zgody");
    },
  ],
  [
    "bez zgody żadne zdarzenie nie leci — także po podstawieniu fbq",
    () => {
      wyczysc();
      podstawFbq();
      const w = sledzZdarzenie("Purchase", { value: 100, currency: "PLN" });
      if (w !== null) throw new Error("zdarzenie poszło bez zgody");
      if (wystrzelone.length !== 0) throw new Error("fbq wywołane bez zgody");
    },
  ],
  [
    "KONTROLA ODWROTNA — po zgodzie skrypt się wstawia i leci PageView",
    () => {
      wyczysc();
      zapiszZgode(ZGODA_PELNA);
      uruchomPiksel();
      if (wstawioneSkrypty.length !== 1) throw new Error("skrypt nie został wstawiony");
      if (!wstawioneSkrypty[0].includes("fbevents.js")) throw new Error("wstawiono nie ten skrypt");
      if (licznikOdslon() !== 1) throw new Error("pierwsza odsłona nie poszła");
    },
  ],
  [
    "ponowne uruchomienie NIE wstawia drugiego skryptu ani drugiej odsłony",
    () => {
      wyczysc();
      zapiszZgode(ZGODA_PELNA);
      uruchomPiksel();
      uruchomPiksel();
      uruchomPiksel();
      if (wstawioneSkrypty.length !== 1) throw new Error(`skrypt wstawiony ${wstawioneSkrypty.length} razy`);
      if (licznikOdslon() !== 1) throw new Error(`odsłon ${licznikOdslon()} zamiast 1`);
    },
  ],
  [
    "sama zgoda ANALITYCZNA nie uruchamia piksela",
    () => {
      wyczysc();
      zapiszZgode({ ...ODMOWA, analityczne: true });
      uruchomPiksel();
      if (wstawioneSkrypty.length !== 0) throw new Error("piksel ruszył na zgodzie analitycznej");
    },
  ],
  [
    "zdarzenie po zgodzie niesie event_id i trafia do fbq",
    () => {
      wyczysc();
      zapiszZgode(ZGODA_PELNA);
      uruchomPiksel();
      podstawFbq();
      wystrzelone.length = 0;
      const ladunek = sledzZdarzenie("Lead", { content_name: "formularz" });
      if (!ladunek) throw new Error("zdarzenie nie poszło mimo zgody");
      if (wystrzelone.length !== 1) throw new Error("fbq nie zostało wywołane");
      if (wystrzelone[0].nazwa !== "Lead") throw new Error("zła nazwa zdarzenia");
      if ((wystrzelone[0].opcje as any)?.eventID !== ladunek.event_id) {
        throw new Error("eventID w fbq różni się od tego w ładunku dla serwera");
      }
    },
  ],
  [
    "TEN SAM event_id po stronie przeglądarki i w ładunku dla CAPI",
    () => {
      wyczysc();
      zapiszZgode(ZGODA_PELNA);
      uruchomPiksel();
      podstawFbq();
      wystrzelone.length = 0;
      const wlasny = "zamowienie-abc-123";
      const ladunek = sledzZdarzenie("Purchase", { value: 249, currency: "PLN" }, wlasny);
      if (ladunek?.event_id !== wlasny) throw new Error("podany event_id został zignorowany");
      if ((wystrzelone[0].opcje as any)?.eventID !== wlasny) {
        throw new Error("do Meta poszedł inny event_id niż podany");
      }
    },
  ],
  [
    "Purchase niesie kwotę i walutę — bez nich Meta nie policzy przychodu",
    () => {
      wyczysc();
      zapiszZgode(ZGODA_PELNA);
      uruchomPiksel();
      podstawFbq();
      wystrzelone.length = 0;
      const ladunek = sledzZdarzenie("Purchase", { value: 249.5, currency: "PLN" });
      if ((ladunek?.custom_data as any)?.value !== 249.5) throw new Error("zgubiona kwota");
      if ((ladunek?.custom_data as any)?.currency !== "PLN") throw new Error("zgubiona waluta");
    },
  ],
  [
    "ładunek dla CAPI ma komplet pól wymaganych przez Meta",
    () => {
      wyczysc();
      zapiszZgode(ZGODA_PELNA);
      uruchomPiksel();
      podstawFbq();
      const l = sledzZdarzenie("InitiateCheckout", { content_name: "warsztat_pro" });
      if (!l) throw new Error("brak ładunku");
      for (const pole of ["event_name", "event_id", "event_time", "event_source_url", "custom_data"]) {
        if (!(pole in l)) throw new Error(`brak pola ${pole}`);
      }
      if (!Number.isInteger(l.event_time)) throw new Error("event_time musi być sekundami, nie ms");
      if (l.event_time > 4_000_000_000) throw new Error("event_time wygląda na milisekundy");
    },
  ],
  [
    "WYCOFANIE zgody w trakcie sesji zatrzymuje wysyłkę mimo wczytanego skryptu",
    () => {
      wyczysc();
      zapiszZgode(ZGODA_PELNA);
      uruchomPiksel();
      podstawFbq();
      wystrzelone.length = 0;
      zapiszZgode(ODMOWA);
      const w = sledzZdarzenie("Purchase", { value: 100, currency: "PLN" });
      if (w !== null) throw new Error("zdarzenie poszło po wycofaniu zgody");
      if (wystrzelone.length !== 0) throw new Error("fbq wywołane po wycofaniu zgody");
    },
  ],
  [
    "odsłona po zmianie trasy dokłada się do licznika",
    () => {
      wyczysc();
      zapiszZgode(ZGODA_PELNA);
      uruchomPiksel();
      podstawFbq();
      sledzOdslone();
      sledzOdslone();
      if (licznikOdslon() !== 3) throw new Error(`odsłon ${licznikOdslon()} zamiast 3`);
    },
  ],
  [
    "identyfikatory zdarzeń się nie powtarzają",
    () => {
      const zbior = new Set(Array.from({ length: 200 }, () => nowyIdZdarzenia()));
      if (zbior.size !== 200) throw new Error("nowyIdZdarzenia zwraca duplikaty");
    },
  ],
  [
    "identyfikator piksela jest tym z panelu Meta",
    () => {
      if (ID_PIKSELA !== "1095723286464143") throw new Error("zmieniony identyfikator piksela");
    },
  ],
];

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
if (zle > 0) throw new Error(`${zle} niezgodności w pikselu Meta`);
console.log("\nWSZYSTKO ZIELONE");

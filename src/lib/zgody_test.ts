/**
 * Testy zgód na cookies.
 *
 * Najważniejszy jest tu przypadek, który MA PRZEJŚĆ: zestaw samych odmów
 * wypadłby zielono także wtedy, gdyby zapis w ogóle nie działał — bo wtedy
 * wszystko jest odmową. Dlatego każdy blok ma parę: odmowa i zgoda.
 */

import {
  ODMOWA,
  WERSJA_ZGODY,
  ZGODA_PELNA,
  aktualnyWybor,
  czyWolno,
  odczytajZgode,
  przywrocZgodeNaStarcie,
  subskrybujZgode,
  sygnalyGoogle,
  wycofajZgode,
  zapiszZgode,
} from "./zgody";

// --- namiastka przeglądarki ---------------------------------------------
const pamiec = new Map<string, string>();
const wyslane: Array<{ typ: string; dane: Record<string, string> }> = [];

(globalThis as any).window = {
  localStorage: {
    getItem: (k: string) => (pamiec.has(k) ? pamiec.get(k)! : null),
    setItem: (k: string, v: string) => void pamiec.set(k, v),
    removeItem: (k: string) => void pamiec.delete(k),
  },
  gtag: (polecenie: string, typ: string, dane: Record<string, string>) => {
    if (polecenie === "consent") wyslane.push({ typ, dane });
  },
};

function wyczysc() {
  pamiec.clear();
  wyslane.length = 0;
}

// --- przypadki ------------------------------------------------------------
export const przypadki: Array<[string, () => void]> = [
  [
    "przed wyborem: brak zapisu, wszystko poza niezbędnymi odmówione",
    () => {
      wyczysc();
      if (odczytajZgode() !== null) throw new Error("zapis istnieje, a nie powinno go być");
      if (czyWolno("analityczne")) throw new Error("analityka dozwolona bez zgody");
      if (czyWolno("marketingowe")) throw new Error("marketing dozwolony bez zgody");
      if (czyWolno("personalizacja")) throw new Error("personalizacja dozwolona bez zgody");
      if (!aktualnyWybor().niezbedne) throw new Error("niezbędne mają być zawsze");
    },
  ],
  [
    "KONTROLA ODWROTNA — po zgodzie kategorie SĄ dozwolone",
    () => {
      wyczysc();
      zapiszZgode(ZGODA_PELNA);
      if (!czyWolno("analityczne")) throw new Error("analityka odmówiona MIMO zgody");
      if (!czyWolno("marketingowe")) throw new Error("marketing odmówiony MIMO zgody");
      if (!czyWolno("personalizacja")) throw new Error("personalizacja odmówiona MIMO zgody");
    },
  ],
  [
    "wybór częściowy zapisuje się dokładnie taki, jaki był",
    () => {
      wyczysc();
      zapiszZgode({ ...ODMOWA, analityczne: true });
      if (!czyWolno("analityczne")) throw new Error("analityka miała być włączona");
      if (czyWolno("marketingowe")) throw new Error("marketing włączył się sam");
      if (czyWolno("personalizacja")) throw new Error("personalizacja włączyła się sama");
    },
  ],
  [
    "odmowa jest ZAPAMIĘTANA — baner nie wraca przy następnej wizycie",
    () => {
      wyczysc();
      zapiszZgode(ODMOWA);
      const zapis = odczytajZgode();
      if (zapis === null) throw new Error("odmowa nie została zapisana — baner wróciłby");
      if (zapis.wybor.analityczne) throw new Error("odmowa zapisała zgodę");
    },
  ],
  [
    "zapis niesie WERSJĘ i DATĘ — bez nich nie ma czego pokazać przy kontroli",
    () => {
      wyczysc();
      const zapis = zapiszZgode(ZGODA_PELNA);
      if (zapis.wersja !== WERSJA_ZGODY) throw new Error("brak wersji treści");
      if (Number.isNaN(Date.parse(zapis.data))) throw new Error("data nie jest datą");
    },
  ],
  [
    "zgoda na STARSZĄ wersję treści nie obowiązuje — baner pokazuje się znowu",
    () => {
      wyczysc();
      pamiec.set(
        "getrido-zgody",
        JSON.stringify({ wybor: ZGODA_PELNA, wersja: "2000-01-01", data: new Date().toISOString() }),
      );
      if (odczytajZgode() !== null) throw new Error("stara zgoda nadal obowiązuje");
      if (czyWolno("marketingowe")) throw new Error("stara zgoda nadal wpuszcza marketing");
    },
  ],
  [
    "brakujące pole w starym zapisie znaczy NIE, nigdy TAK",
    () => {
      wyczysc();
      pamiec.set(
        "getrido-zgody",
        JSON.stringify({
          wybor: { niezbedne: true, analityczne: true },
          wersja: WERSJA_ZGODY,
          data: new Date().toISOString(),
        }),
      );
      if (czyWolno("marketingowe")) throw new Error("brakujące pole potraktowane jak zgoda");
      if (!czyWolno("analityczne")) throw new Error("obecne pole zgubione");
    },
  ],
  [
    "Google dostaje SZEŚĆ parametrów, w tym oba nowe z v2",
    () => {
      const s = sygnalyGoogle(ZGODA_PELNA);
      for (const p of [
        "ad_storage",
        "ad_user_data",
        "ad_personalization",
        "analytics_storage",
        "personalization_storage",
        "security_storage",
      ]) {
        if (!(p in s)) throw new Error(`brak parametru ${p}`);
      }
    },
  ],
  [
    "odwzorowanie kategorii na parametry Google — odmowa",
    () => {
      const s = sygnalyGoogle(ODMOWA);
      if (s.ad_storage !== "denied") throw new Error("ad_storage nie jest denied");
      if (s.ad_user_data !== "denied") throw new Error("ad_user_data nie jest denied");
      if (s.ad_personalization !== "denied") throw new Error("ad_personalization nie jest denied");
      if (s.analytics_storage !== "denied") throw new Error("analytics_storage nie jest denied");
      if (s.security_storage !== "granted") throw new Error("security_storage ma być zawsze granted");
    },
  ],
  [
    "KONTROLA ODWROTNA — po zgodzie te same parametry są granted",
    () => {
      const s = sygnalyGoogle(ZGODA_PELNA);
      for (const p of ["ad_storage", "ad_user_data", "ad_personalization", "analytics_storage"]) {
        if (s[p] !== "granted") throw new Error(`${p} zostało denied MIMO zgody`);
      }
    },
  ],
  [
    "sama analityka NIE otwiera reklam",
    () => {
      const s = sygnalyGoogle({ ...ODMOWA, analityczne: true });
      if (s.analytics_storage !== "granted") throw new Error("analityka nie przeszła");
      if (s.ad_storage !== "denied" || s.ad_user_data !== "denied") {
        throw new Error("zgoda na analitykę otworzyła reklamy");
      }
    },
  ],
  [
    "marketing bez personalizacji: ad_user_data tak, ad_personalization nie",
    () => {
      const s = sygnalyGoogle({ ...ODMOWA, marketingowe: true });
      if (s.ad_user_data !== "granted") throw new Error("ad_user_data nie poszło");
      if (s.ad_personalization !== "denied") throw new Error("personalizacja włączyła się sama");
    },
  ],
  [
    "zapis WYSYŁA sygnał update do Google",
    () => {
      wyczysc();
      zapiszZgode(ZGODA_PELNA);
      const u = wyslane.filter((w) => w.typ === "update");
      if (u.length !== 1) throw new Error(`wysłano ${u.length} sygnałów update zamiast 1`);
      if (u[0].dane.ad_user_data !== "granted") throw new Error("sygnał niesie złe wartości");
    },
  ],
  [
    "wracający użytkownik dostaje POWTÓRZENIE zgody — inaczej liczy się jak odmowa",
    () => {
      wyczysc();
      zapiszZgode(ZGODA_PELNA);
      wyslane.length = 0; // udajemy nowe wejście na stronę
      przywrocZgodeNaStarcie();
      const u = wyslane.filter((w) => w.typ === "update");
      if (u.length !== 1) throw new Error("zapisana zgoda nie została powtórzona przy starcie");
      if (u[0].dane.ad_storage !== "granted") throw new Error("powtórzenie niesie odmowę");
    },
  ],
  [
    "bez zapisu start NIC nie wysyła — default z index.html zostaje odmową",
    () => {
      wyczysc();
      przywrocZgodeNaStarcie();
      if (wyslane.length !== 0) throw new Error("wysłano sygnał mimo braku wyboru");
    },
  ],
  [
    "wycofanie zgody w trakcie sesji powiadamia subskrybentów i wysyła odmowę",
    () => {
      wyczysc();
      zapiszZgode(ZGODA_PELNA);
      let ostatni: unknown = null;
      const stop = subskrybujZgode((w) => { ostatni = w; });
      wyslane.length = 0;
      wycofajZgode();
      stop();
      if (!ostatni || (ostatni as any).marketingowe !== false) {
        throw new Error("subskrybent nie dostał wycofania");
      }
      const u = wyslane.filter((w) => w.typ === "update");
      if (u.length !== 1 || u[0].dane.ad_storage !== "denied") {
        throw new Error("do Google nie poszła odmowa");
      }
    },
  ],
  [
    "odsubskrybowany słuchacz już nic nie dostaje",
    () => {
      wyczysc();
      let ile = 0;
      const stop = subskrybujZgode(() => { ile += 1; });
      zapiszZgode(ZGODA_PELNA);
      stop();
      zapiszZgode(ODMOWA);
      if (ile !== 1) throw new Error(`słuchacz wywołany ${ile} razy zamiast 1`);
    },
  ],
  [
    "zablokowana pamięć nie wywraca wyboru — zgoda działa w tej sesji",
    () => {
      wyczysc();
      const oryginal = (globalThis as any).window.localStorage.setItem;
      (globalThis as any).window.localStorage.setItem = () => {
        throw new Error("tryb prywatny");
      };
      try {
        const zapis = zapiszZgode(ZGODA_PELNA);
        if (!zapis.wybor.marketingowe) throw new Error("wybór zgubiony przy braku pamięci");
      } finally {
        (globalThis as any).window.localStorage.setItem = oryginal;
      }
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
if (zle > 0) throw new Error(`${zle} niezgodności w zgodach na cookies`);
console.log("\nWSZYSTKO ZIELONE");

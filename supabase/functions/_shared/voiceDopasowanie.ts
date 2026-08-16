// ============================================================================
// voiceDopasowanie.ts — SŁOWA DO ROZPOZNANIA USŁUGI, NIE DO WYPOWIEDZENIA.
//
// Powód powstania (rozmowa 17.08, po angielsku):
//
//   KLIENT: what is the cost?
//   AGENT:  I don't have that information — the mechanic will answer…
//   KLIENT: But do you have any average prices for engine check?
//   AGENT:  I don't have that information — the mechanic will answer…
//
// W cenniku stoi „Diagnoza usterki — 150 zloty, cena stała". Agent odmówił
// dwa razy, bo snapshot po angielsku ma PRZETŁUMACZONĄ CENĘ i NIEPRZETŁUMACZONĄ
// NAZWĘ. „engine check" nie miało jak trafić na „Diagnoza usterki".
//
// To samo po ukraińsku: agent powiedział „Діагноза устерки" — czyli przeczytał
// polską nazwę z ukraińską końcówką, mimo reguły, że nazw nie tłumaczy.
//
// ROZDZIELENIE DWÓCH RZECZY:
//   `nazwa`       — do WYPOWIEDZENIA, zostaje po polsku, bo tak wpisał warsztat
//   `dopasowanie` — do ROZPOZNANIA, w języku rozmowy, NIGDY nie wypowiadane
//
// Nazw NIE tłumaczymy maszynowo: „Ceramika 4 letnia + korekta lakieru"
// przetłumaczona automatycznie da bełkot. Dopasowanie to lista słów, po których
// klient MÓWI o tej usłudze — a to co innego niż jej nazwa handlowa.
//
// TYMCZASOWE: słowa pochodzą z wbudowanego słownika kategorii. Docelowo mają
// siedzieć w bazie przy usłudze, generowane raz i poprawialne przez warsztat
// w panelu — bo to warsztat wie, jak jego klienci nazywają jego usługi.
// ============================================================================

export type JezykDopasowania = "pl" | "en" | "ru" | "uk";

/**
 * Kategoria usługi rozpoznawana po rdzeniu polskiej nazwy, plus słowa,
 * którymi klient o niej mówi w każdym z czterech języków.
 *
 * Rdzenie są celowo krótkie i bez końcówek — „diagnoz" łapie „Diagnoza",
 * „diagnostyka", „diagnozowanie".
 */
const KATEGORIE: Array<{ rdzenie: string[]; slowa: Record<JezykDopasowania, string[]> }> = [
  {
    rdzenie: ["diagnoz", "usterk", "przegląd", "przeglad", "sprawdzen"],
    slowa: {
      pl: ["diagnoza", "diagnostyka", "przegląd", "sprawdzenie", "co się dzieje z autem", "obejrzenie"],
      en: ["diagnostics", "engine check", "check-up", "inspection", "what's wrong with my car", "look at the car"],
      ru: ["диагностика", "осмотр", "проверка", "что с машиной", "посмотреть машину"],
      uk: ["діагностика", "огляд", "перевірка", "що з автом", "подивитися авто"],
    },
  },
  {
    rdzenie: ["olej"],
    slowa: {
      pl: ["wymiana oleju", "olej"],
      en: ["oil change", "oil"],
      ru: ["замена масла", "масло"],
      uk: ["заміна оливи", "олива", "масло"],
    },
  },
  {
    rdzenie: ["klock", "tarcz", "hamulc"],
    slowa: {
      pl: ["klocki", "tarcze", "hamulce", "piszczą hamulce"],
      en: ["brake pads", "brake discs", "brakes", "squeaking brakes"],
      ru: ["колодки", "диски", "тормоза", "скрипят тормоза"],
      uk: ["колодки", "диски", "гальма", "скриплять гальма"],
    },
  },
  {
    rdzenie: ["myci", "mycie"],
    slowa: {
      pl: ["mycie", "umyć auto", "czyszczenie"],
      en: ["car wash", "washing", "cleaning"],
      ru: ["мойка", "помыть машину", "чистка"],
      uk: ["мийка", "помити авто", "чистка"],
    },
  },
  {
    rdzenie: ["ceramik", "powłok", "powlok"],
    slowa: {
      pl: ["ceramika", "powłoka ceramiczna", "korekta lakieru"],
      en: ["ceramic coating", "paint correction"],
      ru: ["керамика", "керамическое покрытие", "полировка"],
      uk: ["кераміка", "керамічне покриття", "полірування"],
    },
  },
  {
    rdzenie: ["foli"],
    slowa: {
      pl: ["folia", "folia ochronna", "oklejanie"],
      en: ["paint protection film", "ppf", "wrapping"],
      ru: ["плёнка", "защитная плёнка", "оклейка"],
      uk: ["плівка", "захисна плівка", "обклеювання"],
    },
  },
  {
    rdzenie: ["klimatyz", "czynnik", "r134"],
    slowa: {
      pl: ["klimatyzacja", "napełnienie klimatyzacji", "nie chłodzi"],
      en: ["air conditioning", "ac refill", "not cooling"],
      ru: ["кондиционер", "заправка кондиционера", "не холодит"],
      uk: ["кондиціонер", "заправка кондиціонера", "не холодить"],
    },
  },
  {
    rdzenie: ["zawiesz", "amortyz"],
    slowa: {
      pl: ["zawieszenie", "amortyzatory", "stuka w zawieszeniu"],
      en: ["suspension", "shock absorbers", "knocking noise"],
      ru: ["подвеска", "амортизаторы", "стучит подвеска"],
      uk: ["підвіска", "амортизатори", "стукає підвіска"],
    },
  },
  {
    rdzenie: ["filtr"],
    slowa: {
      pl: ["filtry", "wymiana filtrów"],
      en: ["filters", "filter change"],
      ru: ["фильтры", "замена фильтров"],
      uk: ["фільтри", "заміна фільтрів"],
    },
  },
];

const bezOgonkow = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\u0142/g, "l");

/**
 * Słowa, po których klient mówi o tej usłudze, w podanym języku.
 *
 * Zwraca pustą tablicę, gdy nazwa nie pasuje do żadnej kategorii — wtedy
 * agent zostaje przy dotychczasowym zachowaniu (cenę poda mechanik).
 * Pusta tablica jest UCZCIWSZA niż zgadywanie: lepiej, żeby agent powiedział
 * „mechanik wyceni", niż żeby podał cenę nie tej usługi.
 */
export function dopasowanieUslugi(nazwa: string, jezyk: JezykDopasowania): string[] {
  const n = bezOgonkow(String(nazwa || ""));
  if (!n) return [];
  for (const k of KATEGORIE) {
    if (k.rdzenie.some((r) => n.includes(bezOgonkow(r)))) return k.slowa[jezyk] || [];
  }
  return [];
}

/** Ile znaków dokłada dopasowanie do snapshotu — do kontroli rozmiaru. */
export function znakowDopasowania(nazwy: string[], jezyk: JezykDopasowania): number {
  return nazwy.reduce((suma, n) => suma + JSON.stringify(dopasowanieUslugi(n, jezyk)).length, 0);
}

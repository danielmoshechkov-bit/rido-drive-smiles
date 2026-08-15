// ============================================================================
// voiceSnapshotSlow.ts — ROSYJSKI I UKRAIŃSKI. JEDEN MODUŁ, DWA ZESTAWY FORM.
//
// DLACZEGO RAZEM, A NIE OSOBNO NA JĘZYK:
// rosyjski i ukraiński mają IDENTYCZNĄ strukturę odmiany — te same progi
// (11–19 nieregularne, 20+ złożone), ten sam selektor liczby mnogiej
// (1 / 2-4 / 5+), ten sam rodzaj przy „jeden/dwa". Różnią się WYŁĄCZNIE
// formami. To jest dokładnie ten przypadek, w którym „podmień tablice"
// jest prawdziwe — w odróżnieniu od pary polski ↔ rosyjski, gdzie nie jest.
//
// DLACZEGO NIE UOGÓLNIAMY MODUŁU POLSKIEGO:
// `voiceSnapshot.ts` ma 27 asercji i stoi za nim jedyny bezbłędny język,
// jaki mamy (0/20 wtrętów w pomiarze). Przepisanie go dla dwóch języków,
// które jeszcze nikogo nie obsłużyły, to zła kolejność ryzyka.
// Ten plik NICZEGO z niego nie importuje i niczego w nim nie zmienia.
//
// ⚠️ FORMY WYMAGAJĄ WERYFIKACJI PRZEZ OSOBĘ ZNAJĄCĄ TE JĘZYKI.
// Miernik wtrętów wyłapie zmyślone słowa, ale NIE wyłapie złej odmiany —
// przy polskim „dziewiętnaście sierpnia" przeszło przez pomiar i wyszło
// dopiero w prawdziwej rozmowie z klientką.
// ============================================================================

export type JezykSlow = "ru" | "uk";

type Formy = {
  dni: string[];                 // nazwy dni tygodnia, od niedzieli
  miesiace: string[];            // dopełniacz — „августа", „серпня"
  dniMiesiaca: string[];         // 1..31, liczebnik porządkowy w dopełniaczu
  jednostki: string[];           // 0..19 mianownik
  jednostkiDop: string[];        // 0..19 dopełniacz
  dziesiatki: string[];          // indeks 2..9
  dziesiatkiDop: string[];
  setki: string[];               // indeks 1..9
  setkiDop: string[];
  tysiac: [string, string, string];   // 1 / 2-4 / 5+  (mianownik)
  tysiacDop: string;                  // dopełniacz — jedna forma
  waluta: string;                     // dopełniacz mnogi: „злотых" / „злотих"
  odDo: [string, string];             // „от" / „до"
  czas: Array<[number, string]>;      // siatka czasu trwania
  czasKrotko: string;
  czasKilka: string;
  czasCalyDzien: string;
  zamkniete: string;
  brakTerminow: string;
};

const RU: Formy = {
  dni: ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"],
  miesiace: ["января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря"],
  dniMiesiaca: ["", "первого", "второго", "третьего", "четвёртого", "пятого", "шестого",
    "седьмого", "восьмого", "девятого", "десятого", "одиннадцатого", "двенадцатого",
    "тринадцатого", "четырнадцатого", "пятнадцатого", "шестнадцатого", "семнадцатого",
    "восемнадцатого", "девятнадцатого", "двадцатого", "двадцать первого", "двадцать второго",
    "двадцать третьего", "двадцать четвёртого", "двадцать пятого", "двадцать шестого",
    "двадцать седьмого", "двадцать восьмого", "двадцать девятого", "тридцатого", "тридцать первого"],
  jednostki: ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять",
    "десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать",
    "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"],
  jednostkiDop: ["", "одного", "двух", "трёх", "четырёх", "пяти", "шести", "семи", "восьми",
    "девяти", "десяти", "одиннадцати", "двенадцати", "тринадцати", "четырнадцати", "пятнадцати",
    "шестнадцати", "семнадцати", "восемнадцати", "девятнадцати"],
  dziesiatki: ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят",
    "восемьдесят", "девяносто"],
  dziesiatkiDop: ["", "", "двадцати", "тридцати", "сорока", "пятидесяти", "шестидесяти",
    "семидесяти", "восьмидесяти", "девяноста"],
  setki: ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот",
    "восемьсот", "девятьсот"],
  setkiDop: ["", "ста", "двухсот", "трёхсот", "четырёхсот", "пятисот", "шестисот", "семисот",
    "восьмисот", "девятисот"],
  tysiac: ["тысяча", "тысячи", "тысяч"],
  tysiacDop: "тысяч",
  waluta: "злотых",
  odDo: ["от", "до"],
  czas: [[15, "около пятнадцати минут"], [30, "около получаса"], [45, "около сорока пяти минут"],
    [60, "около часа"], [90, "около полутора часов"], [120, "около двух часов"],
    [180, "около трёх часов"], [240, "около четырёх часов"]],
  czasKrotko: "недолго", czasKilka: "несколько часов", czasCalyDzien: "целый день",
  zamkniete: "закрыто", brakTerminow: "нет свободного времени",
};

const UK: Formy = {
  dni: ["неділя", "понеділок", "вівторок", "середа", "четвер", "п'ятниця", "субота"],
  miesiace: ["січня", "лютого", "березня", "квітня", "травня", "червня",
    "липня", "серпня", "вересня", "жовтня", "листопада", "грудня"],
  dniMiesiaca: ["", "першого", "другого", "третього", "четвертого", "п'ятого", "шостого",
    "сьомого", "восьмого", "дев'ятого", "десятого", "одинадцятого", "дванадцятого",
    "тринадцятого", "чотирнадцятого", "п'ятнадцятого", "шістнадцятого", "сімнадцятого",
    "вісімнадцятого", "дев'ятнадцятого", "двадцятого", "двадцять першого", "двадцять другого",
    "двадцять третього", "двадцять четвертого", "двадцять п'ятого", "двадцять шостого",
    "двадцять сьомого", "двадцять восьмого", "двадцять дев'ятого", "тридцятого", "тридцять першого"],
  jednostki: ["", "один", "два", "три", "чотири", "п'ять", "шість", "сім", "вісім", "дев'ять",
    "десять", "одинадцять", "дванадцять", "тринадцять", "чотирнадцять", "п'ятнадцять",
    "шістнадцять", "сімнадцять", "вісімнадцять", "дев'ятнадцять"],
  jednostkiDop: ["", "одного", "двох", "трьох", "чотирьох", "п'яти", "шести", "семи", "восьми",
    "дев'яти", "десяти", "одинадцяти", "дванадцяти", "тринадцяти", "чотирнадцяти", "п'ятнадцяти",
    "шістнадцяти", "сімнадцяти", "вісімнадцяти", "дев'ятнадцяти"],
  dziesiatki: ["", "", "двадцять", "тридцять", "сорок", "п'ятдесят", "шістдесят", "сімдесят",
    "вісімдесят", "дев'яносто"],
  dziesiatkiDop: ["", "", "двадцяти", "тридцяти", "сорока", "п'ятдесяти", "шістдесяти",
    "сімдесяти", "вісімдесяти", "дев'яноста"],
  setki: ["", "сто", "двісті", "триста", "чотириста", "п'ятсот", "шістсот", "сімсот",
    "вісімсот", "дев'ятсот"],
  setkiDop: ["", "ста", "двохсот", "трьохсот", "чотирьохсот", "п'ятисот", "шестисот", "семисот",
    "восьмисот", "дев'ятисот"],
  tysiac: ["тисяча", "тисячі", "тисяч"],
  tysiacDop: "тисяч",
  waluta: "злотих",
  odDo: ["від", "до"],
  czas: [[15, "близько п'ятнадцяти хвилин"], [30, "близько півгодини"], [45, "близько сорока п'яти хвилин"],
    [60, "близько години"], [90, "близько півтори години"], [120, "близько двох годин"],
    [180, "близько трьох годин"], [240, "близько чотирьох годин"]],
  czasKrotko: "недовго", czasKilka: "кілька годин", czasCalyDzien: "цілий день",
  zamkniete: "зачинено", brakTerminow: "немає вільного часу",
};

const F: Record<JezykSlow, Formy> = { ru: RU, uk: UK };

/**
 * FORMA LICZBY MNOGIEJ — 1 / 2-4 / 5+, z pułapką na 11-14.
 * Ta sama reguła co w polskim „tysiąc / tysiące / tysięcy", te same wyjątki.
 */
const formaMnoga = (ile: number, formy: [string, string, string]): string => {
  const dwie = ile % 100;
  if (dwie >= 11 && dwie <= 14) return formy[2];
  const ost = ile % 10;
  if (ost === 1) return formy[0];
  if (ost >= 2 && ost <= 4) return formy[1];
  return formy[2];
};

/** Setki, dziesiątki i jedności — część wspólna dla liczby i dla tysięcy. */
const doTysiaca = (n: number, f: Formy, dop: boolean): string[] => {
  const out: string[] = [];
  const set = Math.floor(n / 100);
  if (set) out.push((dop ? f.setkiDop : f.setki)[set]);
  const r = n % 100;
  if (r >= 20) {
    out.push((dop ? f.dziesiatkiDop : f.dziesiatki)[Math.floor(r / 10)]);
    if (r % 10) out.push((dop ? f.jednostkiDop : f.jednostki)[r % 10]);
  } else if (r > 0) {
    out.push((dop ? f.jednostkiDop : f.jednostki)[r]);
  }
  return out;
};

const liczbaSlownie = (n: number, f: Formy, dop: boolean): string => {
  if (n <= 0 || n > 999999) return String(n);
  const out: string[] = [];
  const tys = Math.floor(n / 1000);
  if (tys > 0) {
    // ⚠️ RODZAJ ŻEŃSKI PRZY TYSIĄCACH: „одна тысяча", „две тысячи" — nie
    // „один"/„два". To różnica wobec polskiego, gdzie „tysiąc" jest męski.
    const czesc = doTysiaca(tys, f, dop);
    // OKRĄGŁY TYSIĄC BEZ „JEDEN": po rosyjsku i ukraińsku mówi się „тысяча
    // злотых", nie „одна тысяча злотых" — samo „одна" brzmi sztucznie.
    // (Zweryfikowane przez użytkownika znającego oba języki.)
    if (tys === 1) czesc.length = 0;
    else {
      // RODZAJ ŻEŃSKI przy tysiącach: „две тысячи" / „дві тисячі", nie „два".
      if (!dop && tys % 10 === 1 && tys % 100 !== 11) czesc[czesc.length - 1] = "одна";
      if (!dop && tys % 10 === 2 && tys % 100 !== 12) czesc[czesc.length - 1] = f === RU ? "две" : "дві";
    }
    out.push(...czesc, dop ? f.tysiacDop : formaMnoga(tys, f.tysiac));
  }
  out.push(...doTysiaca(n % 1000, f, dop));
  return out.filter(Boolean).join(" ");
};

/** „вторник, восемнадцатого августа" / „вівторок, вісімнадцятого серпня" */
export const doWypowiedzeniaSlow = (iso: string, jezyk: JezykSlow): string => {
  const f = F[jezyk];
  const d = new Date(`${iso}T12:00:00Z`);
  return `${f.dni[d.getUTCDay()]}, ${f.dniMiesiaca[d.getUTCDate()]} ${f.miesiace[d.getUTCMonth()]}`;
};

export const czasDoWypowiedzeniaSlow = (min: number, jezyk: JezykSlow): string => {
  const f = F[jezyk];
  const t = f.czas.find(([m]) => m === min);
  if (t) return t[1];
  if (min < 30) return f.czasKrotko;
  if (min >= 300) return f.czasCalyDzien;
  return f.czasKilka;
};

/** „сто пятьдесят злотых" / „от ста пятидесяти до двухсот пятидесяти злотых" */
export const cenaDoWypowiedzeniaSlow = (od: number, do_: number | null, jezyk: JezykSlow): string => {
  const f = F[jezyk];
  if (!od && !do_) return `0 ${f.waluta}`;
  if (!do_ || do_ === od) return `${liczbaSlownie(od, f, false)} ${f.waluta}`;
  return `${f.odDo[0]} ${liczbaSlownie(od, f, true)} ${f.odDo[1]} ${liczbaSlownie(do_, f, true)} ${f.waluta}`;
};

export const powodSlow = (powodPl: string, jezyk: JezykSlow): string => {
  const f = F[jezyk];
  return powodPl === "zamknięte" ? f.zamkniete
    : powodPl === "brak wolnych terminów" ? f.brakTerminow : powodPl;
};

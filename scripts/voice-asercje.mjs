// ============================================================================
// voice-asercje.mjs — REGUŁY PROMPTU SPRAWDZANE MASZYNOWO.
//
// Sędzia-LLM mówi „rozmowa przebiegła dobrze". Te asercje mówią, KTÓRA REGUŁA
// została złamana, w której turze i jakimi słowami. Dwie różne rzeczy: pierwsza
// ocenia wrażenie, druga łapie defekt.
//
// Każda asercja ma `id`, `waga` ("blad" | "ostrzezenie") i zwraca listę
// naruszeń: { tura, cytat, powod }.
//
// ZASADA 12: asercja, która nie miała czego sprawdzić, MUSI to powiedzieć.
// Cicha asercja wygląda identycznie jak asercja, która przeszła.
// ============================================================================

const bezOgonkow = (s) => String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const zdania = (t) => String(t || "").split(/(?<=[.!?])\s+/).filter(Boolean);

// --- języki ----------------------------------------------------------------
const MIESIACE = {
  pl: ["stycznia","lutego","marca","kwietnia","maja","czerwca","lipca","sierpnia","września","października","listopada","grudnia"],
  ru: ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"],
  uk: ["січня","лютого","березня","квітня","травня","червня","липня","серпня","вересня","жовтня","листопада","грудня"],
  en: ["january","february","march","april","may","june","july","august","september","october","november","december"],
};
// Słowa polskie na tyle charakterystyczne, że ich obecność w zdaniu rosyjskim,
// ukraińskim albo angielskim jest defektem, a nie zbiegiem okoliczności.
const POLSKIE_SLOWA = /\b(poprosz[ęe]|dzi[ęe]kuj[ęe]|godzin[aeoy]?|wolne|termin\w*|z[łl]otych|przyjecha[ćc]|pom[óo]c|pomog[ęe]|dobrze|oczywi[śs]cie|prosz[ęe]|mechanik|warsztat\w*|wymiana|numer rejestracyjny|potwierdzenie|do widzenia|dzie[ńn] dobry|jutro|poniedzia[łl]ek|wtorek|[śs]rod[aęe]|czwartek|pi[ąa]tek|sobot[aęe]|niedziel[aęe])\b/i;


// ============================================================================
// DATY — PORÓWNUJEMY LICZBY, NIE FRAZY.
//
// Pierwsza wersja porównywała napisy: snapshot ma „Monday, 17 August", agent
// powiedział „Monday the 17th of August" i asercja zapaliła się na poprawnej
// dacie. Cztery języki razy kilkanaście sposobów odmiany to nie jest zbiór,
// który da się dopasować napisem. Dzień i miesiąc są liczbami — i tak je
// porównujemy.
// ============================================================================
const LICZEBNIKI = {
  pl: ["pierwsz","drugi","drugie","trzeci","czwart","piąt","szóst","siódm","ósm","dziewiąt","dziesiąt","jedenast","dwunast","trzynast","czternast","piętnast","szesnast","siedemnast","osiemnast","dziewiętnast","dwudziest"],
  ru: ["перв","втор","трет","четверт","пят","шест","седьм","восьм","девят","десят","одиннадцат","двенадцат","тринадцат","четырнадцат","пятнадцат","шестнадцат","семнадцат","восемнадцат","девятнадцат","двадцат"],
  uk: ["перш","друг","трет","четверт","п.ят","шост","сьом","восьм","дев.ят","десят","одинадцят","дванадцят","тринадцят","чотирнадцят","п.ятнадцят","шістнадцят","сімнадцят","вісімнадцят","дев.ятнадцят","двадцят"],
};
// Indeks w tablicy -> dzień miesiąca. „drugi"/„drugie" to ten sam dzień, stąd
// dwie pozycje w polskiej liście i korekta niżej.
const DZIEN_Z_INDEKSU = { pl: [1,2,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20] };

function dzienZeSlow(txt, jezyk) {
  const lista = LICZEBNIKI[jezyk];
  if (!lista) return [];
  const t = bezOgonkow(String(txt).toLowerCase());
  const trafienia = [];
  // \b w JS jest oparte na ASCII i NIE DZIAŁA przed cyrylicą — ta sama pułapka,
  // przez którą wcześniej nie łapaliśmy „полный сервис". Szukamy przez includes.
  //
  // Bierzemy TYLKO NAJDŁUŻSZY pasujący rdzeń: „пятнадцатого" zawiera „пят",
  // więc bez tego filtra piętnasty dzień czytałby się także jako piąty.
  const pasujace = [];
  lista.forEach((rdzen, i) => {
    const r = bezOgonkow(rdzen).replace(/\./g, "."); // apostrof w uk bywa różny
    if (new RegExp(r, "i").test(t)) pasujace.push({ r, i });
  });
  for (const { r, i } of pasujace) {
    if (pasujace.some((inny) => inny.r !== r && inny.r.includes(r))) continue;
    trafienia.push((DZIEN_Z_INDEKSU[jezyk] || [])[i] ?? i + 1);
  }
  // „dwudziestego pierwszego" = 21. Gdy w tekście jest „dwudziest" i jeszcze
  // jeden liczebnik z zakresu 1-9, dokładamy sumę jako możliwy dzień.
  if (trafienia.includes(20)) for (const d of trafienia) if (d >= 1 && d <= 9) trafienia.push(20 + d);
  return trafienia;
}

function dzienZCyfr(txt) {
  return [...String(txt).matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\b/gi)].map((m) => Number(m[1])).filter((n) => n >= 1 && n <= 31);
}

/** Zwraca listę par [miesiac, dzien] wymienionych w tekście. */
function datyWTekscie(txt, jezyk) {
  const mies = MIESIACE[jezyk] || MIESIACE.pl;
  const t = bezOgonkow(String(txt).toLowerCase());
  const pary = [];
  mies.forEach((nazwa, idx) => {
    const n = bezOgonkow(nazwa);
    let poz = t.indexOf(n);
    while (poz !== -1) {
      // Dzień stoi PRZED nazwą miesiąca we wszystkich czterech językach.
      const przed = t.slice(Math.max(0, poz - 40), poz);
      const dni = [...dzienZCyfr(przed), ...dzienZeSlow(przed, jezyk)];
      for (const d of dni) pary.push([idx + 1, d]);
      if (!dni.length) pary.push([idx + 1, null]);   // miesiąc bez dnia — i tak wymaga sprawdzenia
      poz = t.indexOf(n, poz + 1);
    }
  });
  return pary;
}

// --- pomocnicze ------------------------------------------------------------
const tekstAgenta = (rozmowa) => rozmowa
  .map((t, i) => ({ i, rola: t.role, tekst: String(t.message || "").trim() }))
  .filter((t) => t.rola === "agent" && t.tekst);

const naruszenie = (t, powod) => ({ tura: t.i, cytat: t.tekst.slice(0, 140), powod });

// ============================================================================
// ASERCJE WSPÓLNE DLA WSZYSTKICH JĘZYKÓW
// ============================================================================
export const ASERCJE = [
  {
    id: "forma_ty",
    waga: "blad",
    opis: "agent przechodzi na formę ty",
    dotyczy: (s) => s.jezyk === "pl",
    sprawdz: (ctx) => tekstAgenta(ctx.rozmowa).flatMap((t) =>
      /\b(pasuje ci|dla ciebie|czy chcesz|wolisz|masz auto|mo[żz]esz (przyjecha|poda|zaczeka)|twoj[aei]\w*|dzwonisz|jeste[śs]|powiedzia[łl]e[śs]|poda[łl]e[śs]|chcia[łl]by[śs]|b[ęe]dziesz|ci pasuje|tobie)\b/i.test(bezOgonkow(t.tekst))
        ? [naruszenie(t, "forma na ty — rozmowa ma być oficjalna od pierwszego do ostatniego zdania")] : []),
  },
  {
    id: "plec_przed_imieniem",
    waga: "blad",
    opis: 'Pan/Pani zanim padło imię',
    dotyczy: (s) => s.jezyk === "pl",
    sprawdz: (ctx) => {
      // Tura, w której klient pierwszy raz podał imię — wcześniej płci nie znamy.
      const imieOd = ctx.rozmowa.findIndex((t) => t.role === "user" && /\b(nazywam si[eę]|imi[eę] to|jestem)\b/i.test(String(t.message || "")));
      const granica = imieOd === -1 ? Infinity : imieOd;
      return tekstAgenta(ctx.rozmowa)
        .filter((t) => t.i < granica)
        .flatMap((t) => /\b(pan[uaie]?|pani[ą]?)\b/i.test(bezOgonkow(t.tekst))
          ? [naruszenie(t, "forma z domyśloną płcią przed poznaniem imienia")] : []);
    },
  },
  {
    id: "data_powtorzona",
    waga: "blad",
    opis: "ta sama data lub godzina dwa razy w jednej turze",
    sprawdz: (ctx) => tekstAgenta(ctx.rozmowa).flatMap((t) => {
      const mies = MIESIACE[ctx.jezyk] || MIESIACE.pl;
      const rx = new RegExp(`\\S+\\s+(${mies.join("|")})`, "gi");
      const daty = [...t.tekst.matchAll(rx)].map((m) => bezOgonkow(m[0].toLowerCase()));
      const dubel = daty.find((d, i) => daty.indexOf(d) !== i);
      return dubel ? [naruszenie(t, `data „${dubel}" powtórzona w jednej turze — ma paść DOKŁADNIE RAZ`)] : [];
    }),
  },
  {
    id: "trzy_godziny",
    waga: "blad",
    opis: "trzy godziny naraz zamiast dwóch",
    sprawdz: (ctx) => tekstAgenta(ctx.rozmowa).flatMap((t) => {
      const ile = policzGodziny(t.tekst, ctx.jezyk);
      return ile >= 3 ? [naruszenie(t, `${ile} godziny w jednej turze — limit to dwie`)] : [];
    }),
  },
  {
    id: "relacjonowanie_pracy",
    waga: "blad",
    opis: "agent opowiada, co robi w systemie",
    dotyczy: (s) => s.jezyk === "pl",
    sprawdz: (ctx) => tekstAgenta(ctx.rozmowa).flatMap((t) =>
      /\b(sprawdz(am|[ęe]) (wolne )?(termin|dost[ęe]pno)|zapisuj[ęe] w systemie|tworz[ęe] (rezerwacj|zleceni)|umawiam pan|ju[żz] sprawdzam|chwileczk|(po)?prosz[ęe] (o chwil|zaczeka|czeka))/i.test(bezOgonkow(t.tekst))
        ? [naruszenie(t, "relacja z własnej pracy — klient słyszy wynik, nigdy proces")] : []),
  },
  {
    id: "odsylanie_do_telefonu",
    waga: "blad",
    opis: "agent każe zadzwonić, a klient właśnie dzwoni",
    sprawdz: (ctx) => tekstAgenta(ctx.rozmowa).flatMap((t) =>
      /(zadzwo[nń]|skontaktowa[ćc] si[ęe] z obs[łl]ug|numer (ma pan|znajdzie)|call us|позвоните|зателефонуйте)/i.test(bezOgonkow(t.tekst))
        ? [naruszenie(t, "odesłanie do telefonu w trakcie telefonu")] : []),
  },
  {
    id: "cyfry_grupami",
    waga: "blad",
    opis: "numer czytany grupami zamiast pojedynczo",
    dotyczy: (s) => s.jezyk === "pl",
    sprawdz: (ctx) => tekstAgenta(ctx.rozmowa).flatMap((t) =>
      /\b(pi[ęe][ćc]set|czterysta|trzysta|dziewi[ęe][ćc]set|sze[śs][ćc]set|siedemset|osiemset|dwie[śs]cie)\b/i.test(bezOgonkow(t.tekst))
        ? [naruszenie(t, "setki w numerze — każdą cyfrę czytamy osobno")] : []),
  },

  // ---- NOWE: dane spoza snapshotu -----------------------------------------
  {
    id: "data_spoza_snapshotu",
    waga: "blad",
    opis: "data, której nie ma w snapshocie, bez wywołania check_availability",
    wymagaSnapshotu: true,
    sprawdz: (ctx) => {
      // Bez wiedzy o narzędziach serwerowych nie da się odróżnić „agent zmyślił
      // datę" od „agent ją sprawdził". Milczące zielone byłoby tu kłamstwem.
      if (ctx.logiNieznane) return [{ tura: -1, cytat: "", powod: "NIE SPRAWDZONE: logi narzędzi serwerowych niedostępne" }];
      if (ctx.narzedzia.includes("check_availability")) return [];
      const dozwolone = new Set();
      for (const d of ctx.snapshot?.dni || []) {
        const m = String(d.data || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (m) dozwolone.add(`${Number(m[2])}-${Number(m[3])}`);
      }
      if (!dozwolone.size) return [{ tura: -1, cytat: "", powod: "NIE SPRAWDZONE: snapshot bez dat" }];
      return tekstAgenta(ctx.rozmowa).flatMap((t) => {
        const pary = datyWTekscie(t.tekst, ctx.jezyk);
        if (!pary.length) return [];
        // Agent może w jednej turze wymienić kilka liczb (np. rocznik auta).
        // Wystarczy, że JEDNA z par trafia w snapshot — inaczej łapalibyśmy
        // „BMW serii trzy" jako datę.
        return pary.some(([m, d]) => d !== null && dozwolone.has(`${m}-${d}`))
          ? [] : [naruszenie(t, `data spoza snapshotu (${pary.map(([m, d]) => `${d ?? "?"}.${m}`).join(", ")}), a check_availability nie zostało wywołane`)];
      });
    },
  },
  {
    id: "godzina_spoza_wolnych",
    waga: "blad",
    opis: "godzina spoza wolnych albo po ostatnim możliwym starcie",
    wymagaSnapshotu: true,
    sprawdz: (ctx) => {
      if (ctx.logiNieznane) return [{ tura: -1, cytat: "", powod: "NIE SPRAWDZONE: logi narzędzi serwerowych niedostępne" }];
      if (ctx.narzedzia.includes("check_availability")) return [];
      // PORÓWNUJEMY RDZENIE, NIE PEŁNE FORMY.
      // Pierwsza wersja porównywała słowo w słowo i zapaliła się na
      // „Najpóźniej mogę zapisać na szesnastą", choć snapshot miał
      // „szesnastej" — ta sama godzina, inny przypadek. Asercja, która
      // krzyczy przy poprawnej wypowiedzi, uczy ignorowania czerwonego.
      const dozwolone = new Set();
      const dodaj = (v) => { const r = rdzenGodziny(v); if (r) dozwolone.add(r); };
      for (const d of ctx.snapshot?.dni || []) {
        for (const g of d.wolne_do_wypowiedzenia || []) dodaj(g);
        for (const g of d.wolne || []) dodaj(g);
        dodaj(d.ostatni_mozliwy_start_do_wypowiedzenia);
        dodaj(d.ostatni_start_do_wypowiedzenia);
      }
      dodaj(ctx.snapshot?.ustawienia?.najpozniejsze_przyjecie_do_wypowiedzenia);
      if (!dozwolone.size) return [{ tura: -1, cytat: "", powod: "NIE SPRAWDZONE: snapshot bez wolnych godzin" }];
      return tekstAgenta(ctx.rozmowa).flatMap((t) => {
        // GODZINY OTWARCIA TO NIE PROPOZYCJA TERMINU.
        // „We're open Monday through Friday, 9 to 5" zapalało tę asercję 3/3,
        // choć agent informował o godzinach pracy, a nie proponował siedemnastej.
        // Wycinamy zakresy godzin pracy, zanim policzymy propozycje.
        const bezOtwarcia = String(t.tekst)
          .replace(/\b(?:open|otwarte|czynne|pracujemy|godziny (?:pracy|otwarcia)|работаем|працюємо)[^.!?]*/gi, " ")
          .replace(/\b\d{1,2}\s*(?:-|–|to|do)\s*\d{1,2}\b/gi, " ");
        const obce = [...new Set(wyciagnijGodziny(bezDat(bezOtwarcia, ctx.jezyk), ctx.jezyk).map(rdzenGodziny))]
          // „4 o'clock" po angielsku to szesnasta — snapshot podaje 16:00.
          // Bez tej równoważności asercja krzyczała na poprawne popołudnie.
          .filter((r) => r && !dozwolone.has(r) && !dozwolone.has(po12(r)));
        return obce.length ? [naruszenie(t, `godzina spoza wolnych: ${obce.join(", ")}`)] : [];
      });
    },
  },
  {
    id: "usluga_spoza_cennika",
    waga: "blad",
    opis: "agent nazywa usługę, której nie ma w cenniku",
    wymagaSnapshotu: true,
    sprawdz: (ctx) => {
      // Defekt z rozmowy c0yn9bxn: klient prosił o olej i przegląd stanu,
      // agent nazwał to „полный сервис" — pakietem, którego warsztat nie ma.
      // UWAGA: \b w JS jest oparte na ASCII i NIE dziala przed cyrylica — pierwsza
      // wersja tego wzorca nie lapala „полный сервис" w ogole.
      const wymyslone = /(?:\b(?:pe[łl]ny serwis|kompleksowy serwis|pakiet serwisowy|full service|complete service|service package)\b)|(?:полный сервис|комплексный сервис|повний сервіс|комплексне обслуговування)/i;
      const nazwy = (ctx.snapshot?.uslugi || []).map((u) => bezOgonkow(String(u.nazwa || "").toLowerCase()));
      return tekstAgenta(ctx.rozmowa).flatMap((t) => {
        const m = t.tekst.match(wymyslone);
        if (!m) return [];
        const uzyta = bezOgonkow(m[0].toLowerCase());
        return nazwy.some((n) => n.includes(uzyta)) ? [] : [naruszenie(t, `nazwa usługi spoza cennika: „${m[0]}"`)];
      });
    },
  },
];

// ============================================================================
// ASERCJE JĘZYKOWE — dla rozmów innych niż polska
// ============================================================================
export const ASERCJE_JEZYK = [
  {
    id: "polszczyzna_w_obcym",
    waga: "blad",
    opis: "polskie znaki albo polskie słowa w odpowiedzi obcojęzycznej",
    sprawdz: (ctx) => tekstAgenta(ctx.rozmowa).slice(1).flatMap((t) => {
      // POMIJAMY PIERWSZĄ TURĘ. Powitanie idzie z `first_message` w konfiguracji
      // ElevenLabs i jest po polsku ZAWSZE, także w rozmowie angielskiej —
      // klient jeszcze się nie odezwał, więc nie ma po czym poznać języka.
      // Bez tego pominięcia wszystkie 7 scenariuszy angielskich świeciło na
      // czerwono z powodu zdania, które ma prawo tak brzmieć.
      const naruszenia = [];
      // Nazwy własne (marka, model, tablica) bywają łacinką także w rosyjskim —
      // dlatego szukamy POLSKICH DIAKRYTYKÓW i polskich SŁÓW, nie samej łacinki.
      const diak = t.tekst.match(/[ąćęłńóśźż]/i);
      if (diak) naruszenia.push(naruszenie(t, `polski znak diakrytyczny „${diak[0]}"`));
      const slowo = t.tekst.match(POLSKIE_SLOWA);
      if (slowo) naruszenia.push(naruszenie(t, `polskie słowo „${slowo[0]}"`));
      // W zdaniu cyrylickim nazwy własne (Toyota, Yaris, tablica WX 12345) mają
      // prawo stać łacinką — zawsze WIELKĄ literą. Łacińskie słowo pisane MAŁĄ
      // literą to zawsze przeciek z polskiego: tak wpadło „osiemnastego"
      // w rosyjskie zdanie o dacie.
      if ((ctx.jezyk === "ru" || ctx.jezyk === "uk") && /[а-яА-ЯёЁіїєґ]/.test(t.tekst)) {
        const przeciek = t.tekst.match(/(?<!\p{L})[a-z]{4,}(?!\p{L})/gu);
        if (przeciek) naruszenia.push(naruszenie(t, `łacińskie słowo małą literą w zdaniu cyrylickim: „${przeciek[0]}"`));
      }
      return naruszenia;
    }),
  },
  {
    id: "jezyk_od_pierwszej_odpowiedzi",
    waga: "blad",
    opis: "agent nie przeszedł na język klienta od razu",
    sprawdz: (ctx) => {
      // Powitanie jest z definicji polskie (first_message) — liczy się PIERWSZA
      // odpowiedź po wypowiedzi klienta.
      const agenci = tekstAgenta(ctx.rozmowa);
      const pierwsza = agenci[1];
      if (!pierwsza) return [{ tura: -1, cytat: "", powod: "NIE SPRAWDZONE: agent nie odpowiedział ani razu" }];
      const cyrylica = /[а-яА-ЯёЁіїєґ]/.test(pierwsza.tekst);
      const oczekiwanaCyrylica = ctx.jezyk === "ru" || ctx.jezyk === "uk";
      if (oczekiwanaCyrylica && !cyrylica) return [naruszenie(pierwsza, "pierwsza odpowiedź nie jest w języku klienta")];
      if (!oczekiwanaCyrylica && cyrylica) return [naruszenie(pierwsza, "cyrylica w rozmowie angielskiej")];
      return [];
    },
  },
  {
    id: "wzorce_wstrzykniete",
    waga: "ostrzezenie",
    opis: "czy widać wzorce z voiceWzorce.ts",
    sprawdz: (ctx) => {
      // D11 sprawdza, że blok trafia do promptu. To sprawdza, czy model go UŻYWA.
      // „ostrzezenie", nie „blad": model ma prawo ułożyć własne zdanie.
      const trafienia = ctx.wzorce.filter((w) => ctx.rozmowa.some((t) =>
        t.role === "agent" && String(t.message || "").includes(w.slice(0, 24))));
      return trafienia.length ? [] : [{ tura: -1, cytat: "", powod: "żaden wzorzec nie pojawił się dosłownie — sprawdź, czy blok dochodzi" }];
    },
  },
];

// --- godziny ---------------------------------------------------------------
const SLOWA_GODZIN = {
  pl: /\b(pierwsz|drug|trzeci|czwart|pi[ąa]t|sz[óo]st|si[óo]dm|[óo]sm|dziewi[ąa]t|dziesi[ąa]t|jedenast|dwunast|trzynast|czternast|pi[ęe]tnast|szesnast|siedemnast)(?:[aąeyi]|ej|ą)\b/gi,
  ru: /\b(девят|десят|одиннадцат|двенадцат|тринадцат|четырнадцат|пятнадцат|шестнадцат|семнадцат|восем)\w*/gi,
  uk: /\b(дев\S?ят|десят|одинадцят|дванадцят|тринадцят|чотирнадцят|п\S?ятнадцят|шістнадцят|сімнадцят)\w*/gi,
  // Wymagamy KONTEKSTU godziny (at / am / pm / o'clock), inaczej „Monday the
  // 17th" i „BMW 3 series" liczyłyby się jako godziny.
  en: /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(?:am|pm|o'clock)|\bat\s+(\d{1,2})(?::(\d{2}))?\b/gi,
};
// „dziewiątej", „dziewiąta", „dziewiątą" -> „dziewiat". Obcinamy końcówkę
// fleksyjną, bo snapshot podaje jedną formę, a agent odmienia przez przypadki.
function rdzenGodziny(v) {
  if (!v) return "";
  const s = bezOgonkow(String(v).toLowerCase()).trim();
  // Godziny cyframi sprowadzamy do „H:MM" — snapshot ma „09:00", angielski
  // agent mówi „at 9" albo „9 o'clock". To ta sama godzina.
  const cyfry = s.match(/(\d{1,2})(?:[:.](\d{2}))?/);
  if (cyfry && /\d/.test(s)) return `${Number(cyfry[1])}:${cyfry[2] || "00"}`;
  return s.split(/\s+/)[0].replace(/(ej|a|e|y|ie|em|o|u|ą|a)$/u, "");
}
const po12 = (r) => { const m = String(r).match(/^(\d{1,2}):(\d{2})$/); return m && Number(m[1]) <= 12 ? `${Number(m[1]) + 12}:${m[2]}` : r; };
function bezDat(tekst, jezyk) {
  const mies = MIESIACE[jezyk] || MIESIACE.pl;
  return String(tekst).replace(new RegExp(`\\S+\\s+(${mies.join("|")})`, "gi"), " ");
}
function wyciagnijGodziny(txt, jezyk) {
  const rx = SLOWA_GODZIN[jezyk] || SLOWA_GODZIN.pl;
  return [...String(txt).matchAll(rx)].map((m) => bezOgonkow(m[0].toLowerCase()));
}
function policzGodziny(tekst, jezyk) {
  // Najpierw WYCINAMY daty. „poniedziałek siedemnastego sierpnia o dziewiątej
  // albo o dwunastej trzydzieści" to DWIE godziny, a nie trzy — „siedemnastego"
  // jest dniem miesiąca. Bez tego cięcia asercja świeciła na czerwono przy
  // poprawnej wypowiedzi, czyli uczyła ignorowania czerwonego.
  const mies = MIESIACE[jezyk] || MIESIACE.pl;
  const bezDat = String(tekst).replace(new RegExp(`\\S+\\s+(${mies.join("|")})`, "gi"), " ");
  const txt = bezOgonkow(bezDat.toLowerCase());
  // Liczymy tylko tury, w których agent PROPONUJE (jest spójnik wyboru albo pytajnik).
  if (!/[?]|\balbo\b|\bczy\b|\bили\b|\bчи\b|\bor\b/.test(txt)) return 0;
  return new Set(wyciagnijGodziny(txt, jezyk)).size;
}

/**
 * Uruchamia komplet asercji. Zwraca listę wyników — KAŻDA asercja ma wpis,
 * także ta, która nie miała czego sprawdzić (zasada 12).
 */
export function sprawdzRozmowe(ctx) {
  const zestaw = [...ASERCJE, ...(ctx.jezyk !== "pl" ? ASERCJE_JEZYK : [])];
  return zestaw.map((a) => {
    if (a.dotyczy && !a.dotyczy(ctx)) return { id: a.id, stan: "nie_dotyczy", opis: a.opis, naruszenia: [] };
    if (a.wymagaSnapshotu && !ctx.snapshot) return { id: a.id, stan: "nie_sprawdzone", opis: a.opis, naruszenia: [], powod: "brak snapshotu" };
    const n = a.sprawdz(ctx) || [];
    const nieSprawdzone = n.filter((x) => String(x.powod).startsWith("NIE SPRAWDZONE"));
    if (nieSprawdzone.length) return { id: a.id, stan: "nie_sprawdzone", opis: a.opis, naruszenia: [], powod: nieSprawdzone[0].powod };
    return { id: a.id, stan: n.length ? "blad" : "ok", waga: a.waga, opis: a.opis, naruszenia: n };
  });
}

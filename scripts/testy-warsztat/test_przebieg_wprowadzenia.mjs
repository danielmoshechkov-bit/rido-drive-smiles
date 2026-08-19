// PRZEJŚCIE WPROWADZENIA KROK PO KROKU — bez przeglądarki.
//
// Odtwarzamy dokładnie tę drogę, którą przechodzi warsztat i którą sam opisał:
// panel → okno zlecenia → okno pojazdu → okno klienta → powrót → lista zadań →
// zapis → SMS o przyjęciu → wejście w zlecenie → wycena → kosztorys SMS-em →
// akceptacja → gotowe do odbioru + SMS → dokument → zamknięcie → usunięcie.
//
// Na każdym ekranie mówimy, jakie cele są widoczne i w którym oknie, a potem
// sprawdzamy, czy wprowadzenie pokazuje krok z TEGO ekranu.
//
// To jest test, którego brakowało: błędy typu „dymek mówi o numerze rejestracyjnym,
// a na ekranie są dane klienta" widać tu od razu, bez klikania.
import { wybierzKrok, nastepnyKrok, czyZastosowacKorekte } from '../../src/components/onboarding/wyborKroku.ts';
import { TRASA_PIERWSZE_ZLECENIE } from '../../src/components/onboarding/trasaPierwszeZlecenie.ts';

const cele = TRASA_PIERWSZE_ZLECENIE.map((k) => k.cel);
const tytul = (i) => TRASA_PIERWSZE_ZLECENIE[i]?.tytul ?? '(brak)';
const opcje = {
  przejdzGdyWypelnione: TRASA_PIERWSZE_ZLECENIE.map((k) => !!k.przejdzGdyWypelnione),
  pokazGdySieZjawi: TRASA_PIERWSZE_ZLECENIE.map((k) => !!k.pokazGdySieZjawi),
  pokazGdyWypelniony: TRASA_PIERWSZE_ZLECENIE.map((k) => !!k.pokazGdyWypelniony),
};

let bledy = 0;
const sprawdz = (opis, wynikIndex, oczekiwanyCel) => {
  const ok = cele[wynikIndex] === oczekiwanyCel;
  console.log(`${ok ? ' OK  ' : 'BLAD '} ${opis} → „${tytul(wynikIndex)}" (${cele[wynikIndex]})${ok ? '' : ` — oczekiwano ${oczekiwanyCel}`}`);
  if (!ok) bledy++;
};
const sprawdzWarunek = (opis, ok) => {
  console.log(`${ok ? ' OK  ' : 'BLAD '} ${opis}`);
  if (!ok) bledy++;
};

// ── EKRAN 1: lista zleceń, nic nie otwarte ──────────────────────────────────
let krok = 0;
const panel = [
  { cel: 'nowe-zlecenie', glebokosc: 0 },
  { cel: 'wiersz-zlecenia', glebokosc: 0 },
  { cel: 'zaznacz-zlecenie', glebokosc: 0 },
  { cel: 'dokumenty-zlecenia', glebokosc: 0 },
  { cel: 'status-na-liscie', glebokosc: 0 },
  { cel: 'filtr-zakonczone', glebokosc: 0 },
];
const pustyPanel = [{ cel: 'nowe-zlecenie', glebokosc: 0 }, { cel: 'filtr-zakonczone', glebokosc: 0 }];
krok = wybierzKrok(cele, krok, pustyPanel, opcje);
sprawdz('panel: startujemy od „Nowe zlecenie"', krok, 'nowe-zlecenie');

// ── EKRAN 2: otwarte okno zlecenia ──────────────────────────────────────────
const oknoZlecenia = [
  ...pustyPanel,
  { cel: 'pole-rejestracji', glebokosc: 1 },
  { cel: 'pole-klienta', glebokosc: 1 },
  { cel: 'pole-opisu', glebokosc: 1 },
  { cel: 'uszkodzenia-i-zdjecia', glebokosc: 1 },
  { cel: 'zapisz-zlecenie', glebokosc: 1 },
];
krok = wybierzKrok(cele, krok, oknoZlecenia, opcje);
sprawdz('po otwarciu zlecenia: pole pojazdu', krok, 'pole-rejestracji');

// Wpisany numer rejestracyjny NIE przenosi dalej — trzeba jeszcze nacisnąć
// Enter albo „Utwórz nowy pojazd". To był realny błąd: ramka uciekała na dane
// klienta, zanim człowiek zdążył dodać auto.
{
  const zWpisanym = oknoZlecenia.map((w) => (w.cel === 'pole-rejestracji' ? { ...w, wypelniony: true } : w));
  const wynik = wybierzKrok(cele, krok, zWpisanym, opcje);
  sprawdzWarunek('wpisany numer rejestracyjny NIE przesuwa ramki na klienta', wynik === krok);
}

// ── EKRAN 3: okno „Dodaj nowy pojazd" NA WIERZCHU ───────────────────────────
// Okno pojazdu otwiera sie NAD oknem zlecenia. Biblioteka ukrywa tlo przed
// czytnikami ekranu, wiec cele z okna pod spodem znikaja z listy widocznych —
// dokladnie tak, jak liczy to silnik.
const oknoPojazdu = [
  ...pustyPanel,
  { cel: 'pojazd-wlasciciel', glebokosc: 2 },
  { cel: 'pojazd-rejestracja', glebokosc: 2 },
  // Pola pojazdu SA na ekranie od poczatku — tylko puste. Wprowadzenie nie moze
  // o nich mowic, dopoki rejestr ich nie wypelni.
  { cel: 'pobrane-dane', glebokosc: 2, wypelniony: false },
  { cel: 'pojazd-zapisz', glebokosc: 2 },
];
krok = wybierzKrok(cele, krok, oknoPojazdu, opcje);
sprawdz('okno pojazdu: najpierw właściciel', krok, 'pojazd-wlasciciel');

// ── EKRAN 4: okno „Dodaj nowego klienta" NA WIERZCHU ────────────────────────
const oknoKlienta = [
  ...pustyPanel,
  { cel: 'klient-imie-nazwisko', glebokosc: 3 },
  { cel: 'klient-telefon', glebokosc: 3 },
];
krok = wybierzKrok(cele, krok, oknoKlienta, opcje);
sprawdz('okno klienta: imię i nazwisko', krok, 'klient-imie-nazwisko');

// Wpisane imię ma SAMO przenieść ramkę na telefon — bez klikania „Dalej".
const oknoKlientaZImieniem = oknoKlienta.map((w) => (w.cel === 'klient-imie-nazwisko' ? { ...w, wypelniony: true } : w));
krok = wybierzKrok(cele, krok, oknoKlientaZImieniem, opcje);
sprawdz('po wpisaniu imienia ramka schodzi sama na telefon', krok, 'klient-telefon');

// A po wpisaniu numeru — na „Zapisz". Wczesniej instrukcja mowila „potem
// Zapisz", ale nie bylo widac, ktory to przycisk.
const oknoKlientaZTelefonem = [
  ...pustyPanel,
  { cel: 'klient-imie-nazwisko', glebokosc: 3, wypelniony: true },
  { cel: 'klient-telefon', glebokosc: 3, wypelniony: true },
  { cel: 'klient-zapisz', glebokosc: 3 },
];
krok = wybierzKrok(cele, krok, oknoKlientaZTelefonem, opcje);
sprawdz('po wpisaniu telefonu ramka pokazuje „Zapisz"', krok, 'klient-zapisz');

// ── EKRAN 5: klient zapisany, wracamy do okna pojazdu ───────────────────────
krok = wybierzKrok(cele, krok, oknoPojazdu, opcje);
sprawdz('powrót do pojazdu: numer i lupka', krok, 'pojazd-rejestracja');

// ── EKRAN 6: po lupce pola pojazdu sie wypelniaja ───────────────────────────
const poLupce = oknoPojazdu.map((w) => (w.cel === 'pobrane-dane' ? { ...w, wypelniony: true } : w));
krok = wybierzKrok(cele, krok, poLupce, opcje);
sprawdz('po lupce: wypełnione pola pojazdu', krok, 'pobrane-dane');
krok = nastepnyKrok(cele, krok, poLupce);
sprawdz('„Dalej": zapis pojazdu', krok, 'pojazd-zapisz');

// ── EKRAN 7: pojazd zapisany, znów samo okno zlecenia ───────────────────────
krok = wybierzKrok(cele, krok, oknoZlecenia, opcje);
sprawdz('powrót do zlecenia: dane klienta', krok, 'pole-klienta');
krok = nastepnyKrok(cele, krok, oknoZlecenia);
sprawdz('„Dalej": lista zadań do wykonania', krok, 'pole-opisu');
// Po liscie zadan idziemy PROSTO do zdjec — „Dodaj pozycje" jest podswietlone
// razem z lista, wiec nie potrzebuje wlasnego kroku.
krok = nastepnyKrok(cele, krok, oknoZlecenia);
sprawdz('„Dalej": uszkodzenia, zdjęcia i protokół', krok, 'uszkodzenia-i-zdjecia');
krok = nastepnyKrok(cele, krok, oknoZlecenia);
sprawdz('„Dalej": zapis zlecenia', krok, 'zapisz-zlecenie');

// ── EKRAN 8: okno „Zlecenie utworzone!" — SMS do klienta ────────────────────
const oknoSukcesu = [...pustyPanel, { cel: 'sms-po-utworzeniu', glebokosc: 1 }];
krok = wybierzKrok(cele, krok, oknoSukcesu, opcje);
sprawdz('po zapisie: SMS o przyjęciu zlecenia', krok, 'sms-po-utworzeniu');

// ── EKRAN 9: lista ze zleceniem — trzeba w nie wejść ────────────────────────
krok = wybierzKrok(cele, krok, panel, opcje);
sprawdz('zlecenie na liście: wejdź w nie', krok, 'wiersz-zlecenia');

// ── EKRAN 10: karta zlecenia (wycena) ───────────────────────────────────────
const kartaWyceny = [
  { cel: 'ikony-wiadomosci', glebokosc: 0 },
  { cel: 'tabela-robocizny', glebokosc: 0 },
  { cel: 'rido-wycena', glebokosc: 0 },
  { cel: 'tabela-czesci', glebokosc: 0 },
  { cel: 'kolumna-koszt', glebokosc: 0 },
  { cel: 'kolumna-cena', glebokosc: 0 },
  { cel: 'podsumowanie-zlecenia', glebokosc: 0 },
  { cel: 'przycisk-przyjecie', glebokosc: 0 },
  { cel: 'przycisk-kosztorys', glebokosc: 0 },
  { cel: 'przycisk-odbior', glebokosc: 0 },
  { cel: 'status-zlecenia', glebokosc: 0 },
];
krok = wybierzKrok(cele, krok, kartaWyceny, opcje);
sprawdz('karta zlecenia: pasek rozmowy z klientem', krok, 'ikony-wiadomosci');
for (const [opis, oczek] of [
  ['robocizna', 'tabela-robocizny'],
  ['Rido Wycena', 'rido-wycena'],
  // „Dalej" idzie o JEDEN krok, wiec przechodzi takze przez kroki, ktorych cel
  // akurat nie jest na wierzchu (okno Rido). Tak jest przewidywalnie.
  ['okno widelek', 'rido-okno'],
  ['zastosowanie cen', 'zastosuj-ceny'],
  ['części', 'tabela-czesci'],
  ['koszt', 'kolumna-koszt'],
  ['cena', 'kolumna-cena'],
  ['podsumowanie', 'podsumowanie-zlecenia'],
  ['protokół przyjęcia', 'przycisk-przyjecie'],
  ['kosztorys', 'przycisk-kosztorys'],
]) {
  krok = nastepnyKrok(cele, krok, kartaWyceny);
  sprawdz(`„Dalej": ${opis}`, krok, oczek);
}

// ── EKRAN 10b: okno Rido Wyceny ─────────────────────────────────────────────
{
  const oknoRido = [
    ...kartaWyceny.map((w) => ({ ...w })),
    { cel: 'rido-okno', glebokosc: 1 },
    { cel: 'zastosuj-ceny', glebokosc: 1 },
  ];
  const wynik = wybierzKrok(cele, cele.indexOf('rido-wycena'), oknoRido, opcje);
  sprawdz('po kliknięciu Rido Wycena: okno widełek', wynik, 'rido-okno');
}

// ── EKRAN 11: okno SMS-a z kosztorysem ──────────────────────────────────────
const oknoSmsKosztorys = [...kartaWyceny.map((w) => ({ ...w })), { cel: 'sms-quote', glebokosc: 1 }];
krok = wybierzKrok(cele, krok, oknoSmsKosztorys, opcje);
sprawdz('po kliknięciu ikony: okno SMS-a z kosztorysem', krok, 'sms-quote');

// ── EKRAN 12: SMS wysłany, klient akceptuje → zielone, można naprawiać ──────
krok = wybierzKrok(cele, krok, kartaWyceny, opcje);
sprawdz('SMS wysłany: akceptacja i status', krok, 'status-zlecenia');

// Po naprawie wracamy NA LISTĘ i tam zmieniamy status.
krok = nastepnyKrok(cele, krok, panel);
sprawdz('„Dalej": status na liście', krok, 'status-na-liscie');

// Rozwinięta lista statusów — pokazujemy konkretną pozycję.
{
  const listaStatusow = [...panel, { cel: 'status-gotowe', glebokosc: 0 }, { cel: 'status-zakonczone', glebokosc: 0 }];
  krok = wybierzKrok(cele, krok, listaStatusow, opcje);
  sprawdz('rozwinięta lista: „Gotowe do odbioru"', krok, 'status-gotowe');
}
krok = nastepnyKrok(cele, krok, kartaWyceny);
sprawdz('„Dalej": powiadomienie o gotowym aucie', krok, 'przycisk-odbior');

// ── EKRAN 13: okno SMS-a o gotowym aucie ────────────────────────────────────
const oknoSmsOdbior = [...kartaWyceny.map((w) => ({ ...w })), { cel: 'sms-ready', glebokosc: 1 }];
krok = wybierzKrok(cele, krok, oknoSmsOdbior, opcje);
sprawdz('okno SMS-a o gotowym aucie', krok, 'sms-ready');

// TO SIĘ PSUŁO: po zamknięciu okna SMS-a wprowadzenie wracało na sam początek
// karty (robocizna), bo to pierwsza rzecz, jaką widać. Na zwykłym ekranie
// cofać się nie wolno.
{
  const wynik = wybierzKrok(cele, krok, kartaWyceny, opcje);
  sprawdzWarunek(
    `zamknięcie okna SMS-a nie cofa na robociznę (zostaje: ${cele[wynik]})`,
    wynik >= cele.indexOf('przycisk-odbior'),
  );
  krok = wynik;
}

// ── EKRAN 14: powrót na listę — dokument, zamknięcie, usunięcie ─────────────
krok = nastepnyKrok(cele, krok, panel);
sprawdz('powrót na listę: zaznacz zlecenie i „Wystaw"', krok, 'zaznacz-zlecenie');

const menuWystaw = [...panel, { cel: 'wystaw-dokumenty', glebokosc: 0 }];
krok = wybierzKrok(cele, krok, menuWystaw, opcje);
sprawdz('otwarte menu: paragon, faktura, potwierdzenie', krok, 'wystaw-dokumenty');

krok = nastepnyKrok(cele, krok, panel);
sprawdz('„Dalej": podgląd wystawionego dokumentu', krok, 'podglad-dokumentu');
krok = nastepnyKrok(cele, krok, panel);
sprawdz('„Dalej": zamknięcie zlecenia statusem', krok, 'status-zakonczone');
krok = nastepnyKrok(cele, krok, panel);
sprawdz('„Dalej": zakładka Zakończone', krok, 'filtr-zakonczone');

const panelZZaznaczonym = [...panel, { cel: 'usun-zlecenie', glebokosc: 0 }];
krok = nastepnyKrok(cele, krok, panelZZaznaczonym);
sprawdz('„Dalej": usunięcie zlecenia próbnego', krok, 'usun-zlecenie');
sprawdzWarunek('to ostatni krok trasy', krok === cele.length - 1);

// ── KOLEJNOSC, NA KTOREJ STOI CALA RESZTA ───────────────────────────────────
//
// Kosztorys wysyla sie z cenami, a ceny biora sie z Rido Wyceny. Dlatego krok
// „Rido Wycena" MUSI wypasc przed krokiem „wyslij kosztorys" — inaczej
// wprowadzenie prowadzi do przycisku, ktory nie ma czego wyslac. Nie blokujemy
// tego w kodzie (mozna przeciez wpisac ceny recznie), ale pilnujemy kolejnosci.
{
  const rido = cele.indexOf('rido-wycena');
  const oknoRido = cele.indexOf('rido-okno');
  const kosztorys = cele.indexOf('przycisk-kosztorys');
  const robocizna = cele.indexOf('tabela-robocizny');
  sprawdzWarunek(`robocizna (${robocizna}) przed Rido Wyceną (${rido})`, robocizna < rido);
  sprawdzWarunek(`okno widełek (${oknoRido}) zaraz po przycisku (${rido})`, oknoRido === rido + 1);
  sprawdzWarunek(`Rido Wycena przed kosztorysem (${rido} < ${kosztorys})`, rido < kosztorys);
}

// Idac samym „Dalej" od robocizny NIE da sie ominac Rido Wyceny.
{
  let i = cele.indexOf('tabela-robocizny');
  const odwiedzone = [];
  for (let n = 0; n < 12 && cele[i] !== 'przycisk-kosztorys'; n++) {
    i = nastepnyKrok(cele, i, kartaWyceny);
    odwiedzone.push(cele[i]);
  }
  sprawdzWarunek(
    `„Dalej" od robocizny prowadzi przez Rido Wycenę do kosztorysu (${odwiedzone.join(' → ')})`,
    odwiedzone.includes('rido-wycena') && cele[i] === 'przycisk-kosztorys',
  );
}

// ── PRZYPADKI BRZEGOWE, KTÓRE WYSZŁY NA ŻYWO ────────────────────────────────
console.log('--- przypadki brzegowe ---');

// 0. NAJGORSZY Z DOTYCHCZASOWYCH: okno zlecenia znika (zamkniete recznie albo
//    klknieciem obok), a na pustej liscie widac tylko „Nowe zlecenie" i
//    „Zakonczone zlecenia". Wprowadzenie skakalo wtedy na krok 28 i opowiadalo
//    o archiwum, zamiast odeslac czlowieka do „Nowe zlecenie".
{
  const pustaLista = [
    { cel: 'nowe-zlecenie', glebokosc: 0 },
    { cel: 'filtr-zakonczone', glebokosc: 0 },
  ];
  for (const skad of ['pole-rejestracji', 'pole-klienta', 'pole-opisu', 'zapisz-zlecenie']) {
    const wynik = wybierzKrok(cele, cele.indexOf(skad), pustaLista, opcje);
    sprawdz(`zamkniete okno zlecenia (byl krok „${skad}")`, wynik, 'nowe-zlecenie');
  }
}

// 0b. To samo z okna pojazdu i klienta — tam tez nie wolno uciec na koniec.
{
  const pustaLista = [
    { cel: 'nowe-zlecenie', glebokosc: 0 },
    { cel: 'filtr-zakonczone', glebokosc: 0 },
  ];
  for (const skad of ['pojazd-wlasciciel', 'klient-telefon', 'pobrane-dane']) {
    const wynik = wybierzKrok(cele, cele.indexOf(skad), pustaLista, opcje);
    sprawdz(`zamkniete okno pojazdu/klienta (byl krok „${skad}")`, wynik, 'nowe-zlecenie');
  }
}

// 0c. Klient jest juz wybrany, wiec w polu klienta nie ma czego wpisywac —
//     ramka ma zejsc na liste zadan, bo to ONA blokuje zapis zlecenia.
{
  const zWybranymKlientem = oknoZlecenia.map((w) =>
    w.cel === 'pole-klienta' ? { ...w, wypelniony: true } : w,
  );
  const wynik = wybierzKrok(cele, cele.indexOf('pole-klienta'), zWybranymKlientem, opcje);
  sprawdz('klient juz wybrany → ramka na liste zadan', wynik, 'pole-opisu');
}

// 1. „Dalej" IDZIE O JEDEN KROK — zawsze, także gdy celu następnego kroku
//    akurat nie widać. Wcześniej funkcja szukała „czegoś widocznego" i robiła
//    skoki (z kroku 2 na 10, z 27 na 35), które wyglądały na awarię.
{
  const naDokumentach = cele.indexOf('wystaw-dokumenty');
  sprawdzWarunek(
    '„Dalej" idzie dokładnie o jeden krok, nawet gdy nic nie widać',
    nastepnyKrok(cele, naDokumentach, []) === naDokumentach + 1,
  );
  sprawdzWarunek(
    '„Dalej" idzie o jeden także przy pełnym ekranie',
    nastepnyKrok(cele, 5, panel) === 6,
  );
}

// 2. Wprowadzenie nie może samo przeskoczyć na koniec, gdy nic nie widać.
{
  const wynik = wybierzKrok(cele, 3, [], opcje);
  sprawdzWarunek(`pusty ekran nie przesuwa kroku (${wynik})`, wynik === 3);
}

// 2b. Puste pola pojazdu nie przejmuja ekranu — dopiero wypelnione. Inaczej po
//     otwarciu okna pojazdu wprowadzenie od razu mowiloby „to przyszlo z
//     rejestru", zanim ktokolwiek nacisnal lupke.
{
  const wynik = wybierzKrok(cele, cele.indexOf('pole-rejestracji'), oknoPojazdu, opcje);
  sprawdz('puste pola pojazdu nie udaja pobranych danych', wynik, 'pojazd-wlasciciel');
}

// 3. Wejście w okno, które już się widziało, wraca do JEGO pierwszego kroku —
//    a nie do środka. Tak jest, gdy ktoś poprawia dane klienta.
{
  const wynik = wybierzKrok(cele, cele.indexOf('pojazd-rejestracja'), oknoKlienta, opcje);
  sprawdz('ponowne wejście w okno klienta', wynik, 'klient-imie-nazwisko');
}

// 4. Każdy cel z trasy musi istnieć w kodzie — inaczej krok jest niemy.
//    (Sprawdzenie plików robi osobny test; tu pilnujemy, że nie ma duplikatów
//    i pustych celów, bo dwa kroki o tym samym celu nigdy się nie pokażą.)
{
  const bezPustych = cele.filter(Boolean);
  const unikalne = new Set(bezPustych);
  sprawdzWarunek(`trasa nie ma powtórzonych celów (${bezPustych.length} kroków)`, unikalne.size === bezPustych.length);
}

// 5. ROZWINIETA LISTA STATUSOW NIE KATAPULTUJE NA KONIEC DROGI.
//
//    Lista zawiera i „Gotowe do odbioru" (krok o gotowosci), i „Zakonczone"
//    (krok zamykajacy) — obie pozycje maja regule „pokaz, gdy sie zjawi".
//    Po otwarciu listy na kroku o gotowosci wprowadzenie skakalo na sam koniec,
//    omijajac powiadomienie o gotowym aucie, odbior i wystawienie dokumentu.
{
  const listaStatusow = [
    { cel: 'status-na-liscie', glebokosc: 0 },
    { cel: 'status-gotowe', glebokosc: 0 },
    { cel: 'status-zakonczone', glebokosc: 0 },
  ];
  const naGotowym = cele.indexOf('status-gotowe');
  sprawdz('otwarta lista statusow zostawia krok o gotowosci',
    wybierzKrok(cele, naGotowym, listaStatusow, opcje), 'status-gotowe');

  // A z kroku WCZESNIEJSZEGO rozwinieta lista ma przejac ekran — po to ta regula
  // w ogole istnieje. Tylko do NAJBLIZSZEJ pozycji, nie do ostatniej.
  sprawdz('rozwinieta lista przejmuje ekran z kroku wczesniejszego',
    wybierzKrok(cele, cele.indexOf('status-na-liscie'), listaStatusow, opcje), 'status-gotowe');

  // ZGLOSZONE Z TESTOW NA ZYWO 19.08.2026 (zrzut z otwartym oknem SMS-a).
  //
  // Czlowiek stal na kroku o powiadomieniu o gotowym aucie, a lista statusow
  // dopiero co sie zamykala. Wprowadzenie przeskoczylo na „Krok 8 — zamknij
  // zlecenie", wiec chwile pozniej, przy otwartym oknie „Wyslij wiadomosc SMS
  // do klienta", dymek mowil o zamykaniu zlecenia.
  //
  // Zaden krok z okolic odbioru nie moze skoczyc na zamkniecie zlecenia tylko
  // dlatego, ze pozycja „Zakonczone" mignela na ekranie.
  for (const skad of ['status-gotowe', 'przycisk-odbior', 'sms-ready']) {
    const trafiony = wybierzKrok(cele, cele.indexOf(skad), listaStatusow, opcje);
    sprawdzWarunek(
      `mignieta pozycja „Zakonczone" nie katapultuje z kroku ${skad}`,
      cele[trafiony] !== 'status-zakonczone',
    );
  }
}

// 5b. OKNO SMS-a O GOTOWYM AUCIE JEST WAZNIEJSZE NIZ LISTA POD SPODEM.
//
//     Zrzut z testow: otwarte okno „Wyslij wiadomosc SMS do klienta", a dymek
//     mowil „Krok 8 — zamknij zlecenie". Okno jest glebiej niz lista, wiec to
//     ono decyduje — nawet gdy wprowadzenie stalo juz na kroku koncowym.
{
  const oknoSmsNadLista = [
    { cel: 'status-na-liscie', glebokosc: 0 },
    { cel: 'sms-ready', glebokosc: 1 },
  ];
  sprawdz('otwarte okno SMS-a o gotowym aucie sciaga dymek z kroku koncowego',
    wybierzKrok(cele, cele.indexOf('status-zakonczone'), oknoSmsNadLista, opcje), 'sms-ready');
}

// 5c. MIGAWKA W TRAKCIE PRZERYSOWANIA NIE COFA CALEJ DROGI.
//
//     Zgloszone z testow na zywo 19.08.2026: po nacisnieciu „Wyslij SMS"
//     wprowadzenie wracalo na „Zacznijmy od pierwszego zlecenia", mimo ze
//     zlecenie bylo zalozone, a SMS wyslany. Okno zamyka sie natychmiast,
//     lista dociaga wiersz chwile pozniej — i przez ten moment jedynym celem
//     na ekranie jest „Nowe zlecenie", czyli krok pierwszy.
{
  const doPoczatku = 0;

  // Migawka: propozycja pojawia sie pierwszy raz — nie wolno jej zastosowac.
  let stan = czyZastosowacKorekte(null, doPoczatku, 1000, false);
  sprawdzWarunek('pierwsza propozycja korekty jeszcze nie wchodzi', stan.zastosuj === false);

  // Chwile pozniej lista dorysowala wiersz i propozycja jest juz INNA —
  // poprzednia przepada, zegar rusza od nowa.
  const poZmianie = czyZastosowacKorekte(stan.propozycja, 14, 1100, false);
  sprawdzWarunek('zmiana propozycji zeruje odliczanie', poZmianie.zastosuj === false);

  // Propozycja, ktora sie UTRZYMALA, wchodzi.
  const utrzymana = czyZastosowacKorekte(poZmianie.propozycja, 14, 1700, false);
  sprawdzWarunek('propozycja utrzymana przez pol sekundy wchodzi', utrzymana.zastosuj === true);

  // Gdyby migawka z krokiem pierwszym utrzymala sie tylko przez ćwierć sekundy,
  // nie ma prawa nic zmienic.
  const migniecie = czyZastosowacKorekte(stan.propozycja, doPoczatku, 1250, false);
  sprawdzWarunek('cofniecie na poczatek po migawce NIE wchodzi', migniecie.zastosuj === false);

  // Otwarte okno to co innego: czlowiek wlasnie je otworzyl, wiec bez zwloki.
  const pilne = czyZastosowacKorekte(null, 18, 1000, true);
  sprawdzWarunek('rzecz, ktora sie wlasnie zjawila, wchodzi natychmiast', pilne.zastosuj === true);
}

// 6. Kroki konca drogi ida po kolei: gotowe -> SMS -> odbior klienta ->
//    dokument -> podglad -> zamkniecie. Warsztat wprost prosil o te kolejnosc.
{
  const kolejnosc = ['status-gotowe', 'przycisk-odbior', 'sms-ready', 'zaznacz-zlecenie',
                     'wystaw-dokumenty', 'podglad-dokumentu', 'status-zakonczone'];
  const indeksy = kolejnosc.map((c) => cele.indexOf(c));
  sprawdzWarunek(
    `koniec drogi w kolejnosci: ${kolejnosc.join(' -> ')}`,
    indeksy.every((n, i) => n >= 0 && (i === 0 || n === indeksy[i - 1] + 1)),
  );
}

// 7. Kroki, ktorych cel pojawia sie dopiero po klikniecu, MUSZA umiec go otworzyc.
//    Inaczej „Dalej" przechodzi na krok bez czego pokazac i dymek laduje na srodku.
{
  const wystaw = TRASA_PIERWSZE_ZLECENIE[cele.indexOf('wystaw-dokumenty')];
  sprawdzWarunek('krok o wystawianiu dokumentu sam otwiera menu „Wystaw"',
    wystaw.dalejKlika === true && wystaw.dalejKlikaCel === 'dokumenty-zlecenia');

  const wiersz = TRASA_PIERWSZE_ZLECENIE[cele.indexOf('wiersz-zlecenia')];
  sprawdzWarunek('krok o wierszu zlecenia naciska CALY wiersz, nie przycisk w srodku',
    wiersz.dalejKlika === true && wiersz.dalejKlikaWprost === true);

  const zaznacz = TRASA_PIERWSZE_ZLECENIE[cele.indexOf('zaznacz-zlecenie')];
  sprawdzWarunek('krok o zaznaczeniu zlecenia zaznacza je za czlowieka',
    zaznacz.dalejKlika === true);
}

console.log(bledy ? `BLAD: ${bledy} przypadkow poszlo nie tam` : 'PRZEBIEG WPROWADZENIA POPRAWNY');
process.exit(bledy ? 1 : 0);

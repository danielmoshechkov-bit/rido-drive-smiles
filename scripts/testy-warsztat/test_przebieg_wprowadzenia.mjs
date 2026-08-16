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
import { wybierzKrok, nastepnyKrok } from '../../src/components/onboarding/wyborKroku.ts';
import { TRASA_PIERWSZE_ZLECENIE } from '../../src/components/onboarding/trasaPierwszeZlecenie.ts';

const cele = TRASA_PIERWSZE_ZLECENIE.map((k) => k.cel);
const tytul = (i) => TRASA_PIERWSZE_ZLECENIE[i]?.tytul ?? '(brak)';
const opcje = {
  przejdzGdyWypelnione: TRASA_PIERWSZE_ZLECENIE.map((k) => !!k.przejdzGdyWypelnione),
  pokazGdySieZjawi: TRASA_PIERWSZE_ZLECENIE.map((k) => !!k.pokazGdySieZjawi),
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

// ── EKRAN 5: klient zapisany, wracamy do okna pojazdu ───────────────────────
krok = wybierzKrok(cele, krok, oknoPojazdu, opcje);
sprawdz('powrót do pojazdu: numer i lupka', krok, 'pojazd-rejestracja');

// ── EKRAN 6: po lupce pojawia się podsumowanie pobranych danych ─────────────
const poLupce = [...oknoPojazdu, { cel: 'pobrane-dane', glebokosc: 2 }];
krok = wybierzKrok(cele, krok, poLupce, opcje);
sprawdz('po lupce: co przyszło z rejestru', krok, 'pobrane-dane');

// ── EKRAN 7: pojazd zapisany, znów samo okno zlecenia ───────────────────────
krok = wybierzKrok(cele, krok, oknoZlecenia, opcje);
sprawdz('powrót do zlecenia: dane klienta', krok, 'pole-klienta');
krok = nastepnyKrok(cele, krok, oknoZlecenia);
sprawdz('„Dalej": lista zadań do wykonania', krok, 'pole-opisu');
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
sprawdz('karta zlecenia: robocizna', krok, 'tabela-robocizny');
for (const [opis, oczek] of [
  ['Rido Wycena', 'rido-wycena'],
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

// ── EKRAN 11: okno SMS-a z kosztorysem ──────────────────────────────────────
const oknoSmsKosztorys = [...kartaWyceny.map((w) => ({ ...w })), { cel: 'sms-quote', glebokosc: 1 }];
krok = wybierzKrok(cele, krok, oknoSmsKosztorys, opcje);
sprawdz('po kliknięciu ikony: okno SMS-a z kosztorysem', krok, 'sms-quote');

// ── EKRAN 12: SMS wysłany, klient akceptuje → zielone, można naprawiać ──────
krok = wybierzKrok(cele, krok, kartaWyceny, opcje);
sprawdz('SMS wysłany: akceptacja i status', krok, 'status-zlecenia');
krok = nastepnyKrok(cele, krok, kartaWyceny);
sprawdz('„Dalej": auto gotowe do odbioru', krok, 'przycisk-odbior');

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
sprawdz('„Dalej": zamknięcie zlecenia statusem', krok, 'status-na-liscie');
krok = nastepnyKrok(cele, krok, panel);
sprawdz('„Dalej": zakładka Zakończone', krok, 'filtr-zakonczone');

const panelZZaznaczonym = [...panel, { cel: 'usun-zlecenie', glebokosc: 0 }];
krok = nastepnyKrok(cele, krok, panelZZaznaczonym);
sprawdz('„Dalej": usunięcie zlecenia próbnego', krok, 'usun-zlecenie');
sprawdzWarunek('to ostatni krok trasy', krok === cele.length - 1);

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

// 1. Na wierzchu okno, w którym wprowadzenie nie ma nic do pokazania
//    (podgląd wystawionego dokumentu). „Dalej" nie może iść w ciemno.
{
  const naDokumentach = cele.indexOf('wystaw-dokumenty');
  const poDalej = nastepnyKrok(cele, naDokumentach, []);
  sprawdzWarunek(`„Dalej" przy otwartym podglądzie zostaje na miejscu (${poDalej})`, poDalej === naDokumentach);
}

// 2. Wprowadzenie nie może samo przeskoczyć na koniec, gdy nic nie widać.
{
  const wynik = wybierzKrok(cele, 3, [], opcje);
  sprawdzWarunek(`pusty ekran nie przesuwa kroku (${wynik})`, wynik === 3);
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

console.log(bledy ? `BLAD: ${bledy} przypadkow poszlo nie tam` : 'PRZEBIEG WPROWADZENIA POPRAWNY');
process.exit(bledy ? 1 : 0);

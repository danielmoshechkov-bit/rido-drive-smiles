// PRZEJŚCIE WPROWADZENIA KROK PO KROKU — bez przeglądarki.
//
// Odtwarzamy dokładnie tę drogę, którą przechodzi warsztat: panel → okno
// zlecenia → okno pojazdu → okno klienta → powrót → zapis → karta wyceny.
// Na każdym ekranie mówimy, jakie cele są widoczne i w którym oknie, a potem
// sprawdzamy, czy wprowadzenie pokazuje krok z TEGO ekranu.
//
// To jest test, którego brakowało: błędy typu „dymek mówi o liście zadań,
// a na wierzchu stoi okno pojazdu" widać tu od razu, bez klikania.
import { wybierzKrok, nastepnyKrok } from '../../src/components/onboarding/wyborKroku.ts';
import { TRASA_PIERWSZE_ZLECENIE } from '../../src/components/onboarding/trasaPierwszeZlecenie.ts';

const cele = TRASA_PIERWSZE_ZLECENIE.map((k) => k.cel);
const tytul = (i) => TRASA_PIERWSZE_ZLECENIE[i]?.tytul ?? '(brak)';

let bledy = 0;
const sprawdz = (opis, wynikIndex, oczekiwanyCel) => {
  const ok = cele[wynikIndex] === oczekiwanyCel;
  console.log(`${ok ? ' OK  ' : 'BLAD '} ${opis} → „${tytul(wynikIndex)}" (${cele[wynikIndex]})${ok ? '' : ` — oczekiwano ${oczekiwanyCel}`}`);
  if (!ok) bledy++;
};

// ── EKRAN 1: lista zleceń, nic nie otwarte ──────────────────────────────────
let krok = 0;
const panel = [{ cel: 'nowe-zlecenie', glebokosc: 0 }, { cel: 'filtr-zakonczone', glebokosc: 0 }];
krok = wybierzKrok(cele, krok, panel);
sprawdz('panel: startujemy od „Nowe zlecenie"', krok, 'nowe-zlecenie');

// ── EKRAN 2: otwarte okno zlecenia ──────────────────────────────────────────
const oknoZlecenia = [
  ...panel,
  { cel: 'pole-rejestracji', glebokosc: 1 },
  { cel: 'pole-klienta', glebokosc: 1 },
  { cel: 'pole-opisu', glebokosc: 1 },
  { cel: 'zapisz-zlecenie', glebokosc: 1 },
];
krok = wybierzKrok(cele, krok, oknoZlecenia);
sprawdz('po otwarciu zlecenia: pole pojazdu', krok, 'pole-rejestracji');

// ── EKRAN 3: okno „Dodaj nowy pojazd" NA WIERZCHU ───────────────────────────
// Okno pojazdu otwiera sie NAD oknem zlecenia. Biblioteka ukrywa tlo przed
// czytnikami ekranu, wiec cele z okna pod spodem znikaja z listy widocznych —
// dokladnie tak, jak liczy to silnik.
const oknoPojazdu = [
  ...panel,
  { cel: 'pojazd-wlasciciel', glebokosc: 2 },
  { cel: 'pojazd-rejestracja', glebokosc: 2 },
];
krok = wybierzKrok(cele, krok, oknoPojazdu);
sprawdz('okno pojazdu: najpierw właściciel', krok, 'pojazd-wlasciciel');

// ── EKRAN 4: okno „Dodaj nowego klienta" NA WIERZCHU ────────────────────────
const oknoKlienta = [
  ...panel,
  { cel: 'klient-imie-nazwisko', glebokosc: 3 },
  { cel: 'klient-telefon', glebokosc: 3 },
];
krok = wybierzKrok(cele, krok, oknoKlienta);
sprawdz('okno klienta: imię i nazwisko', krok, 'klient-imie-nazwisko');
krok = nastepnyKrok(cele, krok, oknoKlienta);
sprawdz('„Dalej" w oknie klienta: telefon', krok, 'klient-telefon');

// ── EKRAN 5: klient zapisany, wracamy do okna pojazdu ───────────────────────
krok = wybierzKrok(cele, krok, oknoPojazdu);
sprawdz('powrót do pojazdu: numer i lupka', krok, 'pojazd-rejestracja');

// ── EKRAN 6: po lupce pojawia się podsumowanie pobranych danych ─────────────
const poLupce = [...panel, { cel: 'pojazd-wlasciciel', glebokosc: 2 }, { cel: 'pojazd-rejestracja', glebokosc: 2 }, { cel: 'pobrane-dane', glebokosc: 2 }];
krok = nastepnyKrok(cele, krok, poLupce);
sprawdz('po lupce: co przyszło z rejestru', krok, 'pobrane-dane');

// ── EKRAN 7: pojazd zapisany, znów samo okno zlecenia ───────────────────────
krok = wybierzKrok(cele, krok, oknoZlecenia);
sprawdz('powrót do zlecenia: dane klienta', krok, 'pole-klienta');
krok = nastepnyKrok(cele, krok, oknoZlecenia);
sprawdz('„Dalej": lista zadań', krok, 'pole-opisu');
krok = nastepnyKrok(cele, krok, oknoZlecenia);
sprawdz('„Dalej": zapis zlecenia', krok, 'zapisz-zlecenie');

// ── EKRAN 8: karta zlecenia (wycena) ────────────────────────────────────────
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
krok = wybierzKrok(cele, krok, kartaWyceny);
sprawdz('po zapisie: robocizna', krok, 'tabela-robocizny');
for (const [opis, oczek] of [
  ['Rido Wycena', 'rido-wycena'],
  ['części', 'tabela-czesci'],
  ['koszt', 'kolumna-koszt'],
  ['cena', 'kolumna-cena'],
  ['podsumowanie', 'podsumowanie-zlecenia'],
  ['SMS przyjęcia', 'przycisk-przyjecie'],
  ['kosztorys', 'przycisk-kosztorys'],
  ['odbiór', 'przycisk-odbior'],
  ['status', 'status-zlecenia'],
]) {
  krok = nastepnyKrok(cele, krok, kartaWyceny);
  sprawdz(`„Dalej": ${opis}`, krok, oczek);
}

// ── EKRAN 9: powrót na listę, zakładka Zakończone ───────────────────────────
krok = nastepnyKrok(cele, krok, panel);
sprawdz('na końcu: zakończone i usuwanie', krok, 'filtr-zakonczone');


// ── PRZYPADKI BRZEGOWE, KTÓRE WYSZŁY NA ŻYWO ────────────────────────────────
console.log('--- przypadki brzegowe ---');

// 1. Na wierzchu okno, w którym wprowadzenie nie ma nic do pokazania
//    (podgląd wystawionego dokumentu). „Dalej" nie może iść w ciemno.
const podgladDokumentu = [];
const naDokumentach = cele.indexOf('dokumenty-zlecenia');
const poDalej = nastepnyKrok(cele, naDokumentach, podgladDokumentu);
{
  const ok = poDalej === naDokumentach;
  console.log(`${ok ? ' OK  ' : 'BLAD '} „Dalej" przy otwartym podglądzie zostaje na miejscu (${poDalej})`);
  if (!ok) bledy++;
}

// 2. Zamknięcie podglądu wraca do listy — wprowadzenie ma tam swoje kroki.
{
  const wynik = wybierzKrok(cele, naDokumentach, panel);
  const ok = cele[wynik] === 'dokumenty-zlecenia' || cele[wynik] === 'filtr-zakonczone' || cele[wynik] === 'zaznacz-zlecenie';
  console.log(`${ok ? ' OK  ' : 'BLAD '} po zamknięciu podglądu wracamy na listę → ${cele[wynik]}`);
  if (!ok) bledy++;
}

// 3. Wprowadzenie nie może samo przeskoczyć na koniec, gdy nic nie widać.
{
  const wynik = wybierzKrok(cele, 3, []);
  const ok = wynik === 3;
  console.log(`${ok ? ' OK  ' : 'BLAD '} pusty ekran nie przesuwa kroku (${wynik})`);
  if (!ok) bledy++;
}

console.log(bledy ? `BLAD: ${bledy} przypadkow poszlo nie tam` : 'PRZEBIEG WPROWADZENIA POPRAWNY');
process.exit(bledy ? 1 : 0);

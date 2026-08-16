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
const oknoPojazdu = [
  ...oknoZlecenia,
  { cel: 'pojazd-wlasciciel', glebokosc: 2 },
  { cel: 'pojazd-rejestracja', glebokosc: 2 },
];
krok = wybierzKrok(cele, krok, oknoPojazdu);
sprawdz('okno pojazdu: najpierw właściciel', krok, 'pojazd-wlasciciel');

// ── EKRAN 4: okno „Dodaj nowego klienta" NA WIERZCHU ────────────────────────
const oknoKlienta = [
  ...oknoPojazdu,
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
const poLupce = [...oknoPojazdu, { cel: 'pobrane-dane', glebokosc: 2 }];
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

console.log(bledy ? `BLAD: ${bledy} krokow poszlo nie tam` : 'PRZEBIEG WPROWADZENIA POPRAWNY');
process.exit(bledy ? 1 : 0);

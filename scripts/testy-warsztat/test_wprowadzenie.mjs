// Wprowadzenie „pierwsze zlecenie": czy trasa jest kompletna i czy każdy krok
// ma na co pokazać. Krok bez znacznika w kodzie = przygaszony ekran bez celu.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { TRASA_PIERWSZE_ZLECENIE } from '../../src/components/onboarding/trasaPierwszeZlecenie.ts';

const pliki = (d) => readdirSync(d).flatMap((w) => {
  const s = join(d, w);
  return statSync(s).isDirectory() ? pliki(s) : (['.tsx', '.ts'].includes(extname(s)) ? [s] : []);
});
const kod = pliki('src').map((f) => readFileSync(f, 'utf8')).join('\n');

let bledy = 0;
const sprawdz = (opis, ok) => { console.log(`${ok ? ' OK  ' : 'BLAD '} ${opis}`); if (!ok) bledy++; };

// 1. Każdy krok z celem ma odpowiadający znacznik data-tour w kodzie.
for (const krok of TRASA_PIERWSZE_ZLECENIE) {
  if (!krok.cel) continue;
  sprawdz(`znacznik dla kroku „${krok.tytul}" (${krok.cel})`, kod.includes(`data-tour="${krok.cel}"`));
}

// 2. Trasa przechodzi CAŁĄ drogę, o którą chodziło.
const cele = TRASA_PIERWSZE_ZLECENIE.map((k) => k.cel);
for (const wymagany of ['nowe-zlecenie', 'pole-rejestracji', 'pole-klienta', 'pole-opisu',
                        'tabela-robocizny', 'rido-wycena', 'kolumna-koszt', 'kolumna-cena',
                        'podsumowanie-zlecenia', 'przycisk-przyjecie', 'przycisk-kosztorys',
                        'filtr-zakonczone']) {
  sprawdz(`trasa obejmuje: ${wymagany}`, cele.includes(wymagany));
}

// 3. Treści mówią o rzeczach, o które prosił warsztat.
const tresci = TRASA_PIERWSZE_ZLECENIE.map((k) => `${k.tytul} ${k.tresc} ${k.akcja || ''}`).join(' ').toLowerCase();
sprawdz('mowi, zeby wpisac SWOJ numer telefonu', tresci.includes('swój numer') || tresci.includes('siebie'));
sprawdz('tlumaczy koszt zakupu czesci', tresci.includes('zakupu'));
sprawdz('tlumaczy cene sprzedazy', tresci.includes('sprzedaży'));
sprawdz('pokazuje, ile sie zarabia', tresci.includes('zarabiasz'));
sprawdz('mowi o dokumentach po naprawie', tresci.includes('faktur'));
sprawdz('mowi, jak zakonczyc i usunac', tresci.includes('zakończone') && tresci.includes('usu'));

// 4. Dymek musi dać się kliknąć nad oknem modalnym i nie zasłaniać pola.
import { readFileSync as czytaj } from 'node:fs';
const silnik = czytaj('src/components/onboarding/GuidedTour.tsx', 'utf8');
sprawdz('dymek klikalny nad oknem modalnym', silnik.includes('pointer-events-auto'));
sprawdz('dymek staje z boku, nie na polu', silnik.includes('miejsceZPrawej'));

// 5. Instrukcja KSeF nie każe wysyłać próbnej faktury — jest przycisk sprawdzenia.
const kreator = czytaj('src/components/workshop/onboarding/WorkshopSetupWizard.tsx', 'utf8');
sprawdz('KSeF: sprawdzenie polaczenia zamiast wysylki testowej',
  kreator.includes('Testuj połączenie') && !kreator.includes('wyślij dowolny dokument'));

// 6. Wprowadzenie nie może utknąć na kroku „kliknij", gdy cel jest zasłonięty.
sprawdz('krok czekajacy przechodzi, gdy uzytkownik jest juz dalej', silnik.includes('celNastepnego'));
// 7. Podświetlenie obejmuje rozwinięte listy (są pozycjonowane bezwzględnie).
sprawdz('podswietlenie obejmuje rozwinieta liste', silnik.includes('el.querySelectorAll'));

// 8. Enter w polu pojazdu robi to samo, co przycisk dodania auta.
const okno = czytaj('src/components/workshop/WorkshopNewOrderDialog.tsx', 'utf8');
sprawdz('Enter zaklada auto, gdy nie ma go w kartotece', /e.key !== 'Enter'[\s\S]{0,900}setShowAddVehicle\(true\)/.test(okno));
sprawdz('podpowiedz przy braku wynikow', okno.includes('Tego auta nie ma jeszcze w kartotece'));

// 9. Kroki nie mogą przelatywać same, gdy cel bieżącego kroku wciąż jest widoczny.
sprawdz('auto-przejscie tylko gdy krok utknal', silnik.includes('if (celBiezacego) return;'));
// 10. Wprowadzenie prowadzi też przez okno nowego pojazdu (właściciel, lupka).
sprawdz('trasa obejmuje wlasciciela pojazdu', cele.includes('pojazd-wlasciciel'));
sprawdz('trasa obejmuje lupke przy rejestracji', cele.includes('pojazd-rejestracja'));
// 11. Darmowe sprawdzenie nie może być blokowane licznikiem kredytów w przeglądarce.
const oknoPojazdu = czytaj('src/components/workshop/WorkshopAddVehicleDialog.tsx', 'utf8');
sprawdz('licznik kredytow nie blokuje darmowego sprawdzenia', oknoPojazdu.includes('!trybProbny && (!credits'));
// 12. Nieudane zapisanie zlecenia musi być widoczne.
sprawdz('blad zapisu zlecenia widoczny', okno.includes('Nie udało się utworzyć zlecenia'));
sprawdz('walidacja mowi, czego brakuje', okno.includes('Nie mogę utworzyć zlecenia'));

console.log(bledy ? `BLAD: ${bledy} przypadkow` : 'WPROWADZENIE KOMPLETNE');
process.exit(bledy ? 1 : 0);

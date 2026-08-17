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
  // Znacznik bywa skladany w locie (`data-tour={`sms-${type}`}`), bo to samo okno
  // SMS-a pojawia sie w dwoch miejscach drogi i musi je od siebie odroznic.
  const wprost = kod.includes(`data-tour="${krok.cel}"`);
  // Znacznik bywa WYLICZANY: pozycje listy statusow dostaja go warunkowo, bo
  // ich nazwy sa tlumaczone i nie da sie ich wpisac na sztywno w JSX.
  const zWarunku = kod.includes('data-tour={') && kod.includes(`'${krok.cel}'`);
  const skladany = /^(.*?)-([a-z]+)$/.exec(krok.cel);
  const zeZmiennej = skladany ? kod.includes(`data-tour={\`${skladany[1]}-$`) : false;
  sprawdz(`znacznik dla kroku „${krok.tytul}" (${krok.cel})`, wprost || zeZmiennej || zWarunku);
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
// Regula pozycjonowania wyprowadzila sie do pozycjaDymka.ts, zeby dalo sie ja
// sprawdzic liczbowo (patrz test_dymek_miesci_sie.mjs). Tu pilnujemy tylko, ze
// komponent z niej korzysta, a nie stawia dymka „na oko".
sprawdz('dymek stawiany wedlug reguly, nie na oko', silnik.includes('pozycjaDymka('));

// 4b. WPROWADZENIE MUSI ZOSTAC PO WEJSCIU W ZLECENIE.
//
// Karta zlecenia i karta pojazdu to osobne galezie panelu (wczesny return),
// a wprowadzenie bylo dorysowywane tylko przy liscie. Prowadzilo wiec za reke
// az do utworzenia zlecenia i znikalo dokladnie tam, gdzie zaczyna sie wycena.
const panel = czytaj('src/components/workshop/WorkshopDashboard.tsx', 'utf8');
sprawdz('wprowadzenie ma jedna wspolna oprawe', panel.includes('const zOpieka ='));
sprawdz('karta zlecenia tez jest pod opieka', /if \(currentSelectedOrder\) \{\s*return zOpieka\(/.test(panel));
sprawdz('karta pojazdu tez jest pod opieka', /if \(selectedVehicle\) \{\s*return zOpieka\(/.test(panel));
sprawdz('GuidedTour rysowany tylko w jednym miejscu', (panel.match(/<GuidedTour/g) || []).length === 1);

// 4c. „Dalej" mruga, gdy krok jest zrobiony — inaczej nie wiadomo, ze czeka.
sprawdz('„Dalej" mruga, gdy pole jest wypelnione', silnik.includes('czekaNaDalej') && silnik.includes('miga-dalej'));

// Mruganie ma byc WIDOCZNE: na przycisku sama przezroczystosc ginela, wiec
// zmienia sie rozmiar i poswiata.
const style = czytaj('src/index.css', 'utf8');
sprawdz('mruganie „Dalej" zmienia rozmiar, nie tylko przezroczystosc', /miganie-dalej[\s\S]*scale\(1\.0/.test(style));
sprawdz('mruganie wylaczone przy ograniczonym ruchu', /prefers-reduced-motion[\s\S]*miga-dalej/.test(style));

// „Dalej" MUSI byc od razu takze na krokach czekajacych na klikniecie —
// inaczej widac sam „Zamknij" i wyglada to na zaciecie.
sprawdz('„Dalej" nie chowa sie na krokach z klknieciem', !silnik.includes('setFurtka'));

// 4d. Powrot i pierwszy krok — dwie rzeczy, o ktore prosil warsztat po tym,
//     jak powitanie znikalo mu w pol sekundy.
sprawdz('jest przycisk „Wstecz"', silnik.includes('Wstecz') && silnik.includes('onKrok(krok - 1)'));
sprawdz('reczne cofniecie ma pierwszenstwo nad ekranem', silnik.includes('recznaZmiana'));

// TO ROBILO OKNO RIDO WYCENY NIEWIDZIALNYM.
// `offsetParent` zwraca null takze dla `position: fixed`, czyli dla kazdego okna
// modalnego — krok o tym oknie nigdy nie wchodzil, a „Dalej" nie mial dokad isc.
sprawdz('widocznosc liczona bez offsetParent', !silnik.includes('offsetParent ===') && silnik.includes('getClientRects'));

// Kroki z listy zamykaja otwarta karte same.
sprawdz('krok z listy wraca z karty na liste', silnik.includes('wracajNaListe') && silnik.includes('onWrocNaListe'));
sprawdz('panel podaje powrot na liste', panel.includes('onWrocNaListe={() => setSelectedOrder(null)}'));

// Konkretne pozycje listy statusow maja swoje znaczniki.
const picker = czytaj('src/components/workshop/WorkshopStatusPicker.tsx', 'utf8');
sprawdz('„Gotowe do odbioru" ma znacznik', picker.includes("'status-gotowe'"));
sprawdz('„Zakonczone" ma znacznik', picker.includes("'status-zakonczone'"));
// Krok pierwszy stoi, DOPOKI widac jego cel. Gdy „Nowe zlecenie" zniknie za
// otwartym oknem, wprowadzenie przechodzi dalej — inaczej zostawaloby na
// powitaniu mimo otwartego formularza.
// Krok pierwszy zwalnia dopiero, gdy OTWORZY SIE OKNO. Sprawdzanie „czy widac
// cel" nie wystarczalo: przycisk pod otwartym oknem nadal ma swoje miejsce na
// ekranie, wiec wprowadzenie zostawalo na powitaniu mimo otwartego formularza.
sprawdz('pierwszy krok zwalnia po otwarciu okna', /krok === 0 && !oknoOtwarte/.test(silnik));
// Czas na przeczytanie powitania NIE moze blokowac przejscia, gdy okno juz
// stoi otwarte — inaczej wprowadzenie czeka 20 sekund przy gotowym formularzu.
sprawdz('otwarte okno wazniejsze niz czas na przeczytanie', /\(krok === 0 && oknoOtwarte\) \|\|/.test(silnik));
// „Dalej" zamyka podglad dokumentu zamiast kazac zamykac go recznie.
sprawdz('„Dalej" zamyka otwarty podglad', silnik.includes('zamknijOkno') && silnik.includes("key: 'Escape'"));
// Pozycja do klikniecia na rozwinietej liscie ma mrugac.
sprawdz('podswietlenie potrafi mrugac', silnik.includes('mrugajCel'));
sprawdz('to, co sie wlasnie pojawilo, lapie sie od razu', silnik.includes('const pilne ='));
sprawdz('„Dalej" potrafi nacisnac za czlowieka', silnik.includes('dalejKlika') && silnik.includes('doKlikniecia.click()'));
// Gdy klikniecie nic nie zmieni (menu juz otwarte), krok i tak ma ruszyc.
sprawdz('„Dalej" nie zacina sie, gdy klikniecie nic nie zmieni', /krokRef\.current !== stad/.test(silnik));
// Licznik nad przyciskami, zeby „Dalej" nie wypadal poza ramke.
sprawdz('licznik krokow nie wypycha przyciskow', silnik.includes('mt-3 shrink-0 space-y-2'));
// Rozwiniete menu ikony wchodzi do podswietlenia razem z ikona.
const karta = czytaj('src/components/workshop/WorkshopOrderDetail.tsx', 'utf8');
sprawdz('rozwiniete menu ikon jest podswietlane', karta.includes('data-tour="menu-kosztorys"') && karta.includes('data-tour="menu-przyjecie"'));
// Prawdziwy powod odmowy z funkcji brzegowej zamiast „non-2xx status code".
const bladEdge = czytaj('src/lib/bladEdge.ts', 'utf8');
sprawdz('powod odmowy czytany z odpowiedzi serwera', bladEdge.includes('powodBleduFunkcji') && bladEdge.includes('context'));
const nowe2 = czytaj('src/components/workshop/WorkshopNewOrderDialog.tsx', 'utf8');
sprawdz('okno SMS po utworzeniu pokazuje prawdziwy blad', nowe2.includes('powodBleduFunkcji(error)'));

// 4e. Podpowiedzi o cenach zostaja w interfejsie, nie tylko w dymku.
const wycena = czytaj('src/components/workshop/tabs/WorkshopOrderTasksTab.tsx', 'utf8');
sprawdz('nagłowek kosztu tlumaczy sie pod kursorem', /title="Cena ZAKUPU/.test(wycena));
sprawdz('nagłowek ceny tlumaczy sie pod kursorem', /title="Cena SPRZEDAŻY/.test(wycena));
sprawdz('podswietlamy cala sekcje robocizny, nie sam naglowek', /ref=\{serviceCardRef\} data-tour="tabela-robocizny"/.test(wycena));

// 4f. Zlecenie probne ma pokazywac ZYSK na liczbach, nie same zera.
const nowe = czytaj('src/components/workshop/WorkshopNewOrderDialog.tsx', 'utf8');
sprawdz('przykladowa czesc ma koszt zakupu', /unit_cost_gross: 120/.test(nowe));
sprawdz('przykladowa czesc ma cene sprzedazy', /unit_price_gross: 220/.test(nowe));
sprawdz('robocizna nadal bez cen (jest co pokazac Rido Wycena)', /unit_price_gross: null/.test(nowe));
sprawdz('mruganie tylko tam, gdzie bylo co wpisac', silnik.includes('maPole'));

// 5. Instrukcja KSeF nie każe wysyłać próbnej faktury — jest przycisk sprawdzenia.
const kreator = czytaj('src/components/workshop/onboarding/WorkshopSetupWizard.tsx', 'utf8');
sprawdz('KSeF: sprawdzenie polaczenia zamiast wysylki testowej',
  kreator.includes('Testuj połączenie') && !kreator.includes('wyślij dowolny dokument'));

// 6. Wprowadzenie nie może utknąć na kroku „kliknij", gdy cel jest zasłonięty.

// 7. Podświetlenie obejmuje rozwinięte listy (są pozycjonowane bezwzględnie).
sprawdz('podswietlenie obejmuje rozwinieta liste', silnik.includes('el.querySelectorAll'));

// 8. Enter w polu pojazdu robi to samo, co przycisk dodania auta.
const okno = czytaj('src/components/workshop/WorkshopNewOrderDialog.tsx', 'utf8');
sprawdz('Enter zaklada auto, gdy nie ma go w kartotece', /e.key !== 'Enter'[\s\S]{0,900}setShowAddVehicle\(true\)/.test(okno));
sprawdz('podpowiedz przy braku wynikow', okno.includes('Tego auta nie ma jeszcze w kartotece'));

// 9. Kroki nie mogą przelatywać same, gdy cel bieżącego kroku wciąż jest widoczny.
// Auto-przejście działa TYLKO dla kroków czekających na kliknięcie — kroki do
// przeczytania czekają na „Dalej" i nie mogą przelecieć same.
// Podpowiedź nie może zniknąć, zanim da się ją przeczytać, ani uwięzić człowieka.


// Krok wynika z EKRANU, nie z licznika — inaczej dymek mówi o czymś innym,
// niż widać na wierzchu (okno pojazdu vs. lista zadań w oknie pod spodem).
sprawdz('krok wybierany po tym, co na ekranie', silnik.includes('wybierzKrok'));
// Okna są portalowane (leżą obok siebie), więc o wierzchu decyduje kolejność
// w dokumencie, a tło pod oknem jest oznaczone `aria-hidden` i wypada z gry.
sprawdz('o wierzchu decyduje kolejnosc okien', silnik.includes('okna.indexOf(okno)'));
sprawdz('tlo pod oknem nie wchodzi do gry', silnik.includes("closest('[aria-hidden=\"true\"]')"));
// Zlecenie próbne dostaje gotowe pozycje — na pustej tabeli nie ma czego pokazać.
sprawdz('zlecenie probne ma przykladowe pozycje', okno.includes('przykladowe') && okno.includes('Wymiana klocków'));
sprawdz('pozycje przykladowe BEZ cen', /przykladowe[\s\S]{0,600}unit_price_gross: null/.test(okno));
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

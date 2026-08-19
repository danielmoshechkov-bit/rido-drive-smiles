/**
 * Na dokumencie: najpierw cala robocizna, potem czesci — jak w karcie zlecenia.
 *
 * Warsztat dopisuje pozycje na przemian (usluga, czesc do niej, kolejna usluga),
 * wiec kosztorys szedl pomieszany: „wymiana oleju, olej 5w30, wymiana szczek,
 * filtr oleju…". Klient porownuje kartke z ekranem warsztatu i musi widziec
 * ten sam porzadek.
 *
 * Uruchomienie: node --experimental-strip-types scripts/testy-warsztat/test_kolejnosc_pozycji.mjs
 */
import { robociznaPrzedCzesciami, toRobocizna } from '../../src/lib/kolejnoscPozycji.ts';

let bledy = 0;
const sprawdz = (w, opis) => { if (w) console.log('OK: ' + opis); else { console.error('BLAD: ' + opis); bledy++; } };

// Tak wyglada realne zlecenie: usluga, czesc do niej, usluga, czesc…
const zeZlecenia = [
  { name: 'wymiana oleju i filtrów', item_type: 'service' },
  { name: 'olej 5w30', item_type: 'part' },
  { name: 'wymiana szczęk tylnich', item_type: 'service' },
  { name: 'filtr oleju', item_type: 'part' },
  { name: 'wymiana łączników', item_type: 'task' },
  { name: 'szczęki hamulcowe', item_type: 'goods' },
  { name: 'utylizacja', item_type: 'other' },
];

const wynik = robociznaPrzedCzesciami(zeZlecenia).map((i) => i.name);

sprawdz(
  JSON.stringify(wynik) === JSON.stringify([
    'wymiana oleju i filtrów', 'wymiana szczęk tylnich', 'wymiana łączników',
    'olej 5w30', 'filtr oleju', 'szczęki hamulcowe', 'utylizacja',
  ]),
  'robocizna idzie przed czesciami, kolejnosc wewnatrz grup bez zmian',
);

sprawdz(toRobocizna({ item_type: 'service' }) && toRobocizna({ item_type: 'task' }), 'usluga i zadanie to robocizna');
sprawdz(!toRobocizna({ item_type: 'part' }) && !toRobocizna({ item_type: 'goods' })
  && !toRobocizna({ item_type: 'other' }) && !toRobocizna({}), 'czesc, towar, inne i pozycja bez rodzaju to nie robocizna');

// Pozycja bez rodzaju nie moze wyparowac — na kosztorysie musi byc wszystko.
const zBrakiem = robociznaPrzedCzesciami([{ name: 'a', item_type: 'service' }, { name: 'b' }]);
sprawdz(zBrakiem.length === 2, 'zadna pozycja nie ginie po drodze');

console.log(bledy ? `\n${bledy} BLEDOW` : '\nKOLEJNOSC POZYCJI: wszystko przeszlo');
process.exit(bledy ? 1 : 0);

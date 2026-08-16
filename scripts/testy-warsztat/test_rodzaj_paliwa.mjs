// RODZAJ PALIWA MUSI WPAŚĆ DO POLA WYBORU.
//
// Błąd z żywego przejścia: rejestr oddał paliwo jako „H", a lista wyboru ma
// polskie słowa („Hybryda"). Wpisywaliśmy wartość wprost, więc pole zostawało
// PUSTE — mimo że dane przyszły i było je widać w podsumowaniu. Warsztat musiał
// wybierać paliwo ręcznie przy każdym aucie.
import { naszRodzajPaliwa } from '../../src/lib/rodzajPaliwa.ts';

let bledy = 0;
const sprawdz = (wejscie, oczekiwane) => {
  const wynik = naszRodzajPaliwa(wejscie);
  const ok = wynik === oczekiwane;
  console.log(`${ok ? ' OK  ' : 'BLAD '} „${wejscie}" → ${wynik}${ok ? '' : ` (oczekiwano ${oczekiwane})`}`);
  if (!ok) bledy++;
};

// Kody jednoliterowe — to na nich się wywracało.
sprawdz('H', 'Hybryda');
sprawdz('D', 'Diesel');
sprawdz('P', 'Benzyna');
sprawdz('E', 'Elektryczny');

// Pełne nazwy: angielskie, polskie i te z rejestru.
sprawdz('PETROL', 'Benzyna');
sprawdz('Benzyna', 'Benzyna');
sprawdz('OLEJ NAPĘDOWY', 'Diesel');
sprawdz('Diesel', 'Diesel');
sprawdz('HYBRID', 'Hybryda');
sprawdz('hybryda', 'Hybryda');
sprawdz('ELECTRIC', 'Elektryczny');
sprawdz('ENERGIA ELEKTRYCZNA', 'Elektryczny');
sprawdz('LPG', 'LPG');
sprawdz('CNG', 'CNG');
sprawdz('HYDROGEN', 'Wodór');

// Czego nie rozumiemy, tego nie wstawiamy — lepiej puste pole niż wartość,
// której nie ma na liście (wtedy pole i tak wygląda na puste, tylko myli).
sprawdz('', null);
sprawdz('XYZ', null);
sprawdz(null, null);

console.log(bledy ? `BLAD: ${bledy} przypadkow` : 'RODZAJ PALIWA MAPUJE SIE POPRAWNIE');
process.exit(bledy ? 1 : 0);

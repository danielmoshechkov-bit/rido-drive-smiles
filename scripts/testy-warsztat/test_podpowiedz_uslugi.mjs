/**
 * Wybor podpowiedzi w kosztorysie musi wpisac NAZWE I CENE.
 *
 * Zgloszone dwa razy ze zrzutami. W kosztorysie ladowaly rzedy „wymiana"
 * z czerwonym „podaj cene", mimo ze za kazdym razem wybierana byla
 * „wymiana lacznikow i gum drazka" za 400 zl. Dwie osobne przyczyny:
 *
 *  1. handler nie podnosil `priceSet`, wiec pole ceny rysowalo sie puste
 *     (warunek `row.priceSet ? ... : ''`) i pozycja szla jako niewyceniona,
 *  2. po wyborze wolane bylo `addTaskRow()`, ktore zapisuje wiersze robocze
 *     z `taskRows` ZAMROZONEGO sprzed wyboru — do bazy szla stara, recznie
 *     wystukana nazwa i zadnej ceny.
 *
 * Test jest statyczny, bo obie rzeczy widac w kodzie i obie wracaly przy
 * kolejnych zmianach tego pliku.
 */
import { readFileSync } from 'node:fs';

const plik = readFileSync(
  new URL('../../src/components/workshop/tabs/WorkshopOrderTasksTab.tsx', import.meta.url),
  'utf8',
);

let bledy = 0;
const sprawdz = (opis, warunek, szczegol = '') => {
  if (warunek) console.log(` OK   ${opis}`);
  else { console.log(`BLAD  ${opis}${szczegol ? ' — ' + szczegol : ''}`); bledy++; }
};

// Cialo handlera: od `onSelectSuggestion=` do nastepnej wlasciwosci komponentu
// (`providerId=`). Oba miejsca zapisane sa inaczej — raz z klamra, raz bez —
// wiec nie da sie ich zlapac jednym wzorcem na tresc.
const handlery = [];
let od = plik.indexOf('onSelectSuggestion=');
while (od !== -1) {
  const koniec = plik.indexOf('providerId=', od);
  // Komentarze wycinamy: opisuja wlasnie to, czego w kodzie ma NIE byc,
  // wiec bez tego test lapalby wlasny opis przyczyny.
  const cialo = plik.slice(od, koniec === -1 ? od + 2000 : koniec)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  handlery.push(cialo);
  od = plik.indexOf('onSelectSuggestion=', od + 1);
}

sprawdz('sa dwa miejsca wyboru podpowiedzi (tabela i widok waski)',
  handlery.length === 2, `znaleziono ${handlery.length}`);

handlery.forEach((cialo, i) => {
  sprawdz(`handler ${i + 1}: wpisuje nazwe`, /\bname\b/.test(cialo));
  sprawdz(`handler ${i + 1}: wpisuje cene netto i brutto`,
    /price_net:\s*priceNet/.test(cialo) && /price_gross:\s*priceGross/.test(cialo));
  sprawdz(`handler ${i + 1}: podnosi znacznik "cena podana"`, /priceSet:/.test(cialo));
  sprawdz(`handler ${i + 1}: NIE wola addTaskRow (gubi wybor przez zamrozony stan)`,
    !/addTaskRow\s*\(/.test(cialo));
  sprawdz(`handler ${i + 1}: NIE zapisuje z opoznieniem`,
    !/setTimeout/.test(cialo));
});

console.log(bledy ? `\nBLAD: ${bledy} rzeczy nie gra` : '\nPODPOWIEDZ USLUGI DZIALA');
process.exit(bledy ? 1 : 0);

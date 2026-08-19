/**
 * Obie tabele kosztorysu — robocizna i czesci — musza konczyc sie tak samo.
 *
 * Zgloszone z testow 19.08.2026 ze zrzutami: robocizna wymagala 1180 px przy
 * 1040 px czesci. Przy tej samej szerokosci ekranu jechala w bok, kosz do
 * usuwania pozycji wypadal poza kadr, a kolumny RABAT i PO RABACIE nie staly
 * nad tymi samymi kolumnami w czesciach.
 *
 * Gwarancja, ktora tu pilnujemy: koncowka obu tabel (rabat, po rabacie, kosz)
 * ma identyczne szerokosci, a przed nia stoi DOKLADNIE JEDNA kolumna `auto`,
 * ktora bierze cala reszte. Przy rownej szerokosci obu tabel oznacza to, ze
 * koncowka zaczyna sie w obu w tym samym miejscu — kolumny stoja jedna pod
 * druga bez wzgledu na szerokosc okna.
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

// Wszystkie tabele z colgroup w tym pliku (widok szeroki: robocizna i czesci).
const tabele = [...plik.matchAll(/<table className="w-full min-w-\[(\d+)px\][\s\S]*?<colgroup>([\s\S]*?)<\/colgroup>/g)]
  .map(([, minW, blok]) => ({
    minW: Number(minW),
    kolumny: [...blok.matchAll(/width:\s*'([^']+)'/g)].map((m) => m[1]),
  }));

sprawdz('sa dwie tabele kosztorysu', tabele.length === 2, `znaleziono ${tabele.length}`);
if (tabele.length !== 2) { process.exit(1); }

const [robocizna, czesci] = tabele;

sprawdz('obie tabele maja te sama szerokosc minimalna',
  robocizna.minW === czesci.minW, `${robocizna.minW} vs ${czesci.minW}`);

for (const [nazwa, t] of [['robocizna', robocizna], ['czesci', czesci]]) {
  const ile = t.kolumny.filter((k) => k === 'auto').length;
  sprawdz(`${nazwa}: dokladnie jedna kolumna bierze reszte szerokosci`, ile === 1, `jest ${ile}`);
  sprawdz(`${nazwa}: zadnych szerokosci w procentach`,
    !t.kolumny.some((k) => k.endsWith('%')), t.kolumny.filter((k) => k.endsWith('%')).join(', '));
}

// Koncowka: rabat + po rabacie + kosz.
const konR = robocizna.kolumny.slice(-3).join(' ');
const konC = czesci.kolumny.slice(-3).join(' ');
sprawdz('koncowka obu tabel jest identyczna (rabat, po rabacie, kosz)',
  konR === konC, `robocizna [${konR}] vs czesci [${konC}]`);

// Kosz musi byc w kadrze: kolumna `auto` nie moze byc ostatnia.
for (const [nazwa, t] of [['robocizna', robocizna], ['czesci', czesci]]) {
  sprawdz(`${nazwa}: kolumna z koszem stoi na koncu, wiec nie ucieka poza kadr`,
    t.kolumny[t.kolumny.length - 1] !== 'auto');
}

console.log(bledy ? `\nBLAD: ${bledy} rzeczy nie gra` : '\nKOLUMNY KOSZTORYSU ZGODNE');
process.exit(bledy ? 1 : 0);

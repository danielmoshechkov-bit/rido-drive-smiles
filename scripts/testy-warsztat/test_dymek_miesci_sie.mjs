// DYMEK MA SIĘ MIEŚCIĆ, NIE ZASŁANIAĆ I NIE ZAMYKAĆ OKNA.
//
// Trzy błędy z żywego przejścia, każdy kosztował zaczęte zlecenie:
//
//  1. Przy długiej podpowiedzi dolna krawędź dymka wychodziła pod krawędź okna
//     i razem z nią znikał przycisk „Dalej".
//  2. Dymek lądował na polu, w które trzeba było pisać.
//  3. Kliknięcie w dymek albo w przyciemnienie Radix czytał jako „kliknięcie
//     obok okna" i ZAMYKAŁ okno zlecenia razem z wpisanymi danymi.
//
// Pierwsze dwa sprawdzamy na czystej funkcji pozycjonującej, trzeci — obecnością
// zabezpieczenia w komponencie (tego nie da się policzyć, ale da się upilnować,
// żeby ktoś go nie usunął).
import { readFileSync } from 'node:fs';
import { pozycjaDymka, zachodzenie } from '../../src/components/onboarding/pozycjaDymka.ts';

const zrodlo = readFileSync('src/components/onboarding/GuidedTour.tsx', 'utf8');

let bledy = 0;
const sprawdz = (opis, ok) => { console.log(`${ok ? ' OK  ' : 'BLAD '} ${opis}`); if (!ok) bledy++; };

// ── 1. Zabezpieczenia, które muszą zostać w komponencie ─────────────────────
sprawdz('kliknięcie w dymek nie zamyka okna', /nieZamykajOkna/.test(zrodlo) && /stopPropagation/.test(zrodlo));
sprawdz('przyciemnienie też nie zamyka okna', (zrodlo.match(/\{\.\.\.nieZamykajOkna\}/g) || []).length >= 5);
sprawdz('kółkiem myszy da się przewinąć okno', /onWheel=\{przewinPodSpodem\}/.test(zrodlo));
sprawdz('dymek jest mierzony po wyrenderowaniu', zrodlo.includes('setWysokoscDymka'));
sprawdz('treść przewija się, gdy jest długa', zrodlo.includes('overflow-y-auto'));
sprawdz('pasek z przyciskami nie kurczy się', /mt-3 shrink-0/.test(zrodlo));
sprawdz('dymek ma górny limit wysokości', zrodlo.includes('max-h-[80vh]'));
sprawdz('numer telefonu czeka na komplet cyfr', /length < 9/.test(zrodlo));
sprawdz('ramka czeka, aż człowiek przestanie pisać', /1500/.test(zrodlo));

// ── 2. Sama reguła pozycjonowania ───────────────────────────────────────────
const SZEROKOSC = 320;

const przypadki = [
  { opis: 'długa podpowiedź, cel nisko', obszar: { top: 590, bottom: 720, left: 520, right: 1490 }, wysokosc: 420, ekranW: 1728, ekranH: 900 },
  { opis: 'lista zadań na całą szerokość okna', obszar: { top: 600, bottom: 730, left: 515, right: 1490 }, wysokosc: 600, ekranW: 2000, ekranH: 1000 },
  { opis: 'bardzo długa podpowiedź na niskim ekranie', obszar: { top: 300, bottom: 380, left: 100, right: 900 }, wysokosc: 640, ekranW: 1000, ekranH: 700 },
  { opis: 'cel przy samej górze', obszar: { top: 10, bottom: 60, left: 200, right: 1500 }, wysokosc: 300, ekranW: 1600, ekranH: 900 },
  { opis: 'cel przy samym dole', obszar: { top: 840, bottom: 890, left: 200, right: 1500 }, wysokosc: 300, ekranW: 1600, ekranH: 900 },
  { opis: 'jest miejsce z prawej', obszar: { top: 400, bottom: 460, left: 100, right: 600 }, wysokosc: 500, ekranW: 1600, ekranH: 900 },
  { opis: 'wąskie okno telefonu', obszar: { top: 200, bottom: 260, left: 12, right: 380 }, wysokosc: 380, ekranW: 400, ekranH: 800 },
];

for (const p of przypadki) {
  const { top, left, strona } = pozycjaDymka({ ...p, szerokosc: SZEROKOSC });
  const dol = top + p.wysokosc;
  const mieciSie = top >= 12 && (dol <= p.ekranH || p.wysokosc + 24 > p.ekranH);
  sprawdz(`${p.opis}: mieści się w pionie (dół ${Math.round(dol)} z ${p.ekranH}, ${strona})`, mieciSie);

  const dymek = { top, bottom: dol, left, right: left + SZEROKOSC };
  const polePodswietlone = (p.obszar.right - p.obszar.left) * (p.obszar.bottom - p.obszar.top);
  const zasloniete = zachodzenie(dymek, p.obszar);
  // Na ciasnym ekranie pełne ominięcie bywa niemożliwe — pilnujemy, żeby dymek
  // nie zabierał więcej niż połowy podświetlenia.
  sprawdz(`${p.opis}: nie zasłania celu (${Math.round((zasloniete / polePodswietlone) * 100)}%)`, zasloniete <= polePodswietlone / 2);
}

// ── 3. Dymek wyższy niż całe okno: zaczyna się u góry, resztę przewija w środku.
{
  const { top } = pozycjaDymka({ obszar: { top: 300, bottom: 360, left: 100, right: 900 }, szerokosc: SZEROKOSC, wysokosc: 1200, ekranW: 1000, ekranH: 600 });
  sprawdz(`dymek wyższy niż okno zaczyna się u góry (${top})`, top === 12);
}

// ── 4. WIELKI CEL: uciec się nie da, więc zasłaniamy to, co najmniej boli ───
//
// Tabela robocizny zajmuje prawie cały ekran. Każde ustawienie dymka coś
// przykryje — liczy się CO. Nazwy pozycji stoją po lewej i u góry, kwoty i
// dalsze wiersze po prawej i niżej. Dymek ma iść tam, gdzie nie ma nazw.
{
  const obszar = { top: 90, bottom: 940, left: 240, right: 1900 };
  const wysokosc = 480;
  const { top, left } = pozycjaDymka({ obszar, szerokosc: SZEROKOSC, wysokosc, ekranW: 2000, ekranH: 1000 });
  const dymek = { top, bottom: top + wysokosc, left, right: left + SZEROKOSC };
  const strefaCzytania = {
    top: obszar.top,
    bottom: obszar.top + (obszar.bottom - obszar.top) * 0.6,
    left: obszar.left,
    right: obszar.left + (obszar.right - obszar.left) * 0.55,
  };
  const polePasa = (strefaCzytania.right - strefaCzytania.left) * (strefaCzytania.bottom - strefaCzytania.top);
  const zasloniete = zachodzenie(dymek, strefaCzytania);
  sprawdz(
    `wielki cel: dymek nie siada na nazwach pozycji (${Math.round((zasloniete / polePasa) * 100)}% pasa czytania)`,
    zasloniete === 0,
  );
  sprawdz(`wielki cel: dymek nadal mieści się w oknie (dół ${top + wysokosc} z 1000)`, top + wysokosc <= 1000 && top >= 12);
}

// ── 5. Zabezpieczenia silnika, ktore musza zostac ───────────────────────────
sprawdz('klikniecie w to, o czym mowi krok, przesuwa wprowadzenie dalej', /const naszKlik = useRef\(false\)/.test(zrodlo) && /zrobiony = i/.test(zrodlo));
sprawdz('nasze wlasne klikniecie nie liczy sie podwojnie', /if \(naszKlik\.current\) \{ naszKlik\.current = false; return; \}/.test(zrodlo));
sprawdz('rada „gdzie tego szukac" rozroznia liste od karty zlecenia', /w karcie zlecenia/.test(zrodlo) && /na liscie zlecen|na li\u015bcie zlece\u0144/.test(zrodlo));

console.log(bledy ? `BLAD: ${bledy} przypadkow` : 'DYMEK ZACHOWUJE SIE POPRAWNIE');
process.exit(bledy ? 1 : 0);

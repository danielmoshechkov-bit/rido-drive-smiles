// DYMEK MUSI MIEŚCIĆ SIĘ W EKRANIE.
//
// Błąd z żywego przejścia: przy długiej podpowiedzi (lista zadań) dymek wychodził
// dołem poza okno przeglądarki i razem z nim znikał przycisk „Dalej". Nie dało się
// przejść dalej ani domknąć kroku — trzeba było zamknąć całe wprowadzenie, a
// zaczęte zlecenie przepadało.
//
// Test sprawdza samą regułę pozycjonowania (bez przeglądarki): dla różnych
// wysokości dymka, rozmiarów okna i położeń podświetlenia dymek ma się mieścić
// w pionie, a jego dolna krawędź — czyli pasek z „Dalej" — pozostać widoczna.
import { readFileSync } from 'node:fs';

const zrodlo = readFileSync('src/components/onboarding/GuidedTour.tsx', 'utf8');

let bledy = 0;
const sprawdz = (opis, ok) => { console.log(`${ok ? ' OK  ' : 'BLAD '} ${opis}`); if (!ok) bledy++; };

// 1. Reguła musi w ogóle istnieć w kodzie — pozycja liczona z ZMIERZONEJ
//    wysokości dymka, nie ze stałej „mniej więcej 240 pikseli".
sprawdz('dymek jest mierzony po wyrenderowaniu', zrodlo.includes('setWysokoscDymka'));
sprawdz('pozycja jest przycinana do ekranu', /const przytnij = /.test(zrodlo));
sprawdz('treść przewija się, gdy jest długa', zrodlo.includes('overflow-y-auto'));
sprawdz('pasek z przyciskami nie kurczy się', /mt-3 shrink-0/.test(zrodlo));
sprawdz('dymek ma górny limit wysokości', zrodlo.includes('max-h-[80vh]'));

// 2. Sama arytmetyka przycinania — odtworzona 1:1 z komponentu.
const ODSTEP = 8;
const SZEROKOSC = 320;

function pozycjaDymka({ obszar, wysokosc, ekranW, ekranH }) {
  const dolnaGranica = Math.max(12, ekranH - wysokosc - 12);
  const przytnij = (y) => Math.min(Math.max(12, y), dolnaGranica);
  const miejsceZPrawej = ekranW - obszar.right;
  const miejsceZLewej = obszar.left;
  const gora = przytnij(obszar.top - 20);
  if (miejsceZPrawej > SZEROKOSC + 24) return { top: gora, left: obszar.right + 16 };
  if (miejsceZLewej > SZEROKOSC + 24) return { top: gora, left: obszar.left - SZEROKOSC - 16 };
  const podSpodem = obszar.bottom + wysokosc + 24 < ekranH;
  return {
    top: przytnij(podSpodem ? obszar.bottom + ODSTEP + 6 : obszar.top - wysokosc - ODSTEP - 6),
    left: Math.min(Math.max(12, obszar.left), ekranW - SZEROKOSC - 12),
  };
}

// Przypadki wzięte z tego, co realnie się zdarza: wąskie okno bez miejsca po
// bokach, bardzo długa podpowiedź, cel przy samym dole i przy samej górze.
const przypadki = [
  { opis: 'długa podpowiedź, cel nisko (to był ten błąd)', obszar: { top: 590, bottom: 720, left: 520, right: 1490 }, wysokosc: 420, ekranW: 1728, ekranH: 900 },
  { opis: 'bardzo długa podpowiedź na niskim ekranie', obszar: { top: 300, bottom: 380, left: 100, right: 900 }, wysokosc: 640, ekranW: 1000, ekranH: 700 },
  { opis: 'cel przy samej górze', obszar: { top: 10, bottom: 60, left: 200, right: 1500 }, wysokosc: 300, ekranW: 1600, ekranH: 900 },
  { opis: 'cel przy samym dole', obszar: { top: 840, bottom: 890, left: 200, right: 1500 }, wysokosc: 300, ekranW: 1600, ekranH: 900 },
  { opis: 'jest miejsce z prawej', obszar: { top: 400, bottom: 460, left: 100, right: 600 }, wysokosc: 500, ekranW: 1600, ekranH: 900 },
  { opis: 'wąskie okno telefonu', obszar: { top: 200, bottom: 260, left: 12, right: 380 }, wysokosc: 380, ekranW: 400, ekranH: 800 },
];

for (const p of przypadki) {
  const { top } = pozycjaDymka(p);
  const dol = top + p.wysokosc;
  const mieciSie = top >= 12 && (dol <= p.ekranH || p.wysokosc + 24 > p.ekranH);
  sprawdz(`${p.opis}: dół dymka na ${Math.round(dol)} z ${p.ekranH}`, mieciSie);
}

// 3. Dymek wyższy niż całe okno: wtedy nie da się go zmieścić w całości, ale
//    MUSI zaczynać się od góry ekranu — resztę przewija się w środku.
{
  const { top } = pozycjaDymka({ obszar: { top: 300, bottom: 360, left: 100, right: 900 }, wysokosc: 1200, ekranW: 1000, ekranH: 600 });
  sprawdz(`dymek wyższy niż okno zaczyna się u góry (${top})`, top === 12);
}

console.log(bledy ? `BLAD: ${bledy} przypadkow` : 'DYMEK MIESCI SIE W EKRANIE');
process.exit(bledy ? 1 : 0);

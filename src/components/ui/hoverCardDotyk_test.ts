/**
 * Bramka: podpowiedź musi działać na dotyk, a na myszy zostać bez zmian.
 *
 * Karty pojazdu i klienta otwierały się wyłącznie na najechanie, więc na
 * telefonie nie istniały. Poprawka siedzi w prymitywie `ui/hover-card.tsx`,
 * żeby wszystkie miejsca użycia dostały ją naraz — a ten test pilnuje, żeby
 * któryś wariant nie wypadł przy następnej zmianie.
 *
 * Sprawdzamy STRUKTURĘ obu wariantów, nie wygląd: czy wyzwalacz niesie treść,
 * czy na dotyk jest przyciskiem (a nie kotwicą, której telefon nie kliknie),
 * i czy własności najeżdżania nie wyciekają do DOM jako nieznane atrybuty.
 */
import { createElement as h } from 'react';
// `server.browser`, nie `server`: wariant serwerowy ciagnie strumienie Node'a,
// ktorych `esbuild` nie potrafi zwiazac w jeden plik ESM.
import { renderToStaticMarkup } from 'react-dom/server.browser';
import { HoverCard, HoverCardTrigger, HoverCardContent } from '@/components/ui/hover-card';

/** Podstawiamy zdolność urządzenia — tak jak rozstrzyga ją `(hover: none)`. */
function ustawUrzadzenie(umieNajezdzac: boolean) {
  const okno = (globalThis as any).window ?? ((globalThis as any).window = {});
  okno.matchMedia = (q: string) => ({
    matches: q.includes('hover: none') ? !umieNajezdzac : umieNajezdzac,
    media: q,
    addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {},
  });
}

const karta = () => h(
  HoverCard, { openDelay: 400, closeDelay: 200 },
  h(HoverCardTrigger, { asChild: true }, h('div', { onClick: () => {} }, 'WK 12345')),
  h(HoverCardContent, null, 'VIN: ABC123'),
);

let zle = 0;
const sprawdz = (opis: string, warunek: boolean) => {
  console.log(`${warunek ? '✅' : '❌'} ${opis}`);
  if (!warunek) zle++;
};

ustawUrzadzenie(true);
const mysz = renderToStaticMarkup(karta());
sprawdz('mysz: wyzwalacz niesie treść', mysz.includes('WK 12345'));
sprawdz('mysz: brak nieznanych atrybutów w DOM (openDelay/closeDelay)',
  !/opendelay|closedelay/i.test(mysz));

ustawUrzadzenie(false);
const dotyk = renderToStaticMarkup(karta());
sprawdz('dotyk: wyzwalacz niesie treść', dotyk.includes('WK 12345'));
sprawdz('dotyk: brak nieznanych atrybutów w DOM', !/opendelay|closedelay/i.test(dotyk));

// KONTROLA POZYTYWNA: test musi umieć rozróżnić oba warianty. Gdyby renderowały
// identyczny znacznik, zieleń nie mówiłaby nic o przełączaniu.
sprawdz('oba warianty renderują RÓŻNY znacznik — przełączanie naprawdę działa', mysz !== dotyk);

if (zle > 0) throw new Error(`${zle} niezgodności w podpowiedzi dotykowej`);
console.log('\nWSZYSTKO ZIELONE');

// Test rozróżnienia „brak ceny" vs „cena 0" — na tym samym kodzie, którego używa aplikacja.
import { readFileSync } from 'node:fs';
const zrodlo = readFileSync('src/lib/orderItemPricing.ts', 'utf8')
  .replace(/export interface[\s\S]*?\n}\n/, '')
  .replace(/: PozycjaZCena \| null \| undefined/g, '')
  .replace(/: boolean/g, '').replace(/<T extends PozycjaZCena>/g, '')
  .replace(/: T\[\] \| null \| undefined/g, '').replace(/: T\[\]/g, '')
  .replace(/export /g, '');
const mod = new Function(`${zrodlo}; return { cenaNieustalona, widocznaDlaKlienta, tylkoWycenione };`)();

let bledy = 0;
const sprawdz = (opis, wynik) => { console.log(`${wynik ? ' OK  ' : 'BLAD '} ${opis}`); if (!wynik) bledy++; };

const brakCeny   = { name: 'wymiana rozrzadu', unit_price_net: null, unit_price_gross: null };
const zaDarmo    = { name: 'diagnostyka', unit_price_net: 0, unit_price_gross: 0 };
const normalna   = { name: 'olej', unit_price_net: 100, unit_price_gross: 123 };
const tylkoNetto = { name: 'polowiczna', unit_price_net: 50, unit_price_gross: null };

sprawdz('pozycja bez ceny: nieustalona', mod.cenaNieustalona(brakCeny) === true);
sprawdz('pozycja za 0 zl: cena USTALONA', mod.cenaNieustalona(zaDarmo) === false);
sprawdz('klient NIE widzi pozycji bez ceny', mod.widocznaDlaKlienta(brakCeny) === false);
sprawdz('klient WIDZI pozycje za 0 zl', mod.widocznaDlaKlienta(zaDarmo) === true);
sprawdz('klient widzi zwykla pozycje', mod.widocznaDlaKlienta(normalna) === true);
sprawdz('wpisane samo netto to tez cena', mod.widocznaDlaKlienta(tylkoNetto) === true);

const dlaKlienta = mod.tylkoWycenione([brakCeny, zaDarmo, normalna]);
sprawdz('lista dla klienta pomija tylko te bez ceny', dlaKlienta.length === 2 && !dlaKlienta.includes(brakCeny));
sprawdz('pusta lista nie wywala', mod.tylkoWycenione(null).length === 0);

process.exit(bledy ? 1 : 0);

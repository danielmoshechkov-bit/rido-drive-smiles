/**
 * SCIEZKA ZAKUPU PAKIETU AGENT — straznik trzech bledow z 13.09.2026.
 *
 * Objaw zgloszony przez uzytkownika: klikniecie pakietu nie prowadzilo do
 * platnosci, pokazywalo obcy naglowek „Na jak dlugo" i zawieszalo sie na
 * ekranie „Przetwarzamy platnosc".
 *
 * Trzy przyczyny, wszystkie tutaj upilnowane.
 *
 * Uruchomienie: node scripts/test-zakup-agenta.mjs
 */
import { readFileSync } from 'node:fs';

let bledy = 0;
const sprawdz = (w, opis) => { if (w) console.log('OK: ' + opis); else { console.error('BLAD: ' + opis); bledy++; } };
const plik = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const okno = plik('src/components/billing/OknoZakupu.tsx');
const oferta = plik('src/components/ai-sales/OfertaAgenta.tsx');
const cennik = plik('src/hooks/usePublicPricing.ts');

// 1. Okno znalo tylko linie „warsztat" — dla agenta `wybranyPlan` byl undefined
//    i caly krok „okres" renderowal sie pusty.
sprawdz(/plans\.find\(\(p\) => p\.code === plan\)/.test(okno),
  'znany plan szukany jest we WSZYSTKICH liniach, nie tylko w warsztatowej');
sprawdz(!/const wybranyPlan[^=]*= doKupienia\.find/.test(okno),
  'stare szukanie wylacznie w liscie warsztatowej nie wrocilo');

// 2. Pytanie o okres przy produkcie, ktory ma tylko cene miesieczna.
sprawdz(/ma_cene_roczna/.test(cennik), 'cennik mowi, czy plan da sie kupic na rok');
sprawdz(/rocznyMozliwy/.test(okno) && /rocznyMozliwy \? 'okres' : 'dane'/.test(okno),
  'plan bez ceny rocznej pomija krok „na jak dlugo"');
sprawdz(/zadanie\.okres \?\? \(rocznyMozliwy \? 'rok' : 'miesiac'\)/.test(okno),
  'domyslny okres to miesiac, gdy rocznego nie ma — inaczej serwer szukalby ceny, ktorej nie ma');

// 3. Stan przejsciowy zapalal sie przy KLIKNIECIU, zanim cokolwiek poszlo
//    do operatora.
sprawdz(/const kup = \(p: PublicPlan\) => klik\(p\);/.test(oferta),
  'klikniecie pakietu tylko otwiera zakup — nie wlacza poczekalni');
sprawdz(!/setOczekuje\(true\); klik/.test(oferta),
  'stary wyzwalacz poczekalni przy klikniecu nie wrocil');
const poPowrocie = oferta.slice(oferta.indexOf("platnosc"));
sprawdz(/zapamietajZakup\(\)/.test(poPowrocie),
  'poczekalnia ma jeden wyzwalacz: powrot z bramki platnosci');

console.log(bledy ? `\n${bledy} BLEDOW` : '\nSCIEZKA ZAKUPU: wszystko przeszlo');
process.exit(bledy ? 1 : 0);

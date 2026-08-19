/**
 * Straznik bledu React #31 — „Ten widok sie nie wczytal".
 *
 * 19.08.2026 produkcja wywalala sie losowo na roznych kontach i na stronach,
 * ktore z pojazdami nie maja nic wspolnego (np. /uslugi/panel). Powod: dwa haki
 * pisaly pod TEN SAM klucz React Query rozne KSZTALTY danych — jeden liczbe,
 * drugi obiekt { remaining_credits, bez_limitu }. Wygrywal ten, kto zapytal
 * pierwszy, a pasek licznikow probowal wyrysowac obiekt jako tekst.
 *
 * Ten test pilnuje, zeby pod `kluczJednostki(...)` byl DOKLADNIE JEDEN pisarz.
 * Uruchomienie: node scripts/testy-warsztat/test_licznik_jednostek.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const KORZEN = new URL('../../src/', import.meta.url).pathname;
let bledy = 0;
const zle = (m) => { console.error('BLAD: ' + m); bledy++; };

function pliki(katalog) {
  const wynik = [];
  for (const wpis of readdirSync(katalog)) {
    const sciezka = join(katalog, wpis);
    if (statSync(sciezka).isDirectory()) wynik.push(...pliki(sciezka));
    else if (/\.tsx?$/.test(wpis)) wynik.push(sciezka);
  }
  return wynik;
}

const wszystkie = pliki(KORZEN);

// 1. Kto uzywa kluczJednostki jako queryKey w useQuery?
const pisarze = [];
for (const p of wszystkie) {
  const tresc = readFileSync(p, 'utf8');
  if (!tresc.includes('kluczJednostki')) continue;
  // queryKey: kluczJednostki(...) wewnatrz useQuery — invalidateQueries nie liczy sie,
  // bo tylko uniewaznia wpis, a nie ustala jego ksztaltu.
  const uzycia = tresc.split('useQuery({').slice(1);
  for (const blok of uzycia) {
    const glowa = blok.slice(0, 400);
    if (/queryKey:\s*kluczJednostki\(/.test(glowa)) pisarze.push(p.replace(KORZEN, 'src/'));
  }
}

if (pisarze.length !== 1) {
  zle(`pod kluczJednostki() pisze ${pisarze.length} miejsc: ${pisarze.join(', ')} — musi byc dokladnie jedno (hooks/useDostepneJednostki.ts)`);
} else if (!pisarze[0].endsWith('hooks/useDostepneJednostki.ts')) {
  zle(`jedyny pisarz to ${pisarze[0]}, a powinien nim byc hooks/useDostepneJednostki.ts`);
} else {
  console.log('OK: jeden pisarz pod kluczJednostki() —', pisarze[0]);
}

// 2. Licznik nie moze wypuscic obiektu — pasek rysuje te wartosc wprost.
const hak = readFileSync(join(KORZEN, 'hooks/useDostepneJednostki.ts'), 'utf8');
if (!/typeof data === 'number' \|\| data === null/.test(hak)) {
  zle('useDostepneJednostki nie sprawdza typu przed zwroceniem — obiekt pod tym kluczem znow wywali widok');
} else {
  console.log('OK: licznik zwraca wylacznie liczbe albo null');
}

// 3. „Bez limitu" nie moze zamieniac sie w zero (pasek pokazuje wtedy 0 zamiast ∞).
if (/dostepne: data \?\? 0/.test(hak)) {
  zle('useDostepneJednostki robi `data ?? 0` — plan bez limitu (null) pokaze sie jako 0');
} else {
  console.log('OK: plan bez limitu nie zamienia sie w zero');
}

console.log(bledy ? `\n${bledy} BLEDOW` : '\nLICZNIK JEDNOSTEK: wszystko przeszlo');
process.exit(bledy ? 1 : 0);

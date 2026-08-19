/**
 * Kosztorys naprawy to DOKUMENT, a nie zrzut strony klienta.
 *
 * Do 19.08.2026 „Podglad / Drukuj / Pobierz" przy kosztorysie otwieralo
 * /warsztat/klient/<kod> — strone, ktora klient dostaje SMS-em, z zakladkami
 * i banerem „Podglad menedzera". Na drukarce wychodzily z tego trzy strony
 * zrzutu ekranu zamiast kartki do teczki.
 *
 * Uruchomienie: node scripts/testy-warsztat/test_kosztorys_dokument.mjs
 */
import { readFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Generator ma importy bez rozszerzen (styl Vite), wiec Node sam go nie wczyta.
// Sklejamy go esbuildem — tym samym, ktorego uzywa build.
const katalog = mkdtempSync(join(tmpdir(), 'kosztorys-'));
const paczka = join(katalog, 'generator.mjs');
execFileSync('npx', ['esbuild',
  new URL('../../src/utils/invoiceHtmlGenerator.ts', import.meta.url).pathname,
  '--bundle', '--format=esm', '--platform=neutral', '--outfile=' + paczka,
], { stdio: 'pipe' });
const { generateInvoiceHtml } = await import(paczka);

let bledy = 0;
const sprawdz = (warunek, opis) => {
  if (warunek) console.log('OK: ' + opis);
  else { console.error('BLAD: ' + opis); bledy++; }
};

const pozycja = (name, net, gross) => ({
  name, quantity: 1, unit: 'usł.', unit_net_price: net, vat_rate: '23',
  net_amount: net, vat_amount: gross - net, gross_amount: gross,
});

const bazowy = {
  invoice_number: 'KOS/ZL-08/2026-029',
  issue_place: 'Warszawa',
  issue_date: '2026-08-19', sale_date: '2026-08-19', due_date: '2026-08-19',
  payment_method: 'cash', currency: 'PLN',
  items: [
    pozycja('wymiana oleju i filtrów', 162.6, 200),
    pozycja('wymiana szczęk tylnich', 243.9, 300),
  ],
  seller: { name: 'CART78GARAGE sp. z o.o.', nip: '1234567890' },
  buyer: { name: 'Jan Nowak' },
};

const kosztorys = generateInvoiceHtml({ ...bazowy, type: 'repair_estimate' });
const potwierdzenie = generateInvoiceHtml({
  ...bazowy, type: 'service_confirmation', invoice_number: 'PWU/ZL-08/2026-029',
});

sprawdz(/inv-title-main">KOSZTORYS NAPRAWY</.test(kosztorys), 'tytul „KOSZTORYS NAPRAWY" w jednej linii');
sprawdz(/inv-title-num">KOS\/ZL-08\/2026-029</.test(kosztorys), 'numer w osobnej linii pod tytulem');
sprawdz(kosztorys.includes('Warszawa, 19.08.2026'), 'u gory miejscowosc warsztatu i data');
sprawdz(kosztorys.includes('KOS/ZL-08/2026-029'), 'numer dokumentu jest na kartce');
for (const p of bazowy.items) {
  sprawdz(kosztorys.includes(p.name), `pozycja „${p.name}" jest wypisana`);
}
sprawdz(kosztorys.includes('CART78GARAGE'), 'naglowek ma dane warsztatu');
sprawdz(kosztorys.includes('Jan Nowak'), 'dokument ma dane klienta');
sprawdz(kosztorys.includes('SZACOWANY KOSZT'), 'pasek kwoty mowi o szacunku, nie o „do zaplaty"');
sprawdz(!kosztorys.includes('Termin płatności'), 'wycena nie udaje faktury terminem platnosci');
sprawdz(kosztorys.includes('Akceptacja klienta'), 'jest miejsce na zgode klienta na naprawe');
sprawdz(/nie jest fakturą/.test(kosztorys), 'stopka zastrzega, ze to nie faktura');
sprawdz(!kosztorys.includes('Podgląd menedżera'), 'to NIE jest podglad strony klienta');

// Ten sam dokument — rozni sie wylacznie tytulem, numerem, stopka i podpisami.
const bezRoznic = (html) => html
  .replace(/KOSZTORYS NAPRAWY|POTWIERDZENIE WYKONANIA USŁUGI/g, 'TYTUL')
  .replace(/KOS\/|PWU\//g, 'NR/')
  .replace(/SZACOWANY KOSZT|DO ZAPŁATY/g, 'KWOTA');
const dlugoscKosztorys = bezRoznic(kosztorys).length;
const dlugoscPotwierdzenie = bezRoznic(potwierdzenie).length;
sprawdz(
  Math.abs(dlugoscKosztorys - dlugoscPotwierdzenie) < 1400,
  `kosztorys i potwierdzenie to ten sam uklad (roznica ${Math.abs(dlugoscKosztorys - dlugoscPotwierdzenie)} znakow)`,
);

// Karta zlecenia nie moze juz otwierac strony klienta pod „Kosztorys".
const karta = readFileSync(new URL('../../src/components/workshop/WorkshopOrderDetail.tsx', import.meta.url), 'utf8');
sprawdz(!/openClientEstimate/.test(karta), 'menu kosztorysu nie otwiera juz strony klienta');
sprawdz(/otworzKosztorys\('print'\)/.test(karta) && /otworzKosztorys\('download'\)/.test(karta),
  '„Drukuj" i „Pobierz" robia swoje bez drugiego klikniecia');

console.log(bledy ? `\n${bledy} BLEDOW` : '\nKOSZTORYS: wszystko przeszlo');
process.exit(bledy ? 1 : 0);

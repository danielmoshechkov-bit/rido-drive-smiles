/**
 * Protokol przyjecia pojazdu — dokument, a nie strona klienta.
 *
 * Warsztat przy przyjeciu auta potrzebuje papieru do podpisania: dane auta,
 * przebieg, poziom paliwa, uszkodzenia, ustalenia, zdjecia i rysunek auta do
 * obrysowania rys dlugopisem. Do 19.08.2026 „Podglad / Drukuj / Pobierz"
 * otwieraly kartę klienta.
 *
 * Uruchomienie: node scripts/testy-warsztat/test_protokol_przyjecia.mjs
 */
import { readFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const katalog = mkdtempSync(join(tmpdir(), 'protokol-'));
const paczka = join(katalog, 'generator.mjs');
execFileSync('npx', ['esbuild',
  new URL('../../src/utils/receptionProtocolHtml.ts', import.meta.url).pathname,
  '--bundle', '--format=esm', '--platform=neutral', '--outfile=' + paczka,
], { stdio: 'pipe' });
const { generateReceptionProtocolHtml } = await import(paczka);

let bledy = 0;
const sprawdz = (w, opis) => { if (w) console.log('OK: ' + opis); else { console.error('BLAD: ' + opis); bledy++; } };

const dane = {
  numer: 'PP/ZL-08/2026-029',
  data: '2026-08-19',
  miasto: 'Warszawa',
  warsztat: { nazwa: 'CART78GARAGE sp. z o.o.', nip: '5223247450', adres: 'ul. Borsucza 13, 02-213 Warszawa', telefon: '796386382' },
  klient: { nazwa: 'Jan Nowak', telefon: '600 100 200' },
  pojazd: { marka: 'TOYOTA', model: 'Corolla', nrRej: 'WOT06207', vin: 'NMTEM22E60R036253', rocznik: 2004, przebieg: 214500, poziomPaliwa: '1/2' },
  opisZlecenia: 'Serwis olejowy.',
  opisUszkodzen: 'Rysa na lewych drzwiach przednich.',
  zakres: ['wymiana oleju i filtrów', 'wymiana szczęk tylnich'],
  ustalenia: [
    { etykieta: 'Zgoda na jazdę próbną', tak: true },
    { etykieta: 'Zwrot wymienionych części klientowi', tak: false },
  ],
  zdjecia: [{ podpis: 'Przód', obraz: 'data:image/png;base64,iVBORw0KGgo=' }],
  przyjmujacy: 'Daniel M.',
};

const html = generateReceptionProtocolHtml(dane);

sprawdz(html.includes('PROTOKÓŁ PRZYJĘCIA POJAZDU'), 'dokument nosi tytul „PROTOKOL PRZYJECIA POJAZDU"');
sprawdz(html.includes('PP/ZL-08/2026-029'), 'numer protokolu jest na kartce');
sprawdz(html.includes('Warszawa, 19.08.2026'), 'u gory miejscowosc warsztatu i data');
sprawdz(html.includes('CART78GARAGE') && html.includes('Jan Nowak'), 'obie strony: warsztat i klient');
for (const [opis, tekst] of [
  ['marka i model', 'TOYOTA'], ['numer rejestracyjny', 'WOT06207'], ['VIN', 'NMTEM22E60R036253'],
  ['przebieg', '214500 km'], ['poziom paliwa', '1/2'],
]) sprawdz(html.includes(tekst), `dane pojazdu: ${opis}`);
sprawdz(html.includes('Rysa na lewych drzwiach'), 'opis uszkodzen jest przepisany');
sprawdz(html.includes('wymiana oleju i filtrów'), 'zakres prac jest wypisany');
sprawdz(html.includes('Zgoda na jazdę próbną') && html.includes('TAK') && html.includes('NIE'),
  'ustalenia z klientem z odpowiedziami tak/nie');
sprawdz(html.includes('data:image/svg+xml'), 'jest sylwetka auta do recznego zaznaczania uszkodzen');
sprawdz(/X — rysa/.test(html), 'jest legenda oznaczen uszkodzen');
sprawdz(html.includes('Dokumentacja fotograficzna') && html.includes('data:image/png;base64'),
  'zdjecia sa OSADZONE w dokumencie, nie podlinkowane');
sprawdz(html.includes('Podpis przyjmującego') && html.includes('Podpis klienta'), 'sa dwa miejsca na podpis');
sprawdz(html.includes('Daniel M.'), 'przyjmujacy podpisany z imienia');
sprawdz(!html.includes('Podgląd menedżera'), 'to NIE jest podglad strony klienta');

// Bez zdjec sekcja fotograficzna w ogole sie nie pojawia — pusta ramka na wydruku
// wyglada jak brak dowodu, a nie jak brak zdjec.
const bezZdjec = generateReceptionProtocolHtml({ ...dane, zdjecia: [] });
sprawdz(!bezZdjec.includes('Dokumentacja fotograficzna'), 'bez zdjec nie ma pustej sekcji fotograficznej');

// Karta zlecenia: menu protokolu ma wysylke SMS i wlasny dokument.
const karta = readFileSync(new URL('../../src/components/workshop/WorkshopOrderDetail.tsx', import.meta.url), 'utf8');
sprawdz(/otworzProtokol\('print'\)/.test(karta) && /otworzProtokol\('download'\)/.test(karta),
  '„Drukuj" i „Pobierz" otwieraja protokol i robia swoje');
sprawdz(/openSms\('reception'\)/.test(karta), 'w menu protokolu jest wysylka SMS');
sprawdz(!/openClientDoc/.test(karta), 'karta zlecenia nie otwiera juz strony klienta jako dokumentu');

console.log(bledy ? `\n${bledy} BLEDOW` : '\nPROTOKOL PRZYJECIA: wszystko przeszlo');
process.exit(bledy ? 1 : 0);

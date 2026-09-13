/**
 * SCIEZKA ZAKUPU PAKIETU AGENT — straznik bledow z 13.09.2026.
 *
 * Objaw zgloszony przez uzytkownika: klikniecie pakietu nie prowadzilo do
 * platnosci, pokazywalo obcy naglowek „Na jak dlugo" i zawieszalo sie na
 * ekranie „Przetwarzamy platnosc".
 *
 * Trzy przyczyny, wszystkie tutaj upilnowane. Czwarty punkt doszedl tego
 * samego dnia i jest ta sama klasa: SERWER ODMAWIA ZDANIEM, A FRONT GO NIE
 * CZYTA. `functions.invoke` przy kazdej odpowiedzi spoza 2xx zostawia
 * `data === null`, wiec `data?.message` czyta z pustki i czlowiek dostaje
 * zdanie o niczym zamiast powodu.
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
const strona = plik('src/components/agent/StronaAgenta.tsx');
const panel = plik('src/components/ai-sales/VoiceAgentPanel.tsx');
const checkout = plik('supabase/functions/billing-checkout/index.ts');
const synchro = plik('supabase/functions/billing-stripe-sync/index.ts');

// 1. Okno znalo tylko linie „warsztat" — dla agenta `wybranyPlan` byl undefined
//    i caly krok „okres" renderowal sie pusty.
sprawdz(/plans\.find\(\(p\) => p\.code === plan\)/.test(okno),
  'znany plan szukany jest we WSZYSTKICH liniach, nie tylko w warsztatowej');
sprawdz(!/const wybranyPlan[^=]*= doKupienia\.find/.test(okno),
  'stare szukanie wylacznie w liscie warsztatowej nie wrocilo');

// 2. Pytanie o okres przy produkcie, ktory ma tylko cene miesieczna.
sprawdz(/ma_cene_roczna/.test(cennik), 'cennik mowi, czy plan da sie kupic na rok');
sprawdz(/rocznyMozliwy/.test(okno) && /rocznyMozliwy \? 'okres' : krokPoDanych\(\)/.test(okno),
  'plan bez ceny rocznej pomija krok „na jak dlugo"');
sprawdz(/krokPoDanych = \(\): Krok => \(daneKompletne === true \? 'podsumowanie' : 'dane'\)/.test(okno),
  'formularz faktury pokazuje sie TYLKO przy niekompletnych danych');
sprawdz(!/'metoda'/.test(okno),
  'osobny ekran wyboru metody zniknal — decyzja zapada na przyciskach z kwota');
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

// 4. Odmowa serwera ma DOCHODZIC DO EKRANU — i ma byc zdaniem, nie kodem.
sprawdz(!/data\?\.message \|\|/.test(strona),
  'formularz dema nie czyta `data?.message` — przy odmowie 4xx to zawsze pustka');
sprawdz(/odczytajBladFunkcji\(error\)/.test(strona),
  'formularz dema pokazuje zdanie, ktore napisal serwer');

const brakCeny = checkout.slice(checkout.indexOf('PLAN_NOT_SYNCED') - 900, checkout.indexOf('PLAN_NOT_SYNCED') + 60);
sprawdz(/error: "[^"]{40,}"/.test(brakCeny),
  'brak ceny u operatora tlumaczy sie klientowi zdaniem, nie nazwa systemu');
sprawdz(!/error: "Plan wymaga synchronizacji ze Stripe"/.test(checkout),
  'stary komunikat techniczny nie wrocil');
sprawdz(/console\.error\([^)]*stripe_price_id/.test(checkout),
  'brak ceny zostawia slad w logach — to nasza zaleglosc, nie blad klienta');

// 4b. Optymistyczny stan po odmowie — ta sama klasa, tylko widoczna dluzej.
//     Panel pisal „Zamawiamy Twoj numer" takze wtedy, gdy serwer zamowienie
//     ODRZUCIL: toast znikal, zdanie zostawalo, warsztat czekal na nic.
sprawdz(/odmowaNumeru/.test(panel) && /setOdmowaNumeru\(odmowa\.komunikat\)/.test(panel),
  'odmowa zamowienia numeru zostaje na ekranie, nie tylko w znikajacym powiadomieniu');
sprawdz(/odmowaNumeru && !stan\?\.wymaga_miasta \?/.test(panel),
  '„Zamawiamy Twoj numer" nie pokazuje sie po odmowie');
sprawdz(/ponowZamowienie/.test(panel),
  'po odmowie jest czym sprobowac ponownie — automat probowal juz raz');
sprawdz(!/if \(error\) \{ toast\.error\("Nie udalo sie rozpoczac aktywacji"\); return; \}/.test(panel),
  'stare polkniecie zdania serwera przy aktywacji nie wrocilo');

// 4c. MARTWY PRZYCISK. Oba przyciski platnosci stoja pod `!cena`, a wycena
//     oddawala `null` zarowno przy planie nie do kupienia, jak i przy AWARII.
//     Gdy baza przestala wyceniac pakiet agenta, okno wygasilo platnosc
//     i zamilklo: do serwera nie szlo ani jedno zadanie.
const wycena = plik('src/hooks/useCenaOkresu.ts');
sprawdz(/PLAN_NIE_DO_KUPIENIA/.test(wycena) && /throw new Error/.test(wycena),
  'wycena odroznia „nie do kupienia" od awarii — awarie podnosi, zamiast ja polykac');
// Wzorzec zakotwiczony na POCZATKU LINII — inaczej lapie sam siebie w komentarzu,
// ktory opisuje, co tu stalo. (Zlapal. Stad ta uwaga.)
sprawdz(!/^\s*if \(blad \|\| !w\) return null;/m.test(wycena),
  'stare polkniecie kazdej odmowy wyceny nie wrocilo');
sprawdz(/!ladowanie && !cena &&/.test(okno) && /bladCeny/.test(okno),
  'brak ceny daje ZDANIE na ekranie, nie dwa wyszarzone przyciski');

// 4d. Metoda platnosci ustalana PRZEZ NAS, nie przez panel operatora.
sprawdz(/"payment_method_types\[0\]": "card"/.test(checkout),
  'sesja abonamentowa prosi wprost o karte — jedyna metode, ktora umie cykl');
sprawdz((checkout.match(/payment_method_types/g) || []).length === 1,
  'wymuszenie metody stoi w JEDNYM miejscu — sciezki PayU (SMS, doladowania) nietkniete');

// 4e. 🔴 ZAGNIEZDZENIE PO `billing_plans` MUSI NAZYWAC WIEZ.
//     Z `billing_subscriptions` prowadza do `billing_plans` DWA klucze obce
//     (`plan_id` i `plan_od_nastepnego_okresu`), wiec samo `billing_plans(...)`
//     nie rozstrzyga sie i PostgREST odsyla PGRST201 zamiast danych.
//     Skutek w produkcji: warsztat OPLACIL pakiet, subskrypcja stanela w bazie
//     jako `active`, a panel dalej pokazywal oferte — bo zapytanie zwracalo
//     blad, a blad czytamy jako „nie ma pakietu".
const pakiet = plik('src/hooks/usePakietAgenta.ts');
const szczegoly = plik('src/hooks/useSubscriptionDetails.ts');
// KOMENTARZE ODCINAMY, bo opisuja bledny ksztalt slowo w slowo — bez tego
// bramka zapala sie na wlasnym opisie naprawy. (Zapalila sie. Stad ta linia.)
const bezKomentarzy = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

for (const [nazwa, plikTresc] of [['usePakietAgenta', pakiet], ['useSubscriptionDetails', szczegoly]]) {
  const tresc = bezKomentarzy(plikTresc);
  const zagniezdzenia = tresc.match(/billing_plans(?:![A-Za-z_]+)*\(/g) || [];
  const bezNazwy = zagniezdzenia.filter((z) => !z.includes('billing_subscriptions_plan_id_fkey'));
  sprawdz(zagniezdzenia.length > 0 && bezNazwy.length === 0,
    `${nazwa}: zagniezdzenie po billing_plans nazywa wiez (inaczej PGRST201 zamiast danych)`);
}

// 5. Cennik u operatora: nazwa produktu to nazwa, ktora klient czyta przy platnosci.
sprawdz(/const nazwa = `GetRido \$\{plan\.name\}`/.test(synchro) && /wyrownajNazwe/.test(synchro),
  'synchronizacja wyrownuje nazwe produktu, nie tylko ustawia ja przy zakladaniu');
sprawdz(/zKluczaSerwisowego/.test(synchro) && /accessToken === kluczSerwisowy/.test(synchro),
  'cennik da sie zsynchronizowac kluczem serwisowym — bez czlowieka przy klawiaturze');
sprawdz(/if \(!accessToken\) return json\(\{ error: "Unauthorized" \}, 401\);/.test(synchro),
  'wywolanie bez zadnego tokenu nadal jest odrzucane');

console.log(bledy ? `\n${bledy} BLEDOW` : '\nSCIEZKA ZAKUPU: wszystko przeszlo');
process.exit(bledy ? 1 : 0);

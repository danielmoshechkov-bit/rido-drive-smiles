/**
 * NIE MA PAKIETU = NIE MA AGENTA — straznik trzech miejsc.
 *
 * Zasada byla do 13.09.2026 wylacznie w glowie: zakladke „Asystent glosowy"
 * widzial kazdy z 30 warsztatow, ustawienia byly otwarte, licznik minut
 * pokazywal saldo produktu, ktorego nikt nie kupil. Dwa warsztaty testowe
 * odbieraly telefony i zuzywaly nasze minuty u ElevenLabs bez pakietu.
 *
 * Uruchomienie: node scripts/test-bramka-agenta.mjs
 */
import { readFileSync } from 'node:fs';

let bledy = 0;
const sprawdz = (w, opis) => { if (w) console.log('OK: ' + opis); else { console.error('BLAD: ' + opis); bledy++; } };
const plik = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const hak = plik('src/hooks/usePakietAgenta.ts');
sprawdz(/billing_plans!inner/.test(hak) && /plan\.product_line', 'agent'/.test(hak),
  'pytamy o LINIE PLANU, nie o kolumne product_line (webhook jej nie ustawia)');
sprawdz(/current_period_end/.test(hak),
  'wygasly okres nie liczy sie jako aktywny pakiet');
sprawdz(/if \(error\) return false/.test(hak),
  'blad odczytu znaczy BRAK dostepu, nie dostep');

const panel = plik('src/components/ai-sales/VoiceAgentPanel.tsx');
sprawdz(/if \(!maPakiet\) return <OfertaAgenta \/>;/.test(panel),
  'bez pakietu zakladka pokazuje oferte, nie ustawienia');
sprawdz(/if \(!pakietSprawdzony\)/.test(panel),
  'dopoki nie wiadomo, nie mignie ani oferta, ani ustawienia');

const licznik = plik('src/components/LicznikMinutAgenta.tsx');
sprawdz(/usePakietAgenta/.test(licznik) && /if \(!maPakiet\) return null;/.test(licznik),
  'licznik minut widzi wylacznie warsztat z pakietem');
sprawdz(!/voice_agent_configs/.test(licznik),
  'licznik nie opiera sie juz na wlaczonym przelaczniku (dal sie miec bez pakietu)');

const oferta = plik('src/components/ai-sales/OfertaAgenta.tsx');
const strona = plik('src/components/agent/StronaAgenta.tsx');
sprawdz(/usePublicPricing/.test(strona) && /usePubliczneDoladowania/.test(strona),
  'ceny i pakiety ida z cennika w bazie, nie z tekstu w kodzie');
sprawdz(!/199|399|1[,.]15/.test(strona.replace(/\/\*[\s\S]*?\*\//g, '')),
  'zadnej ceny wpisanej na sztywno w widoku sprzedazowym');
sprawdz(/usePlanAction/.test(strona), 'przycisk zakupu idzie ta sama droga co cennik');
sprawdz(!/probka|Posluchaj|Posłuchaj|Audio\(/.test(strona),
  'brak odsluchu w ofercie — demo idzie osobna droga, nie synteza za nasze kredyty');
sprawdz(!/Doładowanie minut/.test(strona) && /Po wykorzystaniu pakietu/.test(strona),
  'stawka po wyczerpaniu jest NA KARCIE pakietu, bez osobnej sekcji');
sprawdz(/zarezerwowany/.test(oferta) && /voice_numbers/.test(oferta),
  'wygasla subskrypcja mowi, ile dni numer jest jeszcze trzymany');
sprawdz(/Przetwarzamy płatność/.test(oferta) && /platnosc/.test(oferta),
  'po powrocie z bramki widac stan przejsciowy, a nie znowu cennik');
sprawdz(/invalidateQueries/.test(oferta) && /pakiet-agenta/.test(oferta),
  'stan przejsciowy sam dopytuje o pakiet i przelacza widok bez odswiezania');

// Jedna tresc, dwa wejscia: strona publiczna i panel. Dwie kopie rozjechalyby
// sie przy pierwszej zmianie ceny.
sprawdz(/StronaAgenta/.test(oferta), 'panel pokazuje TE SAMA strone co /ai-agent, nie wlasna kopie');
sprawdz(/wPanelu/.test(strona), 'wspolna strona zachowuje sie inaczej w panelu niz publicznie');
sprawdz(/zgoda_telefon/.test(strona) && /agent-demo-lead/.test(strona),
  'numer demo wydaje sie dopiero po kontakcie, z osobna zgoda na telefon');
sprawdz(!/4822101589/.test(strona), 'numeru demo NIE MA w kodzie strony — wydaje go funkcja brzegowa');

console.log(bledy ? `\n${bledy} BLEDOW` : '\nBRAMKA AGENTA: wszystko przeszlo');
process.exit(bledy ? 1 : 0);

// Kolory przycisków wysyłki: szary → czerwony (trzeba wysłać) → żółty (wysłane) → zielony.
import { stanPrzyjecia, stanKosztorysu, stanOdbioru } from '../../src/lib/orderActionStatus.ts';

let bledy = 0;
const sprawdz = (opis, wynik, oczek) => {
  const ok = wynik.stan === oczek;
  console.log(`${ok ? ' OK  ' : 'BLAD '} ${opis} → ${wynik.stan}${ok ? '' : ` (oczekiwano ${oczek})`}`);
  if (!ok) bledy++;
};

// PRZYJĘCIE
sprawdz('bez klienta: nie ma czego wysylac', stanPrzyjecia({}, false, false), 'nieaktywny');
sprawdz('klient jest, protokol niewyslany', stanPrzyjecia({}, true, false), 'do_wyslania');
sprawdz('protokol wyslany, brak podpisu', stanPrzyjecia({}, true, true), 'wyslane');
sprawdz('klient podpisal', stanPrzyjecia({ client_acceptance_confirmed: true }, true, true), 'gotowe');

// KOSZTORYS
sprawdz('brak pozycji', stanKosztorysu({}, false), 'nieaktywny');
sprawdz('sa pozycje, kosztorys niewyslany', stanKosztorysu({}, true), 'do_wyslania');
sprawdz('kosztorys wyslany', stanKosztorysu({ estimate_sent_to_client: true }, true), 'wyslane');
sprawdz('klient zaakceptowal', stanKosztorysu({ quote_accepted: true }, true), 'gotowe');
sprawdz('zmiana PO akceptacji wraca do wyslania',
  stanKosztorysu({ quote_accepted: true, estimate_changed_after_send: true }, true), 'do_wyslania');

// ODBIÓR
sprawdz('zlecenie w toku', stanOdbioru({ status_name: 'W trakcie' }), 'nieaktywny');
sprawdz('gotowe, nikt nie powiadomil', stanOdbioru({ status_name: 'Gotowy do odbioru' }), 'do_wyslania');
sprawdz('powiadomienie wyslane', stanOdbioru({ status_name: 'Gotowy do odbioru', ready_notification_sent: true }), 'gotowe');

// Kolory i podpowiedzi
const czerwony = stanKosztorysu({}, true);
if (!czerwony.klasa.includes('miga-do-wyslania') || !czerwony.klasa.includes('red')) { bledy++; console.log('BLAD  stan „do wyslania" nie miga na czerwono'); }
else console.log(' OK   stan „do wyslania" miga na czerwono');
if (!/wyślij/i.test(czerwony.podpowiedz)) { bledy++; console.log('BLAD  podpowiedz nie mowi, co zrobic'); }
else console.log(' OK   podpowiedz mowi, co zrobic');

console.log(bledy ? `BLAD: ${bledy} przypadkow` : 'STANY PRZYCISKOW OK');
process.exit(bledy ? 1 : 0);

// Tryb próbny: zlecenie z wprowadzenia nie liczy się do pakietu SMS ani do limitu VIN.
// Sprawdzamy, czy decyzje zapadają NA SERWERZE — przeglądarka może skłamać.
import { readFileSync } from 'node:fs';

const sms = readFileSync('supabase/functions/workshop-send-sms/index.ts', 'utf8');
const pojazd = readFileSync('supabase/functions/vehicle-check/index.ts', 'utf8');
const migracja = readFileSync('supabase/migrations/20260816_zlecenie_probne.sql', 'utf8');
const dialog = readFileSync('src/components/workshop/WorkshopNewOrderDialog.tsx', 'utf8');

let bledy = 0;
const sprawdz = (opis, ok) => { console.log(`${ok ? ' OK  ' : 'BLAD '} ${opis}`); if (!ok) bledy++; };

// SERWER decyduje po kolumnie zlecenia, nie po fladze z przegladarki.
sprawdz('SMS: serwer czyta is_demo ze zlecenia', /from\("workshop_orders"\)[\s\S]{0,80}is_demo/.test(sms));
sprawdz('SMS: probny tylko na wlasny numer', migracja.includes('tylko na własny numer warsztatu'));
sprawdz('SMS: pula probnych ograniczona', /demo_sms_sent[\s\S]{0,200}p_limit/.test(migracja));
sprawdz('SMS: pakiet nietkniety przy probnym', /smsProbny[\s\S]{0,200}demo_sms_zapisz/.test(sms));
sprawdz('SMS: normalny nadal zdejmuje kredyt', sms.includes('deduct_sms_credit'));

// VIN: jedno darmowe, odhaczane w bazie.
sprawdz('VIN: darmowe sprawdzenie tylko przez baze', pojazd.includes('onboarding_pojazd_za_darmo'));
sprawdz('VIN: kredyt nietkniety przy darmowym', /if \(!zaDarmo\) await deductCredit/.test(pojazd));
sprawdz('VIN: brak kredytow nie blokuje darmowego', pojazd.includes('!hasCredits && !zaDarmo'));
sprawdz('VIN: darmowe przysluguje RAZ', /vehicle_lookup_used[\s\S]{0,200}RETURN false/.test(migracja));

// Zlecenie z wprowadzenia jest oznaczane.
sprawdz('zlecenie z wprowadzenia oznaczane jako probne', dialog.includes('is_demo: trybProbny'));

console.log(bledy ? `BLAD: ${bledy} przypadkow` : 'TRYB PROBNY OK');
process.exit(bledy ? 1 : 0);

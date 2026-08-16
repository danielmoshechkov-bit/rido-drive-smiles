// Kreator pierwszego uruchomienia — sprawdzamy REGUŁY, nie wygląd:
// co jest wymagane, dokąd trafia zapis i kiedy okno ma się pokazać.
import { readFileSync } from 'node:fs';
const kreator = readFileSync('src/components/workshop/onboarding/WorkshopSetupWizard.tsx', 'utf8');
const panel = readFileSync('src/components/workshop/WorkshopDashboard.tsx', 'utf8');

let bledy = 0;
const sprawdz = (opis, warunek) => { console.log(`${warunek ? ' OK  ' : 'BLAD '} ${opis}`); if (!warunek) bledy++; };

// 1. Pola wymagane — bez nich faktura wyjdzie bez sprzedawcy.
for (const pole of ['firm_name', 'nip', 'address', 'postal_code', 'city', 'phone', 'email']) {
  sprawdz(`pole wymagane: ${pole}`, new RegExp(`\\['${pole}',`).test(kreator));
}
// 2. Zapis w OBU miejscach — inaczej nazwa firmy rozjedzie się między ekranami.
sprawdz('zapis do workshop_settings', kreator.includes("from('workshop_settings')"));
sprawdz('odbicie w service_providers', kreator.includes("from('service_providers')") && kreator.includes('company_name:'));
// 3. Godziny i stanowiska można pominąć, dane firmy nie.
sprawdz('godziny pracy do pominiecia', kreator.includes('Pominę na razie'));
sprawdz('krok 1 nie da sie zamknac po cichu', kreator.includes("krok === 1") && kreator.includes('toast.error'));
// 4. KSeF: instrukcja z konkretami, nie ogolnik.
sprawdz('instrukcja KSeF: portal', kreator.includes('ksef.mf.gov.pl'));
sprawdz('instrukcja KSeF: gdzie wkleic', /Księgowość → KSeF/.test(kreator));
sprawdz('instrukcja KSeF: token tylko raz', /tylko raz/.test(kreator));
// 5. Wyzwalanie: po danych, nie po fladze.
sprawdz('okno zalezy od danych, nie od flagi', panel.includes('brakujeDanychFirmy') && !panel.includes('onboarding_done'));
sprawdz('kreator wpiety w panel warsztatu', panel.includes('<WorkshopSetupWizard'));

console.log(bledy ? `BLAD: ${bledy} przypadkow` : 'KREATOR STARTOWY OK');
process.exit(bledy ? 1 : 0);

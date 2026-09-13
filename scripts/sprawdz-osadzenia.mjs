#!/usr/bin/env node
/**
 * OSADZENIE POSTGREST MIĘDZY TABELAMI Z DWOMA KLUCZAMI OBCYMI MUSI WSKAZAĆ KLUCZ.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PO CO TO ISTNIEJE — KOSZTOWAŁO SPRZEDAŻ
 * ═══════════════════════════════════════════════════════════════════════════
 * `billing_subscriptions` ma DWA klucze obce do `billing_plans` (`plan_id`
 * i `plan_od_nastepnego_okresu`). Zapis `plan:billing_plans(...)` jest wtedy
 * niejednoznaczny i PostgREST odsyła **HTTP 300 / PGRST201** — nie pustkę,
 * nie wiersz, tylko błąd.
 *
 * 13.09.2026 pierwszy prawdziwy zakup pakietu Agenta kartą przeszedł w Stripe,
 * subskrypcja powstała, minuty były na koncie — a panel dalej pokazywał ofertę
 * z cennikiem, bo `usePakietAgenta` czytał `if (error) return false`. Trzy
 * miejsca miały ten sam błąd naraz:
 *   • `usePakietAgenta`            → oferta mimo opłaconego pakietu,
 *   • `useSubscriptionDetails`     → rzucał wyjątkiem,
 *   • `billing-price-guarantee`    → cron ceny docelowej padał przy KAŻDYM
 *                                    przebiegu, po cichu.
 *
 * To trzeci raz w tym repozytorium (patrz CLAUDE.md, „druga kolumna FK do
 * billing_plans"). Reguła w dokumentacji nie dociera do kogoś, kto kopiuje
 * istniejące zapytanie — bramka dociera.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SKĄD LISTA PAR
 * ═══════════════════════════════════════════════════════════════════════════
 * `scripts/niejednoznaczne-osadzenia.json`, odczytane z bazy. Odświeżenie:
 *
 *   SELECT c.relname AS dziecko, r.relname AS rodzic, count(*),
 *          string_agg(con.conname, ' | ' ORDER BY con.conname)
 *   FROM pg_constraint con
 *   JOIN pg_class c ON c.oid = con.conrelid
 *   JOIN pg_class r ON r.oid = con.confrelid
 *   JOIN pg_namespace n ON n.oid = c.relnamespace
 *   WHERE con.contype = 'f' AND n.nspname = 'public'
 *   GROUP BY 1, 2 HAVING count(*) > 1;
 *
 * ⚠️ Lista jest MIGAWKĄ. Nowy drugi klucz obcy nie zapali tej bramki, dopóki
 * ktoś jej nie odświeży — dlatego pytanie „czy dokładasz drugi klucz obcy do
 * tej samej tabeli" zostaje na liście w CLAUDE.md. Bramka łapie kopiowanie
 * starego wzorca, nie zakładanie nowego więzu.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const KORZEN = process.cwd();
const DANE = JSON.parse(readFileSync(resolve(KORZEN, 'scripts/niejednoznaczne-osadzenia.json'), 'utf8'));

/** Zbiór par w OBU kierunkach — osadzać można w każdą stronę. */
const PARY = new Set();
for (const p of DANE.pary) {
  PARY.add(`${p.dziecko}|${p.rodzic}`);
  PARY.add(`${p.rodzic}|${p.dziecko}`);
}
const KLUCZE = new Set(DANE.pary.flatMap((p) => p.klucze));

/** `!inner` i `!left` to modyfikatory złączenia, nie nazwy kluczy obcych. */
const MODYFIKATORY = new Set(['inner', 'left']);

function pliki(kat, wynik = []) {
  for (const w of readdirSync(kat)) {
    if (w === 'node_modules' || w === 'dist' || w.startsWith('.')) continue;
    const p = join(kat, w);
    if (statSync(p).isDirectory()) pliki(p, wynik);
    else if (/\.(ts|tsx)$/.test(w) && !/_test\.ts$/.test(w)) wynik.push(p);
  }
  return wynik;
}

/**
 * Zapytania w jednym pliku: `.from('X')` i najbliższy po nim `.select(...)`.
 * Świadomie wąsko — bramka ma nie krzyczeć na dobry kod.
 */
export function znajdzNaruszenia(tresc, nazwa = '') {
  const naruszenia = [];
  const wzorFrom = /\.from\(\s*['"`]([A-Za-z0-9_]+)['"`]/g;
  let m;
  while ((m = wzorFrom.exec(tresc)) !== null) {
    const tabela = m[1];
    /**
     * 🔴 ZAKRES KOŃCZY SIĘ NA NASTĘPNYM `.from(`, NIE PO STAŁEJ LICZBIE ZNAKÓW.
     *
     * Pierwsza wersja brała 2000 znaków w przód i zgłosiła FAŁSZYWY ALARM:
     * `.from('unmapped_settlement_drivers').update({...})` nie ma własnego
     * `.select(`, więc wyszukiwanie doleciało do kolejnego zapytania w tym
     * samym pliku — na zupełnie inną tabelę — i przypisało mu cudze osadzenie.
     * Bramka, która krzyczy na dobry kod, uczy ignorowania siebie.
     */
    const nastepneFrom = tresc.slice(m.index + 1).search(/\.from\(\s*['"`]/);
    const kres = nastepneFrom === -1 ? tresc.length : m.index + 1 + nastepneFrom;
    const ogon = tresc.slice(m.index, kres);
    const iSel = ogon.indexOf('.select(');
    if (iSel === -1) continue;
    // Treść wywołania `.select(` aż do domykającego nawiasu tego wywołania.
    let glebokosc = 0, koniec = -1;
    for (let i = iSel + '.select('.length - 1; i < ogon.length; i++) {
      if (ogon[i] === '(') glebokosc++;
      else if (ogon[i] === ')') { glebokosc--; if (glebokosc === 0) { koniec = i; break; } }
    }
    if (koniec === -1) continue;
    /**
     * KOMENTARZE W ŚRODKU `.select(` ODCINAMY — ale ZNAK W ZNAK, na spacje.
     *
     * Drugi fałszywy alarm tej bramki (13.09.2026): w `useSubscriptionDetails`
     * nad listą kolumn stoi komentarz tłumaczący, czemu więz jest nazwany —
     * i cytuje w nim BŁĘDNY kształt `billing_plans(...)`. Bramka zapaliła się
     * na opisie własnej naprawy, przy poprawnym kodzie linijkę niżej.
     *
     * Podmiana na spacje o tej samej długości (z zachowaniem końców linii)
     * zamiast wycięcia: numer linii w zgłoszeniu liczy się z przesunięć
     * w tekście, a skrócenie go przesunęłoby wszystkie kolejne.
     */
    const naSpacje = (t) => t.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (k) => k.replace(/[^\n]/g, ' '));
    const lista = naSpacje(ogon.slice(iSel + '.select('.length, koniec));

    // Osadzenia: `alias:tabela!klucz!inner(` albo `tabela(`
    const wzorOsad = /(?:([A-Za-z0-9_]+)\s*:\s*)?([A-Za-z0-9_]+)((?:\s*![A-Za-z0-9_]+)*)\s*\(/g;
    let o;
    while ((o = wzorOsad.exec(lista)) !== null) {
      const osadzana = o[2];
      if (!PARY.has(`${tabela}|${osadzana}`)) continue;
      const znaczniki = (o[3] || '').split('!').map((s) => s.trim()).filter(Boolean);
      const maKlucz = znaczniki.some((z) => !MODYFIKATORY.has(z));
      if (maKlucz) continue;
      const linia = tresc.slice(0, m.index + iSel + o.index).split('\n').length;
      naruszenia.push({
        plik: nazwa, linia, tabela, osadzana,
        podpowiedz: DANE.pary.find(
          (p) => (p.dziecko === tabela && p.rodzic === osadzana) || (p.rodzic === tabela && p.dziecko === osadzana),
        )?.klucze ?? [],
      });
    }
  }
  return naruszenia;
}

/**
 * Część wykonawcza siedzi w funkcji, żeby `znajdzNaruszenia` dało się
 * zaimportować bez uruchamiania przeglądu (i bez `process.exit` w środku
 * cudzego programu). Uruchamia się tylko wtedy, gdy plik jest wywołany wprost.
 */
function przebieg() {
  // ── kontrola pozytywna i odwrotna ───────────────────────────────────────────
  const ZLE = `
    const { data } = await supabase
      .from('billing_subscriptions')
      .select('id, status, plan:billing_plans!inner(product_line)')
      .eq('subscriber_id', id);
  `;
  /**
   * Druga kontrola pozytywna, dokładnie na to, co zawężenie mogło zjeść:
   * zapytanie BEZ `.select(` (samo `.update`), a po nim inne zapytanie z
   * osadzeniem. Zły zapis ma być nadal złapany — a ten pierwszy `.from`
   * NIE ma dostać cudzego osadzenia.
   */
  const ZLE_PO_UPDATE = `
    await supabase.from('unmapped_settlement_drivers').update({ status: 'resolved' }).eq('id', x);
    const { data } = await supabase
      .from('billing_subscriptions')
      .select('id, plan:billing_plans(product_line)')
      .eq('subscriber_id', id);
  `;
  const DOBRE = `
    const { data } = await supabase
      .from('billing_subscriptions')
      .select('id, status, plan:billing_plans!billing_subscriptions_plan_id_fkey!inner(product_line)')
      .eq('subscriber_id', id);
  `;

  const kontrolaZla = znajdzNaruszenia(ZLE, '<kontrola>');
  const kontrolaDobra = znajdzNaruszenia(DOBRE, '<kontrola>');
  if (kontrolaZla.length !== 1) {
    console.log(`❌ KONTROLA POZYTYWNA PADŁA: bramka nie widzi zapisu, o którym wiadomo, że jest zły (${kontrolaZla.length} trafień). Wynik jest bez wartości.`);
    process.exit(1);
  }
  if (kontrolaDobra.length !== 0) {
    console.log('❌ KONTROLA ODWROTNA PADŁA: bramka zapala się na POPRAWNYM zapisie z jawnym kluczem. Nauczyłaby ignorowania siebie.');
    process.exit(1);
  }
  const kontrolaPoUpdate = znajdzNaruszenia(ZLE_PO_UPDATE, '<kontrola>');
  if (kontrolaPoUpdate.length !== 1 || kontrolaPoUpdate[0].tabela !== 'billing_subscriptions') {
    console.log(`❌ KONTROLA POZYTYWNA nr 2 PADŁA: po zawężeniu zakresu bramka gubi zły zapis albo przypisuje go nie tej tabeli (${JSON.stringify(kontrolaPoUpdate)}).`);
    process.exit(1);
  }
  console.log('✅ kontrola pozytywna — zły zapis łapany');
  console.log('✅ kontrola pozytywna nr 2 — zły zapis łapany także po zapytaniu bez `.select(`');
  console.log('✅ kontrola odwrotna — dobry zapis przepuszczany');

  // ── przegląd repozytorium ───────────────────────────────────────────────────
  const doPrzejrzenia = [
    ...pliki(resolve(KORZEN, 'src')),
    ...pliki(resolve(KORZEN, 'supabase/functions')),
  ];
  const wszystkie = [];
  for (const p of doPrzejrzenia) {
    wszystkie.push(...znajdzNaruszenia(readFileSync(p, 'utf8'), p.replace(KORZEN + '/', '')));
  }

  console.log(`\nPrzejrzano ${doPrzejrzenia.length} plików, ${DANE.pary.length} par tabel z wieloma kluczami obcymi.`);
  if (!wszystkie.length) {
    console.log('Zero niejednoznacznych osadzeń.');
    process.exit(0);
  }
  console.log(`\n🔴 NIEJEDNOZNACZNE OSADZENIA: ${wszystkie.length}. Każde kończy się HTTP 300 / PGRST201, nie pustką.\n`);
  for (const n of wszystkie) {
    console.log(`${n.plik}:${n.linia}`);
    console.log(`  .from('${n.tabela}') osadza '${n.osadzana}' bez wskazania klucza`);
    console.log(`  wybierz jeden: ${n.podpowiedz.join('  albo  ')}`);
  }
  process.exit(1);

}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) przebieg();

import { assert } from 'https://deno.land/std@0.208.0/assert/mod.ts';

/**
 * Straż kompletności bramki zapisu (G4).
 *
 * ⚠️ POWÓD (16.08.2026): `warsztat_zaloz_bramke` chodzi po STATYCZNEJ liście
 * tabel z `warsztat_tabele_wprost()`. Każda nowa tabela warsztatowa zostaje
 * poza bramką, dopóki ktoś jej tam nie dopisze — a brak polityki nie daje
 * żadnego sygnału. Nie ma błędu, nie ma ostrzeżenia; po prostu ta jedna tabela
 * jest zapisywalna bez opłaconej subskrypcji.
 *
 * Zdarzyło się to od razu: `workshop_calendar_settings` powstała w innym
 * wątku i weszła na produkcję niebramkowana. Test zapala się na PR-ze, zanim
 * tabela trafi na produkcję.
 *
 * Test NIE zmusza do bramkowania wszystkiego. Zmusza do PODJĘCIA DECYZJI:
 * albo tabela wchodzi do bramki, albo trafia na listę wyjątków z powodem.
 */

const KATALOG = 'supabase/migrations';

/**
 * Tabele świadomie POZA bramką zapisu, z uzasadnieniem.
 * Dopisanie czegoś tutaj ma być decyzją, nie odruchem.
 */
const WYJATKI: Record<string, string> = {
  workshop_client_bookings:
    'Bramkowany osobno i tylko INSERT — klient końcowy, który umówił się przed ' +
    'blokadą, ma zostać obsłużony (potwierdzenie, odwołanie, przełożenie).',
  workshop_order_events:
    'Dziennik zdarzeń pisany triggerem przy zmianie statusu. Gdy operacja ' +
    'nadrzędna jest zablokowana, trigger i tak nie zadziała.',
  workshop_order_status_history: 'Jak wyżej — historia pisana triggerem.',
  workshop_order_assignment_history: 'Jak wyżej — historia pisana triggerem.',
  workshop_sms_log:
    'Dziennik wysyłek. Bramką jest `workshop-send-sms` (G5), nie zapis do logu.',
  workshop_translations_cache:
    'Bufor tłumaczeń, zapisywany przez funkcję brzegową na kluczu serwisowym.',
  workshop_tire_reminders_due:
    'WIDOK, nie tabela — nie da się na nim założyć polityki.',
  workshop_tire_location_log:
    'Historia przeniesień opon między regałami, pisana triggerem. INSERT/UPDATE/DELETE ' +
    'odebrane rolom klienckim, więc przez bramkę i tak nic tu nie przejdzie. ' +
    'Gdy operacja nadrzędna (zapis wpisu) jest zablokowana, trigger nie zadziała.',
  workshop_tire_receipts:
    'Kopia potwierdzenia dla klienta końcowego, pisana triggerem przy przyjęciu. ' +
    'Zapis odebrany rolom klienckim; odczyt publiczny idzie funkcją brzegową ' +
    'na kluczu serwisowym. Ma przeżyć skasowanie wpisu — to dowód dla klienta, ' +
    'nie dane warsztatu, więc blokada subskrypcji nie może go zabierać.',
  workshop_parts_order_items:
    'Brak kolumny właściciela; właściciela ustala się przez `workshop_parts_orders`. ' +
    'Do domknięcia przy okazji — patrz audyt.',
  workshop_tire_storage_tasks:
    'Brak kolumny właściciela; do domknięcia razem z `workshop_parts_order_items`.',
  workshop_settings:
    'Kluczowana po `user_id`, nie po `provider_id` — ustawienia konta, nie warsztatu.',
  workshop_onboarding_usage:
    'Licznik darmowego wprowadzenia (jedno sprawdzenie pojazdu, pula SMS-ów próbnych). ' +
    'Bramka zadaje tu ZŁE PYTANIE: pyta „czy ten warsztat ma opłaconą subskrypcję", ' +
    'a tej tabeli nie wolno zapisywać NIKOMU z przeglądarki — także warsztatowi ' +
    'płacącemu, bo wpis wprost resetuje mu darmowy przydział. Wpisanie jej do bramki ' +
    'otworzyłoby zapis wszystkim opłaconym. ' +
    'Co ją dziś chroni: RLS jest włączone, a jedyna polityka to `wou_read` (SELECT) — ' +
    'przy braku polityki zapisu RLS odmawia domyślnie. Piszą wyłącznie trzy funkcje ' +
    '`SECURITY DEFINER`: `demo_sms_dozwolony`, `demo_sms_zapisz`, `onboarding_pojazd_za_darmo`. ' +
    'DOPÓKI NIKT NIE DOŁOŻY TU POLITYKI ZAPISU, tabela jest zamknięta szczelniej niż bramką. ' +
    'Uwaga na przyszłość: uprawnienia tabelowe dla `anon`/`authenticated` są szerokie, ' +
    'ale to domyślna konfiguracja platformy — ma je 530 z 561 tabel tego projektu, ' +
    'więc jedyną realną warstwą jest tu RLS, tak jak wszędzie indziej.',
};

async function pliki(): Promise<string[]> {
  const out: string[] = [];
  for await (const w of Deno.readDir(KATALOG)) {
    if (w.isFile && w.name.endsWith('.sql')) out.push(w.name);
  }
  return out.sort(); // nazwy są datowane, więc sortowanie = kolejność wykonania
}

/** Tabele `workshop_*`, które mają kolumnę `provider_id`. */
async function tabeleZProviderId(nazwy: string[]): Promise<Set<string>> {
  const znalezione = new Set<string>();

  for (const n of nazwy) {
    const t = (await Deno.readTextFile(`${KATALOG}/${n}`))
      // komentarze zamieniamy na spacje, żeby nie łapać przykładów z opisów
      .replace(/--[^\n]*/g, (m) => ' '.repeat(m.length));

    // CREATE TABLE <nazwa> ( … provider_id … )
    for (const m of t.matchAll(
      /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?(workshop_\w+)\s*\(([\s\S]*?)\n\s*\);/gi,
    )) {
      if (/\bprovider_id\b/.test(m[2])) znalezione.add(m[1].toLowerCase());
    }

    // ALTER TABLE <nazwa> ADD COLUMN provider_id
    for (const m of t.matchAll(
      /ALTER\s+TABLE\s+(?:public\.)?(workshop_\w+)[\s\S]{0,200}?ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?provider_id/gi,
    )) {
      znalezione.add(m[1].toLowerCase());
    }
  }
  return znalezione;
}

/** Lista z OSTATNIEJ definicji `warsztat_tabele_wprost()`. */
async function tabeleWBramce(nazwy: string[]): Promise<Set<string>> {
  let ostatnia: string | null = null;
  for (const n of nazwy) {
    const t = await Deno.readTextFile(`${KATALOG}/${n}`);
    const m = t.match(
      /FUNCTION\s+public\.warsztat_tabele_wprost\(\)[\s\S]*?ARRAY\[([\s\S]*?)\];/i,
    );
    if (m) ostatnia = m[1]; // późniejszy plik nadpisuje wcześniejszy
  }
  assert(ostatnia, 'nie znalazłem definicji warsztat_tabele_wprost()');
  return new Set([...ostatnia.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
}

Deno.test('każda tabela warsztatowa z provider_id jest w bramce albo na liście wyjątków', async () => {
  const nazwy = await pliki();
  const zProviderId = await tabeleZProviderId(nazwy);
  const wBramce = await tabeleWBramce(nazwy);

  assert(zProviderId.size > 20, `podejrzanie mało tabel: ${zProviderId.size} — parser się zepsuł?`);
  assert(wBramce.size > 20, `podejrzanie krótka lista bramki: ${wBramce.size}`);

  const niebramkowane = [...zProviderId]
    .filter((t) => !wBramce.has(t))
    .filter((t) => !(t in WYJATKI))
    .sort();

  assert(
    niebramkowane.length === 0,
    'Tabele warsztatowe z `provider_id` POZA bramką zapisu:\n' +
      niebramkowane.map((t) => `  • ${t}`).join('\n') +
      '\n\nKażda z nich jest dziś zapisywalna BEZ opłaconej subskrypcji.\n' +
      'Dopisz je do `warsztat_tabele_wprost()` w nowej migracji ' +
      '(wzór: 20260816180000_bramka_nowe_tabele.sql)\n' +
      'albo do WYJATKI w tym pliku — z uzasadnieniem, dlaczego mają zostać otwarte.',
  );
});

Deno.test('lista wyjątków nie zawiera tabel, które i tak są w bramce', async () => {
  // Wyjątek na tabelę, która jest bramkowana, to martwy wpis wprowadzający
  // w błąd przy następnym czytaniu.
  const wBramce = await tabeleWBramce(await pliki());
  const zbedne = Object.keys(WYJATKI).filter((t) => wBramce.has(t));
  assert(
    zbedne.length === 0,
    `Te tabele są w bramce, więc wpis w WYJATKI jest zbędny: ${zbedne.join(', ')}`,
  );
});

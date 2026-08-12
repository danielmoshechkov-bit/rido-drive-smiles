#!/usr/bin/env node
// ============================================================================
// voice-audit.mjs — AUDYT STANU, NIE KODU.
//
// Powód powstania: 90 testów jednostkowych i ani jeden nie złapał sześciu
// ostatnich błędów, bo wszystkie siedziały w DANYCH i KONFIGURACJI:
//   - reguła ze zmyślonymi godzinami w bazie wiedzy
//   - prompt persony każący wywołać nieistniejące narzędzie
//   - dane osobowe w 23 wpisach
//   - asr.keywords wracające dwa razy
//   - wants_cancel wykrywany, ale przez nikogo nieczytany
//   - status „Oddzwonić" zdefiniowany, ale nieosiągalny
//
// Testy sprawdzają, czy kod robi to, co napisano. Ten skrypt sprawdza, czy
// STAN SYSTEMU zgadza się z tym, co uważamy za prawdę.
//
// URUCHAMIAĆ: przed każdym wdrożeniem i po każdym deployu z Lovable.
// Kod wyjścia != 0 znaczy: nie wdrażamy.
//
//   node scripts/voice-audit.mjs            # wszystko
//   node scripts/voice-audit.mjs A B D      # wybrane sekcje
//
// Wymaga w .env.local: SUPABASE_ACCESS_TOKEN, ELEVENLABS_API_KEY
// Tylko ODCZYT. Niczego nie zmienia.
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT = "wclrrytmrscqvsyxyvnn";
const AGENT_ID = "agent_8301ky7ve28ee6jsb3h30h11354g";
// DWA RÓŻNE KLUCZE, łatwe do pomylenia — i pomyliłem je przy pierwszym uruchomieniu:
// ai_agents_config.agent_id     = "voice_workshop_secretary"
// voice_agent_knowledge.persona_key = "workshop_secretary"
// Kontrola A2 przeszła wtedy „bez zastrzeżeń", bo sprawdziła ZERO wierszy.
const PERSONA_AGENT = "voice_workshop_secretary";
const PERSONA_KEY = "workshop_secretary";

// --- środowisko -------------------------------------------------------------
for (const line of existsSync(join(ROOT, ".env.local")) ? readFileSync(join(ROOT, ".env.local"), "utf8").split("\n") : []) {
  const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const SB = process.env.SUPABASE_ACCESS_TOKEN;
const EL = process.env.ELEVENLABS_API_KEY;

// --- raport -----------------------------------------------------------------
const problemy = [];
let sprawdzen = 0;

// KAŻDA KONTROLA MUSI POWIEDZIEĆ, ILE WIERSZY OBEJRZAŁA.
//
// Zasada 12 zastosowana do narzędzi diagnostycznych: cichy audyt wygląda
// identycznie jak czysty wynik. Kontrola A2 zaraportowała „bez zastrzeżeń",
// bo pytała o zły `persona_key` i nie obejrzała ANI JEDNEGO wiersza.
//
// `n` jest obowiązkowe. n === 0 zamienia sukces w porażkę, bo kontrola,
// która nic nie sprawdziła, nie jest kontrolą.
// Wyjątek świadomy: `pusteDozwolone` dla stanów, w których zero jest CELEM
// (np. wyzerowana baza wiedzy) — tam trzeba to napisać wprost.
const ok = (sekcja, co, n, pusteDozwolone = false) => {
  sprawdzen++;
  if (n === undefined) {
    problemy.push({ sekcja, co: `${co} — kontrola nie podała, ile sprawdziła` });
    console.log(`  \x1b[31mX\x1b[0m [${sekcja}] ${co}  \x1b[31m(brak licznika sprawdzonych)\x1b[0m`);
    return;
  }
  if (n === 0 && !pusteDozwolone) {
    problemy.push({ sekcja, co: `${co} — ZERO sprawdzonych, kontrola ślepa` });
    console.log(`  \x1b[31mX\x1b[0m [${sekcja}] ${co}  \x1b[31m(0 sprawdzonych — kontrola ślepa)\x1b[0m`);
    return;
  }
  console.log(`  \x1b[32m✔\x1b[0m [${sekcja}] ${co}  \x1b[90m(${n} sprawdzonych)\x1b[0m`);
};
const zle = (sekcja, co, szczegol) => {
  sprawdzen++;
  problemy.push({ sekcja, co, szczegol });
  console.log(`  \x1b[31mX\x1b[0m [${sekcja}] ${co}`);
  if (szczegol) String(szczegol).split("\n").forEach((l) => console.log(`      ${l}`));
};
const naglowek = (t) => console.log(`\n\x1b[1m${t}\x1b[0m\n${"─".repeat(t.length)}`);

const db = async (sql) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${SB}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const d = await r.json();
  if (!Array.isArray(d)) throw new Error(d?.message || "zapytanie nie powiodło się");
  return d;
};

const czytajFunkcje = (nazwa) => readFileSync(join(ROOT, "supabase/functions", nazwa, "index.ts"), "utf8");

// ============================================================================
// A. SPÓJNOŚĆ TRZECH ŹRÓDEŁ (zasada 15)
//    prompt z kodu  ×  prompt persony w bazie  ×  aktywne reguły bazy wiedzy
// ============================================================================
async function sekcjaA() {
  naglowek("A. SPÓJNOŚĆ TRZECH ŹRÓDEŁ PRAWDY");
  const chat = czytajFunkcje("voice-agent-chat");

  // Narzędzia, które kod NAPRAWDĘ przekazuje modelowi.
  const narzedziaKodu = new Set([...chat.matchAll(/tools\.push\(\{\s*\n?\s*name:\s*"([a-z_]+)"/g)].map((m) => m[1]));
  // Narzędzia klienta z ElevenLabs dochodzą w czasie działania — dopisujemy znane.
  const narzedziaKlienta = new Set(["end_call", "language_detection"]);

  const [persona] = await db(
    `select coalesce(system_prompt,'') as p from ai_agents_config where agent_id = '${PERSONA_AGENT}'`,
  );
  const promptPersony = persona?.p || "";

  // A1: persona nie może wołać narzędzia, którego kod nie przekazuje.
  const wolane = [...promptPersony.matchAll(/\b(create_booking|create_order|check_availability|end_call|transfer_to_human|language_detection|cancel_booking)\b/g)]
    .map((m) => m[1]);
  const nieistniejace = [...new Set(wolane)].filter((t) => !narzedziaKodu.has(t) && !narzedziaKlienta.has(t));
  if (nieistniejace.length) {
    zle("A1", "prompt persony wywołuje narzędzia, których kod NIE przekazuje",
      `${nieistniejace.join(", ")}\nnarzędzia realnie przekazywane: ${[...narzedziaKodu, ...narzedziaKlienta].join(", ")}`);
  } else {
    ok("A1", `persona nie wywołuje nieistniejących narzędzi (kod daje: ${[...narzedziaKodu].join(", ")})`, promptPersony.length ? 1 : 0);
  }

  // A2: aktywne reguły bazy wiedzy nie mogą przeczyć promptowi.
  const reguly = await db(
    `select id::text as id, situation, recommended_response from voice_agent_knowledge
      where is_active and persona_key = '${PERSONA_KEY}'`,
  );
  const [licz] = await db(
    `select count(*)::int as n from voice_agent_knowledge where persona_key = '${PERSONA_KEY}'`);
  const wszystkieDlaPersony = licz?.n ?? 0;

  // Pary: (co prompt uznaje za NADRZĘDNE, wzorzec przeczącej reguły)
  const kolizje = [
    { prompt: /każdą cyfrę czytasz OSOBNO/i, regula: /grupami|naturalnie, grupami|bez rozbijania na pojedyncze cyfry/i,
      opis: "prompt każe czytać cyfry POJEDYNCZO, reguła każe czytać GRUPAMI" },
    { prompt: /żaden czasownik opisujący TWOJĄ pracę/i, regula: /zapisuję Pana|umawiam Pana|tworzę rezerwacj|sprawdzam terminy/i,
      opis: "prompt zakazuje relacjonowania własnych działań, reguła podaje taką frazę jako wzorzec" },
    { prompt: /NIE PYTAJ O NAZWISKO/i, regula: /popro[śs].*nazwisk|zapytaj.*nazwisk/i,
      opis: "prompt zakazuje pytać o nazwisko, reguła każe je zebrać" },
    { prompt: /musi być BEZOSOBOWE/i, regula: /dla Pana najwygodniejszy|dla Pani najwygodniej/i,
      opis: "prompt wymaga formy bezosobowej przed poznaniem imienia, reguła podaje zwrot z domyśloną płcią" },
  ];
  let kolizji = 0;
  for (const k of kolizje) {
    if (!k.prompt.test(chat)) continue;
    for (const r of reguly) {
      const t = `${r.situation || ""} ${r.recommended_response || ""}`;
      if (k.regula.test(t)) {
        kolizji++;
        zle("A2", `sprzeczność prompt ↔ baza wiedzy: ${k.opis}`,
          `reguła ${r.id.slice(0, 8)}: ${(r.recommended_response || "").slice(0, 110)}`);
      }
    }
  }
  // KONTROLA NA PUSTYM ZBIORZE TO NIE JEST SUKCES. Pierwsza wersja tego skryptu
  // pytała o zły `persona_key` i raportowała „bez zastrzeżeń", nie obejrzawszy
  // ani jednego wiersza. Zero danych = zepsuta kontrola, nie czysty wynik.
  if (reguly.length === 0) {
    // ZERO AKTYWNYCH REGUŁ TO STAN DOCELOWY, NIE AWARIA.
    //
    // 11.08 wyzerowaliśmy całą aktywną dziesiątkę: 5 reguł było wadliwych
    // (zmyślone godziny, dane osobowe), 3 sprzeczne z promptem, a wszystkie
    // sensowne były już w prompcie w wersji nowszej. Baza wiedzy ma rosnąć
    // OD ZERA, wyłącznie przez bramkę uczenia: z rozmów udanych, po redakcji,
    // z `is_active = false` do świadomej akceptacji człowieka.
    //
    // NIE WŁĄCZAJ ICH Z POWROTEM, jeśli tu trafiłeś szukając awarii.
    // Rollback istnieje (voice-knowledge-reset-20260811-rollback.sql), ale jego
    // użycie przywróci trzy znane sprzeczności.
    //
    // Rozróżnienie: pusta tabela dla tej persony = kontrola ślepa (błąd);
    // wpisy są, tylko żaden nie jest aktywny = stan docelowy (w porządku).
    if (wszystkieDlaPersony === 0) {
      zle("A2", "brak JAKICHKOLWIEK wpisów dla tej persony — kontrola ślepa",
        `persona_key = '${PERSONA_KEY}'; sprawdź, czy klucz jest poprawny`);
    } else {
      ok("A2", `zero aktywnych reguł — STAN DOCELOWY po wyzerowaniu 11.08 (${wszystkieDlaPersony} wpisów nieaktywnych czeka na bramkę)`, 1, true);
    }
  } else if (!kolizji) {
    ok("A2", `${reguly.length} aktywnych reguł, żadna nie przeczy promptowi`, reguly.length * kolizje.length);
  }

  // A3: reguła nie może NAKAZYWAĆ tego, co prompt ZAKAZUJE (odwrotny kierunek).
  const zakazy = [...chat.matchAll(/ZAKAZ(?:ANE)?:?\s*([^\n\\]{10,120})/g)].map((m) => m[1].trim());
  ok("A3", `wykryto ${zakazy.length} bloków zakazów w prompcie z kodu (materiał do kontroli ręcznej)`, zakazy.length);
}

// ============================================================================
// B. HIGIENA BAZY WIEDZY (zasady 20, 22)
// ============================================================================
// ZASADA 23: zanim zaraportujesz zero dla identyfikatora, sprawdź, czy ten
// identyfikator istnieje. Zapytanie na zmyślonym UUID nie zwraca błędu — zwraca
// pustkę nieodróżnialną od prawdziwego zera. Dwa razy w jednej sesji zbudowałem
// pełny UUID ze skróconej formy i zaraportowałem trzy błędne wnioski.
async function sprawdzIdentyfikator(sekcja, tabela, kolumna, wartosc, opis) {
  const [r] = await db(`select count(*)::int as n from ${tabela} where ${kolumna} = '${wartosc}'`);
  if ((r?.n ?? 0) === 0) {
    zle(sekcja, `${opis} NIE ISTNIEJE w ${tabela} — każde zero policzone dla niego jest fałszywe`,
      `${kolumna} = ${wartosc}`);
    return false;
  }
  return true;
}

async function sekcjaB() {
  naglowek("B. HIGIENA BAZY WIEDZY");
  const wpisy = await db(
    `select id::text as id, is_active, coalesce(situation,'') as s, coalesce(recommended_response,'') as r
       from voice_agent_knowledge`,
  );
  const tekst = (x) => `${x.s} ${x.r}`;
  if (wpisy.length === 0) { zle("B", "tabela bazy wiedzy pusta — kontrola nic nie obejrzała"); return; }

  const wzorce = [
    { nazwa: "dane osobowe: numer telefonu", rx: /\b\d{3}[\s-]?\d{3}[\s-]?\d{3}\b|pięćset\s+\w+\s+\w+\s+\w+/i },
    { nazwa: "dane osobowe: tablica rejestracyjna", rx: /\b[A-Z]{2,3}\s?(?=[A-Z0-9]{4,6}\b)(?=[A-Z0-9]*\d)[A-Z0-9]{4,6}\b/ },
    { nazwa: "dane osobowe: imię i nazwisko", rx: /\b[A-ZŁŚŻŹĆŃÓ][a-ząćęłńóśźż]+\s+[A-ZŁŚŻŹĆŃÓ][a-ząćęłńóśźż]*(?:ski|cki|wicz|czyk|kow|ków|ov)\b/ },
    { nazwa: "ZASADA 22: konkretna godzina w przykładzie", rx: /\b\d{1,2}:\d{2}\b/ },
    { nazwa: "ZASADA 22: konkretna data w przykładzie", rx: /\b\d{1,2}\s+(?:stycznia|lutego|marca|kwietnia|maja|czerwca|lipca|sierpnia|września|października|listopada|grudnia)\b|\b\d{4}-\d{2}-\d{2}\b/i },
    { nazwa: "ZASADA 22: kwota w przykładzie", rx: /\b\d+(?:[.,]\d+)?\s*(?:zł|PLN|złotych)/i },
    { nazwa: "obietnica: transfer do człowieka", rx: /połącz(?:ę|yć).*(?:koleg|konsultant|pracownik)|tłumacz|przełącz(?:ę|yć) (?:Pana|Panią)/i },
    { nazwa: "obietnica: oddzwonienie", rx: /oddzwoni(?:ę|my)|zadzwonimy do Pana/i },
    { nazwa: "obietnica: konkretny czas realizacji", rx: /trwa (?:około|okolo)\s*\d|\b\d+\s*[-–]\s*\d+\s*minut|zajmie (?:około|okolo)\s*\d/i },
  ];
  for (const w of wzorce) {
    const trafienia = wpisy.filter((x) => w.rx.test(tekst(x)));
    const aktywne = trafienia.filter((x) => x.is_active);
    if (trafienia.length === 0) {
      ok("B", `${w.nazwa}: zero trafień`, wpisy.length);
    } else {
      // Aktywne = błąd twardy. Nieaktywne = ostrzeżenie, bo ożyją po włączeniu.
      const szcz = trafienia.slice(0, 3).map((x) =>
        `${x.is_active ? "AKTYWNY" : "nieaktywny"} ${x.id.slice(0, 8)}: ${tekst(x).slice(0, 100)}`).join("\n");
      if (aktywne.length) zle("B", `${w.nazwa}: ${aktywne.length} AKTYWNYCH (z ${trafienia.length})`, szcz);
      else zle("B", `${w.nazwa}: ${trafienia.length} nieaktywnych — ożyją po włączeniu w panelu`, szcz);
    }
  }
}

// ============================================================================
// D. MARTWE ŚCIEŻKI
// ============================================================================
async function sekcjaD() {
  naglowek("D. MARTWE ŚCIEŻKI");

  // D0: tożsamość tenanta. Bez tego cała sekcja liczyłaby zera dla nikogo.
  const [cfg] = await db("select provider_id::text as p from voice_agent_configs limit 1");
  if (cfg?.p) {
    const ok1 = await sprawdzIdentyfikator("D0", "service_providers", "id", cfg.p, "provider_id agenta głosowego");
    if (ok1) {
      const [dane] = await db(`select
        (select count(*) from provider_services where provider_id='${cfg.p}') as uslugi,
        (select count(*) from workshop_workstations where provider_id='${cfg.p}') as stanowiska,
        (select count(*) from booking_resources where provider_id='${cfg.p}') as zasoby`);
      ok("D0", `tenant istnieje; usługi=${dane.uslugi} stanowiska=${dane.stanowiska} zasoby=${dane.zasoby}`, 1);
      if (Number(dane.uslugi) === 0) {
        zle("D0", "cennik PUSTY — snapshot FAZY A nie będzie miał skąd wziąć cen ani czasów trwania");
      }
    }
  } else {
    zle("D0", "brak konfiguracji agenta — nie wiadomo, dla kogo liczyć");
  }

  // D1: każde pole ekstrakcji musi być gdzieś czytane.
  const ekstrakcja = readFileSync(join(ROOT, "supabase/functions/_shared/voiceExtraction.ts"), "utf8");
  const pola = [...ekstrakcja.matchAll(/^\s{4}([a-z_]+):\s/gm)].map((m) => m[1]);
  const unikalne = [...new Set(pola)].filter((p) => !["type", "role", "message"].includes(p));
  const konsumenci = ["voice-call-commit", "voice-call-postprocess"].map(czytajFunkcje).join("\n")
    + readFileSync(join(ROOT, "supabase/functions/_shared/voiceReconcile.ts"), "utf8");
  const nieczytane = unikalne.filter((p) => !new RegExp(`\\b${p}\\b`).test(konsumenci));
  if (nieczytane.length) {
    zle("D1", "pola wypełniane przez ekstrakcję, których NIKT nie czyta",
      `${nieczytane.join(", ")}\n(tak było z wants_cancel: wykrywany i ignorowany, więc system zakładał drugą rezerwację)`);
  } else {
    ok("D1", `wszystkie ${unikalne.length} pól ekstrakcji ma konsumenta`, unikalne.length);
  }

  // D2: każdy status zdefiniowany w RPC musi być osiągalny.
  const sqlPliki = join(ROOT, "scripts/sql/voice-commit-call-20260806.sql");
  if (existsSync(sqlPliki)) {
    const rpc = readFileSync(sqlPliki, "utf8");
    const statusy = [...new Set([...rpc.matchAll(/v_status_name\s*:?=\s*'([^']+)'/g)].map((m) => m[1]))];
    const commit = czytajFunkcje("voice-call-commit");
    const nieosiagalne = [];
    for (const s of statusy) {
      // „Oddzwonić" powstaje przy p_date IS NULL — sprawdzamy, czy commit w ogóle
      // potrafi wywołać RPC z pustą datą.
      if (s === "Oddzwonić" && !/date:\s*\w+\s*\?\s*null|p_date:\s*null/.test(commit)) nieosiagalne.push(s);
    }
    if (nieosiagalne.length) {
      zle("D2", "statusy zdefiniowane w RPC, ale NIEOSIĄGALNE z kodu",
        `${nieosiagalne.join(", ")}\ncommit zatrzymuje się przed RPC, więc gałąź nigdy nie wykona się w praktyce`);
    } else {
      ok("D2", `wszystkie statusy RPC osiągalne (${statusy.join(", ")})`, statusy.length);
    }
  }

  // D3: funkcje wołane przez fetch muszą istnieć w repozytorium.
  const wszystkie = ["voice-agent-chat", "voice-agent-llm", "voice-agent-tools",
    "voice-call-commit", "voice-call-postprocess", "voice-call-analyze", "voice-call-reconcile"];
  const brakujace = new Set();
  for (const f of wszystkie) {
    for (const m of czytajFunkcje(f).matchAll(/functions\/v1\/([a-z0-9-]+)/g)) {
      if (!existsSync(join(ROOT, "supabase/functions", m[1], "index.ts"))) brakujace.add(`${f} → ${m[1]}`);
    }
  }
  if (brakujace.size) zle("D3", "wołane funkcje, których nie ma w repozytorium", [...brakujace].join("\n"));
  else ok("D3", "każda wołana funkcja istnieje w repozytorium", wszystkie.length);
}

// ============================================================================
// C. KONFIGURACJA ELEVENLABS
// ============================================================================
async function sekcjaC() {
  naglowek("C. KONFIGURACJA ELEVENLABS");
  if (!EL) { zle("C", "brak ELEVENLABS_API_KEY — sekcja pominięta"); return; }
  const r = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${AGENT_ID}`, { headers: { "xi-api-key": EL } });
  if (!r.ok) { zle("C", `ElevenLabs zwrócił ${r.status}`); return; }
  const cfg = (await r.json())?.conversation_config || {};

  const kw = cfg.asr?.keywords || [];
  if (kw.length) zle("C1", `asr.keywords MUSZĄ być puste — jest ${kw.length}`,
    `${kw.slice(0, 6).join(", ")}…\nprzy 12 słowach ASR halucynował w 2 z 9 tur; wracały już DWA RAZY`);
  else ok("C1", "asr.keywords puste", 1);

  const tt = cfg.turn?.turn_timeout;
  tt === 4 ? ok("C2", "turn_timeout = 4 s", 1) : zle("C2", `turn_timeout = ${tt}, oczekiwane 4`);

  const narzedzia = (cfg.agent?.prompt?.tools || []).map((t) => t.name).sort();
  const oczekiwane = ["end_call", "language_detection"];
  JSON.stringify(narzedzia) === JSON.stringify(oczekiwane)
    ? ok("C3", `narzędzia agenta: ${narzedzia.join(", ")}`, narzedzia.length)
    : zle("C3", `narzędzia agenta: ${narzedzia.join(", ") || "(brak)"}, oczekiwane: ${oczekiwane.join(", ")}`);

  const chat = czytajFunkcje("voice-agent-chat");
  const mt = [...new Set([...chat.matchAll(/max(?:_t|OutputT)okens:?\s*(\d+)/g)].map((m) => m[1]))];
  JSON.stringify(mt) === JSON.stringify(["400"])
    ? ok("C4", "max_tokens = 400 we wszystkich miejscach", mt.length)
    : zle("C4", `max_tokens niespójne albo inne niż 400: ${mt.join(", ")}`);

  const presety = Object.keys(cfg.agent?.language_presets || {});
  presety.length ? ok("C5", `language_presets: ${presety.join(", ")}`, presety.length)
    : zle("C5", "language_presets PUSTE — language_detection nie ma na co przełączyć");
}

// ============================================================================
// E. ZGODNOŚĆ PRODUKCJI Z MAIN
// ============================================================================
async function sekcjaE() {
  naglowek("E. ZGODNOŚĆ PRODUKCJI Z MAIN");
  const funkcje = ["voice-agent-chat", "voice-agent-llm", "voice-agent-tools",
    "voice-call-commit", "voice-call-postprocess", "voice-call-analyze", "voice-call-reconcile"];
  let katalog;
  try {
    katalog = execSync("mktemp -d", { encoding: "utf8" }).trim();
    for (const f of funkcje) {
      execSync(`cd ${katalog} && SUPABASE_ACCESS_TOKEN=${SB} npx --yes supabase@latest functions download ${f} --project-ref ${PROJECT}`,
        { stdio: "ignore" });
    }
  } catch { zle("E", "nie udało się pobrać funkcji z produkcji"); return; }

  for (const f of funkcje) {
    const prod = join(katalog, "supabase/functions", f, "index.ts");
    if (!existsSync(prod)) { zle("E", `${f}: nie pobrano z produkcji`); continue; }
    const hp = createHash("sha256").update(readFileSync(prod)).digest("hex").slice(0, 12);
    let hm;
    try { hm = createHash("sha256").update(execSync(`git show origin/main:supabase/functions/${f}/index.ts`, { cwd: ROOT })).digest("hex").slice(0, 12); }
    catch { zle("E", `${f}: brak na origin/main`); continue; }
    hp === hm ? ok("E", `${f} ${hp}`, 1) : zle("E", `${f}: ROZJAZD`, `produkcja=${hp}  main=${hm}`);
  }
}

// ============================================================================
const SEKCJE = { A: sekcjaA, B: sekcjaB, C: sekcjaC, D: sekcjaD, E: sekcjaE };
const wybrane = process.argv.slice(2).filter((a) => SEKCJE[a]);
const doUruchomienia = wybrane.length ? wybrane : Object.keys(SEKCJE);

console.log(`\x1b[1mAUDYT STANU AGENTA GŁOSOWEGO\x1b[0m   sekcje: ${doUruchomienia.join(" ")}`);
if (!SB) { console.error("\nBRAK SUPABASE_ACCESS_TOKEN w .env.local — zatrzymuję się, nie obchodzę."); process.exit(2); }

for (const s of doUruchomienia) {
  try { await SEKCJE[s](); }
  catch (e) { zle(s, `sekcja przerwana błędem: ${e.message}`); }
}

console.log(`\n${"═".repeat(64)}`);
if (problemy.length === 0) {
  console.log(`\x1b[32mBEZ ZASTRZEŻEŃ\x1b[0m — ${sprawdzen} kontroli`);
  process.exit(0);
}
console.log(`\x1b[31m${problemy.length} PROBLEMÓW\x1b[0m z ${sprawdzen} kontroli — NIE WDRAŻAMY\n`);
for (const p of problemy) console.log(`  [${p.sekcja}] ${p.co}`);
process.exit(1);

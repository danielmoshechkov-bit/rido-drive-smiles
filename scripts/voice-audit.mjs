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
import { readFileSync, existsSync, readdirSync } from "node:fs";
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
    { prompt: /Mówisz WYNIK, nigdy PROCES/i, regula: /zapisuję Pana|umawiam Pana|tworzę rezerwacj|sprawdzam terminy/i,
      opis: "prompt zakazuje relacjonowania własnych działań, reguła podaje taką frazę jako wzorzec" },
    { prompt: /Nie pytasz o nazwisko/i, regula: /popro[śs].*nazwisk|zapytaj.*nazwisk/i,
      opis: "prompt zakazuje pytać o nazwisko, reguła każe je zebrać" },
    { prompt: /Do poznania imienia mówisz BEZOSOBOWO/i, regula: /dla Pana najwygodniejszy|dla Pani najwygodniej/i,
      opis: "prompt wymaga formy bezosobowej przed poznaniem imienia, reguła podaje zwrot z domyśloną płcią" },
  ];
  // REGUŁA, KTÓREJ NIE MA W PROMPCIE, TO NIE JEST „BRAK KOLIZJI".
  //
  // Pierwsza wersja robiła `continue` — i po przepisaniu promptu w FAZIE C
  // TRZY z czterech par przestały pasować, ciche. Kontrola świeciła na zielono,
  // sprawdzając jedną parę zamiast czterech. Zasada 12 zastosowana do kontroli,
  // która sama miała pilnować sprzeczności.
  const zagubione = kolizje.filter((k) => !k.prompt.test(chat)).map((k) => k.opis);
  if (zagubione.length) {
    zle("A2", `${zagubione.length} z ${kolizje.length} par kolizji NIE MA ODPOWIEDNIKA w prompcie`,
      `${zagubione.join("\n")}\nreguła zniknęła albo zmieniła brzmienie — para nie jest sprawdzana`);
  }
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
      // PUSTA BAZA WIEDZY TO STAN DOCELOWY (od 16.08, po skasowaniu 108 wpisow
    // wydestylowanych automatycznie). Kontrola ma prawo powiedziec „nie ma czego
    // sprawdzac" — ale MUSI to powiedziec wprost, nie udawac zielonego.
    ok("A2", "baza wiedzy pusta — brak reguł mogących przeczyć promptowi (stan docelowy)", 0, true);
  } else if (false) {
    zle("A2", "brak JAKICHKOLWIEK wpisów dla tej persony — kontrola ślepa",
        `persona_key = '${PERSONA_KEY}'; sprawdź, czy klucz jest poprawny`);
    } else {
      ok("A2", `zero aktywnych reguł — STAN DOCELOWY po wyzerowaniu 11.08 (${wszystkieDlaPersony} wpisów nieaktywnych czeka na bramkę)`, 1, true);
    }
  } else if (!kolizji) {
    ok("A2", `${reguly.length} aktywnych reguł, żadna nie przeczy promptowi`, reguly.length * kolizje.length);
  }

  // A3: reguła nie może NAKAZYWAĆ tego, co prompt ZAKAZUJE (odwrotny kierunek).
  // FAZA C usunela naglowki „ZAKAZ…" — zakazy sa teraz zwyklymi zdaniami
  // („Nigdy nie odsylasz do telefonu", „Nie mowisz, ze sprawdzasz"). Wzorzec
  // szukajacy naglowka zwrocil ZERO i kontrola zglosila slepote — poprawnie.
  const zakazy = [...chat.matchAll(/^\s*-?\s*(?:⛔\s*)?((?:Nigdy nie|Nie mówisz|Nie pytasz|Nie wyliczaj|Nie wymyślasz|Nie zgadujesz|Nie anulujesz|Nie obiecujesz|Nie tłumaczysz|Nie wołasz|ZAKAZ(?:ANE)?:?)[^\n\\]{5,120})/gmi)].map((m) => m[1].trim());
  ok("A3", `wykryto ${zakazy.length} zakazów w prompcie z kodu (materiał do kontroli ręcznej)`, zakazy.length);
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

  const wszystkie = ["voice-agent-chat", "voice-agent-llm", "voice-agent-tools", "voice-agent-init",
    "voice-call-commit", "voice-call-postprocess", "voice-call-analyze", "voice-call-reconcile"];

  // D4: KOLUMNY W ZAPYTANIACH MUSZĄ ISTNIEĆ W SCHEMACIE.
  //
  // Czwarty raz ta sama klasa błędu: maybeSingle, address/city, duration_seconds,
  // teraz service_providers.phone. Za każdym razem PostgREST zwracał błąd, `data`
  // było null, a skutek wyglądał jak brak danych — ostatnio jako warsztat zamknięty
  // przez czternaście dni. Da się to sprawdzić mechanicznie i tu jest to zrobione.
  const kolumnyBazy = new Map();
  for (const r of await db(
    `select table_name, string_agg(column_name, ',') as cols from information_schema.columns
      where table_schema = 'public' group by table_name`)) {
    kolumnyBazy.set(r.table_name, new Set(String(r.cols).split(",")));
  }
  const zle_kolumny = [];
  let sprawdzonychSelectow = 0;
  const pominieteTabele = new Set();
  for (const f of wszystkie) {
    const kod = czytajFunkcje(f);
    // .from("tabela")…select("a, b, c") — bierzemy tylko proste listy kolumn,
    // bez zagnieżdżeń PostgREST (te mają nawiasy) i bez count/head.
    for (const m of kod.matchAll(/\.from\("([a-z_]+)"\)[\s\S]{0,200}?\.select\(\s*"([^"()*]+)"/g)) {
      const [, tabela, lista] = m;
      const znane = kolumnyBazy.get(tabela);
      // TABELA, KTOREJ SCHEMATU NIE MAMY, TO NIE JEST TABELA BEZ BLEDOW.
      // Ciche `continue` sprawialo, ze zapytanie do nieznanej tabeli wygladalo
      // identycznie jak zapytanie sprawdzone i poprawne. Ta sama klasa co
      // `catch` polykajacy odrzucony INSERT alertu.
      if (!znane) { pominieteTabele.add(tabela); continue; }
      sprawdzonychSelectow++;
      for (const kol of lista.split(",").map((c) => c.trim().split(":")[0].trim()).filter(Boolean)) {
        if (!znane.has(kol)) zle_kolumny.push(`${f}: ${tabela}.${kol}`);
      }
    }
  }
  if (zle_kolumny.length) {
    zle("D4", "zapytania wybierają kolumny, których NIE MA w schemacie",
      `${[...new Set(zle_kolumny)].join("\n")}\nPostgREST zwróci błąd, a data będzie null — skutek wygląda jak brak danych`);
  } else {
    if (pominieteTabele.size) {
      zle("D4", `${pominieteTabele.size} tabel POMINIETYCH — brak schematu, zapytania niesprawdzone`,
        [...pominieteTabele].join(", "));
    } else {
      ok("D4", `wszystkie kolumny w zapytaniach istnieją w schemacie`, sprawdzonychSelectow);
    }
  }

  // D5: ZAŚLEPKI W KODZIE PRODUKCYJNYM.
  // `filter(() => false)` napisane jako miejsce na późniejszą logikę omal nie
  // pojechało na produkcję. To ta sama klasa co wants_cancel: pole w kontrakcie,
  // którego nikt nie wypełnia.
  const zaslepki = [];
  const WZORCE_ZASLEPEK = [
    [/filter\(\(\) => false\)/g, "filter(() => false)"],
    [/\bTODO\b/g, "TODO"], [/\bFIXME\b/g, "FIXME"],
    [/\bXXX\b/g, "XXX"], [/return \[\];\s*\/\/\s*(tymczas|placeholder|na razie)/gi, "pusta tablica tymczasowo"],
  ];
  for (const f of wszystkie) {
    const kod = czytajFunkcje(f);
    for (const [rx, opis] of WZORCE_ZASLEPEK) {
      const n = (kod.match(rx) || []).length;
      if (n) zaslepki.push(`${f}: ${opis} ×${n}`);
    }
  }
  if (zaslepki.length) zle("D5", "zaślepki w kodzie produkcyjnym", zaslepki.join("\n"));
  else ok("D5", "brak zaślepek (filter(() => false), TODO, FIXME, XXX)", wszystkie.length);

  // D7: ZDANIA WZORCOWE W PROMPCIE NIE MOGĄ MIEĆ ZASZYTEJ PŁCI.
  //
  // Siedem razy agent zwrócił się „Pan" do kobiety. Przez sześć z nich szukaliśmy
  // przyczyny w regułach o zgadywaniu płci. Przyczyną było ZDANIE, które prompt
  // każe wypowiedzieć DOSŁOWNIE:
  //   „W podsumowaniu powiedz: »Potwierdzenie wyślemy SMS-em na numer,
  //    z którego Pan dzwoni.«"
  // Model nie zgadywał — recytował nasz szablon. Zasada 22 (przykład staje się
  // zachowaniem) w najczystszej postaci, tylko dotyczy rodzaju gramatycznego.
  // WZORCE MIESZKAJA TERAZ W DWOCH PLIKACH.
  // 16.08 dopisalem wzorzec „Jesli potrzebuje PAN pozniej, mozna zostawic auto"
  // do voiceWzorce.ts — i D7 go NIE ZOBACZYLA, bo skanowala wylacznie prompt.
  // Asercja `plec_przed_imieniem` w symulacji zlapala to piec razy na trzech
  // przebiegach. Kontrola, ktora patrzy w jedno z dwoch zrodel, jest slepa
  // na polowe materialu.
  const chatSrc = czytajFunkcje("voice-agent-chat")
    + "\n" + readFileSync(join(ROOT, "supabase/functions/_shared/voiceWzorce.ts"), "utf8");
  const plciowe = [];
  for (const m of chatSrc.matchAll(/"[^"]{0,160}(?:z którego Pan|dla Pana|Panu wygodnie|mógłby Pan|zdecydują się Państwo|potrzebuje Pan|dla Pani|Pani wygodnie)[^"]{0,80}"/g)) {
    const kontekst = chatSrc.slice(Math.max(0, m.index - 120), m.index);
    // Przykłady NEGATYWNE są w porządku — pokazują, czego nie robić. Rozpoznajemy je
    // po znacznikach („ŹLE:", „BŁĄD:") ORAZ po zaprzeczeniu tuż przed cytatem
    // („…, nie »…«", „zamiast »…«"). Bez tego drugiego warunku kontrola krzyczała
    // na własną regułę zakazującą tej formy — a kontrola, która myli się przy
    // pierwszym uruchomieniu, przestaje być czytana.
    if (/ŹLE|BŁĄD|padło|nie mów/i.test(kontekst)) continue;
    if (/(,\s*nie|zamiast|nigdy)\s*$/i.test(kontekst.trimEnd() + " ")) continue;
    if (/(,\s*nie|zamiast|nigdy)\s*$/i.test(kontekst)) continue;
    plciowe.push(m[0].slice(0, 110));
  }
  if (plciowe.length) {
    zle("D7", "zdania wzorcowe w prompcie mają zaszytą formę męską",
      `${plciowe.join("\n")}\nmodel wypowie je DOSŁOWNIE, także do kobiety`);
  } else {
    ok("D7", "żadne zdanie wzorcowe nie zakłada płci rozmówcy", 1);
  }

  // D6: SCHEMATY NARZĘDZI MUSZĄ BYĆ LOGOWANE (zasada 25).
  // Pole `reason` w end_call kosztowało 1236 ms na każdej rozmowie przez trzy
  // pomiary, bo nikt nigdy nie obejrzał schematu, który wysyłamy modelowi.
  const chatKod = czytajFunkcje("voice-agent-chat");
  const maLog = /client_tools_schema/.test(chatKod);
  const maFiltr = /ZBEDNE_POLA/.test(chatKod);
  if (maLog && maFiltr) {
    ok("D6", "schematy narzędzi są logowane i filtrowane (ZBEDNE_POLA)", 1);
  } else {
    zle("D6", "schematy narzędzi klienta nie są logowane albo nie są filtrowane",
      `log=${maLog} filtr=${maFiltr}\nmodel wypełni KAŻDE pole, które zobaczy — także takie, którego nikt nie czyta`);
  }

  // D3: funkcje wołane przez fetch muszą istnieć w repozytorium.
  const brakujace = new Set();
  for (const f of wszystkie) {
    for (const m of czytajFunkcje(f).matchAll(/functions\/v1\/([a-z0-9-]+)/g)) {
      if (!existsSync(join(ROOT, "supabase/functions", m[1], "index.ts"))) brakujace.add(`${f} → ${m[1]}`);
    }
  }
  if (brakujace.size) zle("D3", "wołane funkcje, których nie ma w repozytorium", [...brakujace].join("\n"));
  else ok("D3", "każda wołana funkcja istnieje w repozytorium", wszystkie.length);

  // D8: KAŻDA FUNKCJA BAZY WOŁANA PRZEZ RPC MUSI BYĆ W MIGRACJACH.
  //
  // `voice_commit_call` i `get_voice_context` działały na produkcji od 11.08,
  // a nie było ich w ŻADNEJ migracji — powstały przez `db query` i istniały
  // wyłącznie w bazie. Reset schematu albo odtworzenie środowiska z repozytorium
  // dawało bazę, w której agent przyjmuje rozmowy i NIC NIE ZAPISUJE, bez żadnego
  // śladu w gicie, że czegokolwiek brakuje.
  //
  // Ta kontrola czyta, co Edge Functions faktycznie wołają przez `.rpc("…")`,
  // i sprawdza każdą nazwę w katalogu migracji. Nie ufa liście wpisanej ręcznie,
  // bo taka lista starzeje się przy pierwszym nowym RPC.
  const wywolaneRpc = new Set();
  for (const f of wszystkie) {
    for (const m of czytajFunkcje(f).matchAll(/\.rpc\(\s*["'`]([a-z0-9_]+)["'`]/gi)) wywolaneRpc.add(m[1]);
  }
  const migracje = readdirSync(join(ROOT, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(ROOT, "supabase/migrations", f), "utf8"))
    .join("\n");
  const pozaGitem = [...wywolaneRpc].filter(
    (n) => !new RegExp(`FUNCTION\\s+(?:public\\.)?${n}\\s*\\(`, "i").test(migracje));

  if (!wywolaneRpc.size) {
    // Pusty zbiór to porażka, nie sukces (zasada 12). Zero wykrytych wywołań RPC
    // znaczy, że przestał pasować wzorzec — nie że wszystko jest w porządku.
    zle("D8", "nie wykryto ANI JEDNEGO wywołania .rpc() w Edge Functions",
      "kontrola nic nie sprawdziła — popsuł się wzorzec, nie kod");
  } else if (pozaGitem.length) {
    zle("D8", "funkcje bazy wołane przez RPC, których NIE MA w migracjach",
      `${pozaGitem.join(", ")}\nreset schematu usunie je bez śladu w gicie`);
  } else {
    ok("D8", "każda funkcja bazy wołana przez RPC jest w migracjach", wywolaneRpc.size);
  }

  // D9: PRODUKCJA MUSI ZGADZAĆ SIĘ ZE ZŁOTYM STANEM.
  //
  // Każde pole w config/elevenlabs-agent-ZLOTY-STAN.json kosztowało pomiary:
  // model syntezy to tydzień diagnozy bełkotu, głos to 80 syntez i test
  // istotności, puste `asr.keywords` to halucynacje rozpoznawania. Bez tej
  // kontroli cicha zmiana w panelu albo pętla sondująca (moja, 15.08) cofa
  // tydzień pracy i nikt się nie dowiaduje.
  //
  // RÓŻNICA TO ALARM, NIE INFORMACJA — dlatego zle(), nie ostrzeżenie.
  const zlotyPlik = join(ROOT, "config/elevenlabs-agent-ZLOTY-STAN.json");
  if (!existsSync(zlotyPlik)) {
    zle("D9", "brak pliku złotego stanu", "config/elevenlabs-agent-ZLOTY-STAN.json");
  } else {
    try {
      const wynik = execSync("node scripts/voice-restore-golden.mjs", { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      const ile = (wynik.match(/(\d+) pól sprawdzonych/) || [])[1];
      if (!ile || Number(ile) === 0) {
        zle("D9", "porównanie ze złotym stanem nic nie sprawdziło", "pusty zbiór pól = ślepa kontrola");
      } else {
        ok("D9", "produkcja zgodna ze złotym stanem", Number(ile));
      }
    } catch (e) {
      const tekst = String(e.stdout || "") + String(e.stderr || "");
      const pola = [...tekst.matchAll(/ROZJAZD\S*\s+(\S+)/g)].map((m) => m[1]);
      zle("D9", "PRODUKCJA ODBIEGA OD ZŁOTEGO STANU",
        `${pola.join("\n")}\nprzywrócenie: node scripts/voice-restore-golden.mjs --wykonaj`);
    }
  }

  // D10: POLSKI AGENT MUSI ZGADZAĆ SIĘ Z OSTATNIM POTWIERDZONYM STANEM.
  //
  // D9 pilnuje konfiguracji ElevenLabs — 22 pola. Nie pilnuje ANI JEDNEGO znaku
  // promptu, persony z bazy ani modułu renderującego godziny. 15.08 prompt urósł
  // o 4950 znaków, voiceSnapshot.ts zmienił się trzy razy, a jedyną kontrolą było
  // to, że pamiętałem policzyć SHA ręcznie.
  //
  // Regresja 0/20 świadomie NIE jest tu uruchamiana: kosztuje 20 syntez, a audyt
  // ma być darmowy i puszczalny zawsze. Odciski łapią zmianę, regresja odpowiada
  // na inne pytanie („czy nadal brzmi dobrze") i ma własne polecenie.
  // D11: WZORCE JĘZYKOWE MUSZĄ TRAFIAĆ DO PROMPTU.
  //
  // Moduł, który istnieje i ma zielone testy, ale nikt go nie woła, wygląda
  // w repozytorium identycznie jak moduł działający — a agent dalej mówi po
  // polsku w rosyjskiej rozmowie. Dokładnie ten kształt błędu złapało D1
  // (pola ekstrakcji, których nikt nie czyta).
  const chatWzorce = czytajFunkcje("voice-agent-chat");
  const wolane = /wzorceWJezyku\s*\(/.test(chatWzorce);
  const wPromptcie = /systemVolatile\s*=[^;]*blokWzorcow/.test(chatWzorce);
  if (!wolane) zle("D11", "voiceWzorce.ts nie jest wołane w voice-agent-chat", "moduł jest martwy — obcojęzyczne rozmowy dostaną wzorce polskie");
  else if (!wPromptcie) zle("D11", "wzorceWJezyku wołane, ale wynik nie trafia do promptu", "sprawdź, czy blokWzorcow jest doklejany do systemVolatile");
  else ok("D11", "wzorce w języku rozmowy doklejane do promptu (systemVolatile)", 1);

  // D12: ROZMOWA TESTOWA NIE MOŻE UCZYĆ.
  //
  // `is_test` był wysyłany przez voice-agent-simulate od początku i nie był
  // czytany ani razu — 108 wydestylowanych reguł w bazie, część z losowych
  // scenariuszy wymyślonych przez model. Kontrola pilnuje OBU warunków:
  // że flaga jest czytana I że blokuje zapis do bazy wiedzy.
  const analyzeSrc = czytajFunkcje("voice-call-analyze");
  const czytaFlage = /const\s+isTest\s*=\s*body\?\.is_test/.test(analyzeSrc);
  const blokuje = /if\s*\(\s*!isTest\s*&&[^)]*Array\.isArray\(a\?\.lessons\)/.test(analyzeSrc);
  if (!czytaFlage) zle("D12", "voice-call-analyze NIE CZYTA is_test", "symulacje karmią voice_agent_knowledge");
  else if (!blokuje) zle("D12", "is_test czytane, ale nie blokuje zapisu do bazy wiedzy", "sprawdź warunek przy pętli lessons");
  else {
    const aktywne = await db(`select count(*)::int n from voice_agent_knowledge where is_active`);
    const n = aktywne?.[0]?.n ?? -1;
    if (n > 0) zle("D12", `baza wiedzy ma ${n} AKTYWNYCH reguł`, "miała mieć zero do czasu zbudowania bramki uczenia");
    else ok("D12", "rozmowa testowa nie uczy; baza wiedzy bez aktywnych reguł", 1);
  }

  const odciskPlik = join(ROOT, "config/POLSKI-ODCISK.json");
  if (!existsSync(odciskPlik)) {
    zle("D10", "brak odcisku polskiego agenta",
      "config/POLSKI-ODCISK.json — utwórz: node scripts/voice-polski-nienaruszony.mjs --zapisz");
  } else {
    try {
      const wyj = execSync("node scripts/voice-polski-nienaruszony.mjs --bez-regresji", { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      const zgodnych = (wyj.match(/^ ✓/gm) || []).length;
      if (!zgodnych) zle("D10", "sprawdzenie polskiego nic nie potwierdziło", "ślepa kontrola");
      else ok("D10", `polski zgodny z ostatnim potwierdzonym stanem (${zgodnych} warstwy)`, zgodnych);
    } catch (e) {
      const tekst = String(e.stdout || "") + String(e.stderr || "");
      const linia = (tekst.match(/^POLSKI NIENARUSZONY: NIE.*$/m) || [])[0] || tekst.slice(-500);
      zle("D10", "POLSKI ODBIEGA OD OSTATNIEGO POTWIERDZONEGO STANU",
        `${linia}\nszczegóły: node scripts/voice-polski-nienaruszony.mjs`);
    }
  }
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
  // language_detection WYLACZONE 17.08. Regula z ⛔ i opisem nie dzialala trzy
  // razy — 15.08 i 17.08 agent wywolal je po kolei trzy razy, dostal trzy
  // odmowy „Invalid language" i klient uslyszal czternascie sekund ciszy.
  // Zasada 26 odwrotnie: nie ma czego wywolac, wiec nie ma jak zlamac reguly.
  const oczekiwane = ["end_call"];
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
// E. ZGODNOŚĆ PRODUKCJI Z WDROŻONYM KODEM
// ============================================================================
async function sekcjaE() {
  naglowek("E. ZGODNOŚĆ PRODUKCJI Z WDROŻONYM KODEM");
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
    // PORÓWNUJEMY Z TYM, CO WDRAŻAMY — czyli z lokalnym HEAD, nie z main.
    //
    // Pierwsza wersja porównywała z `origin/main`. Wdrażamy z gałęzi roboczej,
    // więc KAŻDA funkcja świeciła na czerwono i sekcja przestała cokolwiek
    // znaczyć — dokładnie „czerwone CI, które wszyscy przeskakują" (zasada 28).
    //
    // Pytanie, na które ta kontrola ma odpowiadać, brzmi: „czy na produkcji
    // stoi to, co ostatnio wdrożyliśmy" — bo Lovable potrafi nadpisać funkcję
    // z main i cofnąć naszą pracę bez śladu.
    let hl;
    try { hl = createHash("sha256").update(readFileSync(join(ROOT, "supabase/functions", f, "index.ts"))).digest("hex").slice(0, 12); }
    catch { zle("E", `${f}: brak w repozytorium`); continue; }
    if (hp === hl) { ok("E", `${f} ${hp} (zgodne z HEAD)`, 1); continue; }
    // Rozjazd z HEAD: sprawdzamy, CZY produkcja to przypadkiem main —
    // to znaczyłoby, że ktoś nadpisał nasze wdrożenie.
    let hm = null;
    try { hm = createHash("sha256").update(execSync(`git show origin/main:supabase/functions/${f}/index.ts`, { cwd: ROOT })).digest("hex").slice(0, 12); } catch { /* brak na main */ }
    zle("E", `${f}: PRODUKCJA ODBIEGA OD HEAD`,
      hp === hm
        ? `produkcja=${hp} = origin/main — NASZE WDROŻENIE ZOSTAŁO NADPISANE`
        : `produkcja=${hp}  HEAD=${hl}${hm ? `  main=${hm}` : ""} — wdróż albo sprawdź, co stoi na produkcji`);
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

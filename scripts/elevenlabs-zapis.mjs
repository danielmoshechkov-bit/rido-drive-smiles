// ============================================================================
// elevenlabs-zapis.mjs — JEDYNA DROGA ZAPISU DO KONFIGURACJI ELEVENLABS.
//
// Powód powstania: 15.08 puściłem pętlę PATCH po nazwach modeli, żeby ustalić,
// które platforma przyjmuje — i zostawiłem produkcję na `eleven_flash_v2_5`,
// modelu z najgorszym wynikiem. Zapisałem wtedy zasadę „sondowanie, które
// zapisuje, nie jest sondowaniem".
//
// 17.08 złamałem ją ponownie: sondując dozwolone wartości `turn_timeout`
// wysłałem PATCH z `-1`. API przyjęło i zapisało. Telefon w tym czasie
// nie dzwonił — ale mógł.
//
// ZASADA 32: błąd, w który wpadasz mimo wiedzy, że istnieje, nie jest błędem
// uwagi — jest brakiem kontroli. Uwaga nie skaluje się na drugie powtórzenie.
//
// Stąd ta funkcja. Każdy zapis wymaga JAWNEJ deklaracji `zamierzone: true`
// i powodu. Bez nich odmawia — nie da się „przypadkiem" zapisać, sondując.
//
//   import { zapiszKonfiguracje, sondujKonfiguracje } from "./elevenlabs-zapis.mjs";
//   await zapiszKonfiguracje({
//     zmiana: { conversation_config: { tts: { speed: 1.0 } } },
//     zamierzone: true,
//     powod: "cofniecie z 1.15 — multilingual sepleni przyspieszony",
//   });
// ============================================================================
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const AGENT = "agent_8301ky7ve28ee6jsb3h30h11354g";

for (const line of existsSync(join(ROOT, ".env.local")) ? readFileSync(join(ROOT, ".env.local"), "utf8").split("\n") : []) {
  const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const EL = process.env.ELEVENLABS_API_KEY;

const odczytaj = async (agent = AGENT) => {
  const r = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agent}`, { headers: { "xi-api-key": EL } });
  if (!r.ok) throw new Error(`odczyt agenta zwrócił ${r.status}`);
  return r.json();
};

/**
 * SONDOWANIE — wyłącznie ODCZYT. Nie wysyła żadnego zapisu.
 *
 * Gdy chcesz wiedzieć, jakie wartości pole przyjmuje, NIE wysyłaj PATCH-a
 * z wartością testową: API potrafi ją przyjąć i zapisać. Odczytaj obecną
 * wartość i sprawdź dokumentację albo zapytaj dostawcy.
 */
export async function sondujKonfiguracje(sciezka, agent = AGENT) {
  const cfg = await odczytaj(agent);
  return sciezka.split(".").reduce((o, k) => (o == null ? o : o[k]), cfg);
}

/**
 * ZAPIS. Wymaga jawnej zgody i powodu, weryfikuje przez ponowny odczyt.
 *
 * `zamierzone` musi być dosłownie `true`. Wartość domyślna nie istnieje
 * celowo — brak parametru to odmowa, a nie zapis.
 */
export async function zapiszKonfiguracje({ zmiana, zamierzone, powod, agent = AGENT, sprawdz }) {
  if (zamierzone !== true) {
    throw new Error(
      "ODMOWA ZAPISU: brak `zamierzone: true`.\n" +
      "Kod 200 z PATCH-a znaczy przyjalem zadanie, nie chciales tego.\n" +
      "Jeśli sondujesz dozwolone wartości — użyj sondujKonfiguracje() albo agenta testowego.",
    );
  }
  if (!powod || String(powod).trim().length < 10) {
    throw new Error("ODMOWA ZAPISU: `powod` jest obowiązkowy i ma opisywać, po co ta zmiana.");
  }
  if (!EL) throw new Error("BRAK ELEVENLABS_API_KEY — zatrzymuję się, nie obchodzę.");

  const przed = await odczytaj(agent);
  const r = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${agent}`, {
    method: "PATCH",
    headers: { "xi-api-key": EL, "Content-Type": "application/json" },
    body: JSON.stringify(zmiana),
  });
  if (!r.ok) throw new Error(`PATCH zwrócił ${r.status}: ${(await r.text()).slice(0, 300)}`);

  // WERYFIKACJA PRZEZ PONOWNY ODCZYT, nie po kodzie odpowiedzi.
  // `language_presets` przyjmowało zapis i przechowywało `null`.
  const po = await odczytaj(agent);
  const wynik = { powod, sprawdzone: null };
  if (sprawdz) {
    const oczekiwana = sprawdz.wartosc;
    const faktyczna = sprawdz.sciezka.split(".").reduce((o, k) => (o == null ? o : o[k]), po);
    wynik.sprawdzone = { sciezka: sprawdz.sciezka, oczekiwana, faktyczna, zgodne: JSON.stringify(faktyczna) === JSON.stringify(oczekiwana) };
    if (!wynik.sprawdzone.zgodne) {
      throw new Error(`ZAPIS NIE UTRZYMAŁ SIĘ: ${sprawdz.sciezka} = ${JSON.stringify(faktyczna)}, oczekiwano ${JSON.stringify(oczekiwana)}`);
    }
  }
  return { przed, po, ...wynik };
}

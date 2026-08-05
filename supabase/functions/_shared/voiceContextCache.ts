// Cache kontekstu rozmowy w pamięci IZOLATU.
//
// Każda tura czyta te same dane: konfigurację agenta, personę, aktywne reguły
// wiedzy i kontekst firmy. Zmieniają się raz na tydzień, a odpytujemy je przy
// każdej turze — dziewięć razy na rozmowę.
//
// OGRANICZENIE, o którym trzeba pamiętać przy interpretacji pomiarów: izolaty są
// krótkotrwałe i KAŻDA TURA zwykle ląduje na innym (pomiar 05.08: 40 unikalnych
// izolatów w 10 minut). Trafienie zdarza się więc tylko wtedy, gdy dwie tury
// trafią na ten sam izolat. Dlatego logujemy hit/miss — bez tego nie da się
// odróżnić "cache działa słabo" od "cache nie działa wcale".
//
// Docelowo znika: FAZA 1B przynosi ten kontekst w dynamic_variables webhooka
// inicjującego i tura nie dotyka bazy w ogóle. Ten moduł jest mostem do tego
// czasu i siatką bezpieczeństwa, gdyby webhook padł.

type Entry = { value: unknown; expires: number };
const store = new Map<string, Entry>();

const DEFAULT_TTL_MS = 5 * 60_000;

export const cachedContext = async <T>(
  key: string,
  load: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS,
): Promise<T> => {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) {
    console.info("[voiceContextCache]", JSON.stringify({ event: "cache", result: "hit", key }));
    return hit.value as T;
  }
  const value = await load();
  store.set(key, { value, expires: now + ttlMs });
  console.info("[voiceContextCache]", JSON.stringify({ event: "cache", result: "miss", key }));
  return value;
};

// Wyłącznie na potrzeby testów — izolaty i tak nie żyją długo.
export const clearContextCache = () => store.clear();

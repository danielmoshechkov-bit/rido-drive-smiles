// ============================================================================
// voiceRegiony.ts — Z KTÓREJ STREFY KUPIĆ NUMER DLA TEGO WARSZTATU.
//
// Numer warszawski dla warsztatu z Gdańska wygląda w oczach klienta jak obca
// firma. Wszystkie 49 polskich stref ma wolne numery (sprawdzone 16.08:
// od 809 w Poznaniu do kilkunastu w najmniejszych), więc dopasowanie jest
// wykonalne prawie zawsze — problemem nie jest dostępność, tylko to, że
// `company_city` u większości warsztatów jest puste.
//
// Funkcja jest CZYSTA: listę stref dostaje wstrzykniętą, bo pochodzi z API
// operatora i będzie się zmieniać. Dzięki temu dopasowanie da się sprawdzić
// bez sieci i bez kupowania numeru.
// ============================================================================

export interface Strefa {
  id: number;
  city: string;
  prefix: number;
}

export interface DopasowanieStrefy {
  strefaId: number | null;
  miasto: string | null;
  /** `miasto` | `kod_pocztowy` | `telefon` | `awaryjne` — trafia do logu. */
  droga: "miasto" | "telefon" | "awaryjne" | "brak";
}

/** Warszawa. Wyłącznie jako ostatnia deska ratunku i ZAWSZE z logiem. */
export const STREFA_AWARYJNA_PREFIKS = 22;

const bezOgonkow = (s: string) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l")
    .replace(/[^a-z]/g, "");

/**
 * Numer kierunkowy z polskiego numeru telefonu, jeśli da się go odczytać.
 *
 * Warsztaty podają najczęściej komórkę (`5xx`, `6xx`, `7xx`, `8xx` na starcie),
 * a te NIE MAJĄ kierunkowego strefowego — zwracamy wtedy null zamiast zgadywać.
 * Kierunkowe stacjonarne w Polsce to 12–89, dwucyfrowe.
 */
export function kierunkowyZTelefonu(telefon: unknown): number | null {
  let c = String(telefon ?? "").replace(/\D/g, "");
  if (!c) return null;
  if (c.startsWith("0048")) c = c.slice(4);
  else if (c.startsWith("48") && c.length > 9) c = c.slice(2);
  if (c.length !== 9) return null;
  // Komórka: pierwsza cyfra 4-8 i drugi znak taki, że nie tworzy kierunkowego.
  const dwie = Number(c.slice(0, 2));
  if (dwie < 12 || dwie > 89) return null;
  // 45-49, 50-53, 57, 60, 66, 69, 72, 73, 78, 79, 88 to zakresy komórkowe.
  const komorkowe = [45, 46, 47, 48, 49, 50, 51, 53, 57, 60, 66, 69, 72, 73, 78, 79, 88];
  if (komorkowe.includes(dwie)) return null;
  return dwie;
}

/**
 * Dopasowanie strefy do warsztatu.
 *
 * Kolejność jest podyktowana tym, co REALNIE mamy w bazie: `company_city`
 * jest puste u większości warsztatów, więc telefon stacjonarny bywa jedyną
 * wskazówką. Zgadywanie po kodzie pocztowym odpada — mapowanie kod → strefa
 * telefoniczna nie jest jednoznaczne i nie mamy takiej tablicy.
 */
export function dopasujStrefe(
  warsztat: { miasto?: string | null; telefon?: string | null },
  strefy: Strefa[],
): DopasowanieStrefy {
  if (!strefy?.length) return { strefaId: null, miasto: null, droga: "brak" };

  const miasto = bezOgonkow(warsztat.miasto ?? "");
  if (miasto) {
    const trafiona = strefy.find((s) => bezOgonkow(s.city) === miasto);
    if (trafiona) return { strefaId: trafiona.id, miasto: trafiona.city, droga: "miasto" };
  }

  const kier = kierunkowyZTelefonu(warsztat.telefon);
  if (kier != null) {
    const trafiona = strefy.find((s) => Number(s.prefix) === kier);
    if (trafiona) return { strefaId: trafiona.id, miasto: trafiona.city, droga: "telefon" };
  }

  const awaryjna = strefy.find((s) => Number(s.prefix) === STREFA_AWARYJNA_PREFIKS);
  return awaryjna
    ? { strefaId: awaryjna.id, miasto: awaryjna.city, droga: "awaryjne" }
    : { strefaId: strefy[0].id, miasto: strefy[0].city, droga: "awaryjne" };
}

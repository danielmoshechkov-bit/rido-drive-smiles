// ============================================================================
// voiceJezykRozmowy.ts — W JAKIM JĘZYKU IDZIE ROZMOWA I JAK PRZEROBIĆ SNAPSHOT.
//
// PO CO: snapshot powstaje RAZ, przy odebraniu połączenia, gdy nie wiemy jeszcze,
// w jakim języku rozmówca się odezwie. Gotowe formy („poniedziałek, siedemnastego
// sierpnia") są wtedy zawsze polskie. Gdy rozmowa przechodzi na rosyjski, agent
// dostaje rosyjski prompt i POLSKĄ datę — i wtrąca ją w środek rosyjskiego zdania.
//
// ZASADA NADRZĘDNA (mocniejsza niż jakakolwiek optymalizacja latencji):
// AGENT NIGDY NIE MIESZA JĘZYKÓW W JEDNEJ WYPOWIEDZI. Data, cena, godzina
// i nazwa dnia idą w języku rozmowy. Czego nie umiemy powiedzieć w danym
// języku — agent NIE MÓWI WCALE, zamiast wtrącać polski.
// Klient słyszący obce słowo w środku zdania traci zaufanie do całej rozmowy.
//
// JAK: snapshot niesie DANE SUROWE obok gotowych form — `dni[].data` to ISO,
// `cena.od`/`cena.do` to liczby. Renderujemy z nich formy w języku rozmowy
// i PODMIENIAMY pola polskie, nie dokładamy obok. Podmiana, nie dokładanie,
// jest tu istotą: gdyby polskie pole zostało, model mógłby po nie sięgnąć.
// ============================================================================
import { cenaDoWypowiedzeniaEn, czasDoWypowiedzeniaEn, doWypowiedzeniaEn, powodEn } from "./voiceSnapshotEn.ts";
import {
  cenaDoWypowiedzeniaSlow, czasDoWypowiedzeniaSlow, doWypowiedzeniaSlow, powodSlow, type JezykSlow,
} from "./voiceSnapshotSlow.ts";

export type JezykRozmowy = "pl" | "en" | "ru" | "uk";

/**
 * JĘZYK ROZMOWY Z OSTATNICH WYPOWIEDZI ROZMÓWCY.
 *
 * Patrzymy na TRZY ostatnie tury klienta, nie na jedną: pojedyncze „да" albo
 * „ok" nie może przestawić całej rozmowy. Domyślnie polski — przy niepewności
 * zostajemy przy nim, bo to jedyny język, w którym wszystko jest zmierzone.
 */
export const jezykRozmowy = (
  wiadomosci: Array<{ role?: string; content?: unknown }>,
): JezykRozmowy => {
  const klienta = wiadomosci
    .filter((m) => m?.role === "user" && typeof m.content === "string")
    .slice(-3)
    .map((m) => String(m.content))
    .join(" ");
  if (!klienta.trim()) return "pl";

  // Cyrylica: ukraiński ma і, ї, є, ґ; rosyjski ы, э, ъ. Gdy oba albo żaden —
  // rosyjski, bo jest częstszy wśród naszych klientów, a formy ukraińskie
  // w rosyjskim zdaniu brzmią gorzej niż odwrotnie.
  if (/[Ѐ-ӿ]/.test(klienta)) {
    const uk = (klienta.match(/[іїєґІЇЄҐ]/g) || []).length;
    const ru = (klienta.match(/[ыэъЫЭЪ]/g) || []).length;
    return uk > ru ? "uk" : "ru";
  }
  // Polskie znaki diakrytyczne rozstrzygają natychmiast.
  if (/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(klienta)) return "pl";
  // Bez diakrytyków: angielski tylko przy WYRAŹNYCH słowach funkcyjnych.
  // Sama łacinka to za mało — polski bywa transkrybowany bez ogonków.
  const ang = (klienta.match(/\b(the|and|you|your|can|could|would|please|thanks|thank|hello|hi|good|morning|need|want|have|is|are|do|does|my|for|with|about|when|what|how)\b/gi) || []).length;
  const pol = (klienta.match(/\b(dzien|dobry|prosze|chcialbym|chcialabym|jest|nie|tak|moze|czy|jak|kiedy|mam|auto|samochod|termin)\b/gi) || []).length;
  return ang >= 3 && ang > pol ? "en" : "pl";
};

/**
 * PODMIANA FORM W SNAPSHOCIE NA JĘZYK ROZMOWY.
 *
 * Zwraca snapshot jako tekst. Dla polskiego zwraca wejście BEZ ZMIANY — polski
 * jest jedynym językiem zmierzonym na produkcji i nie przepuszczamy go przez
 * żadną dodatkową ścieżkę.
 */
export const snapshotWJezyku = (surowy: string, jezyk: JezykRozmowy): string => {
  if (jezyk === "pl" || !surowy) return surowy;
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(surowy);
  } catch {
    // Uszkodzony snapshot nie może wywrócić tury — oddajemy wejście bez zmian.
    return surowy;
  }
  const slow: JezykSlow | null = jezyk === "ru" || jezyk === "uk" ? jezyk : null;
  const data = (iso: string) => (slow ? doWypowiedzeniaSlow(iso, slow) : doWypowiedzeniaEn(iso));
  const powod = (p: string) => (slow ? powodSlow(p, slow) : powodEn(p));
  const czas = (m: number) => (slow ? czasDoWypowiedzeniaSlow(m, slow) : czasDoWypowiedzeniaEn(m));
  const cena = (od: number, do_: number | null) =>
    slow ? cenaDoWypowiedzeniaSlow(od, do_, slow) : cenaDoWypowiedzeniaEn(od, do_);

  for (const d of (o.dni as Array<Record<string, unknown>>) || []) {
    if (typeof d.data === "string") d.do_wypowiedzenia = data(d.data);
    if (typeof d.powod === "string") d.powod = powod(d.powod);
    // Pola z innych języków znikają — w snapshocie ma zostać JEDEN język.
    for (const k of Object.keys(d)) if (/_(en|ru|uk)$/.test(k)) delete d[k];
  }
  for (const u of (o.uslugi as Array<Record<string, unknown>>) || []) {
    const c = u.cena as Record<string, unknown> | null;
    if (c && typeof c.od === "number") {
      c.do_powiedzenia = cena(c.od as number, typeof c.do === "number" ? (c.do as number) : null);
      for (const k of Object.keys(c)) if (/_(en|ru|uk)$/.test(k)) delete c[k];
    }
    if (u.czas_znany === true && typeof u.czas_blokady_min === "number") {
      u.czas_do_powiedzenia = czas(u.czas_blokady_min as number);
    }
    for (const k of Object.keys(u)) if (/_(en|ru|uk)$/.test(k)) delete u[k];
  }
  // Teksty ustawień są po polsku i NIE MAMY ich tłumaczeń. Zgodnie z zasadą
  // „czego nie umiemy powiedzieć, nie mówimy wcale" — usuwamy je, zamiast
  // pozwolić agentowi przeczytać polskie zdanie w rosyjskiej rozmowie.
  const ust = o.ustawienia as Record<string, unknown> | undefined;
  if (ust) delete ust.polityka_wyceny_tekst;
  return JSON.stringify(o);
};

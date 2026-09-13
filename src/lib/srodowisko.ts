/**
 * CZY TO PRODUKCJA — JEDNO MIEJSCE, KTÓRE O TYM DECYDUJE.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PO CO
 * ═══════════════════════════════════════════════════════════════════════════
 * Piksel i analityka nie mogą wysyłać niczego z serwera deweloperskiego ani
 * z podglądu. Zaśmiecone dane to nie jest usterka, którą się naprawia — nie
 * da się ich odróżnić po fakcie od prawdziwego ruchu i zostają w koncie na
 * zawsze.
 *
 * To ten sam problem co „testowy numer KSeF na fakturze": narzędzie działa,
 * tylko liczy nie to, co trzeba.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DLACZEGO NAZWA HOSTA, A NIE `import.meta.env.PROD`
 * ═══════════════════════════════════════════════════════════════════════════
 * `PROD` jest prawdziwe w KAŻDYM budowaniu produkcyjnym — także w `npm run
 * preview` na localhoście i w podglądzie Lovable. Nazwa hosta mówi, gdzie kod
 * NAPRAWDĘ stoi, a to jest pytanie, które tu zadajemy.
 */

/** Domeny, z których wolno raportować. Nic poza nimi nie wysyła. */
const DOMENY_PRODUKCYJNE = ["getrido.pl", "www.getrido.pl"];

export function czyProdukcja(): boolean {
  if (typeof window === "undefined") return false;
  return DOMENY_PRODUKCYJNE.includes(window.location.hostname);
}

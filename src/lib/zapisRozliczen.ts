/**
 * Zapis, który nie kłamie.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POWÓD (14.09.2026)
 * ═══════════════════════════════════════════════════════════════════════════
 * Kasowanie ustawień miasta pokazywało „Usunięto", a wiersz zostawał na liście.
 * Zapis drugiego miasta meldował „zapisano", a lista dalej miała jedno.
 *
 * Przyczyna nie była w panelu, tylko w RLS: polityka FILTRUJE wiersze, więc
 * `UPDATE` i `DELETE` bez uprawnień kończą się BEZ BŁĘDU, dotykając zera
 * wierszy. Kod sprawdzający wyłącznie `error` widzi wtedy sukces.
 *
 * Dlatego każda mutacja w module rozliczeń przechodzi tędy: dokładamy
 * `.select(...)`, liczymy zwrócone wiersze i mówimy prawdę, gdy jest ich zero.
 *
 * Uwaga przy INSERT: `Prefer: return=representation` (czyli `.select()` po
 * `.insert()`) podlega politykom SELECT, nie INSERT. Zapis może przejść,
 * a odczyt zaraz po nim wywrócić się na 42501 — komunikat mówi wtedy
 * o odczycie, nie o zapisie, i tak też go tu opisujemy.
 */

export interface WynikZapisu<T> {
  wiersze: T[];
  ile: number;
}

export class BladZapisu extends Error {
  readonly kod?: string;
  constructor(wiadomosc: string, kod?: string) {
    super(wiadomosc);
    this.name = 'BladZapisu';
    this.kod = kod;
  }
}

type OdpowiedzSupabase<T> = { data: T[] | null; error: { message: string; code?: string } | null };

/**
 * Wykonuje mutację i upiera się przy dowodzie, że coś się zmieniło.
 *
 * @param zapytanie łańcuch Supabase zakończony `.select(...)` — bez tego baza
 *                  nie odsyła wierszy i nie ma czego policzyć.
 * @param co        nazwa operacji do komunikatu („Zapis ustawień Warszawy").
 */
export async function wykonajZapis<T>(
  zapytanie: PromiseLike<OdpowiedzSupabase<T>>,
  co: string,
): Promise<WynikZapisu<T>> {
  const { data, error } = await zapytanie;

  if (error) {
    const kod = (error as any)?.code;
    // 42501 / „row-level security policy" to zawsze brak uprawnień, nie awaria.
    const czyRls = kod === '42501' || /row-level security/i.test(error.message || '');
    throw new BladZapisu(
      czyRls
        ? `${co}: brak uprawnień do danych tej floty (RLS). Zmiana NIE została zapisana.`
        : `${co}: ${error.message}`,
      kod,
    );
  }

  const wiersze = data ?? [];
  if (wiersze.length === 0) {
    throw new BladZapisu(
      `${co}: baza nie zmieniła żadnego wiersza. Najczęściej znaczy to brak uprawnień (RLS) ` +
        `albo że wiersz zniknął w międzyczasie. Zmiana NIE została zapisana.`,
    );
  }

  return { wiersze, ile: wiersze.length };
}

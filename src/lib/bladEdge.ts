/**
 * Prawdziwy powód odmowy z funkcji brzegowej.
 *
 * `supabase.functions.invoke` przy odpowiedzi innej niż 2xx rzuca błąd
 * z komunikatem „Edge Function returned a non-2xx status code" — i tyle widzi
 * użytkownik. Tymczasem serwer napisał w treści odpowiedzi, o co dokładnie
 * chodzi: „Wykorzystano pulę 5 wiadomości próbnych", „Brak pakietu SMS",
 * „Wiadomość zawiera treść, której nie wyślemy".
 *
 * Warsztat widział więc komunikat, z którym nie może zrobić NIC — ani zrozumieć,
 * ani naprawić. Ta funkcja wyciąga treść z odpowiedzi i podaje ją dalej.
 */
export async function powodBleduFunkcji(blad: unknown, zapasowy = 'Nieznany błąd'): Promise<string> {
  const kontekst = (blad as { context?: unknown })?.context;

  // FunctionsHttpError trzyma pod `context` oryginalną odpowiedź HTTP.
  if (kontekst instanceof Response) {
    try {
      const tresc = await kontekst.clone().text();
      try {
        const json = JSON.parse(tresc);
        const komunikat = json?.message || json?.error;
        if (komunikat) return String(komunikat);
      } catch {
        // Odpowiedź nie jest JSON-em — bierzemy ją jak stoi, byle nie pustą.
      }
      if (tresc.trim()) return tresc.trim().slice(0, 300);
    } catch {
      // Treści nie da się odczytać — zostaje komunikat oryginalny.
    }
  }

  const wiadomosc = (blad as { message?: string })?.message;
  return wiadomosc || zapasowy;
}

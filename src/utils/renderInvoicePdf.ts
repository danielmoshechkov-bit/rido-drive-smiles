// Render faktury/dokumentu (HTML) -> base64 PDF przez WŁASNY serwerowy endpoint
// (public/invoice-pdf.php, Dompdf na LH.pl). Ten sam plik dla "Pobierz" i "Wyślij mailem".
// Zwraca null gdy endpoint niedostępny (np. dev / błąd) -> wołający robi fallback
// (druk przeglądarki / html2canvas). Bez zewnętrznych usług, bez opłat.
export async function renderInvoicePdf(html: string): Promise<string | null> {
  try {
    const res = await fetch('/invoice-pdf.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ html }),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return (data && typeof data.pdf_base64 === 'string') ? data.pdf_base64 : null;
  } catch {
    return null;
  }
}

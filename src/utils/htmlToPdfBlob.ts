// Awaryjne generowanie PDF-u po stronie przeglądarki.
//
// Normalnie dokumenty renderuje serwerowy Dompdf (public/invoice-pdf.php). Gdy jest
// niedostępny (dev bez PHP, chwilowy błąd), przycisk „Pobierz PDF" nie może kończyć
// się otwarciem okna wydruku — użytkownik prosił o plik, więc plik ma dostać.
// Robimy zrzut dokumentu w ramce o szerokości A4 i składamy z niego strony PDF.

const A4_WIDTH_PX = 794;   // 210 mm przy 96 dpi
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

/** Renderuje pełny dokument HTML do PDF-a. Zwraca null, gdy się nie uda. */
export async function htmlToPdfBlob(html: string): Promise<Blob | null> {
  let frame: HTMLIFrameElement | null = null;
  try {
    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ]);

    frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.left = '-10000px';
    frame.style.top = '0';
    frame.style.width = `${A4_WIDTH_PX}px`;
    frame.style.height = '1200px';
    frame.style.border = '0';
    frame.srcdoc = html;
    document.body.appendChild(frame);

    const doc = await new Promise<Document | null>((resolve) => {
      const done = () => resolve(frame?.contentDocument ?? null);
      frame!.onload = () => setTimeout(done, 350); // czas na logo i czcionki
      setTimeout(done, 4000);                      // twardy limit, żeby nie wisieć
    });
    if (!doc?.body) return null;

    const canvas = await html2canvas(doc.body, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      windowWidth: A4_WIDTH_PX,
      width: A4_WIDTH_PX,
    });

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const pageHeightPx = Math.floor((canvas.width * A4_HEIGHT_MM) / A4_WIDTH_MM);
    const pages = Math.max(1, Math.ceil(canvas.height / pageHeightPx));

    for (let page = 0; page < pages; page++) {
      const sliceHeight = Math.min(pageHeightPx, canvas.height - page * pageHeightPx);
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = sliceHeight;
      const ctx = slice.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, page * pageHeightPx, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);

      const sliceHeightMm = (sliceHeight * A4_WIDTH_MM) / canvas.width;
      if (page > 0) pdf.addPage();
      pdf.addImage(slice.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, A4_WIDTH_MM, sliceHeightMm);
    }

    return pdf.output('blob');
  } catch {
    return null;
  } finally {
    frame?.remove();
  }
}

const PDF_MARGIN_MM = 10;
const RENDER_SCALE = 2;
const MAX_RENDER_PIXELS = 60_000_000;
const MAX_PDF_PAGES = 100;

function safePdfFilename(filename: string): string {
  const normalized = filename.trim().replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 180);
  if (!normalized) return 'document.pdf';
  return normalized.toLowerCase().endsWith('.pdf') ? normalized : `${normalized}.pdf`;
}

/**
 * Eksportuje wyłącznie już zsanityzowany element DOM. Limit pikseli i stron
 * chroni kartę przeglądarki przed niekontrolowanym zużyciem pamięci.
 */
export async function exportElementToPdf(element: HTMLElement, filename: string): Promise<void> {
  const sourceWidth = Math.max(1, element.scrollWidth, element.clientWidth);
  const sourceHeight = Math.max(1, element.scrollHeight, element.clientHeight);
  const estimatedPixels = sourceWidth * sourceHeight * RENDER_SCALE * RENDER_SCALE;
  if (!Number.isSafeInteger(estimatedPixels) || estimatedPixels > MAX_RENDER_PIXELS) {
    throw new Error('PDF_RENDER_LIMIT_EXCEEDED');
  }

  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);
  const canvas = await html2canvas(element, {
    scale: RENDER_SCALE,
    backgroundColor: '#ffffff',
    logging: false,
    useCORS: false,
  });
  if (!canvas.width || !canvas.height || canvas.width * canvas.height > MAX_RENDER_PIXELS) {
    canvas.width = 0;
    canvas.height = 0;
    throw new Error('PDF_RENDER_LIMIT_EXCEEDED');
  }

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const contentWidthMm = pageWidth - PDF_MARGIN_MM * 2;
  const contentHeightMm = pageHeight - PDF_MARGIN_MM * 2;
  const pixelsPerMm = canvas.width / contentWidthMm;
  const sliceHeightPx = Math.max(1, Math.floor(contentHeightMm * pixelsPerMm));
  const pageCount = Math.ceil(canvas.height / sliceHeightPx);
  if (pageCount > MAX_PDF_PAGES) {
    canvas.width = 0;
    canvas.height = 0;
    throw new Error('PDF_PAGE_LIMIT_EXCEEDED');
  }

  for (let page = 0; page < pageCount; page += 1) {
    const sourceY = page * sliceHeightPx;
    const currentSliceHeight = Math.min(sliceHeightPx, canvas.height - sourceY);
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = canvas.width;
    pageCanvas.height = currentSliceHeight;
    const context = pageCanvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('PDF_CANVAS_UNAVAILABLE');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    context.drawImage(
      canvas,
      0,
      sourceY,
      canvas.width,
      currentSliceHeight,
      0,
      0,
      canvas.width,
      currentSliceHeight,
    );
    if (page > 0) pdf.addPage('a4', 'portrait');
    pdf.addImage(
      pageCanvas.toDataURL('image/png'),
      'PNG',
      PDF_MARGIN_MM,
      PDF_MARGIN_MM,
      contentWidthMm,
      currentSliceHeight / pixelsPerMm,
      undefined,
      'FAST',
    );
    pageCanvas.width = 0;
    pageCanvas.height = 0;
  }

  canvas.width = 0;
  canvas.height = 0;
  pdf.save(safePdfFilename(filename));
}

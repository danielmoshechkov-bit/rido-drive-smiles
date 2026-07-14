import { supabase } from '@/integrations/supabase/client';
import { generateInvoiceHtml, InvoiceData } from './invoiceHtmlGenerator';
import { renderInvoicePdf } from './renderInvoicePdf';

// FREEZE PDF wysłanej faktury (FAZA 1 fix/faktury-mega).
// W momencie wysyłki do KSeF renderujemy PDF (ten sam Dompdf co „Pobierz"),
// wgrywamy do prywatnego bucketa invoice-pdfs/<user_id>/<invoice_id>.pdf
// i zapisujemy ścieżkę w user_invoices.pdf_url. Od tej chwili PDF wysłanej
// faktury jest serwowany WYŁĄCZNIE z tego pliku — nie zmieni go ani edycja
// danych firmy, ani przyszłe zmiany szablonu. Dokument = to co poszło do KSeF.
export const FROZEN_PDF_PREFIX = 'invoice-pdfs/';

export function isFrozenPdfUrl(pdfUrl?: string | null): boolean {
  return !!pdfUrl && pdfUrl.startsWith(FROZEN_PDF_PREFIX);
}

export async function freezeInvoicePdf(invoiceId: string, data: InvoiceData): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const html = generateInvoiceHtml(data);
    const base64 = await renderInvoicePdf(html);
    if (!base64) return null; // endpoint PDF niedostępny — faktura zostaje bez snapshotu (fallback: render na żywo)
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const path = `${user.id}/${invoiceId}.pdf`;
    const { error: upErr } = await supabase.storage
      .from('invoice-pdfs')
      .upload(path, new Blob([bytes], { type: 'application/pdf' }), { upsert: true, contentType: 'application/pdf' });
    if (upErr) {
      console.error('[freezeInvoicePdf] upload:', upErr.message);
      return null;
    }
    const stored = FROZEN_PDF_PREFIX + path;
    await supabase.from('user_invoices').update({ pdf_url: stored } as any).eq('id', invoiceId);
    return stored;
  } catch (e) {
    console.error('[freezeInvoicePdf]', e);
    return null;
  }
}

// Pobiera zamrożony PDF jako base64 (do pobrania/podglądu). null = brak snapshotu.
export async function downloadFrozenPdf(pdfUrl?: string | null): Promise<string | null> {
  if (!isFrozenPdfUrl(pdfUrl)) return null;
  const path = pdfUrl!.slice(FROZEN_PDF_PREFIX.length);
  const { data, error } = await supabase.storage.from('invoice-pdfs').download(path);
  if (error || !data) return null;
  const buf = new Uint8Array(await data.arrayBuffer());
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) bin += String.fromCharCode(...buf.subarray(i, i + chunk));
  return btoa(bin);
}

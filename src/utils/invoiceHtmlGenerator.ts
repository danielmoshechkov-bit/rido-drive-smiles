/**
 * Generator HTML faktury — WIDOK DLA FRONTU.
 *
 * Sam szablon przeniósł się do `supabase/functions/_shared/invoiceHtml.ts`,
 * bo faktura musi powstawać także po stronie serwera: po opłaconym zakupie
 * wystawia ją funkcja brzegowa i wysyła mailem, a tam nie ma przeglądarki.
 * Dwie kopie szablonu rozjechałyby się przy pierwszej zmianie wyglądu — i nikt
 * by tego nie zauważył, dopóki klient nie porównałby dwóch swoich dokumentów.
 *
 * Ten plik zostaje, żeby dwadzieścia miejsc w interfejsie importowało jak
 * dotąd. Nic w wyglądzie faktury się nie zmieniło: sprawdzone odciskiem
 * SHA-256 wygenerowanego HTML-a przed przeniesieniem i po nim — ten sam
 * skrót, ta sama długość co do znaku.
 *
 * Zostają tu WYŁĄCZNIE funkcje drukujące, bo to jedyne, które dotykały
 * `window` i `document`. Drukowanie jest czynnością przeglądarki i na
 * serwerze nie znaczyłoby nic.
 */
export * from '../../supabase/functions/_shared/invoiceHtml';

import type { InvoiceData } from '../../supabase/functions/_shared/invoiceHtml';
import { generateInvoiceHtml } from '../../supabase/functions/_shared/invoiceHtml';

export const printHtmlDocument = (html: string): void => {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();

  const startedAt = Date.now();
  const waitForAssetsAndPrint = () => {
    const qrImages = printWindow.document.querySelectorAll('img.ksef-qr');

    if (qrImages.length === 0) {
      setTimeout(() => printWindow.print(), 250);
      return;
    }

    const allReady = Array.from(qrImages).every((img) => (img as HTMLImageElement).complete);
    if (allReady || Date.now() - startedAt > 3000) {
      setTimeout(() => printWindow.print(), 100);
      return;
    }

    setTimeout(waitForAssetsAndPrint, 150);
  };

  setTimeout(waitForAssetsAndPrint, 150);
};

export const printInvoice = (invoice: InvoiceData): void => {
  const html = generateInvoiceHtml(invoice);
  printHtmlDocument(html);
};

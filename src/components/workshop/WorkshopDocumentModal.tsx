import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download, Loader2, Printer } from 'lucide-react';
import { renderInvoicePdf } from '@/utils/renderInvoicePdf';
import { PdfCanvasPreview } from '@/components/invoices/PdfCanvasPreview';
import { toast } from 'sonner';

/**
 * Okno gotowego dokumentu warsztatowego (protokół przyjęcia i pokrewne).
 *
 * Kosztorys i potwierdzenie wykonania jadą przez `InvoicePreviewModal`, bo są
 * tabelą pozycji z kwotami i składa je generator faktur. Protokół przyjęcia ma
 * własny układ — dostaje więc okno, które przyjmuje GOTOWY HTML i daje przy nim
 * dokładnie te same trzy czynności: podgląd, pobranie i wydruk.
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Gotowy dokument (pełny HTML). */
  html: string;
  tytul: string;
  /** Nazwa pobieranego pliku, bez rozszerzenia. */
  nazwaPliku: string;
  /** Czynność wykonana sama po otwarciu — dla pozycji menu „Drukuj"/„Pobierz". */
  autoAkcja?: 'print' | 'download';
}

export function WorkshopDocumentModal({ open, onOpenChange, html, tytul, nazwaPliku, autoAkcja }: Props) {
  const [pdfBase64, setPdfBase64] = useState<string | null>(null);
  const [ladowanie, setLadowanie] = useState(false);
  const [pobieranie, setPobieranie] = useState(false);
  const ramkaRef = useRef<HTMLIFrameElement>(null);
  const [wysokoscRamki, setWysokoscRamki] = useState(1120);

  // Podgląd = ten sam plik, który wychodzi z „Pobierz PDF". Gdy serwerowy
  // generator jest niedostępny, zostaje podgląd HTML w ramce.
  useEffect(() => {
    if (!open) return;
    let przerwane = false;
    setLadowanie(true);
    setPdfBase64(null);
    (async () => {
      try {
        const base64 = await renderInvoicePdf(html);
        if (!przerwane && base64) setPdfBase64(base64);
      } catch {
        /* zostaje podgląd HTML */
      } finally {
        if (!przerwane) setLadowanie(false);
      }
    })();
    return () => { przerwane = true; };
  }, [open, html]);

  const drukuj = () => {
    const ramka = document.createElement('iframe');
    ramka.style.position = 'fixed';
    ramka.style.right = '0';
    ramka.style.bottom = '0';
    ramka.style.width = '0';
    ramka.style.height = '0';
    ramka.style.border = '0';
    ramka.srcdoc = html;
    ramka.onload = () => {
      const okno = ramka.contentWindow;
      if (!okno) return;
      okno.focus();
      // Chwila na zdjęcia i czcionki — bez tego drukarka dostaje pusty nagłówek.
      setTimeout(() => {
        okno.print();
        setTimeout(() => ramka.remove(), 1000);
      }, 350);
    };
    document.body.appendChild(ramka);
  };

  const pobierz = async () => {
    setPobieranie(true);
    try {
      const base64 = pdfBase64 || (await renderInvoicePdf(html));
      if (!base64) {
        // „Pobierz" ma pobrać plik, a nie zaskoczyć oknem drukarki — od tego
        // jest przycisk obok. Mówimy wprost, co się nie udało.
        toast.error('Nie udało się wygenerować PDF-a. Wybierz „Drukuj" i tam „Zapisz jako PDF".');
        return;
      }
      const bajty = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bajty], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${nazwaPliku}.pdf`.replace(/\//g, '-');
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setPobieranie(false);
    }
  };

  // Czekamy na koniec renderu podglądu, żeby pobranie wzięło gotowy plik
  // zamiast renderować dokument po raz drugi.
  const bylLadowany = useRef(false);
  const autoWykonane = useRef(false);
  useEffect(() => {
    if (!open) { bylLadowany.current = false; autoWykonane.current = false; return; }
    if (ladowanie) { bylLadowany.current = true; return; }
    if (!autoAkcja || !bylLadowany.current || autoWykonane.current) return;
    autoWykonane.current = true;
    void (autoAkcja === 'print' ? drukuj() : pobierz());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ladowanie, autoAkcja]);

  const dopasujWysokosc = () => {
    const ramka = ramkaRef.current;
    if (!ramka) return;
    const zmierz = () => {
      try {
        const dok = ramka.contentDocument;
        const h = Math.max(dok?.body?.scrollHeight || 0, dok?.documentElement?.scrollHeight || 0, 1120);
        setWysokoscRamki(h + 20);
      } catch { /* inny origin — zostaje wartość domyślna */ }
    };
    zmierz();
    setTimeout(zmierz, 300);
    setTimeout(zmierz, 900);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[96vw] h-[92vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-4 md:px-6 py-3 border-b shrink-0">
          <DialogTitle className="text-base">{tytul}</DialogTitle>
        </DialogHeader>

        <div className="flex items-center gap-1.5 px-3 md:px-6 py-2 border-b bg-muted/30 shrink-0">
          <Button variant="outline" size="sm" className="text-xs px-2 md:px-3 h-8" onClick={() => onOpenChange(false)}>
            <ArrowLeft className="h-3 w-3 mr-1" /> <span className="hidden sm:inline">Zamknij</span>
          </Button>
          <Button variant="default" size="sm" className="text-xs px-2 md:px-3 h-8" onClick={pobierz} disabled={pobieranie}>
            {pobieranie ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Download className="h-3 w-3 mr-1" />}
            Pobierz PDF
          </Button>
          <Button variant="outline" size="sm" className="text-xs px-2 md:px-3 h-8" onClick={drukuj}>
            <Printer className="h-3 w-3 mr-1" /> Drukuj
          </Button>
        </div>

        <div className="flex-1 overflow-hidden bg-muted/50 p-2 md:p-4">
          {ladowanie ? (
            <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Generowanie podglądu…
            </div>
          ) : pdfBase64 ? (
            <PdfCanvasPreview base64={pdfBase64} />
          ) : (
            <div className="h-full overflow-y-auto overflow-x-hidden">
              <div className="mx-auto bg-white shadow-xl rounded-lg w-full">
                <iframe
                  ref={ramkaRef}
                  className="w-full border-0 block"
                  style={{ height: `${wysokoscRamki}px`, overflow: 'hidden' }}
                  title={tytul}
                  sandbox="allow-same-origin"
                  scrolling="no"
                  onLoad={dopasujWysokosc}
                  srcDoc={open ? html : ''}
                />
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

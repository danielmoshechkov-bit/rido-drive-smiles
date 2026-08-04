import { useState, useRef, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Download, 
  Send, 
  ArrowLeft,
  Mail,
  Loader2,
  Save,
  Printer
} from 'lucide-react';
import { InvoiceData, generateInvoiceHtml } from '@/utils/invoiceHtmlGenerator';
import { renderInvoicePdf } from '@/utils/renderInvoicePdf';
import { PdfCanvasPreview } from './PdfCanvasPreview';
import { sanitizeIsolatedPreviewHtml } from '@/security/htmlSanitizer';

// Zamień URL logo sprzedawcy na data-URI, żeby render PDF nie zależał od plików na serwerze.
async function withEmbeddedLogo(inv: InvoiceData): Promise<InvoiceData> {
  const url = inv?.seller?.logo_url;
  if (!url || !/^https?:\/\//.test(url)) return inv;
  try {
    const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) return inv;
    const blob = await res.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
    return { ...inv, seller: { ...inv.seller, logo_url: dataUrl } };
  } catch {
    return inv;
  }
}
import { AuthModal } from '@/components/auth/AuthModal';
import { toast } from 'sonner';

interface InvoicePreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceData: InvoiceData;
  isLoggedIn: boolean;
  onSave?: () => Promise<void>;
  onSend?: (email: string) => Promise<void>;
  invoiceIssued?: boolean; // If true, invoice is already saved
  /** FREEZE: gotowy base64 zamrożonego PDF (faktura wysłana do KSeF) —
      podgląd i przycisk „PDF" używają tego pliku zamiast renderować na nowo. */
  frozenPdfBase64?: string;
  /**
   * 'document' = dokument do wydania klientowi na miejscu (np. potwierdzenie wykonania
   * usługi): zostają tylko „Pobierz PDF" i „Drukuj", bez zapisu i wysyłki mailem.
   */
  mode?: 'invoice' | 'document';
  /** Nagłówek okna zamiast „Podgląd" (np. „Potwierdzenie wykonania usługi"). */
  titleLabel?: string;
}

export function InvoicePreviewModal({
  open,
  onOpenChange,
  invoiceData,
  isLoggedIn,
  onSave,
  onSend,
  invoiceIssued = false,
  frozenPdfBase64,
  mode = 'invoice',
  titleLabel
}: InvoicePreviewModalProps) {
  const isDocumentMode = mode === 'document';
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [pendingAction, setPendingAction] = useState<'save' | 'send' | null>(null);
  const [iframeHeight, setIframeHeight] = useState(1120);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Podgląd = ten sam PDF co pobranie/mail (render przez endpoint Dompdf, pokazany
  // przez pdf.js na canvas). Gdy endpoint niedostępny (np. dev bez PHP) → podgląd HTML.
  const [previewPdfBase64, setPreviewPdfBase64] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const safePreviewHtml = useMemo(
    () => sanitizeIsolatedPreviewHtml(open ? generateInvoiceHtml(invoiceData) : ''),
    [open, invoiceData],
  );

  const syncIframeHeight = () => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const measure = () => {
      try {
        const doc = iframe.contentDocument;
        const bodyHeight = doc?.body?.scrollHeight || 0;
        const htmlHeight = doc?.documentElement?.scrollHeight || 0;
        const nextHeight = Math.max(bodyHeight, htmlHeight, 1120);
        setIframeHeight(nextHeight + 20); // small buffer to avoid scrollbar
      } catch (error) {
        console.error('Could not sync invoice preview height:', error);
      }
    };

    // Measure multiple times to catch late-rendering content (images, fonts)
    measure();
    setTimeout(measure, 300);
    setTimeout(measure, 800);
    setTimeout(measure, 1500);
  };

  useEffect(() => {
    if (open) {
      setIframeHeight(1120);
    }
  }, [open, invoiceData]);

  // Po otwarciu: wyrenderuj PDF przez endpoint (ten sam plik co „PDF"/„Email").
  // Podgląd pokazuje realny PDF, więc jest 1:1 z pobranym/wysłanym. base64 zostaje
  // zapamiętany — przycisk „PDF" pobiera go bez ponownego renderu (i bez fallbacku).
  useEffect(() => {
    if (!open) return;
    // FREEZE: wysłana faktura ze snapshotem — pokaż zamrożony plik, bez renderu.
    if (frozenPdfBase64) {
      setPreviewPdfBase64(frozenPdfBase64);
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewPdfBase64(null);
    (async () => {
      try {
        const data = await withEmbeddedLogo(invoiceData);
        const html = generateInvoiceHtml(data);
        const base64 = await renderInvoicePdf(html);
        if (cancelled) return;
        if (base64) setPreviewPdfBase64(base64);
      } catch {
        /* endpoint niedostępny → zostaje podgląd HTML */
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, invoiceData]);

  // Drukowanie prosto z podglądu: dokument ląduje w ukrytej ramce i od razu idzie
  // do okna wydruku — bez otwierania osobnej karty z surowym HTML-em.
  const handlePrint = async () => {
    const data = await withEmbeddedLogo(invoiceData);
    const html = generateInvoiceHtml(data);
    const frame = document.createElement('iframe');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '0';
    frame.style.height = '0';
    frame.style.border = '0';
    frame.srcdoc = html;
    frame.onload = () => {
      const win = frame.contentWindow;
      if (!win) return;
      win.focus();
      // Odrobina czasu na logo i czcionki, inaczej drukarka dostaje pusty nagłówek.
      setTimeout(() => {
        win.print();
        setTimeout(() => frame.remove(), 1000);
      }, 350);
    };
    document.body.appendChild(frame);
  };

  const saveBlob = (blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(invoiceData as any).invoice_number || (isDocumentMode ? 'Dokument' : 'Faktura')}.pdf`.replace(/\//g, '-');
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDownloadPdf = async () => {
    setIsDownloading(true);
    try {
      // Jeśli podgląd już wyrenderował PDF — pobierz dokładnie ten sam plik.
      let base64 = previewPdfBase64;
      let html = '';
      if (!base64) {
        // Osadź logo sprzedawcy jako data-URI — render niezależny od plików na serwerze
        // (tak samo jak maskotka). Gdy brak/niedostępne → generator pokaże ostylowany box.
        const data = await withEmbeddedLogo(invoiceData);
        html = generateInvoiceHtml(data);
        // Serwerowy render (ten sam co mail) → „Pobierz" i „Wyślij" identyczne.
        base64 = await renderInvoicePdf(html);
      }
      if (base64) {
        const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        saveBlob(new Blob([bytes], { type: 'application/pdf' }));
        return;
      }
      // Serwerowy generator niedostępny (np. lokalny dev bez PHP). Nie składamy
      // wtedy PDF-a z obrazka — wychodził dokument INNY niż podgląd. Zamiast tego
      // ten sam dokument idzie do okna wydruku, gdzie „Zapisz jako PDF" daje plik
      // wyrenderowany przez samą przeglądarkę, czyli 1:1 z podglądem.
      toast.info('Generator PDF niedostępny — wybierz „Zapisz jako PDF" w oknie wydruku');
      await handlePrint();
    } finally {
      setIsDownloading(false);
    }
  };

  const handleSaveClick = async () => {
    if (!isLoggedIn) {
      setPendingAction('save');
      setShowAuthModal(true);
      return;
    }
    
    if (onSave) {
      setIsSaving(true);
      try {
        await onSave();
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleSendClick = () => {
    if (!isLoggedIn) {
      setPendingAction('send');
      setShowAuthModal(true);
      return;
    }
    setShowEmailDialog(true);
  };

  const handleSendEmail = async () => {
    if (!email || !onSend) return;
    
    setIsSending(true);
    try {
      await onSend(email);
      setShowEmailDialog(false);
      setEmail('');
    } finally {
      setIsSending(false);
    }
  };

  const handleAuthSuccess = () => {
    setShowAuthModal(false);
    if (pendingAction === 'save') {
      handleSaveClick();
    } else if (pendingAction === 'send') {
      setShowEmailDialog(true);
    }
    setPendingAction(null);
  };

  const grossTotal = invoiceData.items.reduce((sum, item) => sum + item.gross_amount, 0);
  const currency = invoiceData.currency || 'PLN';

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl w-full h-[95vh] md:h-[95vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="px-4 md:px-6 pt-4 pb-3 border-b shrink-0">
            <DialogTitle className="text-base md:text-lg">
              {titleLabel || (invoiceIssued ? '✅ Faktura wystawiona' : 'Podgląd')}: {invoiceData.invoice_number}
            </DialogTitle>
          </DialogHeader>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 px-3 md:px-6 py-2 border-b bg-muted/30 shrink-0">
            <Button variant="outline" size="sm" className="text-xs px-2 md:px-3 h-8" onClick={() => onOpenChange(false)}>
              <ArrowLeft className="h-3 w-3 mr-1" />
              <span className="hidden sm:inline">{isDocumentMode || invoiceIssued ? 'Zamknij' : 'Wróć'}</span>
            </Button>
            {/* Only show Save button if invoice is not already issued */}
            {!isDocumentMode && !invoiceIssued && onSave && (
              <Button 
                variant="outline" 
                size="sm"
                className="text-xs px-2 md:px-3 h-8"
                onClick={handleSaveClick}
                disabled={isSaving}
              >
                {isSaving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>
                    <Save className="h-3 w-3 mr-1" />
                    <span className="hidden sm:inline">Zapisz</span>
                  </>
                )}
              </Button>
            )}
            <Button variant="default" size="sm" className="text-xs px-2 md:px-3 h-8" onClick={handleDownloadPdf} disabled={isDownloading}>
              {isDownloading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Download className="h-3 w-3 mr-1" />}
              {isDocumentMode ? 'Pobierz PDF' : 'PDF'}
            </Button>
            {isDocumentMode ? (
              <Button variant="outline" size="sm" className="text-xs px-2 md:px-3 h-8" onClick={handlePrint}>
                <Printer className="h-3 w-3 mr-1" />
                Drukuj
              </Button>
            ) : (
              <Button 
                variant="outline" 
                size="sm"
                className="text-xs px-2 md:px-3 h-8"
                onClick={handleSendClick}
                disabled={isSending}
              >
                <Send className="h-3 w-3 mr-1" />
                <span className="hidden sm:inline">Email</span>
              </Button>
            )}
          </div>

          {/* Email dialog */}
          {showEmailDialog && (
            <div className="px-4 md:px-6 py-3 bg-primary/5 border-b shrink-0">
              <div className="flex items-center gap-2 mb-2">
                <Mail className="h-4 w-4 text-primary" />
                <Label className="font-medium text-sm">Wyślij fakturę:</Label>
              </div>
              <div className="flex gap-2">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="adres@email.com"
                  className="flex-1 h-9"
                  autoFocus
                />
                <Button size="sm" onClick={handleSendEmail} disabled={isSending || !email}>
                  {isSending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Wyślij'
                  )}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setShowEmailDialog(false)}>
                  Anuluj
                </Button>
              </div>
            </div>
          )}

          {/* Podgląd = realny PDF z endpointu Dompdf (1:1 z „PDF"/„Email").
              Fallback (endpoint niedostępny, np. dev bez PHP): podgląd HTML. */}
          <div className="flex-1 overflow-hidden bg-muted/50 p-2 md:p-4">
            {previewLoading ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Generowanie podglądu…
              </div>
            ) : previewPdfBase64 ? (
              <PdfCanvasPreview base64={previewPdfBase64} />
            ) : (
              <div className="h-full overflow-y-auto overflow-x-hidden">
                <div className="mx-auto bg-white shadow-xl rounded-lg w-full">
                  <iframe
                    ref={iframeRef}
                    className="w-full border-0 block"
                    style={{ height: `${iframeHeight}px`, overflow: 'hidden' }}
                    title="Podgląd faktury"
                    sandbox=""
                    referrerPolicy="no-referrer"
                    scrolling="no"
                    onLoad={syncIframeHeight}
                    srcDoc={safePreviewHtml}
                  />
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AuthModal
        open={showAuthModal}
        onOpenChange={setShowAuthModal}
        initialMode="login"
        onSuccess={handleAuthSuccess}
        customDescription="Zaloguj się do całkowicie darmowego programu do faktur, aby zapisywać i wysyłać dokumenty. Twoje faktury będą bezpiecznie przechowywane na Twoim koncie."
      />
    </>
  );
}

import { useState, useRef, useEffect } from 'react';
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
  Save
} from 'lucide-react';
import { InvoiceData, generateInvoiceHtml } from '@/utils/invoiceHtmlGenerator';
import { renderInvoicePdf } from '@/utils/renderInvoicePdf';
import { PdfCanvasPreview } from './PdfCanvasPreview';

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

interface InvoicePreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceData: InvoiceData;
  isLoggedIn: boolean;
  onSave?: () => Promise<void>;
  onSend?: (email: string) => Promise<void>;
  invoiceIssued?: boolean; // If true, invoice is already saved
}

export function InvoicePreviewModal({
  open,
  onOpenChange,
  invoiceData,
  isLoggedIn,
  onSave,
  onSend,
  invoiceIssued = false
}: InvoicePreviewModalProps) {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingAction, setPendingAction] = useState<'save' | 'send' | null>(null);
  const [iframeHeight, setIframeHeight] = useState(1120);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Podgląd = ten sam PDF co pobranie/mail (render przez endpoint Dompdf, pokazany
  // przez pdf.js na canvas). Gdy endpoint niedostępny (np. dev bez PHP) → podgląd HTML.
  const [previewPdfBase64, setPreviewPdfBase64] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

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

  const handleDownloadPdf = async () => {
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
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(invoiceData as any).invoice_number || 'Faktura'}.pdf`.replace(/\//g, '-');
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    // Fallback: druk przeglądarki (jak dotychczas) — gdy renderer niedostępny.
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => { printWindow.print(); }, 250);
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
              {invoiceIssued ? '✅ Faktura wystawiona' : 'Podgląd'}: {invoiceData.invoice_number}
            </DialogTitle>
          </DialogHeader>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5 px-3 md:px-6 py-2 border-b bg-muted/30 shrink-0">
            <Button variant="outline" size="sm" className="text-xs px-2 md:px-3 h-8" onClick={() => onOpenChange(false)}>
              <ArrowLeft className="h-3 w-3 mr-1" />
              <span className="hidden sm:inline">{invoiceIssued ? 'Zamknij' : 'Wróć'}</span>
            </Button>
            {/* Only show Save button if invoice is not already issued */}
            {!invoiceIssued && onSave && (
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
            <Button variant="default" size="sm" className="text-xs px-2 md:px-3 h-8" onClick={handleDownloadPdf}>
              <Download className="h-3 w-3 mr-1" />
              PDF
            </Button>
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
                    sandbox="allow-same-origin"
                    scrolling="no"
                    onLoad={syncIframeHeight}
                    srcDoc={open ? generateInvoiceHtml(invoiceData) : ''}
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

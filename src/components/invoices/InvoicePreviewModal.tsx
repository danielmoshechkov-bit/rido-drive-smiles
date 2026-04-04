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

  const handleDownloadPdf = () => {
    const html = generateInvoiceHtml(invoiceData);
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
      }, 250);
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

          {/* Invoice Preview - single scrollbar only */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden bg-muted/50 p-2 md:p-4">
            <div 
              className="mx-auto bg-white shadow-xl rounded-lg w-full"
            >
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

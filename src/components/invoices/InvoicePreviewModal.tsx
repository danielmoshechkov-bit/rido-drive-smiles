import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Download, 
  Send, 
  Save,
  ArrowLeft,
  Mail,
  Loader2,
  ZoomIn,
  ZoomOut,
  Maximize2
} from 'lucide-react';
import { InvoiceData, generateInvoiceHtml, formatCurrency } from '@/utils/invoiceHtmlGenerator';
import { AuthModal } from '@/components/auth/AuthModal';

interface InvoicePreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceData: InvoiceData;
  isLoggedIn: boolean;
  onSave?: () => Promise<void>;
  onSend?: (email: string) => Promise<void>;
}

export function InvoicePreviewModal({
  open,
  onOpenChange,
  invoiceData,
  isLoggedIn,
  onSave,
  onSend
}: InvoicePreviewModalProps) {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [email, setEmail] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingAction, setPendingAction] = useState<'save' | 'send' | null>(null);
  const [zoom, setZoom] = useState(100);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Update iframe content when invoice data changes
  useEffect(() => {
    if (open && iframeRef.current) {
      const html = generateInvoiceHtml(invoiceData);
      const iframe = iframeRef.current;
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
      }
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

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 25, 200));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 25, 50));
  const handleResetZoom = () => setZoom(100);

  const grossTotal = invoiceData.items.reduce((sum, item) => sum + item.gross_amount, 0);
  const currency = invoiceData.currency || 'PLN';

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl h-[95vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogTitle className="flex items-center justify-between">
              <span>Podgląd: {invoiceData.invoice_number}</span>
            </DialogTitle>
          </DialogHeader>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 px-6 py-3 border-b bg-muted/30 shrink-0">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Wróć
            </Button>
            
            {/* Zoom controls */}
            <div className="flex items-center gap-1 border rounded-md">
              <Button variant="ghost" size="sm" onClick={handleZoomOut} className="h-8 w-8 p-0">
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-xs w-12 text-center">{zoom}%</span>
              <Button variant="ghost" size="sm" onClick={handleZoomIn} className="h-8 w-8 p-0">
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={handleResetZoom} className="h-8 w-8 p-0">
                <Maximize2 className="h-3 w-3" />
              </Button>
            </div>
            
            <div className="flex-1" />
            
            <Button variant="default" size="sm" onClick={handleDownloadPdf}>
              <Download className="h-4 w-4 mr-2" />
              Pobierz PDF
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleSendClick}
              disabled={isSending}
            >
              <Send className="h-4 w-4 mr-2" />
              Wyślij mailem
            </Button>
            <Button 
              variant="secondary"
              size="sm"
              onClick={handleSaveClick}
              disabled={isSaving}
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Zapisz
            </Button>
          </div>

          {/* Email dialog */}
          {showEmailDialog && (
            <div className="px-6 py-4 bg-primary/5 border-b shrink-0">
              <div className="flex items-center gap-2 mb-3">
                <Mail className="h-4 w-4 text-primary" />
                <Label className="font-medium">Wyślij fakturę na adres email:</Label>
              </div>
              <div className="flex gap-2">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="adres@email.com"
                  className="flex-1"
                  autoFocus
                />
                <Button onClick={handleSendEmail} disabled={isSending || !email}>
                  {isSending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Wyślij'
                  )}
                </Button>
                <Button variant="ghost" onClick={() => setShowEmailDialog(false)}>
                  Anuluj
                </Button>
              </div>
            </div>
          )}

          {/* Invoice Preview - Full page iframe */}
          <div className="flex-1 overflow-auto bg-muted/50 p-4">
            <div 
              className="mx-auto bg-white shadow-xl rounded-lg overflow-hidden transition-transform"
              style={{ 
                width: `${210 * (zoom / 100)}mm`,
                minHeight: `${297 * (zoom / 100)}mm`,
                transform: 'translateZ(0)',
              }}
            >
              <iframe
                ref={iframeRef}
                className="w-full border-0"
                style={{ 
                  height: `${297 * (zoom / 100) * 3.78}px`,
                  transform: `scale(${zoom / 100})`,
                  transformOrigin: 'top left',
                  width: `${100 / (zoom / 100)}%`,
                }}
                title="Podgląd faktury"
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

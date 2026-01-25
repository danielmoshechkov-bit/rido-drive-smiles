import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { 
  Download, 
  Send, 
  Save,
  ArrowLeft,
  Mail,
  Loader2
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

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <span>Podgląd faktury: {invoiceData.invoice_number}</span>
            </DialogTitle>
          </DialogHeader>

          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 py-4 border-b">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Wróć do edycji
            </Button>
            <div className="flex-1" />
            <Button variant="outline" onClick={handleDownloadPdf}>
              <Download className="h-4 w-4 mr-2" />
              Pobierz PDF
            </Button>
            <Button 
              variant="outline" 
              onClick={handleSendClick}
              disabled={isSending}
            >
              <Send className="h-4 w-4 mr-2" />
              Wyślij mailem
            </Button>
            <Button 
              onClick={handleSaveClick}
              disabled={isSaving}
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Zapisz na koncie
            </Button>
          </div>

          {/* Email dialog */}
          {showEmailDialog && (
            <div className="p-4 bg-muted rounded-lg space-y-3">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                <Label>Wyślij fakturę na adres email:</Label>
              </div>
              <div className="flex gap-2">
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="adres@email.com"
                  className="flex-1"
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

          {/* Invoice Preview */}
          <div className="bg-white border rounded-lg p-6 space-y-6">
            {/* Header */}
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold text-primary">{invoiceData.seller.name}</h2>
                {invoiceData.seller.nip && <p className="text-sm text-muted-foreground">NIP: {invoiceData.seller.nip}</p>}
              </div>
              <div className="text-right">
                <h3 className="text-lg font-semibold">
                  {invoiceData.type === 'invoice' ? 'Faktura VAT' : invoiceData.type === 'proforma' ? 'Faktura Proforma' : 'Rachunek'}
                </h3>
                <p className="text-primary font-medium">{invoiceData.invoice_number}</p>
              </div>
            </div>

            <Separator />

            {/* Parties */}
            <div className="grid grid-cols-2 gap-8">
              <div>
                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Sprzedawca</h4>
                <p className="font-medium">{invoiceData.seller.name}</p>
                {invoiceData.seller.nip && <p className="text-sm">NIP: {invoiceData.seller.nip}</p>}
                {invoiceData.seller.address_street && <p className="text-sm">{invoiceData.seller.address_street}</p>}
                {(invoiceData.seller.address_postal_code || invoiceData.seller.address_city) && (
                  <p className="text-sm">{invoiceData.seller.address_postal_code} {invoiceData.seller.address_city}</p>
                )}
              </div>
              <div>
                <h4 className="text-xs font-semibold uppercase text-muted-foreground mb-2">Nabywca</h4>
                <p className="font-medium">{invoiceData.buyer.name}</p>
                {invoiceData.buyer.nip && <p className="text-sm">NIP: {invoiceData.buyer.nip}</p>}
                {invoiceData.buyer.address_street && <p className="text-sm">{invoiceData.buyer.address_street}</p>}
                {(invoiceData.buyer.address_postal_code || invoiceData.buyer.address_city) && (
                  <p className="text-sm">{invoiceData.buyer.address_postal_code} {invoiceData.buyer.address_city}</p>
                )}
              </div>
            </div>

            {/* Dates */}
            <div className="flex gap-6 text-sm bg-muted/50 p-3 rounded-lg">
              <div>
                <span className="text-muted-foreground">Data wystawienia: </span>
                <span className="font-medium">{new Date(invoiceData.issue_date).toLocaleDateString('pl-PL')}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Data sprzedaży: </span>
                <span className="font-medium">{new Date(invoiceData.sale_date).toLocaleDateString('pl-PL')}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Termin płatności: </span>
                <span className="font-medium">{new Date(invoiceData.due_date).toLocaleDateString('pl-PL')}</span>
              </div>
            </div>

            {/* Items table */}
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-primary text-primary-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Lp.</th>
                    <th className="px-3 py-2 text-left">Nazwa</th>
                    <th className="px-3 py-2 text-center">Jm.</th>
                    <th className="px-3 py-2 text-right">Ilość</th>
                    <th className="px-3 py-2 text-right">Cena netto</th>
                    <th className="px-3 py-2 text-right">Wart. netto</th>
                    <th className="px-3 py-2 text-center">VAT</th>
                    <th className="px-3 py-2 text-right">Wart. brutto</th>
                  </tr>
                </thead>
                <tbody>
                  {invoiceData.items.map((item, index) => (
                    <tr key={index} className="border-t">
                      <td className="px-3 py-2">{index + 1}</td>
                      <td className="px-3 py-2">{item.name}</td>
                      <td className="px-3 py-2 text-center">{item.unit}</td>
                      <td className="px-3 py-2 text-right">{item.quantity}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(item.unit_net_price)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(item.net_amount)}</td>
                      <td className="px-3 py-2 text-center">{item.vat_rate}%</td>
                      <td className="px-3 py-2 text-right font-medium">{formatCurrency(item.gross_amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-64 space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Razem netto:</span>
                  <span>{formatCurrency(invoiceData.items.reduce((s, i) => s + i.net_amount, 0))}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">VAT:</span>
                  <span>{formatCurrency(invoiceData.items.reduce((s, i) => s + i.vat_amount, 0))}</span>
                </div>
                <Separator />
                <div className="flex justify-between text-lg font-bold">
                  <span>Do zapłaty:</span>
                  <span className="text-primary">{formatCurrency(grossTotal)}</span>
                </div>
              </div>
            </div>

            {/* Payment & Notes */}
            {(invoiceData.payment_method || invoiceData.notes) && (
              <div className="text-sm space-y-2">
                <p>
                  <span className="text-muted-foreground">Sposób płatności: </span>
                  <span className="font-medium">
                    {invoiceData.payment_method === 'transfer' ? 'Przelew' : 
                     invoiceData.payment_method === 'cash' ? 'Gotówka' : 'Karta'}
                  </span>
                </p>
                {invoiceData.seller.bank_account && invoiceData.payment_method === 'transfer' && (
                  <p>
                    <span className="text-muted-foreground">Nr konta: </span>
                    <span className="font-medium">{invoiceData.seller.bank_account}</span>
                  </p>
                )}
                {invoiceData.notes && (
                  <div className="p-3 bg-accent border border-border rounded-lg mt-4">
                    <p className="text-xs text-muted-foreground font-medium uppercase mb-1">Uwagi</p>
                    <p className="text-foreground">{invoiceData.notes}</p>
                  </div>
                )}
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

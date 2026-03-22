import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Check, Eye, FileText, Mail, AlertCircle, Package, Loader2 } from 'lucide-react';

const COST_CATEGORIES = [
  { value: 'fuel', label: 'Paliwo' },
  { value: 'materials', label: 'Materiały' },
  { value: 'services', label: 'Usługi obce' },
  { value: 'rent', label: 'Czynsz / Najem' },
  { value: 'utilities', label: 'Media' },
  { value: 'insurance', label: 'Ubezpieczenia' },
  { value: 'wages', label: 'Wynagrodzenia' },
  { value: 'marketing', label: 'Marketing / Reklama' },
  { value: 'office', label: 'Biuro / Administracja' },
  { value: 'inventory', label: 'Magazyn (dodaj do stanu)' },
  { value: 'other', label: 'Inne' },
];

interface PendingInvoice {
  id: string;
  invoice_number: string;
  seller_name: string;
  seller_nip: string;
  issue_date: string;
  gross_amount: number;
  net_amount: number;
  vat_amount: number;
  currency: string;
  sender_email: string;
  received_at: string;
  source: string;
  review_status: string;
  ocr_data: any;
  user_invoice_items: any[];
}

export function PendingInvoicesReview() {
  const [invoices, setInvoices] = useState<PendingInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState<PendingInvoice | null>(null);
  const [costCategory, setCostCategory] = useState('other');
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    loadPending();
  }, []);

  const loadPending = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('user_invoices')
      .select('*, user_invoice_items(*)')
      .eq('review_status', 'pending')
      .order('created_at', { ascending: false }) as any;

    setInvoices(data || []);
    setLoading(false);
  };

  const handleConfirm = async () => {
    if (!selectedInvoice) return;
    setConfirming(true);

    try {
      const { error } = await supabase
        .from('user_invoices')
        .update({
          review_status: 'confirmed',
          status: 'confirmed',
          cost_category: costCategory,
        } as any)
        .eq('id', selectedInvoice.id);

      if (error) throw error;

      // Mark notifications as read
      await supabase
        .from('invoice_notifications')
        .update({ is_read: true } as any)
        .eq('invoice_id', selectedInvoice.id);

      toast.success('Faktura zatwierdzona');
      setSelectedInvoice(null);
      loadPending();
    } catch (err: any) {
      toast.error('Błąd: ' + err.message);
    } finally {
      setConfirming(false);
    }
  };

  const handleReject = async (invoiceId: string) => {
    try {
      await supabase
        .from('user_invoices')
        .update({ review_status: 'rejected', status: 'cancelled' } as any)
        .eq('id', invoiceId);

      await supabase
        .from('invoice_notifications')
        .update({ is_read: true } as any)
        .eq('invoice_id', invoiceId);

      toast.success('Faktura odrzucona');
      loadPending();
    } catch (err: any) {
      toast.error('Błąd: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Mail className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Brak faktur do sprawdzenia</p>
          <p className="text-sm mt-1">Wszystkie faktury zostały przejrzane</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            Faktury do sprawdzenia
            <Badge variant="destructive" className="ml-2">{invoices.length}</Badge>
          </CardTitle>
          <CardDescription>
            Faktury odczytane automatycznie z poczty email. Sprawdź dane i zatwierdź.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nr faktury</TableHead>
                <TableHead>Sprzedawca</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="text-right">Brutto</TableHead>
                <TableHead>Źródło</TableHead>
                <TableHead className="text-right">Akcje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map(inv => (
                <TableRow key={inv.id}>
                  <TableCell className="font-medium">{inv.invoice_number}</TableCell>
                  <TableCell>
                    <div>{inv.seller_name}</div>
                    {inv.seller_nip && <div className="text-xs text-muted-foreground">NIP: {inv.seller_nip}</div>}
                  </TableCell>
                  <TableCell>{inv.issue_date}</TableCell>
                  <TableCell className="text-right font-medium">
                    {inv.gross_amount?.toFixed(2)} {inv.currency || 'PLN'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="gap-1">
                      <Mail className="h-3 w-3" /> Email
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="outline" onClick={() => setSelectedInvoice(inv)}>
                        <Eye className="h-3 w-3 mr-1" /> Sprawdź
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleReject(inv.id)}>
                        Odrzuć
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Invoice review dialog */}
      <Dialog open={!!selectedInvoice} onOpenChange={(v) => !v && setSelectedInvoice(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Sprawdź fakturę: {selectedInvoice?.invoice_number}
            </DialogTitle>
          </DialogHeader>

          {selectedInvoice && (
            <div className="space-y-4">
              {/* Seller info */}
              <div className="grid grid-cols-2 gap-4 p-3 bg-muted/50 rounded-lg">
                <div>
                  <p className="text-xs text-muted-foreground">Sprzedawca</p>
                  <p className="font-medium">{selectedInvoice.seller_name}</p>
                  {selectedInvoice.seller_nip && <p className="text-sm">NIP: {selectedInvoice.seller_nip}</p>}
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Data wystawienia</p>
                  <p className="font-medium">{selectedInvoice.issue_date}</p>
                </div>
              </div>

              {/* Items table */}
              {selectedInvoice.user_invoice_items?.length > 0 && (
                <div>
                  <p className="text-sm font-medium mb-2">Pozycje faktury:</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nazwa</TableHead>
                        <TableHead className="text-right">Ilość</TableHead>
                        <TableHead className="text-right">Cena netto</TableHead>
                        <TableHead className="text-right">VAT</TableHead>
                        <TableHead className="text-right">Brutto</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedInvoice.user_invoice_items.map((item: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell>{item.name}</TableCell>
                          <TableCell className="text-right">{item.quantity} {item.unit}</TableCell>
                          <TableCell className="text-right">{item.net_price?.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{item.vat_rate}%</TableCell>
                          <TableCell className="text-right">{item.gross_amount?.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Totals */}
              <div className="flex justify-end gap-6 p-3 bg-muted/50 rounded-lg text-sm">
                <div><span className="text-muted-foreground">Netto:</span> <strong>{selectedInvoice.net_amount?.toFixed(2)}</strong></div>
                <div><span className="text-muted-foreground">VAT:</span> <strong>{selectedInvoice.vat_amount?.toFixed(2)}</strong></div>
                <div><span className="text-muted-foreground">Brutto:</span> <strong>{selectedInvoice.gross_amount?.toFixed(2)} PLN</strong></div>
              </div>

              {/* Category selection */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Przypisz kategorię kosztową:</p>
                <Select value={costCategory} onValueChange={setCostCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COST_CATEGORIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.value === 'inventory' && <Package className="h-3 w-3 inline mr-1" />}
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {costCategory === 'inventory' && (
                  <p className="text-xs text-amber-600">
                    Pozycje zostaną dodane do stanu magazynowego po zatwierdzeniu.
                  </p>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setSelectedInvoice(null)}>Anuluj</Button>
            <Button variant="destructive" onClick={() => { handleReject(selectedInvoice!.id); setSelectedInvoice(null); }}>
              Odrzuć
            </Button>
            <Button onClick={handleConfirm} disabled={confirming}>
              {confirming ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Zatwierdź i zaksięguj
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

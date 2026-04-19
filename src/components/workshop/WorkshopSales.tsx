import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Search, Loader2, FileText, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { SimpleFreeInvoice } from '@/components/invoices/SimpleFreeInvoice';

interface Props {
  providerId: string;
  onBack: () => void;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'Gotówka',
  transfer: 'Przelew',
  card: 'Karta',
  blik: 'BLIK',
};

export function WorkshopSales({ providerId, onBack }: Props) {
  const [search, setSearch] = useState('');
  const [invoices, setInvoices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewInvoice, setShowNewInvoice] = useState(false);
  const [editInvoiceId, setEditInvoiceId] = useState<string | null>(null);

  const loadInvoices = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setInvoices([]); setIsLoading(false); return; }

    const { data, error } = await (supabase as any)
      .from('user_invoices')
      .select('id, invoice_number, buyer_name, issue_date, sale_date, gross_total, paid_amount, payment_method, type, is_paid')
      .eq('user_id', user.id)
      .neq('type', 'cost')
      .order('issue_date', { ascending: false });

    if (error) {
      toast.error('Błąd ładowania sprzedaży');
      setInvoices([]);
    } else {
      setInvoices(data || []);
    }
    setIsLoading(false);
  };

  useEffect(() => { loadInvoices(); }, []);

  const filtered = useMemo(() => {
    if (!search) return invoices;
    const q = search.toLowerCase();
    return invoices.filter((d: any) =>
      (d.invoice_number || '').toLowerCase().includes(q) ||
      (d.buyer_name || '').toLowerCase().includes(q)
    );
  }, [invoices, search]);

  const totalPaid = filtered.reduce((s, d) => s + (d.paid_amount || (d.is_paid ? d.gross_total : 0) || 0), 0);
  const totalGross = filtered.reduce((s, d) => s + (d.gross_total || 0), 0);
  const totalToPay = totalGross - totalPaid;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-primary hover:underline text-sm">🏠</button>
        <span className="text-muted-foreground">/</span>
        <h2 className="text-xl font-bold">Sprzedaż</h2>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button className="gap-2" onClick={() => setShowNewInvoice(true)}>
          <Plus className="h-4 w-4" /> Wystaw
        </Button>
        <Button variant="destructive" size="sm" className="gap-1" disabled>
          <Trash2 className="h-4 w-4" /> Usuń zaznaczone
        </Button>
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Szukaj" className="pl-9 w-[250px]" />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>NUMER DOKUMENTU</TableHead>
                  <TableHead>KLIENT</TableHead>
                  <TableHead>DATA WYSTAWIENIA</TableHead>
                  <TableHead>DATA SPRZEDAŻY</TableHead>
                  <TableHead className="text-right">ZAPŁACONO</TableHead>
                  <TableHead className="text-right">DO ZAPŁATY</TableHead>
                  <TableHead className="text-right">RAZEM BRUTTO</TableHead>
                  <TableHead>METODA PŁAT.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((doc: any) => {
                  const paid = doc.paid_amount || (doc.is_paid ? doc.gross_total : 0) || 0;
                  const toPay = (doc.gross_total || 0) - paid;
                  return (
                    <TableRow
                      key={doc.id}
                      className="hover:bg-accent/50 cursor-pointer"
                      onClick={() => setEditInvoiceId(doc.id)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{doc.invoice_number}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{doc.buyer_name}</TableCell>
                      <TableCell className="text-sm">{doc.issue_date ? format(new Date(doc.issue_date), 'yyyy-MM-dd') : ''}</TableCell>
                      <TableCell className="text-sm">{doc.sale_date ? format(new Date(doc.sale_date), 'yyyy-MM-dd') : ''}</TableCell>
                      <TableCell className="text-right font-medium">
                        {paid.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className={`text-right font-medium ${toPay > 0 ? 'text-destructive' : ''}`}>
                        {toPay.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {(doc.gross_total || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-sm">{PAYMENT_LABELS[doc.payment_method] || doc.payment_method || '-'}</TableCell>
                    </TableRow>
                  );
                })}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Brak dokumentów sprzedaży
                    </TableCell>
                  </TableRow>
                )}
                {filtered.length > 0 && (
                  <TableRow className="font-semibold bg-muted/50">
                    <TableCell colSpan={4}>Suma</TableCell>
                    <TableCell className="text-right">{totalPaid.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right">{totalToPay.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-right">{totalGross.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="text-sm text-muted-foreground">
        Od 1 do {filtered.length} z {filtered.length} wyników
      </div>

      {(showNewInvoice || editInvoiceId) && (
        <Dialog
          open={showNewInvoice || !!editInvoiceId}
          onOpenChange={(v) => { if (!v) { setShowNewInvoice(false); setEditInvoiceId(null); } }}
        >
          <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto p-0">
            <DialogTitle className="sr-only">{editInvoiceId ? 'Edytuj fakturę' : 'Wystaw fakturę'}</DialogTitle>
            <SimpleFreeInvoice
              editInvoiceId={editInvoiceId || undefined}
              onClose={() => { setShowNewInvoice(false); setEditInvoiceId(null); }}
              onSaved={() => { setShowNewInvoice(false); setEditInvoiceId(null); loadInvoices(); }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

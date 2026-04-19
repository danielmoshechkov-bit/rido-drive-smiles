import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Search, Loader2, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { SimpleFreeInvoice } from '@/components/invoices/SimpleFreeInvoice';
import { InvoiceExpandableRow } from '@/components/invoices/InvoiceExpandableRow';

interface Props {
  providerId: string;
  onBack: () => void;
}

export function WorkshopSales({ providerId: _providerId, onBack }: Props) {
  const [search, setSearch] = useState('');
  const [invoices, setInvoices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewInvoice, setShowNewInvoice] = useState(false);

  const loadInvoices = async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setInvoices([]); setIsLoading(false); return; }

    const { data, error } = await (supabase as any)
      .from('user_invoices')
      .select('*')
      .eq('user_id', user.id)
      .neq('invoice_type', 'cost')
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

      {/* Summary card */}
      {filtered.length > 0 && (
        <Card>
          <CardContent className="py-3 flex flex-wrap gap-6 text-sm">
            <div>
              <span className="text-muted-foreground">Suma brutto:</span>{' '}
              <span className="font-semibold">{totalGross.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł</span>
            </div>
            <div>
              <span className="text-muted-foreground">Zapłacono:</span>{' '}
              <span className="font-semibold">{totalPaid.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł</span>
            </div>
            <div>
              <span className="text-muted-foreground">Do zapłaty:</span>{' '}
              <span className={`font-semibold ${totalToPay > 0 ? 'text-destructive' : ''}`}>
                {totalToPay.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Brak dokumentów sprzedaży
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((doc: any) => (
            <InvoiceExpandableRow
              key={doc.id}
              invoice={doc}
              onUpdate={loadInvoices}
            />
          ))}
        </div>
      )}

      <div className="text-sm text-muted-foreground">
        Od 1 do {filtered.length} z {filtered.length} wyników
      </div>

      {showNewInvoice && (
        <Dialog open={showNewInvoice} onOpenChange={(v) => { if (!v) setShowNewInvoice(false); }}>
          <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto p-0">
            <DialogTitle className="sr-only">Wystaw fakturę</DialogTitle>
            <SimpleFreeInvoice
              onClose={() => setShowNewInvoice(false)}
              onSaved={() => { setShowNewInvoice(false); loadInvoices(); }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

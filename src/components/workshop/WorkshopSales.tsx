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
import { WorkshopExpenses } from './WorkshopExpenses';
import { WorkshopCashPanel } from './WorkshopCashPanel';
import { useTranslation } from 'react-i18next';

interface Props {
  providerId: string;
  onBack: () => void;
}

export function WorkshopSales({ providerId: _providerId, onBack }: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [invoices, setInvoices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewInvoice, setShowNewInvoice] = useState(false);
  const [view, setView] = useState<'kasa' | 'sprzedaz' | 'zakup'>('kasa');
  const [expenseSub, setExpenseSub] = useState<'wydatki' | 'cykliczne'>('wydatki');

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
      toast.error(t('workshop.sales.loadError'));
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

  const viewToggle = (
    <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-1">
      <Button variant={view === 'kasa' ? 'default' : 'ghost'} size="sm" className="h-9 px-4 font-medium" onClick={() => setView('kasa')}>Kasa</Button>
      <Button variant={view === 'sprzedaz' ? 'default' : 'ghost'} size="sm" className="h-9 px-4 font-medium" onClick={() => setView('sprzedaz')}>Sprzedaż</Button>
      <Button variant={view === 'zakup' ? 'default' : 'ghost'} size="sm" className="h-9 px-4 font-medium" onClick={() => setView('zakup')}>Zakupy / Opłaty</Button>
    </div>
  );

  const header = (
    <div className="flex items-center gap-3 flex-wrap">
      <button onClick={onBack} className="text-primary hover:underline text-sm">🏠</button>
      <span className="text-muted-foreground">/</span>
      <h2 className="text-xl font-bold">Kasa</h2>
      {viewToggle}
    </div>
  );

  if (view === 'kasa') {
    return (
      <div className="space-y-4">
        {header}
        <WorkshopCashPanel providerId={_providerId} onGoTo={(v, sub) => { setView(v); if (sub) setExpenseSub(sub); }} />
      </div>
    );
  }

  if (view === 'zakup') {
    return (
      <div className="space-y-4">
        {header}
        <WorkshopExpenses providerId={_providerId} initialTab={expenseSub} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {header}

      <div className="flex flex-wrap items-center gap-2">
        <Button className="gap-2" onClick={() => setShowNewInvoice(true)}>
          <Plus className="h-4 w-4" /> {t('workshop.sales.issue')}
        </Button>
        <Button variant="destructive" size="sm" className="gap-1" disabled>
          <Trash2 className="h-4 w-4" /> {t('workshop.sales.deleteSelected')}
        </Button>
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('common.search')} className="pl-9 w-[250px]" />
        </div>
      </div>

      {/* Summary card */}
      {filtered.length > 0 && (
        <Card>
          <CardContent className="py-3 flex flex-wrap gap-6 text-sm">
            <div>
              <span className="text-muted-foreground">{t('workshop.sales.sumGross')}</span>{' '}
              <span className="font-semibold">{totalGross.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł</span>
            </div>
            <div>
              <span className="text-muted-foreground">{t('workshop.sales.paid')}</span>{' '}
              <span className="font-semibold">{totalPaid.toLocaleString('pl-PL', { minimumFractionDigits: 2 })} zł</span>
            </div>
            <div>
              <span className="text-muted-foreground">{t('workshop.sales.toPay')}</span>{' '}
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
            {t('workshop.sales.noDocuments')}
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
        {t('workshop.sales.pagination', { from: 1, to: filtered.length, total: filtered.length })}
      </div>

      {showNewInvoice && (
        <Dialog open={showNewInvoice} onOpenChange={(v) => { if (!v) setShowNewInvoice(false); }}>
          <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto p-0">
            <DialogTitle className="sr-only">{t('workshop.orders.issueInvoice')}</DialogTitle>
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

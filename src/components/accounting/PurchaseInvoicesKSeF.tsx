import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Download, Loader2, FileText, CheckCircle, XCircle, Package, AlertTriangle } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const CATEGORY_LABELS: Record<string, string> = {
  paliwo: '⛽ Paliwo',
  naprawa: '🔧 Naprawa',
  czesc_magazyn: '📦 Części (magazyn)',
  czesci_magazyn: '📦 Części (magazyn)',
  ubezpieczenie: '🛡️ Ubezpieczenie',
  leasing: '🚗 Leasing',
  uslugi: '🔹 Usługi',
  uslugi_it: '💻 Usługi IT',
  inne: '📄 Inne',
};

const STATUS_BADGES: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  new: { variant: 'outline', label: 'Nowa' },
  booked: { variant: 'default', label: 'Zaksięgowana' },
  rejected: { variant: 'destructive', label: 'Odrzucona' },
  pending: { variant: 'secondary', label: 'Oczekuje' },
};

export function PurchaseInvoicesKSeF() {
  const queryClient = useQueryClient();
  const [fetching, setFetching] = useState(false);
  const [inventoryModal, setInventoryModal] = useState<any>(null);
  const [ksefError, setKsefError] = useState<string | null>(null);
  const now = new Date();
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => now.toISOString().split('T')[0]);

  const { data: invoices, isLoading } = useQuery({
    queryKey: ['purchase-invoices-ksef', dateFrom, dateTo],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await (supabase
        .from('purchase_invoices')
        .select('*') as any)
        .eq('user_id', user.id)
        .gte('purchase_date', dateFrom)
        .lte('purchase_date', dateTo)
        .order('purchase_date', { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const fetchFromKSeF = async () => {
    setFetching(true);
    setKsefError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nie jestes zalogowany');
      const { data: settings } = await (supabase
        .from('company_settings')
        .select('nip, ksef_token, ksef_environment')
        .eq('user_id', user.id)
        .maybeSingle() as any);
      if (!settings?.ksef_token) throw new Error('Brak tokenu KSeF - skonfiguruj go w zakladce KSeF');
      if (!settings?.nip) throw new Error('Brak NIP - uzupelnij dane firmy w zakladce KSeF');
      const { data, error } = await supabase.functions.invoke('ksef-integration', {
        body: { action: 'fetch_received', nip: settings.nip, token: settings.ksef_token, environment: settings.ksef_environment || 'demo', date_from: dateFrom, date_to: dateTo },
      });
      if (error) throw new Error(error.message || 'Blad Edge Function');
      if (!data?.success) throw new Error(data?.error || 'Blad pobierania faktur');
      toast.success('Pobrano ' + (data.count || 0) + ' faktur z KSeF' + (data.demo ? ' (DEMO)' : ''));
      queryClient.invalidateQueries({ queryKey: ['purchase-invoices-ksef'] });
    } catch (err: any) {
      setKsefError(err.message);
      toast.error('Blad: ' + err.message);
    }
    setFetching(false);
  };

  const updateStatus = async (invoiceId: string, status: string) => {
    const { error } = await (supabase.from('purchase_invoices').update({ status } as any).eq('id', invoiceId) as any);
    if (error) toast.error('Blad aktualizacji');
    else { toast.success(status === 'booked' ? 'Zaksiegowano' : 'Odrzucono'); queryClient.invalidateQueries({ queryKey: ['purchase-invoices-ksef'] }); }
  };

  const handleAddToInventory = async () => {
    if (!inventoryModal) return;
    try {
      const { error } = await (supabase.from('products') as any).upsert({
        name: (inventoryModal?.supplier_name || '') + ' -- ' + (inventoryModal?.document_number || ''),
        supplier_name: inventoryModal?.supplier_name,
        purchase_price: inventoryModal?.total_net || 0,
        vat_rate: 23,
        notes: 'Import z KSeF ' + (inventoryModal?.ksef_number || ''),
      }, { onConflict: 'name' });
      if (error) throw error;
      toast.success('Dodano do magazynu');
    } catch (err: any) { toast.error('Blad: ' + err.message); }
    setInventoryModal(null);
  };

  const fmt = (n: number | null) => n ? new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(n) : '0,00 zl';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Download className="h-5 w-5" />Faktury zakupowe z KSeF</CardTitle>
        <CardDescription>Pobieraj faktury od kontrahentow — AI automatycznie kategoryzuje kazda fakture</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {ksefError && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0" /><span>{ksefError}</span>
          </div>
        )}
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1"><Label>Od daty</Label><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" /></div>
          <div className="space-y-1"><Label>Do daty</Label><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" /></div>
          <Button onClick={fetchFromKSeF} disabled={fetching} className="gap-2">
            {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}Pobierz faktury z KSeF
          </Button>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : invoices && invoices.length > 0 ? (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Data</TableHead><TableHead>Dostawca</TableHead><TableHead>NIP</TableHead>
                <TableHead className="text-right">Netto</TableHead><TableHead className="text-right">VAT</TableHead><TableHead className="text-right">Brutto</TableHead>
                <TableHead>Kategoria AI</TableHead><TableHead>Status</TableHead><TableHead>Akcje</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {invoices.map((inv: any) => {
                  const si = STATUS_BADGES[inv.status || 'new'] || STATUS_BADGES.new;
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="whitespace-nowrap">{inv.purchase_date || '—'}</TableCell>
                      <TableCell className="max-w-[160px] truncate">{inv.supplier_name || '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{inv.supplier_nip || '—'}</TableCell>
                      <TableCell className="text-right">{fmt(inv.total_net)}</TableCell>
                      <TableCell className="text-right">{fmt(inv.total_vat)}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(inv.total_gross)}</TableCell>
                      <TableCell>{inv.ai_category ? <Badge variant="secondary" className="text-xs">{CATEGORY_LABELS[inv.ai_category] || inv.ai_category}</Badge> : <span className="text-muted-foreground text-xs">—</span>}</TableCell>
                      <TableCell><Badge variant={si.variant}>{si.label}</Badge></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {inv.status !== 'booked' && <Button size="sm" variant="ghost" onClick={() => updateStatus(inv.id, 'booked')} title="Zaksieguj"><CheckCircle className="h-4 w-4 text-green-600" /></Button>}
                          <Button size="sm" variant="ghost" onClick={() => setInventoryModal(inv)} title="Do magazynu"><Package className="h-4 w-4 text-blue-600" /></Button>
                          {inv.status !== 'rejected' && <Button size="sm" variant="ghost" onClick={() => updateStatus(inv.id, 'rejected')} title="Odrzuc"><XCircle className="h-4 w-4 text-red-500" /></Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p>Brak faktur za wybrany okres</p>
            <p className="text-sm">Kliknij "Pobierz faktury z KSeF" aby pobrac</p>
          </div>
        )}
        <Dialog open={!!inventoryModal} onOpenChange={() => setInventoryModal(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Dodaj do magazynu</DialogTitle></DialogHeader>
            <div className="space-y-2 text-sm">
              <p><strong>Dostawca:</strong> {inventoryModal?.supplier_name}</p>
              <p><strong>Numer:</strong> {inventoryModal?.document_number}</p>
              <p><strong>Kwota netto:</strong> {fmt(inventoryModal?.total_net)}</p>
              <p><strong>Kategoria AI:</strong> {CATEGORY_LABELS[inventoryModal?.ai_category] || inventoryModal?.ai_category || '—'}</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInventoryModal(null)}>Anuluj</Button>
              <Button onClick={handleAddToInventory}><Package className="h-4 w-4 mr-2" />Potwierdz dodanie</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
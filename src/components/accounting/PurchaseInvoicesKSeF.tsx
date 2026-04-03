import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

async function resolveCurrentEntityId(userId: string): Promise<string | null> {
  const { data: entity, error } = await (supabase
    .from('entities')
    .select('id')
    .eq('owner_user_id', userId)
    .limit(1)
    .maybeSingle() as any);

  if (error) throw error;
  return entity?.id || null;
}

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

      const entityId = await resolveCurrentEntityId(user.id);
      if (!entityId) return [];

      const { data, error } = await (supabase
        .from('purchase_invoices')
        .select('*') as any)
        .eq('entity_id', entityId)
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
      if (!user) throw new Error('Nie jesteś zalogowany');

      const [settingsResult, entityId] = await Promise.all([
        (supabase
          .from('company_settings')
          .select('nip, ksef_token, ksef_environment')
          .eq('user_id', user.id)
          .maybeSingle() as any),
        resolveCurrentEntityId(user.id),
      ]);

      if (settingsResult.error) throw settingsResult.error;

      const settings = settingsResult.data;
      const environment = String(settings?.ksef_environment || 'demo');

      if (environment !== 'demo') {
        if (!settings?.ksef_token) {
          throw new Error('Brak tokenu KSeF — skonfiguruj go w zakładce KSeF');
        }
        if (!settings?.nip) {
          throw new Error('Brak NIP — uzupełnij dane firmy w zakładce KSeF');
        }
      }

      const requestBody: Record<string, unknown> = {
        action: 'fetch_received',
        environment,
        date_from: dateFrom,
        date_to: dateTo,
      };

      if (entityId) requestBody.entity_id = entityId;
      if (settings?.nip) requestBody.nip = settings.nip;
      if (settings?.ksef_token) requestBody.token = settings.ksef_token;

      const { data, error } = await supabase.functions.invoke('ksef-integration', {
        body: requestBody,
      });

      if (error) throw new Error(error.message || 'Błąd Edge Function');
      if (!data?.success) throw new Error(data?.error || 'Błąd pobierania faktur');

      toast.success('Pobrano ' + (data.count || 0) + ' faktur z KSeF' + (data.demo ? ' (DEMO)' : ''));
      queryClient.invalidateQueries({ queryKey: ['purchase-invoices-ksef'] });
    } catch (err: any) {
      setKsefError(err.message);
      toast.error('Błąd: ' + err.message);
    } finally {
      setFetching(false);
    }
  };

  const updateStatus = async (invoiceId: string, status: string) => {
    const { error } = await (supabase.from('purchase_invoices').update({ status } as any).eq('id', invoiceId) as any);
    if (error) {
      toast.error('Błąd aktualizacji');
      return;
    }

    toast.success(status === 'booked' ? 'Zaksięgowano' : 'Odrzucono');
    queryClient.invalidateQueries({ queryKey: ['purchase-invoices-ksef'] });
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
    } catch (err: any) {
      toast.error('Błąd: ' + err.message);
    }

    setInventoryModal(null);
  };

  const fmt = (value: number | null) => value
    ? new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(value)
    : '0,00 zł';

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          Faktury zakupowe z KSeF
        </CardTitle>
        <CardDescription>
          Pobieraj faktury od kontrahentów — AI automatycznie kategoryzuje każdą fakturę
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {ksefError && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{ksefError}</span>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label>Od daty</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <Label>Do daty</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
          </div>
          <Button onClick={fetchFromKSeF} disabled={fetching} className="gap-2">
            {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Pobierz faktury z KSeF
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : invoices && invoices.length > 0 ? (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Dostawca</TableHead>
                  <TableHead>NIP</TableHead>
                  <TableHead className="text-right">Netto</TableHead>
                  <TableHead className="text-right">VAT</TableHead>
                  <TableHead className="text-right">Brutto</TableHead>
                  <TableHead>Kategoria AI</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice: any) => {
                  const status = STATUS_BADGES[invoice.status || 'new'] || STATUS_BADGES.new;
                  return (
                    <TableRow key={invoice.id}>
                      <TableCell className="whitespace-nowrap">{invoice.purchase_date || '—'}</TableCell>
                      <TableCell className="max-w-[160px] truncate">{invoice.supplier_name || '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{invoice.supplier_nip || '—'}</TableCell>
                      <TableCell className="text-right">{fmt(invoice.total_net)}</TableCell>
                      <TableCell className="text-right">{fmt(invoice.total_vat)}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(invoice.total_gross)}</TableCell>
                      <TableCell>
                        {invoice.ai_category ? (
                          <Badge variant="secondary" className="text-xs">
                            {CATEGORY_LABELS[invoice.ai_category] || invoice.ai_category}
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {invoice.status !== 'booked' && (
                            <Button size="sm" variant="ghost" onClick={() => updateStatus(invoice.id, 'booked')} title="Zaksięguj">
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setInventoryModal(invoice)} title="Do magazynu">
                            <Package className="h-4 w-4 text-blue-600" />
                          </Button>
                          {invoice.status !== 'rejected' && (
                            <Button size="sm" variant="ghost" onClick={() => updateStatus(invoice.id, 'rejected')} title="Odrzuć">
                              <XCircle className="h-4 w-4 text-red-500" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="py-8 text-center text-muted-foreground">
            <FileText className="mx-auto mb-2 h-10 w-10 opacity-30" />
            <p>Brak faktur za wybrany okres</p>
            <p className="text-sm">Kliknij „Pobierz faktury z KSeF”, aby pobrać dokumenty.</p>
          </div>
        )}

        <Dialog open={!!inventoryModal} onOpenChange={() => setInventoryModal(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Dodaj do magazynu</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 text-sm">
              <p><strong>Dostawca:</strong> {inventoryModal?.supplier_name}</p>
              <p><strong>Numer:</strong> {inventoryModal?.document_number}</p>
              <p><strong>Kwota netto:</strong> {fmt(inventoryModal?.total_net)}</p>
              <p><strong>Kategoria AI:</strong> {CATEGORY_LABELS[inventoryModal?.ai_category] || inventoryModal?.ai_category || '—'}</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInventoryModal(null)}>Anuluj</Button>
              <Button onClick={handleAddToInventory}>
                <Package className="mr-2 h-4 w-4" />
                Potwierdź dodanie
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

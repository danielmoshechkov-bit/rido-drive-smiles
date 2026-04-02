import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Download, Loader2, FileText, CheckCircle, XCircle, Package } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

interface PurchaseInvoicesKSeFProps {
  entityId?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  paliwo: '⛽ Paliwo',
  naprawa: '🔧 Naprawa',
  'części_magazyn': '📦 Części (magazyn)',
  ubezpieczenie: '🛡️ Ubezpieczenie',
  leasing: '🚗 Leasing',
  'usługi_it': '💻 Usługi IT',
  'usługi_inne': '🔹 Usługi inne',
  wynagrodzenia: '👷 Wynagrodzenia',
  inne: '📄 Inne',
};

const STATUS_BADGES: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  new: { variant: 'outline', label: 'Nowa' },
  booked: { variant: 'default', label: 'Zaksięgowana' },
  rejected: { variant: 'destructive', label: 'Odrzucona' },
  pending: { variant: 'secondary', label: 'Oczekuje' },
};

export function PurchaseInvoicesKSeF({ entityId }: PurchaseInvoicesKSeFProps) {
  const queryClient = useQueryClient();
  const [fetching, setFetching] = useState(false);
  const [inventoryModal, setInventoryModal] = useState<any>(null);

  const now = new Date();
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return d.toISOString().split('T')[0];
  });
  const [dateTo, setDateTo] = useState(() => now.toISOString().split('T')[0]);

  const { data: invoices, isLoading } = useQuery({
    queryKey: ['purchase-invoices-ksef', entityId, dateFrom, dateTo],
    queryFn: async () => {
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
    try {
      const { data, error } = await supabase.functions.invoke('ksef-integration', {
        body: {
          action: 'fetch_received',
          entity_id: entityId,
          date_from: dateFrom,
          date_to: dateTo,
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Błąd pobierania');

      toast.success(`Pobrano ${data.count || 0} faktur z KSeF`);
      queryClient.invalidateQueries({ queryKey: ['purchase-invoices-ksef'] });
    } catch (err: any) {
      toast.error(`Błąd: ${err.message}`);
    }
    setFetching(false);
  };

  const updateStatus = async (invoiceId: string, status: string) => {
    const { error } = await supabase
      .from('purchase_invoices')
      .update({ status } as any)
      .eq('id', invoiceId);

    if (error) {
      toast.error('Błąd aktualizacji');
    } else {
      toast.success(status === 'booked' ? 'Zaksięgowano' : status === 'rejected' ? 'Odrzucono' : 'Zaktualizowano');
      queryClient.invalidateQueries({ queryKey: ['purchase-invoices-ksef'] });
    }
  };

  const handleAddToInventory = async () => {
    if (!inventoryModal) return;
    try {
      const { error } = await (supabase.from('products') as any).upsert({
        name: inventoryModal?.supplier_name + ' — ' + (inventoryModal?.document_number || ''),
        supplier_name: inventoryModal?.supplier_name,
        purchase_price: inventoryModal?.total_net || 0,
        vat_rate: 23,
        gtu_code: null,
        notes: 'Import z KSeF ' + (inventoryModal?.ksef_number || inventoryModal?.document_number || ''),
      }, { onConflict: 'name' });

      if (error) {
        toast.error('Błąd dodawania do magazynu: ' + error.message);
      } else {
        toast.success('Dodano pozycje do magazynu');
      }
    } catch (err: any) {
      toast.error('Błąd: ' + err.message);
    }
    setInventoryModal(null);
  };

  const formatCurrency = (amount: number | null) => {
    if (!amount) return '0,00 zł';
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: 'PLN',
    }).format(amount);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          Faktury zakupowe z KSeF
        </CardTitle>
        <CardDescription>
          Pobieraj faktury zakupowe z KSeF — kategoryzacja AI odbywa się automatycznie podczas pobierania
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label>Od daty</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1">
            <Label>Do daty</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-40"
            />
          </div>
          <Button onClick={fetchFromKSeF} disabled={fetching} className="gap-2">
            {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Pobierz faktury z KSeF
          </Button>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : invoices && invoices.length > 0 ? (
          <div className="rounded-md border overflow-x-auto">
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
                {invoices.map((inv: any) => {
                  const statusInfo = STATUS_BADGES[inv.status || 'new'] || STATUS_BADGES.new;
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="whitespace-nowrap">{inv.purchase_date || '—'}</TableCell>
                      <TableCell className="max-w-[200px] truncate">{inv.supplier_name || '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{inv.supplier_nip || '—'}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{formatCurrency(inv.total_net)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap">{formatCurrency(inv.total_vat)}</TableCell>
                      <TableCell className="text-right whitespace-nowrap font-medium">{formatCurrency(inv.total_gross)}</TableCell>
                      <TableCell>
                        {inv.ai_category ? (
                          <Badge variant="secondary" className="text-xs">
                            {CATEGORY_LABELS[inv.ai_category] || inv.ai_category}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {inv.status !== 'booked' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => updateStatus(inv.id, 'booked')}
                              title="Zaksięguj"
                            >
                              <CheckCircle className="h-4 w-4 text-green-600" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setInventoryModal(inv)}
                            title="Do magazynu"
                          >
                            <Package className="h-4 w-4 text-blue-600" />
                          </Button>
                          {inv.status !== 'rejected' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => updateStatus(inv.id, 'rejected')}
                              title="Odrzuć"
                            >
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
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p>Brak faktur zakupowych za wybrany okres</p>
            <p className="text-sm">Kliknij "Pobierz faktury z KSeF" aby pobrać</p>
          </div>
        )}

        {/* Inventory modal */}
        <Dialog open={!!inventoryModal} onOpenChange={() => setInventoryModal(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Dodaj do magazynu</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <p>
                <strong>Dostawca:</strong> {inventoryModal?.supplier_name}
              </p>
              <p>
                <strong>Numer:</strong> {inventoryModal?.document_number}
              </p>
              <p>
                <strong>Kwota netto:</strong> {formatCurrency(inventoryModal?.total_net)}
              </p>
              {inventoryModal?.ai_notes && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Notatka AI:</p>
                  <p>{inventoryModal.ai_notes}</p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setInventoryModal(null)}>
                Anuluj
              </Button>
              <Button onClick={handleAddToInventory}>
                <Package className="h-4 w-4 mr-2" />
                Potwierdź dodanie
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
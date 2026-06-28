import { useState, useMemo, useEffect, forwardRef, useImperativeHandle, Fragment } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { groupByCorrections } from '@/utils/invoiceCorrections';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Download, Loader2, FileText, CheckCircle, XCircle, Package, AlertTriangle, Trash2, RefreshCw } from 'lucide-react';
import { PurchaseInvoicePreviewModal } from './PurchaseInvoicePreviewModal';
import { ListPagination } from '@/components/ListPagination';
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

// ===== Helpery dat (lokalne formatowanie — bez pułapki strefy UTC) =====
const pad = (n: number) => String(n).padStart(2, '0');
const toIsoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const currentMonth = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
const monthRange = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return { from: `${month}-01`, to: toIsoDate(new Date(y, m, 0)) }; // m (1-based) => dzień 0 nast. miesiąca = ostatni dzień
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

interface PurchaseInvoicesKSeFProps {
  /** Gdy podane (z periodTo), okres widoku jest sterowany z zewnątrz (np. InvoicesModule) i wewnętrzny filtr okresu jest ukryty. */
  periodFrom?: string;
  periodTo?: string;
  /** Gdy podane, użyj tego entity zamiast rozwiązywać po zalogowanym userze (kompatybilność wsteczna: brak = jak dotąd). */
  entityId?: string;
}

/** Uchwyt imperatywny — pozwala wywołać pobieranie z zewnątrz (pasek akcji w InvoicesModule). */
export interface PurchaseInvoicesKSeFHandle {
  runFetch: (mode: 'full' | 'append') => Promise<void>;
}

export const PurchaseInvoicesKSeF = forwardRef<PurchaseInvoicesKSeFHandle, PurchaseInvoicesKSeFProps>(function PurchaseInvoicesKSeF({ periodFrom, periodTo, entityId: propEntityId }, ref) {
  const queryClient = useQueryClient();
  const [fetching, setFetching] = useState(false);
  const [fetchingMode, setFetchingMode] = useState<'full' | 'append' | null>(null);
  const [inventoryModal, setInventoryModal] = useState<any>(null);
  const [previewInvoice, setPreviewInvoice] = useState<any>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [vatRateFilter, setVatRateFilter] = useState('all'); // 'all' | '23' | '8' | '5' | '0'
  const [ksefError, setKsefError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Okres sterowany z zewnątrz (moduł) — wtedy chowamy wewnętrzny filtr widoku
  const controlled = !!(periodFrom && periodTo);

  // Zakres POBIERANIA z KSeF (osobny, szeroki — uderza w KSeF, używaj rzadziej)
  const [fetchFrom, setFetchFrom] = useState(() => monthRange(currentMonth()).from);
  const [fetchTo, setFetchTo] = useState(() => monthRange(currentMonth()).to);

  // Filtr WIDOKU bazy (osobny, nie rusza KSeF) — używany tylko gdy NIE kontrolowany z zewnątrz
  const [viewMode, setViewMode] = useState<'month' | 'range'>('month');
  const [viewMonth, setViewMonth] = useState(() => currentMonth());
  const [viewFrom, setViewFrom] = useState(() => monthRange(currentMonth()).from);
  const [viewTo, setViewTo] = useState(() => monthRange(currentMonth()).to);
  const view = useMemo(
    () => (controlled
      ? { from: periodFrom!, to: periodTo! }
      : viewMode === 'month' ? monthRange(viewMonth) : { from: viewFrom, to: viewTo }),
    [controlled, periodFrom, periodTo, viewMode, viewMonth, viewFrom, viewTo],
  );

  // Zaznaczanie
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Czyść zaznaczenie + wróć na 1. stronę przy zmianie okresu lub filtra stawki (lista się zmienia)
  useEffect(() => { setSelectedIds(new Set()); setPage(1); }, [view.from, view.to, vatRateFilter]);

  const { data: invoices, isLoading } = useQuery({
    queryKey: ['purchase-invoices-ksef', propEntityId ?? null, view.from, view.to],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const entityId = propEntityId ?? await resolveCurrentEntityId(user.id);
      if (!entityId) return [];

      const { data, error } = await (supabase
        .from('purchase_invoices')
        .select('*') as any)
        .eq('entity_id', entityId)
        .is('deleted_at', null)
        .gte('purchase_date', view.from)
        .lte('purchase_date', view.to)
        .order('purchase_date', { ascending: false });

      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const list = useMemo(() => invoices || [], [invoices]);
  // Filtr stawki VAT (z vat_breakdown) — przed grupowaniem i paginacją
  const filteredList = useMemo(
    () => (vatRateFilter === 'all'
      ? list
      : list.filter((i: any) => Math.abs(Number(i.vat_breakdown?.[vatRateFilter]?.netto || 0)) > 0.001)),
    [list, vatRateFilter],
  );
  // Grupowanie korekt: oryginał (po ksef_number LUB numerze) + korekty.
  // UWAGA: corrected_ksef_number bywa flagą "1"/"2" z <DaneFaKorygowanej><NrKSeF> (1=była w KSeF),
  // NIE numerem — wtedy wiążemy po corrected_invoice_number (NrFaKorygowanej) → document_number oryginału.
  const groups = useMemo(
    () => groupByCorrections(
      filteredList,
      (i: any) => [i.ksef_number, i.document_number],
      (i: any) => {
        const ck = i.corrected_ksef_number;
        const realKsef = ck && ck !== '1' && ck !== '2' ? ck : null;
        return realKsef || i.corrected_invoice_number || null;
      },
    ),
    [filteredList],
  );
  const pagedGroups = groups.slice((page - 1) * pageSize, page * pageSize);
  const allSelected = filteredList.length > 0 && filteredList.every((i: any) => selectedIds.has(i.id));
  const someSelected = filteredList.some((i: any) => selectedIds.has(i.id)) && !allSelected;

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredList.map((i: any) => i.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const fetchFromKSeF = async (mode: 'full' | 'append' = 'full') => {
    setFetching(true);
    setFetchingMode(mode);
    setKsefError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nie jesteś zalogowany');

      const [settingsResult, resolvedEntityId] = await Promise.all([
        (supabase
          .from('company_settings')
          .select('nip, ksef_token, ksef_environment')
          .eq('user_id', user.id)
          .maybeSingle() as any),
        resolveCurrentEntityId(user.id),
      ]);

      if (settingsResult.error) throw settingsResult.error;

      const settings = settingsResult.data;
      const entityId = propEntityId ?? resolvedEntityId;
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
        // Pull faktur zakupowych przez asynchroniczny eksport paczki KSeF
        // (omija limit 64/h na GET /invoices/ksef — patrz ksef-integration: export_start).
        action: 'export_start',
        mode, // 'full' = Pobierz (upsert) | 'append' = Aktualizuj (tylko nowe)
        environment,
        // W trybie modułu (controlled) pobieramy miesiąc wybrany u góry modułu; samodzielnie — własny zakres
        date_from: controlled ? periodFrom! : fetchFrom,
        date_to: controlled ? periodTo! : fetchTo,
      };

      if (entityId) requestBody.entity_id = entityId;
      if (settings?.nip) requestBody.nip = settings.nip;
      if (settings?.ksef_token) requestBody.token = settings.ksef_token;

      const { data, error } = await supabase.functions.invoke('ksef-integration', {
        body: requestBody,
      });

      if (error) throw new Error(error.message || 'Błąd Edge Function');
      if (!data?.success) throw new Error(data?.error || 'Błąd pobierania faktur');

      if (data.phase === 'pending') {
        toast.message('Eksport KSeF zlecony — paczka jeszcze nieprzygotowana. Spróbuj ponownie za chwilę.');
      } else if (mode === 'append') {
        const added = data.added ?? data.count ?? 0;
        if (added > 0) toast.success(`Pobrano ${added} ${added === 1 ? 'nową fakturę' : 'nowych faktur'} z KSeF`);
        else toast.success('Brak nowych faktur w KSeF dla tego miesiąca.');
      } else if ((data.count || 0) > 0) {
        toast.success('Pobrano ' + (data.count || 0) + ' faktur z KSeF' + (data.demo ? ' (DEMO)' : ''));
      } else {
        toast.success('Brak nowych faktur w KSeF dla wybranego zakresu.');
      }
      queryClient.invalidateQueries({ queryKey: ['purchase-invoices-ksef'] });
    } catch (err: any) {
      setKsefError(err.message);
      toast.error('Błąd: ' + err.message);
    } finally {
      setFetching(false);
      setFetchingMode(null);
    }
  };

  // Pozwala paskowi akcji modułu wywołać pobieranie (zachowuje append-mode z ETAP 2)
  useImperativeHandle(ref, () => ({
    runFetch: (mode: 'full' | 'append') => fetchFromKSeF(mode),
  }));

  const deleteSelected = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setDeleting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await (supabase
        .from('purchase_invoices')
        .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null } as any) as any)
        .in('id', ids);

      if (error) throw error;
      toast.success(`Usunięto ${ids.length} ${ids.length === 1 ? 'fakturę' : 'faktur'} z listy`);
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ['purchase-invoices-ksef'] });
    } catch (err: any) {
      toast.error('Błąd usuwania: ' + err.message);
    } finally {
      setDeleting(false);
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
      {!controlled && (
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Faktury zakupowe z KSeF
          </CardTitle>
          <CardDescription>
            Pobieraj faktury od kontrahentów — AI automatycznie kategoryzuje każdą fakturę
          </CardDescription>
        </CardHeader>
      )}
      <CardContent className="space-y-4">
        {ksefError && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>{ksefError}</span>
          </div>
        )}

        {/* Sekcja 1 — POBIERANIE z KSeF.
            W trybie modułu (controlled): przyciski Pobierz/Aktualizuj są w pasku akcji InvoicesModule (przez runFetch) — tu nic.
            Samodzielnie: pełny blok z własnym zakresem dat. */}
        {!controlled && (
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Download className="h-4 w-4" />
              Pobierz z KSeF — zakres pobierania
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Od</Label>
                <Input type="date" value={fetchFrom} onChange={(e) => setFetchFrom(e.target.value)} className="w-40" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Do</Label>
                <Input type="date" value={fetchTo} onChange={(e) => setFetchTo(e.target.value)} className="w-40" />
              </div>
              <Button onClick={() => fetchFromKSeF('full')} disabled={fetching} className="gap-2">
                {fetching && fetchingMode === 'full' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Pobierz faktury z KSeF
              </Button>
              <Button onClick={() => fetchFromKSeF('append')} disabled={fetching} variant="outline" className="gap-2">
                {fetching && fetchingMode === 'append' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Aktualizuj KSeF
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Pobieranie uderza w KSeF (limity API). Ustaw szerzej (miesiąc / kwartał) i pobieraj rzadziej — przeglądanie poniżej nie rusza KSeF.
            </p>
          </div>
        )}

        {/* Sekcja 2 — FILTR WIDOKU (nie rusza KSeF) — ukryty gdy okres sterowany z zewnątrz (InvoicesModule) */}
        {!controlled && (
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Pokaż w bazie</Label>
            <ToggleGroup
              type="single"
              value={viewMode}
              onValueChange={(v) => v && setViewMode(v as 'month' | 'range')}
              variant="outline"
              size="sm"
            >
              <ToggleGroupItem value="month">Miesiąc</ToggleGroupItem>
              <ToggleGroupItem value="range">Zakres dat</ToggleGroupItem>
            </ToggleGroup>
          </div>
          {viewMode === 'month' ? (
            <div className="space-y-1">
              <Label className="text-xs">Miesiąc</Label>
              <Input type="month" value={viewMonth} onChange={(e) => setViewMonth(e.target.value)} className="w-40" />
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <Label className="text-xs">Od</Label>
                <Input type="date" value={viewFrom} onChange={(e) => setViewFrom(e.target.value)} className="w-40" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Do</Label>
                <Input type="date" value={viewTo} onChange={(e) => setViewTo(e.target.value)} className="w-40" />
              </div>
            </>
          )}
        </div>
        )}

        {/* Filtr stawki VAT (z vat_breakdown) — szybkie wyłapanie nietypowych stawek przy zamknięciu miesiąca */}
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-xs">Stawka VAT</Label>
          <Select value={vatRateFilter} onValueChange={setVatRateFilter}>
            <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie</SelectItem>
              <SelectItem value="23">23%</SelectItem>
              <SelectItem value="8">8%</SelectItem>
              <SelectItem value="5">5%</SelectItem>
              <SelectItem value="0">0% / zw</SelectItem>
            </SelectContent>
          </Select>
          {vatRateFilter !== 'all' && (
            <span className="text-xs text-muted-foreground">
              {filteredList.length} {filteredList.length === 1 ? 'faktura' : 'faktur'} ze stawką {vatRateFilter === '0' ? '0%/zw' : vatRateFilter + '%'}
            </span>
          )}
        </div>

        {/* Pasek akcji zaznaczenia */}
        {selectedIds.size > 0 && (
          <div className="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
            <span className="text-sm font-medium">Zaznaczono: {selectedIds.size}</span>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="gap-2" disabled={deleting}>
                  {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Usuń zaznaczone ({selectedIds.size})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Usunąć {selectedIds.size} {selectedIds.size === 1 ? 'fakturę' : 'faktur'} z listy?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Usuwasz tylko <strong>swój import z bazy GetRido</strong> — faktura kontrahenta w KSeF (dokument prawny) pozostaje nienaruszona.
                    Rekord zostaje w bazie ze śladem (kto i kiedy), można go przywrócić, a ponowne pobranie miesiąca może go przywrócić na listę.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Anuluj</AlertDialogCancel>
                  <AlertDialogAction onClick={deleteSelected} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                    Usuń z listy
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : filteredList.length > 0 ? (
          <div className="space-y-2">
          {/* Desktop: tabela */}
          <div className="hidden overflow-x-auto rounded-md border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                      onCheckedChange={toggleAll}
                      aria-label="Zaznacz wszystko"
                    />
                  </TableHead>
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
                {pagedGroups.map((g) => {
                  const renderRow = (invoice: any, isCorrection: boolean) => {
                    const status = STATUS_BADGES[invoice.status || 'new'] || STATUS_BADGES.new;
                    const checked = selectedIds.has(invoice.id);
                    return (
                      <TableRow
                        key={invoice.id}
                        data-state={checked ? 'selected' : undefined}
                        className={`cursor-pointer hover:bg-muted/50 ${isCorrection ? 'bg-muted/20' : ''}`}
                        onClick={() => setPreviewInvoice(invoice)}
                        title="Kliknij, aby zobaczyć podgląd faktury"
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={checked} onCheckedChange={() => toggleOne(invoice.id)} aria-label="Zaznacz fakturę" />
                        </TableCell>
                        <TableCell className={`whitespace-nowrap ${isCorrection ? 'pl-8' : ''}`}>
                          {isCorrection && <span className="mr-1 text-muted-foreground" title="Korekta do faktury powyżej">↳</span>}
                          {invoice.purchase_date || '—'}
                        </TableCell>
                        <TableCell className="max-w-[160px] truncate">{invoice.supplier_name || '—'}</TableCell>
                        <TableCell className="font-mono text-xs">{invoice.supplier_nip || '—'}</TableCell>
                        <TableCell className="text-right">{fmt(invoice.total_net)}</TableCell>
                        <TableCell className="text-right">{fmt(invoice.total_vat)}</TableCell>
                        <TableCell className="text-right font-medium">{fmt(invoice.total_gross)}</TableCell>
                        <TableCell>
                          {invoice.ai_category ? (
                            <Badge variant="secondary" className="text-xs">{CATEGORY_LABELS[invoice.ai_category] || invoice.ai_category}</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell><Badge variant={status.variant}>{status.label}</Badge></TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
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
                  };
                  return (
                    <Fragment key={g.original.id}>
                      {renderRow(g.original, false)}
                      {g.corrections.map((c: any) => renderRow(c, true))}
                    </Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Mobile: karty zamiast tabeli (czytelne ramki, brak ściskania kolumn) */}
          <div className="space-y-2 md:hidden">
            {pagedGroups.map((g) => {
              const renderCard = (invoice: any, isCorrection: boolean) => {
                const status = STATUS_BADGES[invoice.status || 'new'] || STATUS_BADGES.new;
                const checked = selectedIds.has(invoice.id);
                return (
                  <div
                    key={invoice.id}
                    onClick={() => setPreviewInvoice(invoice)}
                    className={`rounded-lg border p-3 ${isCorrection ? 'ml-4 border-l-2 border-l-muted-foreground/30 bg-muted/20' : ''} ${checked ? 'ring-1 ring-primary' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-start gap-2">
                        <span onClick={(e) => e.stopPropagation()} className="pt-0.5">
                          <Checkbox checked={checked} onCheckedChange={() => toggleOne(invoice.id)} aria-label="Zaznacz fakturę" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-medium">
                            {isCorrection && <span className="mr-1 text-muted-foreground" title="Korekta do faktury powyżej">↳</span>}
                            {invoice.supplier_name || '—'}
                          </p>
                          <p className="text-xs text-muted-foreground">{invoice.purchase_date || '—'} · NIP {invoice.supplier_nip || '—'}</p>
                        </div>
                      </div>
                      <Badge variant={status.variant} className="shrink-0">{status.label}</Badge>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                      <div><span className="block text-xs text-muted-foreground">Netto</span>{fmt(invoice.total_net)}</div>
                      <div><span className="block text-xs text-muted-foreground">VAT</span>{fmt(invoice.total_vat)}</div>
                      <div><span className="block text-xs text-muted-foreground">Brutto</span><span className="font-medium">{fmt(invoice.total_gross)}</span></div>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      {invoice.ai_category
                        ? <Badge variant="secondary" className="text-xs">{CATEGORY_LABELS[invoice.ai_category] || invoice.ai_category}</Badge>
                        : <span className="text-xs text-muted-foreground">—</span>}
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        {invoice.status !== 'booked' && (
                          <Button size="sm" variant="ghost" onClick={() => updateStatus(invoice.id, 'booked')} title="Zaksięguj"><CheckCircle className="h-4 w-4 text-green-600" /></Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setInventoryModal(invoice)} title="Do magazynu"><Package className="h-4 w-4 text-blue-600" /></Button>
                        {invoice.status !== 'rejected' && (
                          <Button size="sm" variant="ghost" onClick={() => updateStatus(invoice.id, 'rejected')} title="Odrzuć"><XCircle className="h-4 w-4 text-red-500" /></Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              };
              return (
                <Fragment key={g.original.id}>
                  {renderCard(g.original, false)}
                  {g.corrections.map((c: any) => renderCard(c, true))}
                </Fragment>
              );
            })}
          </div>

          <ListPagination total={groups.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={setPageSize} />
          </div>
        ) : (
          <div className="py-8 text-center text-muted-foreground">
            <FileText className="mx-auto mb-2 h-10 w-10 opacity-30" />
            <p>Brak faktur za wybrany okres</p>
            <p className="text-sm">Zmień filtr widoku lub kliknij „Pobierz faktury z KSeF”, aby pobrać dokumenty.</p>
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

        {/* Podgląd faktury zakupowej (klik w wiersz) */}
        <PurchaseInvoicePreviewModal
          invoice={previewInvoice}
          open={!!previewInvoice}
          onOpenChange={(o) => !o && setPreviewInvoice(null)}
        />
      </CardContent>
    </Card>
  );
});

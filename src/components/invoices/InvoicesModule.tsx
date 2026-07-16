import { useState, useMemo, useEffect, useRef, Fragment, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useDisableNumberInputScroll } from '@/hooks/useDisableNumberInputScroll';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Loader2, FileText, Trash2, Search, Download, RefreshCw, Plus, Settings2 } from 'lucide-react';
import { InvoiceSettingsDialog } from './InvoiceSettingsDialog';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PurchaseInvoicesKSeF, type PurchaseInvoicesKSeFHandle } from '@/components/accounting/PurchaseInvoicesKSeF';
import { InvoiceExpandableRow } from '@/components/invoices/InvoiceExpandableRow';
import { ListPagination } from '@/components/ListPagination';
import { groupByCorrections } from '@/utils/invoiceCorrections';
import { invalidateInvoiceQueries } from '@/utils/invalidateInvoiceQueries';

// ===== Helpery dat (lokalne — bez pułapki UTC) =====
const MONTHS_PL = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
const pad = (n: number) => String(n).padStart(2, '0');
const toIsoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const monthRange = (year: number, m0: number) => ({
  from: `${year}-${pad(m0 + 1)}-01`,
  to: toIsoDate(new Date(year, m0 + 1, 0)), // dzień 0 nast. miesiąca = ostatni dzień
});

const SALES_STATUS: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  draft: { variant: 'outline', label: 'Szkic' },
  issued: { variant: 'secondary', label: 'Wystawiona' },
  paid: { variant: 'default', label: 'Opłacona' },
  pending: { variant: 'secondary', label: 'Oczekuje' },
  overdue: { variant: 'destructive', label: 'Przeterminowana' },
};

const fmt = (value: number | null | undefined) => (value
  ? new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(value)
  : '0,00 zł');

type SalesSource = 'invoices' | 'user_invoices';

interface InvoicesModuleProps {
  /** Gdy podane, używa tego entity (dla source='invoices'); inaczej rozwiązuje po userze. */
  entityId?: string;
  /** Z której tabeli czytać sprzedaż. 'invoices' = /faktury, 'user_invoices' = portal usługodawcy/klienta. */
  source?: SalesSource;
  /** Akcja po prawej w pasku akcji (np. przycisk „Wystaw fakturę") — pokazywana na zakładce Sprzedaż. */
  headerRight?: ReactNode;
  /** Handler „Dodaj fakturę" (ręczny koszt) na zakładce Zakup — np. otwarcie CostInvoiceModal. */
  onAddPurchase?: () => void;
}

export function InvoicesModule({ entityId: propEntityId, source = 'invoices', headerRight, onAddPurchase }: InvoicesModuleProps = {}) {
  useDisableNumberInputScroll(); // scroll nad polem kwoty nie zmienia wartości (też w dialogach edytora)
  const queryClient = useQueryClient();
  const now = new Date();

  // ===== Wspólny wybór okresu (steruje OBIEMA pod-zakładkami; tylko widok, nie KSeF) =====
  const [viewMode, setViewMode] = useState<'month' | 'range'>('month');
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-based
  const [rangeFrom, setRangeFrom] = useState(() => monthRange(now.getFullYear(), now.getMonth()).from);
  const [rangeTo, setRangeTo] = useState(() => monthRange(now.getFullYear(), now.getMonth()).to);
  const period = useMemo(
    () => (viewMode === 'month' ? monthRange(year, month) : { from: rangeFrom, to: rangeTo }),
    [viewMode, year, month, rangeFrom, rangeTo],
  );

  const cy = now.getFullYear();
  const yearOptions = [cy + 1, cy, cy - 1, cy - 2, cy - 3];

  // Aktywna pod-zakładka (kontrolowana — by pasek akcji zależał od wyboru)
  const [activeTab, setActiveTab] = useState('sprzedazowe');

  // Pasek akcji Zakup steruje pobieraniem przez ref (przyciski w module, logika w PurchaseInvoicesKSeF)
  const ksefRef = useRef<PurchaseInvoicesKSeFHandle>(null);
  const [zakupFetching, setZakupFetching] = useState<'full' | 'append' | null>(null);
  const runZakupFetch = async (mode: 'full' | 'append') => {
    if (zakupFetching) return;
    setZakupFetching(mode);
    try { await ksefRef.current?.runFetch(mode); } finally { setZakupFetching(null); }
  };

  // ===== Kontekst: userId (dla user_invoices) + entityId (dla invoices) =====
  const { data: ctx } = useQuery({
    queryKey: ['invoices-module-ctx', propEntityId ?? null],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id ?? null;
      let entityId = propEntityId ?? null;
      if (!entityId && userId) {
        const { data } = await (supabase
          .from('entities').select('id').eq('owner_user_id', userId).limit(1).maybeSingle() as any);
        entityId = data?.id ?? null;
      }
      return { userId, entityId };
    },
  });
  const userId = ctx?.userId ?? null;
  const entityId = propEntityId ?? ctx?.entityId ?? null;
  const usesUserInvoices = source === 'user_invoices';

  // ===== Sprzedaż (tabela wg `source`) =====
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [salesSelected, setSalesSelected] = useState<Set<string>>(new Set());
  const [salesDeleting, setSalesDeleting] = useState(false);
  const [showInvoiceSettings, setShowInvoiceSettings] = useState(false);

  const salesReady = usesUserInvoices ? !!userId : !!entityId;

  const { data: salesInvoices, isLoading: salesLoading } = useQuery({
    queryKey: ['invoices-module-sales', source, entityId, userId, period.from, period.to, statusFilter],
    enabled: salesReady,
    queryFn: async () => {
      if (usesUserInvoices) {
        const { data, error } = await (supabase
          .from('user_invoices')
          .select('*') as any)
          .eq('user_id', userId)
          .is('deleted_at', null)
          .gte('issue_date', period.from)
          .lte('issue_date', period.to)
          .order('issue_date', { ascending: false })
          .order('invoice_number', { ascending: false }); // drugi klucz — porządek przy tej samej dacie
        if (error) throw error;
        return (data || []) as any[];
      }
      let q = (supabase
        .from('invoices')
        .select('id, invoice_number, type, status, issue_date, due_date, gross_amount, net_amount, buyer_snapshot') as any)
        .eq('entity_id', entityId)
        .is('deleted_at', null)
        .gte('issue_date', period.from)
        .lte('issue_date', period.to)
        .order('issue_date', { ascending: false })
        .order('invoice_number', { ascending: false }); // drugi klucz — porządek przy tej samej dacie
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  // Filtr tekstowy po stronie klienta (numer / nabywca) — pole nabywcy zależy od źródła
  const salesList = useMemo(() => {
    const items = salesInvoices || [];
    if (!searchQuery) return items;
    const qq = searchQuery.toLowerCase();
    return items.filter((i: any) => {
      const buyer = usesUserInvoices ? i.buyer_name : (i.buyer_snapshot as any)?.name;
      return i.invoice_number?.toLowerCase().includes(qq) || buyer?.toLowerCase().includes(qq);
    });
  }, [salesInvoices, searchQuery, usesUserInvoices]);

  // Grupowanie korekt: oryginał + korekty pod spodem. Sprzedaż wiąże po corrected_invoice_id / corrected_ksef_reference.
  const salesGroups = useMemo(
    () => groupByCorrections(
      salesList,
      (i: any) => [i.id, i.ksef_reference],
      (i: any) => i.corrected_invoice_id || i.corrected_ksef_reference || null,
    ),
    [salesList],
  );

  // Paginacja Sprzedaż — po GRUPACH (oryginał+korekty = jeden blok)
  const [salesPage, setSalesPage] = useState(1);
  const [salesPageSize, setSalesPageSize] = useState(10);
  const pagedSalesGroups = useMemo(
    () => salesGroups.slice((salesPage - 1) * salesPageSize, salesPage * salesPageSize),
    [salesGroups, salesPage, salesPageSize],
  );

  useEffect(() => {
    setSalesSelected(new Set());
    setSalesPage(1);
  }, [source, period.from, period.to, statusFilter, searchQuery]);

  // Faktura w KSeF (dokument prawny) — NIE wolno usuwać (nawet soft-delete), tylko korygować.
  // Sprzedaż user_invoices: ksef_reference obecny lub ksef_status wysłany/przetwarzany/zaakceptowany.
  const inKsef = (inv: any) => !!inv.ksef_reference || ['accepted', 'processing', 'sent'].includes(inv.ksef_status || '');
  const selectableSales = useMemo(() => salesList.filter((i: any) => !inKsef(i)), [salesList]);

  const salesAllSelected = selectableSales.length > 0 && selectableSales.every((i: any) => salesSelected.has(i.id));
  const salesSomeSelected = selectableSales.some((i: any) => salesSelected.has(i.id)) && !salesAllSelected;
  const toggleSalesAll = () => {
    if (salesAllSelected) setSalesSelected(new Set());
    else setSalesSelected(new Set(selectableSales.map((i: any) => i.id))); // tylko faktury NIE w KSeF
  };
  const toggleSalesOne = (id: string) => {
    setSalesSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const deleteSalesSelected = async () => {
    // Zabezpieczenie: nigdy nie usuwamy faktur w KSeF, nawet gdyby trafiły do zaznaczenia
    const ids = Array.from(salesSelected).filter((id) => {
      const inv = salesList.find((x: any) => x.id === id);
      return inv && !inKsef(inv);
    });
    if (ids.length === 0) return;
    setSalesDeleting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await (supabase
        .from(source)
        .update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null } as any) as any)
        .in('id', ids);
      if (error) throw error;
      toast.success(`Usunięto ${ids.length} ${ids.length === 1 ? 'fakturę' : 'faktur'} z listy`);
      setSalesSelected(new Set());
      invalidateInvoiceQueries(queryClient);
    } catch (err: any) {
      toast.error('Błąd usuwania: ' + err.message);
    } finally {
      setSalesDeleting(false);
    }
  };

  const refetchSales = () => invalidateInvoiceQueries(queryClient);

  // ===== Pasek akcji zaznaczenia (wspólny dla obu trybów renderowania) =====
  const selectionBar = salesSelected.size > 0 && (
    <div className="flex items-center justify-between rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
      <span className="text-sm font-medium">Zaznaczono: {salesSelected.size}</span>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="destructive" size="sm" className="gap-2" disabled={salesDeleting}>
            {salesDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Usuń zaznaczone ({salesSelected.size})
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usunąć {salesSelected.size} {salesSelected.size === 1 ? 'fakturę' : 'faktur'} z listy?</AlertDialogTitle>
            <AlertDialogDescription>
              Faktury zostaną ukryte z listy i pozostaną w bazie ze śladem (kto i kiedy) — można je przywrócić.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction onClick={deleteSalesSelected} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Usuń z listy
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        {/* Górna linia: przełącznik Sprzedaż|Zakup + Okres OBOK (jedna linia) */}
        <div className="flex flex-wrap items-center gap-3">
          <TabsList className="rounded-xl bg-muted/50 p-1">
            <TabsTrigger value="sprzedazowe" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Sprzedaż</TabsTrigger>
            <TabsTrigger value="zakupowe" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Zakup</TabsTrigger>
          </TabsList>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
            <span className="mr-1 text-xs font-medium text-muted-foreground">Okres:</span>
            <ToggleGroup
              type="single"
              value={viewMode}
              onValueChange={(v) => v && setViewMode(v as 'month' | 'range')}
              variant="outline"
              size="sm"
            >
              <ToggleGroupItem value="month">Miesiąc</ToggleGroupItem>
              <ToggleGroupItem value="range">Zakres</ToggleGroupItem>
            </ToggleGroup>
            {viewMode === 'month' ? (
              <>
                <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                  <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS_PL.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                  <SelectTrigger className="h-9 w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </>
            ) : (
              <>
                <Input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} className="h-9 w-36" />
                <span className="text-xs text-muted-foreground">–</span>
                <Input type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} className="h-9 w-36" />
              </>
            )}
          </div>
        </div>

        {/* Pasek akcji — to samo miejsce dla obu zakładek (pod przełącznikiem) */}
        {activeTab === 'sprzedazowe' && (
          <div className="flex flex-wrap items-center gap-2">
            {headerRight}
            <Button variant="outline" className="gap-2" onClick={() => setShowInvoiceSettings(true)}>
              <Settings2 className="h-4 w-4" /> Ustawienia faktur
            </Button>
          </div>
        )}
        {activeTab === 'zakupowe' && (
          <div className="flex flex-wrap items-center gap-2">
            {onAddPurchase && (
              <Button onClick={onAddPurchase} className="gap-2">
                <Plus className="h-4 w-4" /> Dodaj fakturę
              </Button>
            )}
            <Button onClick={() => runZakupFetch('full')} disabled={!!zakupFetching} variant="outline" className="gap-2">
              {zakupFetching === 'full' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Pobierz z KSeF
            </Button>
            <Button onClick={() => runZakupFetch('append')} disabled={!!zakupFetching} variant="outline" className="gap-2">
              {zakupFetching === 'append' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Aktualizuj KSeF
            </Button>
            <span className="text-xs text-muted-foreground">„Aktualizuj" dociąga tylko nowe — istniejących nie rusza. Lista pokazuje faktury KSeF.</span>
          </div>
        )}

        {/* ===== Sprzedażowe ===== */}
        <TabsContent value="sprzedazowe" className="space-y-4">
          {/* Filtry: status (tylko dla 'invoices') + szukaj */}
          <div className="flex flex-wrap items-end gap-3">
            {!usesUserInvoices && (
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Wszystkie</SelectItem>
                    <SelectItem value="draft">Szkice</SelectItem>
                    <SelectItem value="issued">Wystawione</SelectItem>
                    <SelectItem value="paid">Opłacone</SelectItem>
                    <SelectItem value="pending">Oczekujące</SelectItem>
                    <SelectItem value="overdue">Przeterminowane</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Szukaj faktury lub kontrahenta..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {selectionBar}

          {!salesReady ? (
            <div className="py-8 text-center text-muted-foreground">
              <FileText className="mx-auto mb-2 h-10 w-10 opacity-30" />
              <p>Wybierz / skonfiguruj firmę, aby zobaczyć faktury sprzedażowe</p>
            </div>
          ) : salesLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : salesList.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <FileText className="mx-auto mb-2 h-10 w-10 opacity-30" />
              <p>Brak faktur sprzedażowych za wybrany okres</p>
            </div>
          ) : usesUserInvoices ? (
            // ===== user_invoices: pełne wiersze przez InvoiceExpandableRow (akcje zachowane) + checkbox dookoła =====
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1">
                <Checkbox
                  checked={salesAllSelected ? true : salesSomeSelected ? 'indeterminate' : false}
                  onCheckedChange={toggleSalesAll}
                  aria-label="Zaznacz wszystko"
                />
                <span className="text-xs text-muted-foreground">Zaznacz wszystko</span>
              </div>
              {pagedSalesGroups.map((g) => {
                const renderRow = (inv: any, isCorrection: boolean) => (
                  <div key={inv.id} className={`flex items-start gap-2 ${isCorrection ? 'ml-6' : ''}`}>
                    {isCorrection && <span className="pt-4 text-muted-foreground" title="Korekta do faktury powyżej">↳</span>}
                    <div className="pt-4" title={inKsef(inv) ? 'Faktura w KSeF — można tylko skorygować, nie usunąć' : undefined}>
                      <Checkbox
                        checked={salesSelected.has(inv.id)}
                        onCheckedChange={() => toggleSalesOne(inv.id)}
                        disabled={inKsef(inv)}
                        aria-label="Zaznacz fakturę"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <InvoiceExpandableRow invoice={inv} onUpdate={refetchSales} />
                    </div>
                  </div>
                );
                return (
                  <Fragment key={g.original.id}>
                    {renderRow(g.original, false)}
                    {g.corrections.map((c: any) => renderRow(c, true))}
                  </Fragment>
                );
              })}
              <ListPagination total={salesGroups.length} page={salesPage} pageSize={salesPageSize} onPageChange={setSalesPage} onPageSizeChange={setSalesPageSize} />
            </div>
          ) : (
            // ===== invoices: prosta tabela + checkboxy =====
            <div className="space-y-2">
              <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={salesAllSelected ? true : salesSomeSelected ? 'indeterminate' : false}
                        onCheckedChange={toggleSalesAll}
                        aria-label="Zaznacz wszystko"
                      />
                    </TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Nabywca</TableHead>
                    <TableHead>Numer</TableHead>
                    <TableHead className="text-right">Netto</TableHead>
                    <TableHead className="text-right">VAT</TableHead>
                    <TableHead className="text-right">Brutto</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedSalesGroups.map((g) => {
                    const renderRow = (inv: any, isCorrection: boolean) => {
                      const st = SALES_STATUS[inv.status] || { variant: 'outline' as const, label: inv.status || '—' };
                      const checked = salesSelected.has(inv.id);
                      const net = Number(inv.net_amount) || 0;
                      const gross = Number(inv.gross_amount) || 0;
                      return (
                        <TableRow key={inv.id} data-state={checked ? 'selected' : undefined} className={isCorrection ? 'bg-muted/20' : ''}>
                          <TableCell title={inKsef(inv) ? 'Faktura w KSeF — można tylko skorygować, nie usunąć' : undefined}>
                            <Checkbox checked={checked} onCheckedChange={() => toggleSalesOne(inv.id)} disabled={inKsef(inv)} aria-label="Zaznacz fakturę" />
                          </TableCell>
                          <TableCell className={`whitespace-nowrap ${isCorrection ? 'pl-8' : ''}`}>
                            {isCorrection && <span className="mr-1 text-muted-foreground" title="Korekta do faktury powyżej">↳</span>}
                            {inv.issue_date || '—'}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">{(inv.buyer_snapshot as any)?.name || '—'}</TableCell>
                          <TableCell className="font-mono text-xs">{inv.invoice_number || '—'}</TableCell>
                          <TableCell className="text-right">{fmt(net)}</TableCell>
                          <TableCell className="text-right">{fmt(gross - net)}</TableCell>
                          <TableCell className="text-right font-medium">{fmt(gross)}</TableCell>
                          <TableCell><Badge variant={st.variant}>{st.label}</Badge></TableCell>
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
              <ListPagination total={salesGroups.length} page={salesPage} pageSize={salesPageSize} onPageChange={setSalesPage} onPageSizeChange={setSalesPageSize} />
            </div>
          )}
        </TabsContent>

        {/* ===== Zakupowe (KSeF) — okres sterowany z modułu ===== */}
        <TabsContent value="zakupowe" className="space-y-4">
          <PurchaseInvoicesKSeF
            ref={ksefRef}
            entityId={entityId ?? undefined}
            periodFrom={period.from}
            periodTo={period.to}
          />
        </TabsContent>
      </Tabs>

      <InvoiceSettingsDialog open={showInvoiceSettings} onOpenChange={setShowInvoiceSettings} />
    </div>
  );
}

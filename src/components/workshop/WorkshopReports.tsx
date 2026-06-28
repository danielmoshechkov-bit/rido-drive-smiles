import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useWorkshopOrders, useWorkshopStatuses } from '@/hooks/useWorkshop';
import { useWorkshopPaymentsRange, PAYMENT_METHODS, type PaymentMethod } from '@/hooks/useWorkshopFinance';
import { safeNumber, getLineTotal } from '@/utils/workshopOrderTotals';
import { WorkshopRangeCalendar } from './WorkshopRangeCalendar';
import { WorkshopClientsReport, WorkshopEmployeesReport, WorkshopSalesReport } from './WorkshopExtraReports';
import { WorkshopCompanyReport } from './WorkshopCompanyReport';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ClipboardList, Receipt, Users, UserCheck, Printer, Eye, Loader2, Info, ChevronDown, Building2 } from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';
import { printHtmlDocument } from '@/utils/invoiceHtmlGenerator';
import { buildOrdersReportHtml } from '@/utils/workshopReportPrintHtml';

interface Props {
  providerId: string;
  onBack: () => void;
}

// Tylko kategorie z realnymi raportami (Bilans/Przepływ przeniesiony do Kasy;
// puste kategorie pojazdy/magazyn/kasa usunięte).
const reportCategories = [
  { key: 'zlecenia', labelKey: 'workshop.reports.cat.orders', icon: ClipboardList },
  { key: 'sprzedaz', labelKey: 'workshop.reports.cat.sales', icon: Receipt },
  { key: 'klienci', labelKey: 'workshop.reports.cat.clients', icon: Users },
  { key: 'pracownicy', labelKey: 'workshop.reports.cat.employees', icon: UserCheck },
  { key: 'firma', labelKey: 'Działalność firmy', icon: Building2 },
];

const orderReports = [
  { key: 'zestawienie-szczegolowe', labelKey: 'workshop.reports.orderReports.detailed.label', descKey: 'workshop.reports.orderReports.detailed.desc' },
];
const salesReports = [{ key: 'raport-sprzedazy', label: 'Sprzedaż', desc: 'Obrót, liczba faktur, średnia wartość, rozbicie po miesiącach.' }];
const clientReports = [{ key: 'raport-klienci', label: 'Klienci', desc: 'Nowi, powracający, top klienci wg przychodu.' }];
const employeeReports = [{ key: 'raport-pracownicy', label: 'Pracownicy', desc: 'Liczba i wartość zleceń na pracownika, wypłaty.' }];
const companyReports = [{ key: 'raport-firma', label: 'Podsumowanie firmy', desc: 'Pełny obraz finansów: przychody i wszystkie koszty (pracownicze, czynsz, opłaty stałe, zakupy) → realny wynik firmy.' }];

const fmt = (n: number) => (n || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const startOfMonth = () => format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd');
const todayStr = () => format(new Date(), 'yyyy-MM-dd');
const dpart = (s?: string) => (s ? String(s).slice(0, 10) : '');

// Jedno źródło objaśnień kolumn (tooltipy) — żeby kafelek i tabela mówiły to samo.
const COL_HINTS = {
  revenue: 'Łączna cena sprzedaży dla klienta: części + robocizna + inne pozycje.',
  parts: 'Cena sprzedaży części klientowi (zawiera się w Przychodzie).',
  cost: 'Zakupy do zleceń: części (cena zakupu) + robocizna. Podstawa zysku (Zysk = Przychód − Koszt).',
  profit: 'Przychód − Koszt.',
  paid: 'Suma zarejestrowanych płatności klienta za te zlecenia.',
} as const;

// Etykieta z ikonką (i) i tooltipem. Działa w nagłówku tabeli (inline, respektuje text-right) i w kafelku.
const InfoLabel = ({ label, hint, className }: { label: string; hint: string; className?: string }) => (
  <span className={`inline-flex items-center gap-1 ${className || ''}`}>
    {label}
    <Tooltip>
      <TooltipTrigger asChild>
        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help shrink-0" />
      </TooltipTrigger>
      <TooltipContent className="max-w-[230px] text-xs leading-snug">{hint}</TooltipContent>
    </Tooltip>
  </span>
);

export function WorkshopReports({ providerId, onBack }: Props) {
  const { t } = useTranslation();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeReport, setActiveReport] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState(startOfMonth());
  const [dateTo, setDateTo] = useState(todayStr());
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [selectedStations, setSelectedStations] = useState<Set<string>>(new Set());
  const [priceMode, setPriceMode] = useState<'netto' | 'brutto'>('brutto');
  const [dateBasis, setDateBasis] = useState<'created' | 'completed'>('created');
  const [generated, setGenerated] = useState(false);

  const gross = priceMode === 'brutto';
  const { data: orders = [], isLoading } = useWorkshopOrders(providerId);
  const { data: statuses = [] } = useWorkshopStatuses(providerId);
  const { data: payments = [] } = useWorkshopPaymentsRange(providerId, dateFrom, dateTo);
  const { data: stations = [] } = useQuery({
    queryKey: ['workshop-stations-report', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('workshop_stations').select('id, name').eq('provider_id', providerId).order('name');
      if (error) throw error;
      return data || [];
    },
  });
  const { data: provider } = useQuery({
    queryKey: ['workshop-provider-name', providerId],
    enabled: !!providerId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('service_providers').select('company_name, short_name').eq('id', providerId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const workshopName = (provider?.short_name || provider?.company_name || 'Warsztat') as string;

  const toggleSet = (set: Set<string>, key: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    next.has(key) ? next.delete(key) : next.add(key);
    setter(next);
  };

  const orderRevenue = (o: any) => safeNumber(gross ? o.total_gross : o.total_net);
  const orderCost = (o: any) => (o.items || []).reduce((s: number, i: any) => {
    const qty = safeNumber(i.quantity) || 1;
    const unitCost = gross ? safeNumber(i.unit_cost_gross) : safeNumber(i.unit_cost_net);
    return s + unitCost * qty + safeNumber(i.labor_cost);
  }, 0);
  const isPart = (i: any) => i.item_type === 'part' || i.item_type === 'goods' || i.item_type === 'other';
  const orderParts = (o: any) => (o.items || []).filter(isPart).reduce((s: number, i: any) => s + getLineTotal(i, gross), 0);

  const paidByOrder = useMemo(() => {
    const m: Record<string, number> = {};
    (payments as any[]).forEach((p) => { if (p.order_id && !p.voided) m[p.order_id] = (m[p.order_id] || 0) + Number(p.amount || 0); });
    return m;
  }, [payments]);

  // "Zakończenia": dla zleceń zakończonych bez completed_at (sprzed wdrożenia znacznika)
  // używamy updated_at/created_at jako daty zakończenia — inaczej znikały z raportu.
  const basisDateOf = (o: any) => dateBasis === 'completed'
    ? (o.completed_at || o.updated_at || o.created_at)
    : o.created_at;

  const reportOrders = useMemo(() => (orders as any[]).filter((o) => {
    const basis = basisDateOf(o);
    if (!basis) return false;
    const d = dpart(basis);
    if (d < dateFrom || d > dateTo) return false;
    if (selectedStatuses.size > 0 && !selectedStatuses.has(o.status_name)) return false;
    if (selectedStations.size > 0 && !selectedStations.has(o.station_id)) return false;
    return true;
  }), [orders, dateBasis, dateFrom, dateTo, selectedStatuses, selectedStations]);

  const totalRevenue = reportOrders.reduce((s, o) => s + orderRevenue(o), 0);
  const totalCost = reportOrders.reduce((s, o) => s + orderCost(o), 0);
  const totalParts = reportOrders.reduce((s, o) => s + orderParts(o), 0);
  const totalPaid = reportOrders.reduce((s, o) => s + (paidByOrder[o.id] || 0), 0);
  // Jak płacili — sumy form (płatności przypisane do zleceń z raportu).
  const reportOrderIds = new Set(reportOrders.map((o) => o.id));
  const paidByMethod = (m: PaymentMethod) => (payments as any[]).filter((p) => p.method === m && !p.voided && p.order_id && reportOrderIds.has(p.order_id)).reduce((s, p) => s + Number(p.amount || 0), 0);

  const clientNameOf = (o: any) => o.client
    ? (o.client.client_type === 'company' ? o.client.company_name : `${o.client.first_name || ''} ${o.client.last_name || ''}`.trim())
    : '';
  const ddmmyyyy = (s?: string) => { const d = dpart(s); return d ? format(new Date(d + 'T00:00:00'), 'dd.MM.yyyy') : '—'; };

  // Druk/PDF: czysty HTML w nowym oknie (jak faktury). includeList = z listą zleceń czy samo podsumowanie.
  const handlePrint = (includeList: boolean) => {
    printHtmlDocument(buildOrdersReportHtml({
      workshopName,
      periodFrom: format(new Date(dateFrom + 'T00:00:00'), 'dd.MM.yyyy'),
      periodTo: format(new Date(dateTo + 'T00:00:00'), 'dd.MM.yyyy'),
      generatedAt: format(new Date(), 'dd.MM.yyyy HH:mm'),
      priceMode,
      dateBasis,
      summary: { revenue: totalRevenue, parts: totalParts, cost: totalCost, profit: totalRevenue - totalCost, paid: totalPaid },
      payByMethod: PAYMENT_METHODS.map((m) => ({ label: m.label, amount: paidByMethod(m.value) })).filter((p) => p.amount > 0),
      orders: reportOrders.map((o) => {
        const revenue = orderRevenue(o), cost = orderCost(o);
        return { number: o.order_number, date: ddmmyyyy(basisDateOf(o)), client: clientNameOf(o), status: o.status_name, revenue, parts: orderParts(o), cost, profit: revenue - cost, paid: paidByOrder[o.id] || 0 };
      }),
      includeList,
    }));
  };

  const getReportList = (): any[] => {
    switch (activeCategory) {
      case 'zlecenia': return orderReports;
      case 'sprzedaz': return salesReports;
      case 'klienci': return clientReports;
      case 'pracownicy': return employeeReports;
      case 'firma': return companyReports;
      default: return [];
    }
  };

  // Wrapper z breadcrumbem dla raportów Klienci/Pracownicy/Sprzedaż.
  const reportWrap = (title: string, node: ReactNode) => (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <button onClick={onBack} className="text-primary hover:underline">🏠</button>
        <span className="text-muted-foreground">/</span>
        <button onClick={() => { setActiveReport(null); setActiveCategory(null); }} className="text-primary hover:underline">{t('workshop.reports.title')}</button>
        <span className="text-muted-foreground">/</span>
        <span className="font-semibold">{title}</span>
      </div>
      {node}
    </div>
  );

  if (activeReport === 'raport-klienci') return reportWrap('Klienci', <WorkshopClientsReport providerId={providerId} />);
  if (activeReport === 'raport-pracownicy') return reportWrap('Pracownicy', <WorkshopEmployeesReport providerId={providerId} />);
  if (activeReport === 'raport-sprzedazy') return reportWrap('Sprzedaż', <WorkshopSalesReport providerId={providerId} />);
  if (activeReport === 'raport-firma') return reportWrap('Podsumowanie firmy', <WorkshopCompanyReport providerId={providerId} />);

  if (activeReport === 'zestawienie-szczegolowe') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <button onClick={onBack} className="text-primary hover:underline">🏠</button>
          <span className="text-muted-foreground">/</span>
          <button onClick={() => { setActiveReport(null); setActiveCategory(null); }} className="text-primary hover:underline">{t('workshop.reports.title')}</button>
          <span className="text-muted-foreground">/</span>
          <span className="font-semibold">Rozliczenie zleceń</span>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="py-4 space-y-4">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <Label>Okres</Label>
                <WorkshopRangeCalendar from={dateFrom} to={dateTo} onChange={(f, tt) => { setDateFrom(f); setDateTo(tt); }} />
              </div>
              <div className="space-y-1.5">
                <Label>Licz po</Label>
                <div className="flex border rounded-md overflow-hidden h-9">
                  <Button variant={dateBasis === 'created' ? 'default' : 'ghost'} size="sm" className="rounded-none" onClick={() => setDateBasis('created')}>Utworzenia</Button>
                  <Button variant={dateBasis === 'completed' ? 'default' : 'ghost'} size="sm" className="rounded-none" onClick={() => setDateBasis('completed')}>Zakończenia</Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Ceny</Label>
                <div className="flex border rounded-md overflow-hidden h-9">
                  <Button variant={priceMode === 'netto' ? 'default' : 'ghost'} size="sm" className="rounded-none" onClick={() => setPriceMode('netto')}>Netto</Button>
                  <Button variant={priceMode === 'brutto' ? 'default' : 'ghost'} size="sm" className="rounded-none" onClick={() => setPriceMode('brutto')}>Brutto</Button>
                </div>
              </div>
            </div>

            {/* Status multi */}
            <div className="space-y-1.5">
              <Label>Status zleceń <span className="text-muted-foreground font-normal">(puste = wszystkie)</span></Label>
              <div className="flex flex-wrap gap-1.5">
                {(statuses as any[]).map((s) => {
                  const on = selectedStatuses.has(s.name);
                  return (
                    <Badge key={s.id} onClick={() => toggleSet(selectedStatuses, s.name, setSelectedStatuses)}
                      className={`cursor-pointer ${on ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-muted/70'}`}>
                      {s.name}
                    </Badge>
                  );
                })}
                {selectedStatuses.size > 0 && <Badge variant="outline" className="cursor-pointer" onClick={() => setSelectedStatuses(new Set())}>× wyczyść</Badge>}
              </div>
            </div>

            {/* Stations multi */}
            {(stations as any[]).length > 0 && (
              <div className="space-y-1.5">
                <Label>Stanowiska <span className="text-muted-foreground font-normal">(puste = wszystkie)</span></Label>
                <div className="flex flex-wrap gap-1.5">
                  {(stations as any[]).map((s) => {
                    const on = selectedStations.has(s.id);
                    return (
                      <Badge key={s.id} onClick={() => toggleSet(selectedStations, s.id, setSelectedStations)}
                        className={`cursor-pointer ${on ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground hover:bg-muted/70'}`}>
                        {s.name}
                      </Badge>
                    );
                  })}
                  {selectedStations.size > 0 && <Badge variant="outline" className="cursor-pointer" onClick={() => setSelectedStations(new Set())}>× wyczyść</Badge>}
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button className="gap-2" onClick={() => setGenerated(true)}>
                <Eye className="h-4 w-4" /> {t('workshop.reports.showReport')}
              </Button>
              {generated && !isLoading && reportOrders.length > 0 && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-1">
                      <Printer className="h-4 w-4" /> Drukuj / PDF <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => handlePrint(false)}>Podsumowanie</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handlePrint(true)}>Podsumowanie + lista zleceń</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </CardContent>
        </Card>

        {generated && !isLoading && reportOrders.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card><CardContent className="py-3"><p className="text-xs text-muted-foreground"><InfoLabel label="Przychód" hint={COL_HINTS.revenue} /></p><p className="text-lg font-bold tabular-nums">{fmt(totalRevenue)}</p></CardContent></Card>
            <Card><CardContent className="py-3"><p className="text-xs text-muted-foreground"><InfoLabel label="Części" hint={COL_HINTS.parts} /></p><p className="text-lg font-bold tabular-nums">{fmt(totalParts)}</p></CardContent></Card>
            <Card><CardContent className="py-3"><p className="text-xs text-muted-foreground"><InfoLabel label="Koszt (zakupy)" hint={COL_HINTS.cost} /></p><p className="text-lg font-bold tabular-nums">{fmt(totalCost)}</p></CardContent></Card>
            <Card><CardContent className="py-3"><p className="text-xs text-muted-foreground"><InfoLabel label="Zysk" hint={COL_HINTS.profit} /></p><p className={`text-lg font-bold tabular-nums ${totalRevenue - totalCost >= 0 ? 'text-green-600' : 'text-destructive'}`}>{fmt(totalRevenue - totalCost)}</p></CardContent></Card>
            <Card><CardContent className="py-3"><p className="text-xs text-muted-foreground"><InfoLabel label="Zapłacono" hint={COL_HINTS.paid} /></p><p className="text-lg font-bold tabular-nums">{fmt(totalPaid)}</p></CardContent></Card>
          </div>
        )}

        {generated && !isLoading && reportOrders.length > 0 && (
          <Card><CardContent className="py-3 flex flex-wrap gap-4 text-sm">
            <span className="text-muted-foreground">Jak płacili:</span>
            {PAYMENT_METHODS.map((m) => <span key={m.value}>{m.label}: <span className="font-semibold tabular-nums">{fmt(paidByMethod(m.value))}</span></span>)}
          </CardContent></Card>
        )}

        {/* Results */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : !generated ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">Ustaw filtry i kliknij „Pokaż raport".</div>
            ) : reportOrders.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">Brak zleceń w wybranym zakresie.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nr</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Klient</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right"><InfoLabel label="Przychód" hint={COL_HINTS.revenue} /></TableHead>
                    <TableHead className="text-right"><InfoLabel label="Części" hint={COL_HINTS.parts} /></TableHead>
                    <TableHead className="text-right"><InfoLabel label="Koszt" hint={COL_HINTS.cost} /></TableHead>
                    <TableHead className="text-right"><InfoLabel label="Zysk" hint={COL_HINTS.profit} /></TableHead>
                    <TableHead className="text-right"><InfoLabel label="Zapłacono" hint={COL_HINTS.paid} /></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportOrders.map((o) => {
                    const revenue = orderRevenue(o), cost = orderCost(o), profit = revenue - cost;
                    const basisDate = basisDateOf(o);
                    return (
                      <TableRow key={o.id}>
                        <TableCell className="font-medium">{o.order_number}</TableCell>
                        <TableCell className="text-sm tabular-nums">{basisDate ? dpart(basisDate) : '—'}</TableCell>
                        <TableCell className="text-sm">{clientNameOf(o)}</TableCell>
                        <TableCell className="text-sm">{o.status_name}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{fmt(revenue)}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{fmt(orderParts(o))}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{fmt(cost)}</TableCell>
                        <TableCell className={`text-right font-medium tabular-nums ${profit >= 0 ? 'text-green-600' : 'text-destructive'}`}>{fmt(profit)}</TableCell>
                        <TableCell className="text-right text-sm tabular-nums">{fmt(paidByOrder[o.id] || 0)}</TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="font-semibold bg-muted/50">
                    <TableCell colSpan={4}>{t('workshop.reports.sum')}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(totalRevenue)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(totalParts)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(totalCost)}</TableCell>
                    <TableCell className={`text-right tabular-nums ${totalRevenue - totalCost >= 0 ? 'text-green-600' : 'text-destructive'}`}>{fmt(totalRevenue - totalCost)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(totalPaid)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Sub-report list
  if (activeCategory) {
    const reports = getReportList();
    const activeCategoryLabel = reportCategories.find(c => c.key === activeCategory)?.labelKey;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <button onClick={onBack} className="text-primary hover:underline">🏠</button>
          <span className="text-muted-foreground">/</span>
          <button onClick={() => setActiveCategory(null)} className="text-primary hover:underline">{t('workshop.reports.title')}</button>
          <span className="text-muted-foreground">/</span>
          <span className="font-semibold">{activeCategoryLabel ? t(activeCategoryLabel) : activeCategory}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {reports.map(r => (
            <Card key={r.key} className="cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all" onClick={() => { setGenerated(false); setActiveReport(r.key); }}>
              <CardContent className="py-6 text-center space-y-2">
                <h3 className="font-semibold">{r.labelKey ? t(r.labelKey) : r.label}</h3>
                <p className="text-sm text-muted-foreground">{r.descKey ? t(r.descKey) : r.desc}</p>
              </CardContent>
            </Card>
          ))}
          {reports.length === 0 && (
            <div className="col-span-3 text-center py-12 text-muted-foreground">{t('workshop.reports.categoryComingSoon')}</div>
          )}
        </div>
      </div>
    );
  }

  // Main categories grid
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-primary hover:underline text-sm">🏠</button>
        <span className="text-muted-foreground">/</span>
        <h2 className="text-xl font-bold">{t('workshop.reports.title')}</h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {reportCategories.map(cat => (
          <Card key={cat.key} className="cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all" onClick={() => setActiveCategory(cat.key)}>
            <CardContent className="flex flex-col items-center justify-center py-8 gap-3">
              <cat.icon className="h-10 w-10 text-primary" strokeWidth={1.5} />
              <span className="font-medium text-sm">{t(cat.labelKey)}</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

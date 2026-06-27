import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWorkshopOrders, useWorkshopClients, useWorkshopVehicles, useWorkshopStatuses } from '@/hooks/useWorkshop';
import { safeNumber } from '@/utils/workshopOrderTotals';
import { WorkshopCashFlowReport } from './WorkshopCashFlowReport';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ArrowLeft, ClipboardList, Receipt, Users, UserCheck, Wallet, Car, Package,
  BarChart3, Printer, Eye, Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { useTranslation } from 'react-i18next';

interface Props {
  providerId: string;
  onBack: () => void;
}

const reportCategories = [
  { key: 'zlecenia', labelKey: 'workshop.reports.cat.orders', icon: ClipboardList },
  { key: 'sprzedaz', labelKey: 'workshop.reports.cat.sales', icon: Receipt },
  { key: 'klienci', labelKey: 'workshop.reports.cat.clients', icon: Users },
  { key: 'pracownicy', labelKey: 'workshop.reports.cat.employees', icon: UserCheck },
  { key: 'kasa', labelKey: 'workshop.reports.cat.cash', icon: Wallet },
  { key: 'pojazdy', labelKey: 'workshop.reports.cat.vehicles', icon: Car },
  { key: 'magazyn', labelKey: 'workshop.reports.cat.warehouse', icon: Package },
];

const orderReports = [
  { key: 'zestawienie-szczegolowe', labelKey: 'workshop.reports.orderReports.detailed.label', descKey: 'workshop.reports.orderReports.detailed.desc' },
  { key: 'czas-pracy', labelKey: 'workshop.reports.orderReports.workTime.label', descKey: 'workshop.reports.orderReports.workTime.desc' },
];

const salesReports = [
  { key: 'zestawienie-sprzedazy', labelKey: 'workshop.reports.salesReports.detailed.label', descKey: 'workshop.reports.salesReports.detailed.desc' },
  { key: 'wz-sprzedaz', labelKey: 'workshop.reports.salesReports.wz.label', descKey: 'workshop.reports.salesReports.wz.desc' },
  { key: 'zestawienie-dokumentow', labelKey: 'workshop.reports.salesReports.documents.label', descKey: 'workshop.reports.salesReports.documents.desc' },
];

const clientReports = [
  { key: 'zestawienie-zlecen', labelKey: 'workshop.reports.clientReports.orders.label', descKey: 'workshop.reports.clientReports.orders.desc' },
];

const cashReports = [
  { key: 'bilans-przeplyw', label: 'Bilans / Przepływ', desc: 'Wpływy − wydatki, wynik okresu i stan kasy (tydzień/miesiąc).' },
];

export function WorkshopReports({ providerId, onBack }: Props) {
  const { t } = useTranslation();
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeReport, setActiveReport] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [statusFilter, setStatusFilter] = useState('all');
  const [priceMode, setPriceMode] = useState<'netto' | 'brutto'>('brutto');
  const [dateBasis, setDateBasis] = useState<'created' | 'completed'>('created');
  const [generated, setGenerated] = useState(false);

  const { data: orders = [], isLoading } = useWorkshopOrders(providerId);
  const { data: statuses = [] } = useWorkshopStatuses(providerId);

  const getReportList = (): any[] => {
    switch (activeCategory) {
      case 'zlecenia': return orderReports;
      case 'sprzedaz': return salesReports;
      case 'klienci': return clientReports;
      case 'kasa': return cashReports;
      default: return [];
    }
  };

  // Revenue/cost honour the NETTO/BRUTTO toggle and use the REAL columns:
  //   revenue = order total (net or gross),
  //   cost    = parts unit_cost × qty + labor_cost  (the old code summed `i.cost`,
  //             a field that does not exist → always 0).
  const orderRevenue = (o: any) => safeNumber(priceMode === 'brutto' ? o.total_gross : o.total_net);
  const orderCost = (o: any) => (o.items || []).reduce((s: number, i: any) => {
    const qty = safeNumber(i.quantity) || 1;
    const unitCost = priceMode === 'brutto' ? safeNumber(i.unit_cost_gross) : safeNumber(i.unit_cost_net);
    return s + unitCost * qty + safeNumber(i.labor_cost);
  }, 0);

  // "Pobieraj po": filter by created_at or completed_at depending on the selector.
  const reportOrders = orders.filter((o: any) => {
    const basis = dateBasis === 'completed' ? o.completed_at : o.created_at;
    if (!basis) return false;
    const d = new Date(basis);
    return d >= new Date(dateFrom) && d <= new Date(dateTo + 'T23:59:59') &&
      (statusFilter === 'all' || o.status_name === statusFilter);
  });

  const totalRevenue = reportOrders.reduce((s: number, o: any) => s + orderRevenue(o), 0);
  const totalCost = reportOrders.reduce((s: number, o: any) => s + orderCost(o), 0);

  if (activeReport === 'bilans-przeplyw') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <button onClick={onBack} className="text-primary hover:underline">🏠</button>
          <span className="text-muted-foreground">/</span>
          <button onClick={() => { setActiveReport(null); setActiveCategory(null); }} className="text-primary hover:underline">{t('workshop.reports.title')}</button>
          <span className="text-muted-foreground">/</span>
          <span className="font-semibold">Bilans / Przepływ</span>
        </div>
        <WorkshopCashFlowReport providerId={providerId} />
      </div>
    );
  }

  if (activeReport === 'zestawienie-szczegolowe') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <button onClick={onBack} className="text-primary hover:underline">🏠</button>
          <span className="text-muted-foreground">/</span>
          <button onClick={() => { setActiveReport(null); setActiveCategory(null); }} className="text-primary hover:underline">{t('workshop.reports.title')}</button>
          <span className="text-muted-foreground">/</span>
          <button onClick={() => setActiveReport(null)} className="text-primary hover:underline">{t('workshop.reports.cat.orders')}</button>
          <span className="text-muted-foreground">/</span>
          <span className="font-semibold">{t('workshop.reports.orderReports.detailed.label')}</span>
          <div className="flex-1" />
          <Button variant="outline" size="sm" className="gap-1">
            <Printer className="h-4 w-4" /> {t('workshop.reports.print')}
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="py-4">
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className="space-y-1.5">
                <Label>{t('workshop.reports.selectDateRange')}</Label>
                <div className="flex items-center gap-2">
                  <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                  <span>—</span>
                  <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{t('workshop.reports.fetchBy')}</Label>
                <Select value={dateBasis} onValueChange={(v) => setDateBasis(v as 'created' | 'completed')}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="created">{t('workshop.reports.dateCreated')}</SelectItem>
                    <SelectItem value="completed">{t('workshop.reports.dateCompleted')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t('workshop.reports.orderStatus')}</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger><SelectValue placeholder={t('workshop.reports.allOrSelect')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('workshop.reports.all')}</SelectItem>
                    {statuses.map((s: any) => (
                      <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t('workshop.reports.showPrices')}</Label>
                <div className="flex border rounded-md overflow-hidden">
                  <Button
                    variant={priceMode === 'netto' ? 'default' : 'ghost'}
                    size="sm"
                    className="rounded-none flex-1"
                    onClick={() => setPriceMode('netto')}
                  >{t('workshop.reports.net')}</Button>
                  <Button
                    variant={priceMode === 'brutto' ? 'default' : 'ghost'}
                    size="sm"
                    className="rounded-none flex-1"
                    onClick={() => setPriceMode('brutto')}
                  >{t('workshop.reports.gross')}</Button>
                </div>
              </div>
            </div>

            <Button className="gap-2" onClick={() => setGenerated(true)}>
              <Eye className="h-4 w-4" /> {t('workshop.reports.showReport')}
            </Button>
          </CardContent>
        </Card>

        {/* Report results */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : !generated ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                Ustaw filtry i kliknij „Pokaż raport".
              </div>
            ) : reportOrders.length === 0 ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                Brak zleceń w wybranym zakresie.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('workshop.reports.col.orderNumber')}</TableHead>
                    <TableHead>{t('workshop.reports.col.date')}</TableHead>
                    <TableHead>{t('workshop.reports.col.client')}</TableHead>
                    <TableHead>{t('workshop.reports.col.vehicle')}</TableHead>
                    <TableHead>{t('workshop.reports.col.status')}</TableHead>
                    <TableHead className="text-right">{t('workshop.reports.col.revenue')}</TableHead>
                    <TableHead className="text-right">{t('workshop.reports.col.cost')}</TableHead>
                    <TableHead className="text-right">{t('workshop.reports.col.profit')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportOrders.map((o: any) => {
                    const cost = orderCost(o);
                    const revenue = orderRevenue(o);
                    const profit = revenue - cost;
                    const basisDate = dateBasis === 'completed' ? o.completed_at : o.created_at;
                    return (
                      <TableRow key={o.id}>
                        <TableCell className="font-medium">{o.order_number}</TableCell>
                        <TableCell className="text-sm">{basisDate ? format(new Date(basisDate), 'yyyy-MM-dd') : '—'}</TableCell>
                        <TableCell className="text-sm">
                          {o.client ? (o.client.client_type === 'company' ? o.client.company_name : `${o.client.first_name || ''} ${o.client.last_name || ''}`.trim()) : ''}
                        </TableCell>
                        <TableCell className="text-sm">
                          {o.vehicle ? `${o.vehicle.brand} ${o.vehicle.model}` : ''}
                        </TableCell>
                        <TableCell className="text-sm">{o.status_name}</TableCell>
                        <TableCell className="text-right font-medium">{revenue.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell className="text-right text-sm">{cost.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}</TableCell>
                        <TableCell className={`text-right font-medium ${profit >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                          {profit.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {reportOrders.length > 0 && (
                    <TableRow className="font-semibold bg-muted/50">
                      <TableCell colSpan={5}>{t('workshop.reports.sum')}</TableCell>
                      <TableCell className="text-right">{totalRevenue.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-right">{totalCost.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className={`text-right ${totalRevenue - totalCost >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                        {(totalRevenue - totalCost).toLocaleString('pl-PL', { minimumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  )}
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
            <Card
              key={r.key}
              className="cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all"
              onClick={() => setActiveReport(r.key)}
            >
              <CardContent className="py-6 text-center space-y-2">
                <h3 className="font-semibold">{r.labelKey ? t(r.labelKey) : r.label}</h3>
                <p className="text-sm text-muted-foreground">{r.descKey ? t(r.descKey) : r.desc}</p>
              </CardContent>
            </Card>
          ))}
          {reports.length === 0 && (
            <div className="col-span-3 text-center py-12 text-muted-foreground">
              {t('workshop.reports.categoryComingSoon')}
            </div>
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
          <Card
            key={cat.key}
            className="cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all"
            onClick={() => setActiveCategory(cat.key)}
          >
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

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useWorkshopOrders, useWorkshopClients, useWorkshopVehicles, useWorkshopStatuses } from '@/hooks/useWorkshop';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  ArrowLeft, ClipboardList, Receipt, Users, UserCheck, Wallet, Car, Package,
  BarChart3, Printer, Eye, Loader2
} from 'lucide-react';
import { format } from 'date-fns';

interface Props {
  providerId: string;
  onBack: () => void;
}

const reportCategories = [
  { key: 'zlecenia', label: 'Zlecenia', icon: ClipboardList },
  { key: 'sprzedaz', label: 'Sprzedaż', icon: Receipt },
  { key: 'klienci', label: 'Klienci', icon: Users },
  { key: 'pracownicy', label: 'Pracownicy', icon: UserCheck },
  { key: 'kasa', label: 'Kasa', icon: Wallet },
  { key: 'pojazdy', label: 'Pojazdy', icon: Car },
  { key: 'magazyn', label: 'Magazyn', icon: Package },
];

const orderReports = [
  { key: 'zestawienie-szczegolowe', label: 'Szczegółowe zestawienie zleceń', desc: 'Zestawienie zleceń w formie tabeli, z uwzględnieniem towarów i usług oraz zysku' },
  { key: 'czas-pracy', label: 'Szczegółowy raport rzeczywistego czasu pracy', desc: 'Historia rzeczywistego czasu pracy z wybranego zakresu, pogrupowana w zlecenia' },
];

const salesReports = [
  { key: 'zestawienie-sprzedazy', label: 'Szczegółowe zestawienie sprzedaży', desc: 'Zestawienie sprzedaży w formie tabeli z wyszczególnionym zyskiem' },
  { key: 'wz-sprzedaz', label: 'Zestawienie dokumentów WZ do sprzedaży', desc: 'Raport przedstawia zestawienie wygenerowanych dokumentów WZ do dokumentów sprzedaży oraz prezentuje koszt towarów' },
  { key: 'zestawienie-dokumentow', label: 'Zestawienie dokumentów', desc: 'Raport przedstawia zestawienie wszystkich dokumentów sprzedażowych' },
];

const clientReports = [
  { key: 'zestawienie-zlecen', label: 'Zestawienie zleceń', desc: 'Zestawienie zleceń dla wybranego klienta w formie tabeli' },
];

export function WorkshopReports({ providerId, onBack }: Props) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [activeReport, setActiveReport] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [statusFilter, setStatusFilter] = useState('all');
  const [priceMode, setPriceMode] = useState<'netto' | 'brutto'>('brutto');

  const { data: orders = [], isLoading } = useWorkshopOrders(providerId);
  const { data: statuses = [] } = useWorkshopStatuses(providerId);

  const getReportList = () => {
    switch (activeCategory) {
      case 'zlecenia': return orderReports;
      case 'sprzedaz': return salesReports;
      case 'klienci': return clientReports;
      default: return [];
    }
  };

  // Filter orders by date range for reports
  const reportOrders = orders.filter((o: any) => {
    const d = new Date(o.created_at);
    return d >= new Date(dateFrom) && d <= new Date(dateTo + 'T23:59:59') &&
      (statusFilter === 'all' || o.status_name === statusFilter);
  });

  const totalGross = reportOrders.reduce((s: number, o: any) => s + (o.total_gross || 0), 0);
  const totalCost = reportOrders.reduce((s: number, o: any) => {
    const items = o.items || [];
    return s + items.reduce((is: number, i: any) => is + ((i.cost || 0) * (i.quantity || 1)), 0);
  }, 0);

  if (activeReport === 'zestawienie-szczegolowe') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <button onClick={onBack} className="text-primary hover:underline">🏠</button>
          <span className="text-muted-foreground">/</span>
          <button onClick={() => { setActiveReport(null); setActiveCategory(null); }} className="text-primary hover:underline">Raporty</button>
          <span className="text-muted-foreground">/</span>
          <button onClick={() => setActiveReport(null)} className="text-primary hover:underline">Zlecenia</button>
          <span className="text-muted-foreground">/</span>
          <span className="font-semibold">Szczegółowe zestawienie zleceń</span>
          <div className="flex-1" />
          <Button variant="outline" size="sm" className="gap-1">
            <Printer className="h-4 w-4" /> Drukuj
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="py-4">
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className="space-y-1.5">
                <Label>Wybierz zakres czasu</Label>
                <div className="flex items-center gap-2">
                  <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                  <span>—</span>
                  <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Pobieraj po</Label>
                <Select defaultValue="created">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="created">Data utworzenia zlecenia</SelectItem>
                    <SelectItem value="completed">Data zakończenia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status zlecenia</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger><SelectValue placeholder="Wszystkie lub wybierz" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Wszystkie</SelectItem>
                    {statuses.map((s: any) => (
                      <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Pokazuj ceny</Label>
                <div className="flex border rounded-md overflow-hidden">
                  <Button
                    variant={priceMode === 'netto' ? 'default' : 'ghost'}
                    size="sm"
                    className="rounded-none flex-1"
                    onClick={() => setPriceMode('netto')}
                  >NETTO</Button>
                  <Button
                    variant={priceMode === 'brutto' ? 'default' : 'ghost'}
                    size="sm"
                    className="rounded-none flex-1"
                    onClick={() => setPriceMode('brutto')}
                  >BRUTTO</Button>
                </div>
              </div>
            </div>

            <Button className="gap-2">
              <Eye className="h-4 w-4" /> Pokaż raport
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
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Numer zlecenia</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Klient</TableHead>
                    <TableHead>Pojazd</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Przychód</TableHead>
                    <TableHead className="text-right">Koszt</TableHead>
                    <TableHead className="text-right">Zysk</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reportOrders.map((o: any) => {
                    const cost = (o.items || []).reduce((s: number, i: any) => s + ((i.cost || 0) * (i.quantity || 1)), 0);
                    const revenue = o.total_gross || 0;
                    const profit = revenue - cost;
                    return (
                      <TableRow key={o.id}>
                        <TableCell className="font-medium">{o.order_number}</TableCell>
                        <TableCell className="text-sm">{format(new Date(o.created_at), 'yyyy-MM-dd')}</TableCell>
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
                      <TableCell colSpan={5}>Suma</TableCell>
                      <TableCell className="text-right">{totalGross.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-right">{totalCost.toLocaleString('pl-PL', { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className={`text-right ${totalGross - totalCost >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                        {(totalGross - totalCost).toLocaleString('pl-PL', { minimumFractionDigits: 2 })}
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
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <button onClick={onBack} className="text-primary hover:underline">🏠</button>
          <span className="text-muted-foreground">/</span>
          <button onClick={() => setActiveCategory(null)} className="text-primary hover:underline">Raporty</button>
          <span className="text-muted-foreground">/</span>
          <span className="font-semibold capitalize">{activeCategory}</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {reports.map(r => (
            <Card
              key={r.key}
              className="cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all"
              onClick={() => setActiveReport(r.key)}
            >
              <CardContent className="py-6 text-center space-y-2">
                <h3 className="font-semibold">{r.label}</h3>
                <p className="text-sm text-muted-foreground">{r.desc}</p>
              </CardContent>
            </Card>
          ))}
          {reports.length === 0 && (
            <div className="col-span-3 text-center py-12 text-muted-foreground">
              Raporty w tej kategorii — wkrótce dostępne
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
        <h2 className="text-xl font-bold">Raporty</h2>
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
              <span className="font-medium text-sm">{cat.label}</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { Download, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface SettlementPreviewProps {
  periodId: string;
  periodFrom: string;
  periodTo: string;
}

interface DriverSettlement {
  id: string;
  driver_name: string;
  email: string;
  getrido_id: string;
  // Uber
  uber_payout_d: number;
  uber_cash_f: number;
  uber_base: number;
  uber_tax_8: number;
  uber_net: number;
  // Bolt
  bolt_projected_d: number;
  bolt_payout_s: number;
  bolt_cash: number;       // DODANE
  bolt_commission: number; // DODANE
  bolt_tax_8: number;
  bolt_net: number;
  // FreeNow
  freenow_base_s: number;
  freenow_commission_t: number;
  freenow_cash_f: number;
  freenow_tax_8: number;
  freenow_net: number;
  // Totals
  total_cash: number;      // DODANE: suma gotówki wszystkich platform
  // Other
  fuel: number;
  fuel_vat_refund: number;
  rental_fee: number;
  plan_fee: number;
  // Final
  payout: number;
}

export const SettlementPreview = ({ periodId, periodFrom, periodTo }: SettlementPreviewProps) => {
  const [settlements, setSettlements] = useState<DriverSettlement[]>([]);
  const [filteredSettlements, setFilteredSettlements] = useState<DriverSettlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadSettlements();
  }, [periodId]);

  useEffect(() => {
    if (searchQuery) {
      const filtered = settlements.filter(s => 
        s.driver_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.getrido_id.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredSettlements(filtered);
    } else {
      setFilteredSettlements(settlements);
    }
  }, [searchQuery, settlements]);

  const loadSettlements = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('settlements')
        .select(`
          *,
          drivers (
            id,
            first_name,
            last_name,
            email,
            getrido_id
          )
        `)
        .eq('period_from', periodFrom)
        .eq('period_to', periodTo);

      if (error) throw error;

      const formatted: DriverSettlement[] = (data || []).map(item => {
        const amounts = item.amounts as any || {};
        const driver_name = `${item.drivers?.first_name || ''} ${item.drivers?.last_name || ''}`.trim();
        
        // Extract all values
        const uber_net = amounts.uber_net || 0;
        const bolt_net = amounts.bolt_net || 0;
        const freenow_net = amounts.freenow_net || 0;
        const fuel = amounts.fuel || 0;
        const fuel_vat_refund = amounts.fuelVATRefund || amounts.fuel_vat_refund || 0;
        const rental_fee = item.rental_fee || 0;
        const plan_fee = 50; // Default
        
        // Gotówka z każdej platformy
        const uber_cash_f = amounts.uber_cash_f || 0;
        const bolt_cash = amounts.bolt_cash || 0;
        const freenow_cash_f = amounts.freenow_cash_f || 0;
        const total_cash = uber_cash_f + bolt_cash + freenow_cash_f;
        
        // Prowizja Bolt
        const bolt_commission = amounts.bolt_commission || 0;

        // POPRAWIONA FORMUŁA WYPŁATY:
        // Suma net z platform + zwrot VAT - paliwo - opłata planu - wynajem
        // Gotówka NIE jest odejmowana tutaj - jest osobno zwracana przez kierowcę
        const payout = uber_net + bolt_net + freenow_net + fuel_vat_refund - fuel - plan_fee - rental_fee;

        return {
          id: item.id,
          driver_name,
          email: item.drivers?.email || '',
          getrido_id: item.drivers?.getrido_id || '',
          uber_payout_d: amounts.uber_payout_d || 0,
          uber_cash_f,
          uber_base: amounts.uber_base || 0,
          uber_tax_8: amounts.uber_tax_8 || 0,
          uber_net,
          bolt_projected_d: amounts.bolt_projected_d || 0,
          bolt_payout_s: amounts.bolt_payout_s || 0,
          bolt_cash,
          bolt_commission,
          bolt_tax_8: amounts.bolt_tax_8 || 0,
          bolt_net,
          freenow_base_s: amounts.freenow_base_s || 0,
          freenow_commission_t: amounts.freenow_commission_t || 0,
          freenow_cash_f,
          freenow_tax_8: amounts.freenow_tax_8 || 0,
          freenow_net,
          total_cash,
          fuel,
          fuel_vat_refund,
          rental_fee,
          plan_fee,
          payout
        };
      });

      setSettlements(formatted);
      setFilteredSettlements(formatted);
    } catch (error) {
      console.error('Error loading settlements:', error);
      toast.error('Błąd ładowania rozliczeń');
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = () => {
    const data = filteredSettlements.map(s => ({
      'Kierowca': s.driver_name,
      'Email': s.email,
      'GetRido ID': s.getrido_id,
      'Uber Wypłata (D)': s.uber_payout_d,
      'Uber Gotówka (F)': s.uber_cash_f,
      'Uber Podstawa (D+F)': s.uber_base,
      'Uber Podatek 8%': s.uber_tax_8,
      'Uber Netto': s.uber_net,
      'Bolt Brutto (D)': s.bolt_projected_d,
      'Bolt Gotówka (G)': s.bolt_cash,
      'Bolt Payout (S)': s.bolt_payout_s,
      'Bolt Prowizja': s.bolt_commission,
      'Bolt Podatek 8%': s.bolt_tax_8,
      'Bolt Netto': s.bolt_net,
      'FreeNow Podstawa (S)': s.freenow_base_s,
      'FreeNow Prowizja (T)': s.freenow_commission_t,
      'FreeNow Gotówka (F)': s.freenow_cash_f,
      'FreeNow Podatek 8%': s.freenow_tax_8,
      'FreeNow Netto': s.freenow_net,
      'Gotówka RAZEM': s.total_cash,
      'Paliwo': s.fuel,
      'Zwrot VAT': s.fuel_vat_refund,
      'Wynajem': s.rental_fee,
      'Opłata Planu': s.plan_fee,
      'WYPŁATA': s.payout
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rozliczenia');
    XLSX.writeFile(wb, `rozliczenie_${periodFrom}_${periodTo}.xlsx`);
    toast.success('Wyeksportowano do Excel');
  };

  const totals = {
    uber_base: filteredSettlements.reduce((sum, s) => sum + s.uber_base, 0),
    uber_tax_8: filteredSettlements.reduce((sum, s) => sum + s.uber_tax_8, 0),
    uber_net: filteredSettlements.reduce((sum, s) => sum + s.uber_net, 0),
    bolt_projected_d: filteredSettlements.reduce((sum, s) => sum + s.bolt_projected_d, 0),
    bolt_cash: filteredSettlements.reduce((sum, s) => sum + s.bolt_cash, 0),
    bolt_commission: filteredSettlements.reduce((sum, s) => sum + s.bolt_commission, 0),
    bolt_tax_8: filteredSettlements.reduce((sum, s) => sum + s.bolt_tax_8, 0),
    bolt_net: filteredSettlements.reduce((sum, s) => sum + s.bolt_net, 0),
    freenow_base_s: filteredSettlements.reduce((sum, s) => sum + s.freenow_base_s, 0),
    freenow_tax_8: filteredSettlements.reduce((sum, s) => sum + s.freenow_tax_8, 0),
    freenow_net: filteredSettlements.reduce((sum, s) => sum + s.freenow_net, 0),
    total_cash: filteredSettlements.reduce((sum, s) => sum + s.total_cash, 0),
    fuel: filteredSettlements.reduce((sum, s) => sum + s.fuel, 0),
    fuel_vat_refund: filteredSettlements.reduce((sum, s) => sum + s.fuel_vat_refund, 0),
    payout: filteredSettlements.reduce((sum, s) => sum + s.payout, 0)
  };

  if (loading) {
    return <div className="text-center py-8">Ładowanie...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Podgląd Rozliczeń</CardTitle>
            <p className="text-sm text-muted-foreground">
              Okres: {periodFrom} - {periodTo} | Kierowców: {filteredSettlements.length}
            </p>
          </div>
          <div className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Szukaj kierowcy..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-64"
              />
            </div>
            <Button onClick={exportToExcel} variant="outline">
              <Download className="h-4 w-4 mr-2" />
              Excel
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-bold sticky left-0 bg-muted/50 z-10">Kierowca</TableHead>
                <TableHead className="font-bold">ID</TableHead>
                <TableHead colSpan={3} className="text-center font-bold bg-accent/30">Uber</TableHead>
                <TableHead colSpan={4} className="text-center font-bold bg-primary/10">Bolt</TableHead>
                <TableHead colSpan={3} className="text-center font-bold bg-destructive/10">FreeNow</TableHead>
                <TableHead colSpan={2} className="text-center font-bold bg-secondary/50">Paliwo</TableHead>
                <TableHead colSpan={2} className="text-center font-bold bg-muted">Opłaty</TableHead>
                <TableHead className="font-bold bg-primary/20 sticky right-0 z-10">WYPŁATA</TableHead>
              </TableRow>
              <TableRow className="text-xs">
                <TableHead className="sticky left-0 bg-background z-10"></TableHead>
                <TableHead></TableHead>
                <TableHead>D+F</TableHead>
                <TableHead>-8%</TableHead>
                <TableHead>Netto</TableHead>
                <TableHead>D</TableHead>
                <TableHead>G</TableHead>
                <TableHead>-8%</TableHead>
                <TableHead>Netto</TableHead>
                <TableHead>S</TableHead>
                <TableHead>-8%</TableHead>
                <TableHead>Netto</TableHead>
                <TableHead>Koszt</TableHead>
                <TableHead>+VAT</TableHead>
                <TableHead>Wyn.</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="sticky right-0 bg-background z-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSettlements.map((settlement) => (
                <TableRow key={settlement.id} className="hover:bg-muted/50">
                  <TableCell className="font-medium sticky left-0 bg-background z-10">{settlement.driver_name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{settlement.getrido_id}</TableCell>
                  <TableCell>{settlement.uber_base.toFixed(2)}</TableCell>
                  <TableCell className="text-destructive">-{settlement.uber_tax_8.toFixed(2)}</TableCell>
                  <TableCell className="font-semibold">{settlement.uber_net.toFixed(2)}</TableCell>
                  <TableCell>{settlement.bolt_projected_d.toFixed(2)}</TableCell>
                  <TableCell>{settlement.bolt_cash.toFixed(2)}</TableCell>
                  <TableCell className="text-destructive">-{settlement.bolt_tax_8.toFixed(2)}</TableCell>
                  <TableCell className="font-semibold">{settlement.bolt_net.toFixed(2)}</TableCell>
                  <TableCell>{settlement.freenow_base_s.toFixed(2)}</TableCell>
                  <TableCell className="text-destructive">-{settlement.freenow_tax_8.toFixed(2)}</TableCell>
                  <TableCell className="font-semibold">{settlement.freenow_net.toFixed(2)}</TableCell>
                  <TableCell className="text-destructive">-{settlement.fuel.toFixed(2)}</TableCell>
                  <TableCell className="text-primary">+{settlement.fuel_vat_refund.toFixed(2)}</TableCell>
                  <TableCell className="text-destructive">-{settlement.rental_fee.toFixed(2)}</TableCell>
                  <TableCell className="text-destructive">-{settlement.plan_fee.toFixed(2)}</TableCell>
                  <TableCell className="font-bold text-lg bg-primary/20 sticky right-0 z-10">
                    {settlement.payout.toFixed(2)} zł
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="font-bold bg-muted">
                <TableCell className="sticky left-0 bg-muted z-10">SUMA</TableCell>
                <TableCell></TableCell>
                <TableCell>{totals.uber_base.toFixed(2)}</TableCell>
                <TableCell className="text-red-600">-{totals.uber_tax_8.toFixed(2)}</TableCell>
                <TableCell>-</TableCell>
                <TableCell>{totals.uber_net.toFixed(2)}</TableCell>
                <TableCell>{totals.bolt_projected_d.toFixed(2)}</TableCell>
                <TableCell className="text-red-600">-{totals.bolt_tax_8.toFixed(2)}</TableCell>
                <TableCell>-</TableCell>
                <TableCell>{totals.bolt_net.toFixed(2)}</TableCell>
                <TableCell>{totals.freenow_base_s.toFixed(2)}</TableCell>
                <TableCell>-</TableCell>
                <TableCell>-</TableCell>
                <TableCell className="text-red-600">-{totals.freenow_tax_8.toFixed(2)}</TableCell>
                <TableCell>{totals.freenow_net.toFixed(2)}</TableCell>
                <TableCell className="text-red-600">-{totals.fuel.toFixed(2)}</TableCell>
                <TableCell className="text-green-600">+{totals.fuel_vat_refund.toFixed(2)}</TableCell>
                <TableCell>-</TableCell>
                <TableCell>-</TableCell>
                <TableCell className="text-2xl bg-yellow-500/30 sticky right-0 z-10">
                  {totals.payout.toFixed(2)} zł
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Statystyki Uber</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Podstawa (D+F):</span>
                  <span className="font-semibold">{totals.uber_base.toFixed(2)} zł</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Podatek 8%:</span>
                  <span className="font-semibold text-red-600">-{totals.uber_tax_8.toFixed(2)} zł</span>
                </div>
                <div className="flex justify-between border-t pt-1">
                  <span className="font-bold">Netto:</span>
                  <span className="font-bold">{totals.uber_net.toFixed(2)} zł</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Statystyki Bolt</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Projected (D):</span>
                  <span className="font-semibold">{totals.bolt_projected_d.toFixed(2)} zł</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Podatek 8%:</span>
                  <span className="font-semibold text-red-600">-{totals.bolt_tax_8.toFixed(2)} zł</span>
                </div>
                <div className="flex justify-between border-t pt-1">
                  <span className="font-bold">Netto:</span>
                  <span className="font-bold">{totals.bolt_net.toFixed(2)} zł</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Statystyki FreeNow</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Podstawa (S):</span>
                  <span className="font-semibold">{totals.freenow_base_s.toFixed(2)} zł</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Podatek 8%:</span>
                  <span className="font-semibold text-red-600">-{totals.freenow_tax_8.toFixed(2)} zł</span>
                </div>
                <div className="flex justify-between border-t pt-1">
                  <span className="font-bold">Netto:</span>
                  <span className="font-bold">{totals.freenow_net.toFixed(2)} zł</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-4">
          <Card className="bg-gradient-to-br from-yellow-500/20 to-orange-500/20 border-yellow-500/50">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Łączna wypłata dla {filteredSettlements.length} kierowców</p>
                  <p className="text-4xl font-bold mt-2">{totals.payout.toFixed(2)} zł</p>
                </div>
                <Badge variant="secondary" className="text-lg px-4 py-2">
                  Średnia: {(totals.payout / (filteredSettlements.length || 1)).toFixed(2)} zł
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
};

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface SettlementPeriod {
  id: string;
  week_start: string;
  week_end: string;
  status: string;
}

interface Settlement {
  id: string;
  driver_id: string;
  platform: string;
  total_earnings: number;
  commission_amount: number;
  net_amount: number;
  drivers: {
    first_name: string;
    last_name: string;
    email: string;
  };
}

export default function SettlementSheet() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [settlementPeriod, setSettlementPeriod] = useState<SettlementPeriod | null>(null);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');

  useEffect(() => {
    loadData();
  }, [id]);

  const loadData = async () => {
    if (!id) return;

    try {
      // Load settlement period
      const { data: periodData, error: periodError } = await supabase
        .from('settlement_periods')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      if (periodError) throw periodError;
      setSettlementPeriod(periodData);

      if (!periodData) return;

      // Load settlements for this period
      const { data: settlementsData, error: settlementsError } = await supabase
        .from('settlements')
        .select(`
          id,
          driver_id,
          platform,
          total_earnings,
          commission_amount,
          net_amount,
          drivers (
            first_name,
            last_name,
            email
          )
        `)
        .eq('week_start', periodData.week_start)
        .eq('week_end', periodData.week_end)
        .order('platform', { ascending: true })
        .order('drivers(last_name)', { ascending: true });

      if (settlementsError) throw settlementsError;
      setSettlements(settlementsData || []);
    } catch (error) {
      console.error('Error loading settlement:', error);
      toast.error('Błąd ładowania rozliczenia');
    } finally {
      setLoading(false);
    }
  };

  const exportToCSV = () => {
    if (!settlements.length || !settlementPeriod) return;

    const filteredData = selectedPlatform === 'all' 
      ? settlements 
      : settlements.filter(s => s.platform === selectedPlatform);

    const csvContent = [
      ['Imię', 'Nazwisko', 'Email', 'Platforma', 'Zarobki', 'Prowizja', 'Do wypłaty'],
      ...filteredData.map(s => [
        s.drivers?.first_name || '',
        s.drivers?.last_name || '',
        s.drivers?.email || '',
        s.platform,
        s.total_earnings?.toString() || '0',
        s.commission_amount?.toString() || '0',
        s.net_amount?.toString() || '0'
      ])
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `rozliczenie_${settlementPeriod.week_start}_${settlementPeriod.week_end}.csv`;
    link.click();
    toast.success('Eksport zakończony');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center">
        <p className="text-muted-foreground">Ładowanie...</p>
      </div>
    );
  }

  if (!settlementPeriod) {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Nie znaleziono rozliczenia</p>
          <Button onClick={() => navigate('/admin/dashboard')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Powrót do panelu
          </Button>
        </div>
      </div>
    );
  }

  const filteredSettlements = selectedPlatform === 'all' 
    ? settlements 
    : settlements.filter(s => s.platform === selectedPlatform);

  const totals = filteredSettlements.reduce((acc, s) => ({
    earnings: acc.earnings + (s.total_earnings || 0),
    commission: acc.commission + (s.commission_amount || 0),
    net: acc.net + (s.net_amount || 0)
  }), { earnings: 0, commission: 0, net: 0 });

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Header */}
      <div className="bg-card border-b shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                onClick={() => navigate('/admin/dashboard')}
                className="gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Powrót
              </Button>
              <div>
                <h1 className="text-xl font-bold text-foreground">
                  Rozliczenie {new Date(settlementPeriod.week_start).toLocaleDateString('pl-PL')} - {new Date(settlementPeriod.week_end).toLocaleDateString('pl-PL')}
                </h1>
                <p className="text-sm text-muted-foreground">
                  Status: <span className="font-medium">{settlementPeriod.status}</span>
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={exportToCSV}
              className="gap-2"
              disabled={!settlements.length}
            >
              <Download className="h-4 w-4" />
              Eksportuj CSV
            </Button>
          </div>

          <div className="flex items-center gap-4">
            <Select value={selectedPlatform} onValueChange={setSelectedPlatform}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Platforma" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie platformy</SelectItem>
                <SelectItem value="uber">Uber</SelectItem>
                <SelectItem value="bolt">Bolt</SelectItem>
                <SelectItem value="freenow">FreeNow</SelectItem>
                <SelectItem value="main">Main</SelectItem>
              </SelectContent>
            </Select>
            <div className="text-sm text-muted-foreground">
              Znaleziono: {filteredSettlements.length} rozliczeń
            </div>
          </div>
        </div>
      </div>

      {/* Settlements Table */}
      <div className="container mx-auto px-4 py-6">
        <div className="bg-card rounded-lg shadow-sm border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kierowca</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Platforma</TableHead>
                <TableHead className="text-right">Zarobki</TableHead>
                <TableHead className="text-right">Prowizja</TableHead>
                <TableHead className="text-right">Do wypłaty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSettlements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    Brak danych do wyświetlenia
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {filteredSettlements.map((settlement) => (
                    <TableRow key={settlement.id}>
                      <TableCell className="font-medium">
                        {settlement.drivers?.first_name} {settlement.drivers?.last_name}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {settlement.drivers?.email || '-'}
                      </TableCell>
                      <TableCell>
                        <span className="px-2 py-1 rounded-md text-xs font-medium bg-primary/10 text-primary">
                          {settlement.platform}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {(settlement.total_earnings || 0).toFixed(2)} zł
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {(settlement.commission_amount || 0).toFixed(2)} zł
                      </TableCell>
                      <TableCell className="text-right font-mono font-semibold">
                        {(settlement.net_amount || 0).toFixed(2)} zł
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell colSpan={3}>SUMA</TableCell>
                    <TableCell className="text-right font-mono">
                      {totals.earnings.toFixed(2)} zł
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {totals.commission.toFixed(2)} zł
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {totals.net.toFixed(2)} zł
                    </TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

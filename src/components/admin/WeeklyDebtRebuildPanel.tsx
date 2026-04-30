import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, AlertTriangle, Calculator } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Fleet { id: string; name: string }

export function WeeklyDebtRebuildPanel() {
  const { toast } = useToast();
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [fleetId, setFleetId] = useState<string>('');
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [startWeek, setStartWeek] = useState<number>(13);
  const [dryRun, setDryRun] = useState<boolean>(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const loadFleets = async () => {
    const { data } = await supabase.from('fleets').select('id, name').order('name');
    setFleets(data || []);
  };

  if (!fleets.length) loadFleets();

  const handleRun = async () => {
    if (!fleetId) {
      toast({ title: 'Wybierz flotę', variant: 'destructive' });
      return;
    }
    if (!dryRun) {
      const ok = window.confirm(
        `UWAGA: To jest ZAPIS do bazy. Przeliczy długi tygodniowe od t.${startWeek}/${year} dla wybranej floty i nadpisze settlements.debt_before/debt_after/debt_payment/actual_payout. Kontynuować?`
      );
      if (!ok) return;
    }
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke('weekly-debt-rebuild', {
        body: {
          start_week: startWeek,
          year,
          dry_run: dryRun,
          fleet_id: fleetId,
          limit: 100,
          only_diffs: true,
        },
      });
      if (error) throw error;
      setResult(data);
      toast({
        title: dryRun ? 'Dry-run zakończony' : 'Rebuild zapisany',
        description: `Kierowców: ${data.drivers_processed}, z różnicami: ${data.drivers_with_diffs}, wpłat zmigrowano: ${data.payments_migrated || 0}`,
      });
    } catch (e: any) {
      toast({ title: 'Błąd', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5" />
          Przebudowa długów tygodniowych
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Przelicza opening_debt / remaining_debt od wskazanego tygodnia UI dla wybranej floty.
          Numeracja tygodni zgodna z UI (pierwszy poniedziałek roku = t.1).
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-2">
            <Label>Flota</Label>
            <Select value={fleetId} onValueChange={setFleetId}>
              <SelectTrigger><SelectValue placeholder="Wybierz flotę" /></SelectTrigger>
              <SelectContent>
                {fleets.map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Rok</Label>
            <Input type="number" value={year} onChange={e => setYear(Number(e.target.value))} />
          </div>
          <div className="space-y-2">
            <Label>Tydzień startowy (UI)</Label>
            <Input type="number" value={startWeek} onChange={e => setStartWeek(Number(e.target.value))} />
          </div>
        </div>

        <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
          <Switch checked={dryRun} onCheckedChange={setDryRun} id="dry-run" />
          <Label htmlFor="dry-run" className="cursor-pointer">
            Dry-run (tylko raport, bez zapisu)
          </Label>
          {!dryRun && (
            <span className="ml-auto flex items-center gap-1 text-destructive text-sm font-medium">
              <AlertTriangle className="h-4 w-4" />
              ZAPIS DO BAZY
            </span>
          )}
        </div>

        <Button onClick={handleRun} disabled={loading || !fleetId} className="w-full">
          {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {dryRun ? 'Uruchom dry-run' : 'Uruchom rebuild i zapisz'}
        </Button>

        {result && (
          <div className="mt-4 p-3 rounded-md bg-muted/30 text-sm space-y-1">
            <div>Tryb: <strong>{result.dry_run ? 'DRY-RUN' : 'ZAPIS'}</strong></div>
            <div>Start: t.{result.start_week}/{result.year} = {result.start_date}</div>
            <div>Kierowców przetworzonych: {result.drivers_processed}</div>
            <div>Z różnicami vs stare dane: {result.drivers_with_diffs}</div>
            {!result.dry_run && (
              <>
                <div>Tygodni zapisanych: {result.weeks_written}</div>
                <div>Wpłat zmigrowano: {result.payments_migrated}</div>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

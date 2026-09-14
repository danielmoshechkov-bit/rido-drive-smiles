import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Edit, Plus, Trash2, Wallet } from 'lucide-react';
import { BladZapisu, wykonajZapis } from '@/lib/zapisRozliczen';
import {
  KLUCZ_PLANY,
  PlanRozliczenWiersz,
  opisPlanu,
  usePlanyRozliczen,
} from '@/hooks/usePlanyRozliczen';

/**
 * Plany rozliczeń floty — „Ustawienia rozliczeń → Plany rozliczeń".
 *
 * Partner prowadzi część kierowców na „8% + 50 zł", a część na „159 zł bez
 * podatku". Plan jest przypisywany KIEROWCY (karta kierowcy albo popover „i"
 * w tabeli rozliczeń) i nadpisuje ustawienia miasta.
 *
 * ZASADA: puste pole planu = „zostaw jak jest" (stawka z ustawień miasta
 * kierowcy). Dzięki temu plan domyślny, który dostają wszyscy, nie zmienia
 * nikomu ani grosza — a plan ryczałtowy zmienia dokładnie to, co w nim wpisano.
 */
export function FleetSettlementPlans({ fleetId }: { fleetId: string }) {
  const klient = useQueryClient();
  const { data: plany, isLoading, error } = usePlanyRozliczen(fleetId);

  const [oknoOtwarte, setOknoOtwarte] = useState(false);
  const [edytowany, setEdytowany] = useState<PlanRozliczenWiersz | null>(null);
  const [zapisuje, setZapisuje] = useState(false);

  const [nazwa, setNazwa] = useState('');
  const [podatekWlaczony, setPodatekWlaczony] = useState(true);
  const [stawka, setStawka] = useState('');
  const [oplata, setOplata] = useState('');
  const [dwaPodatki, setDwaPodatki] = useState(false);
  const [domyslny, setDomyslny] = useState(false);

  const odswiez = () => klient.invalidateQueries({ queryKey: [KLUCZ_PLANY] });

  const otworzNowy = () => {
    setEdytowany(null);
    setNazwa('');
    setPodatekWlaczony(true);
    setStawka('');
    setOplata('');
    setDwaPodatki(false);
    setDomyslny(false);
    setOknoOtwarte(true);
  };

  const otworzEdycje = (plan: PlanRozliczenWiersz) => {
    setEdytowany(plan);
    setNazwa(plan.name);
    setPodatekWlaczony(plan.tax_enabled);
    setStawka(plan.tax_percentage === null ? '' : String(plan.tax_percentage));
    setOplata(plan.base_fee === null ? '' : String(plan.base_fee));
    setDwaPodatki(plan.settlement_mode === 'dual_tax');
    setDomyslny(plan.is_default);
    setOknoOtwarte(true);
  };

  const liczbaAlboNull = (tekst: string): number | null => {
    const czyste = tekst.trim().replace(',', '.');
    if (czyste === '') return null;
    const n = Number(czyste);
    return Number.isFinite(n) ? n : null;
  };

  const zapisz = async () => {
    if (!nazwa.trim()) {
      toast.error('Podaj nazwę planu — bez niej nie da się ich rozróżnić na liście kierowców');
      return;
    }
    setZapisuje(true);
    try {
      const dane = {
        name: nazwa.trim(),
        fleet_id: fleetId,
        tax_enabled: podatekWlaczony,
        tax_percentage: podatekWlaczony ? liczbaAlboNull(stawka) : null,
        base_fee: liczbaAlboNull(oplata),
        settlement_mode: dwaPodatki ? 'dual_tax' : null,
        is_default: domyslny,
        is_active: true,
      };

      // Jeden plan domyślny na flotę — pilnuje tego też indeks w bazie,
      // ale bez tego kroku zapis padłby na kluczu zamiast po prostu przestawić.
      if (domyslny) {
        const doZdjecia = (plany || []).filter(
          (p) => p.is_default && p.fleet_id === fleetId && p.id !== edytowany?.id,
        );
        for (const p of doZdjecia) {
          await wykonajZapis(
            (supabase as any).from('settlement_plans').update({ is_default: false }).eq('id', p.id).select('id'),
            `Zdjęcie domyślności z planu ${p.name}`,
          );
        }
      }

      if (edytowany) {
        await wykonajZapis(
          (supabase as any).from('settlement_plans').update(dane).eq('id', edytowany.id).select('id'),
          `Zapis planu ${dane.name}`,
        );
      } else {
        await wykonajZapis(
          (supabase as any).from('settlement_plans').insert([dane]).select('id'),
          `Dodanie planu ${dane.name}`,
        );
      }

      toast.success(edytowany ? 'Plan zapisany' : 'Plan dodany');
      setOknoOtwarte(false);
      await odswiez();
    } catch (blad: any) {
      toast.error(blad instanceof BladZapisu ? blad.message : `Błąd zapisu: ${blad?.message || 'nieznany'}`);
    } finally {
      setZapisuje(false);
    }
  };

  const usun = async (plan: PlanRozliczenWiersz) => {
    if (!confirm(`Usunąć plan „${plan.name}"? Kierowcy z tym planem wrócą na stawki miasta.`)) return;
    try {
      await wykonajZapis(
        (supabase as any).from('settlement_plans').delete().eq('id', plan.id).select('id'),
        `Usunięcie planu ${plan.name}`,
      );
      toast.success(`Usunięto plan „${plan.name}"`);
      await odswiez();
    } catch (blad: any) {
      toast.error(blad instanceof BladZapisu ? blad.message : `Błąd usuwania: ${blad?.message || 'nieznany'}`);
      await odswiez();
    }
  };

  const wlasnePlany = (plany || []).filter((p) => p.fleet_id === fleetId);
  const planyPlatformy = (plany || []).filter((p) => !p.fleet_id);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4" />
              Plany rozliczeń
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Plan przypisujesz kierowcy na jego karcie albo w popoverze „i" w tabeli rozliczeń.
              Puste pole planu = wartość z ustawień miasta.
            </CardDescription>
          </div>
          <Button size="sm" onClick={otworzNowy} className="gap-1">
            <Plus className="h-3 w-3" /> Dodaj plan
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="text-sm text-destructive py-4">
            Nie udało się wczytać planów: {(error as any)?.message}
          </div>
        ) : isLoading ? (
          <div className="text-center py-4 text-muted-foreground text-sm">Ładowanie…</div>
        ) : wlasnePlany.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            Brak własnych planów. Dopóki ich nie ma, wszyscy kierowcy liczą się po ustawieniach miasta.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Nazwa</TableHead>
                  <TableHead className="text-xs">Podatek</TableHead>
                  <TableHead className="text-xs">Opłata stała</TableHead>
                  <TableHead className="text-xs">Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wlasnePlany.map((plan) => (
                  <TableRow key={plan.id} className="hover:bg-primary/10">
                    <TableCell className="text-sm font-medium">
                      <span className="flex items-center gap-2 flex-wrap">
                        {plan.name}
                        {plan.is_default && <Badge variant="secondary" className="text-[10px]">domyślny</Badge>}
                        {plan.settlement_mode === 'dual_tax' && (
                          <Badge variant="outline" className="text-[10px]">dwa podatki</Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {plan.tax_enabled
                        ? (plan.tax_percentage === null ? 'wg miasta' : `${plan.tax_percentage}%`)
                        : <span className="text-muted-foreground">bez podatku</span>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {plan.base_fee === null ? 'wg miasta' : `${plan.base_fee} zł`}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => otworzEdycje(plan)}>
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => usun(plan)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {planyPlatformy.length > 0 && (
          <p className="text-[11px] text-muted-foreground mt-3">
            Plany ogólnoplatformowe (tylko do wyboru, edytuje je administrator):{' '}
            {planyPlatformy.map((p) => `${p.name} (${opisPlanu(p)})`).join(', ')}
          </p>
        )}
      </CardContent>

      <Dialog open={oknoOtwarte} onOpenChange={setOknoOtwarte}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{edytowany ? `Edytuj plan — ${edytowany.name}` : 'Nowy plan rozliczeń'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nazwa *</Label>
              <Input
                value={nazwa}
                onChange={(e) => setNazwa(e.target.value)}
                placeholder="np. 8% + 50 zł albo Ryczałt 159 zł"
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-2">
              <div>
                <p className="text-xs font-medium">Naliczaj podatek</p>
                <p className="text-[10px] text-muted-foreground">
                  Wyłączone = ryczałt: zero podatku i zero odliczenia VAT od paliwa.
                </p>
              </div>
              <Switch checked={podatekWlaczony} onCheckedChange={setPodatekWlaczony} />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Stawka podatku (%)</Label>
                <Input
                  type="number"
                  value={stawka}
                  disabled={!podatekWlaczony}
                  onChange={(e) => setStawka(e.target.value)}
                  placeholder="puste = wg miasta"
                />
              </div>
              <div>
                <Label className="text-xs">Opłata stała (zł)</Label>
                <Input
                  type="number"
                  value={oplata}
                  onChange={(e) => setOplata(e.target.value)}
                  placeholder="puste = wg miasta"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border p-2">
              <div>
                <p className="text-xs font-medium">Tryb „dwa podatki"</p>
                <p className="text-[10px] text-muted-foreground">
                  Drugi podatek od kampanii i rekompensat Bolta. Wyłączone = tryb z ustawień miasta.
                </p>
              </div>
              <Switch checked={dwaPodatki} onCheckedChange={setDwaPodatki} />
            </div>

            <div className="flex items-center justify-between rounded-md border p-2">
              <div>
                <p className="text-xs font-medium">Plan domyślny</p>
                <p className="text-[10px] text-muted-foreground">Dostaje go każdy nowy kierowca tej floty.</p>
              </div>
              <Switch checked={domyslny} onCheckedChange={setDomyslny} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOknoOtwarte(false)}>Anuluj</Button>
            <Button onClick={zapisz} disabled={zapisuje}>
              {zapisuje ? 'Zapisywanie…' : edytowany ? 'Zapisz' : 'Dodaj'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

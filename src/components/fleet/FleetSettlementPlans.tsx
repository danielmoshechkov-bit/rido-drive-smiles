import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Edit, Plus, Trash2, Wallet } from 'lucide-react';
import { useCities } from '@/hooks/useCities';
import { BladZapisu, wykonajZapis } from '@/lib/zapisRozliczen';
import { KLUCZ_PLANY, PlanFloty, opisPlanu, usePlanyFloty } from '@/hooks/usePlanyRozliczen';

/**
 * Panel jednej platformy (Bolt albo Uber) w oknie planu.
 *
 * MUSI być zdefiniowany POZA komponentem karty. Gdy siedział w ciele
 * `FleetCitySettings`, każdy render tworzył NOWY typ komponentu, więc React
 * odmontowywał drzewo zamiast je dopasować — pole „Opłata stała" gubiło ognisko
 * po KAŻDYM znaku.
 */
const PanelPlatformy = ({ platform, mode, setMode, vat, setVat, baseFee, setBaseFee, additional, setAdditional, secondaryVat, setSecondaryVat, email, setEmail, calcMode, setCalcMode }: {
  platform: 'bolt' | 'uber';
  mode: string; setMode: (v: 'single_tax' | 'dual_tax') => void;
  vat: string; setVat: (v: string) => void;
  baseFee: string; setBaseFee: (v: string) => void;
  additional: string; setAdditional: (v: string) => void;
  secondaryVat: string; setSecondaryVat: (v: string) => void;
  email?: string; setEmail?: (v: string) => void;
  calcMode?: string; setCalcMode?: (v: 'netto' | 'brutto') => void;
}) => (
  <div className="space-y-3">
    <div className="flex items-center gap-2">
      {platform === 'bolt'
        ? <Badge className="bg-green-600 text-white">Bolt</Badge>
        : <Badge className="bg-black text-white">Uber</Badge>}
    </div>

    <div>
      <Label className="text-xs">Tryb rozliczeń</Label>
      <div className="grid grid-cols-2 gap-2 mt-1">
        <label className={`flex flex-col items-center p-2 border rounded-lg cursor-pointer transition-colors text-center ${mode === 'single_tax' ? 'border-primary bg-primary/10' : 'hover:bg-muted'}`}>
          <input type="radio" className="sr-only" checked={mode === 'single_tax'} onChange={() => setMode('single_tax')} />
          <span className="text-xs font-medium">Jeden podatek</span>
          <span className="text-[10px] text-muted-foreground">{platform === 'bolt' ? 'VAT od brutto' : 'VAT od zarobku z gotówką'}</span>
        </label>
        <label className={`flex flex-col items-center p-2 border rounded-lg cursor-pointer transition-colors text-center ${mode === 'dual_tax' ? 'border-primary bg-primary/10' : 'hover:bg-muted'}`}>
          <input type="radio" className="sr-only" checked={mode === 'dual_tax'} onChange={() => setMode('dual_tax')} />
          <span className="text-xs font-medium">Dwa podatki</span>
          <span className="text-[10px] text-muted-foreground">{platform === 'bolt' ? '8% + 23%' : 'netto/brutto + kampanie'}</span>
        </label>
      </div>
    </div>

    {platform === 'uber' && mode === 'dual_tax' && calcMode !== undefined && setCalcMode && (
      <div>
        <Label className="text-xs">Sposób obliczania</Label>
        <div className="grid grid-cols-2 gap-2 mt-1">
          <label className={`flex flex-col items-center p-2 border rounded-lg cursor-pointer transition-colors text-center ${calcMode === 'netto' ? 'border-primary bg-primary/10' : 'hover:bg-muted'}`}>
            <input type="radio" className="sr-only" checked={calcMode === 'netto'} onChange={() => setCalcMode('netto')} />
            <span className="text-xs font-medium">Od netto</span>
            <span className="text-[10px] text-muted-foreground">netto + 25%</span>
          </label>
          <label className={`flex flex-col items-center p-2 border rounded-lg cursor-pointer transition-colors text-center ${calcMode === 'brutto' ? 'border-primary bg-primary/10' : 'hover:bg-muted'}`}>
            <input type="radio" className="sr-only" checked={calcMode === 'brutto'} onChange={() => setCalcMode('brutto')} />
            <span className="text-xs font-medium">Od brutto</span>
            <span className="text-[10px] text-muted-foreground">kol. G z CSV</span>
          </label>
        </div>
      </div>
    )}

    <div className="grid grid-cols-2 gap-2">
      <div>
        <Label className="text-xs">VAT (%)</Label>
        <Input type="number" value={vat} onChange={(e) => setVat(e.target.value)} />
        <p className="text-[9px] text-muted-foreground mt-0.5">0 = plan ryczałtowy, bez podatku</p>
      </div>
      <div>
        <Label className="text-xs">Opłata stała (zł)</Label>
        <Input type="number" value={baseFee} onChange={(e) => setBaseFee(e.target.value)} />
      </div>
    </div>

    {mode === 'dual_tax' && (
      <div className="grid grid-cols-2 gap-2 border-t pt-2">
        <div>
          <Label className="text-xs">Dod. % od brutto</Label>
          <Input type="number" value={additional} onChange={(e) => setAdditional(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">VAT kampanie (%)</Label>
          <Input type="number" value={secondaryVat} onChange={(e) => setSecondaryVat(e.target.value)} />
        </div>
      </div>
    )}

    {platform === 'bolt' && email !== undefined && setEmail && (
      <div>
        <Label className="text-xs">Mail do faktur (B2B)</Label>
        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="faktury@firma.pl" />
      </div>
    )}
  </div>
);

/**
 * Plany rozliczeń floty — JEDNA karta w „Ustawieniach rozliczeń".
 *
 * Plan ma nazwę (po niej wybiera się go przy kierowcy), opcjonalne miasto
 * i przełącznik „domyślny" (ten plan dostaje każdy nowy kierowca). Ustawienia
 * Bolt i Uber są takie same jak dotąd — zmienia się to, że komplet ma nazwę
 * i że można mieć ich kilka na jedno miasto.
 */
export function FleetSettlementPlans({ fleetId, focusCityName }: { fleetId: string; focusCityName?: string | null }) {
  const klient = useQueryClient();
  const { data: plany, isLoading, error } = usePlanyFloty(fleetId);
  const { cities: dostepneMiasta, addCity: dodajMiasto } = useCities();

  const [oknoOtwarte, setOknoOtwarte] = useState(false);
  const [edytowany, setEdytowany] = useState<PlanFloty | null>(null);
  const [zapisuje, setZapisuje] = useState(false);

  const [nazwa, setNazwa] = useState('');
  const [miasto, setMiasto] = useState('brak');
  const [noweMiasto, setNoweMiasto] = useState('');
  const [domyslny, setDomyslny] = useState(false);

  const [boltMode, setBoltMode] = useState<'single_tax' | 'dual_tax'>('single_tax');
  const [boltVat, setBoltVat] = useState('8');
  const [boltBaseFee, setBoltBaseFee] = useState('50');
  const [boltAdditional, setBoltAdditional] = useState('0');
  const [boltSecondaryVat, setBoltSecondaryVat] = useState('23');
  const [boltEmail, setBoltEmail] = useState('');

  const [uberMode, setUberMode] = useState<'single_tax' | 'dual_tax'>('single_tax');
  const [uberVat, setUberVat] = useState('8');
  const [uberBaseFee, setUberBaseFee] = useState('50');
  const [uberAdditional, setUberAdditional] = useState('0');
  const [uberSecondaryVat, setUberSecondaryVat] = useState('23');
  const [uberCalcMode, setUberCalcMode] = useState<'netto' | 'brutto'>('netto');

  const odswiez = () => klient.invalidateQueries({ queryKey: [KLUCZ_PLANY] });

  const wyczyscFormularz = () => {
    setNazwa('');
    setMiasto('brak');
    setNoweMiasto('');
    setDomyslny(false);
    setBoltMode('single_tax'); setBoltVat('8'); setBoltBaseFee('50');
    setBoltAdditional('0'); setBoltSecondaryVat('23'); setBoltEmail('');
    setUberMode('single_tax'); setUberVat('8'); setUberBaseFee('50');
    setUberAdditional('0'); setUberSecondaryVat('23'); setUberCalcMode('netto');
  };

  const otworzNowy = (miastoZGory?: string | null) => {
    setEdytowany(null);
    wyczyscFormularz();
    if (miastoZGory) {
      setMiasto(miastoZGory);
      setNazwa(miastoZGory);
    }
    setOknoOtwarte(true);
  };

  const otworzEdycje = (plan: PlanFloty) => {
    setEdytowany(plan);
    setNazwa(plan.name);
    setMiasto(plan.city_name || 'brak');
    setNoweMiasto('');
    setDomyslny(plan.is_default);
    const b = plan.bolt;
    setBoltMode(((b?.settlement_mode as any) || 'single_tax'));
    setBoltVat(String(b?.vat_rate ?? 8));
    setBoltBaseFee(String(b?.base_fee ?? 50));
    setBoltAdditional(String(b?.additional_percent_rate ?? 0));
    setBoltSecondaryVat(String(b?.secondary_vat_rate ?? 23));
    setBoltEmail(b?.invoice_email || '');
    const u = plan.uber;
    setUberMode(((u?.settlement_mode as any) || 'single_tax'));
    setUberVat(String(u?.vat_rate ?? 8));
    setUberBaseFee(String(u?.base_fee ?? 50));
    setUberAdditional(String(u?.additional_percent_rate ?? 0));
    setUberSecondaryVat(String(u?.secondary_vat_rate ?? 23));
    setUberCalcMode(((u?.uber_calculation_mode as any) || 'netto'));
    setOknoOtwarte(true);
  };

  // Kliknięcie wykrzyknika przy kwocie podatku prowadzi tutaj z nazwą miasta,
  // dla którego nie ma jeszcze planu — otwieramy okno z wypełnionym miastem.
  const obsluzoneMiastoRef = useRef<string | null>(null);
  useEffect(() => {
    if (!focusCityName || isLoading) return;
    if (obsluzoneMiastoRef.current === focusCityName) return;
    obsluzoneMiastoRef.current = focusCityName;
    const istniejacy = (plany || []).find((p) => p.city_name === focusCityName);
    if (istniejacy) otworzEdycje(istniejacy);
    else otworzNowy(focusCityName);
  }, [focusCityName, isLoading, plany]);

  const liczba = (tekst: string, domyslna: number) => {
    const n = parseFloat((tekst || '').replace(',', '.'));
    return Number.isFinite(n) ? n : domyslna;
  };

  const zapisz = async () => {
    if (!nazwa.trim()) {
      toast.error('Podaj nazwę planu — po niej wybiera się plan przy kierowcy');
      return;
    }

    let finalneMiasto: string | null = miasto === 'brak' ? null : miasto;
    if (miasto === '__nowe__') {
      if (!noweMiasto.trim()) { toast.error('Podaj nazwę nowego miasta'); return; }
      finalneMiasto = noweMiasto.trim();
      try { await dodajMiasto(finalneMiasto); } catch (err: any) {
        if (!err?.message?.includes('duplicate')) { toast.error('Błąd dodawania miasta: ' + err.message); return; }
      }
    }

    setZapisuje(true);
    try {
      // Jeden plan domyślny na flotę — zdejmujemy przełącznik z pozostałych,
      // zanim zapiszemy nowy. Bez tego zapis padłby na indeksie unikalnym.
      if (domyslny) {
        for (const p of (plany || []).filter((p) => p.is_default && p.id !== edytowany?.id)) {
          await wykonajZapis(
            (supabase as any).from('fleet_settlement_plans').update({ is_default: false }).eq('id', p.id).select('id'),
            `Zdjęcie domyślności z planu ${p.name}`,
          );
        }
      }

      const danePlanu = {
        fleet_id: fleetId,
        name: nazwa.trim(),
        city_name: finalneMiasto,
        is_default: domyslny,
        is_active: true,
      };

      let planId = edytowany?.id;
      if (edytowany) {
        await wykonajZapis(
          (supabase as any).from('fleet_settlement_plans').update(danePlanu).eq('id', edytowany.id).select('id'),
          `Zapis planu ${danePlanu.name}`,
        );
      } else {
        const { wiersze } = await wykonajZapis(
          (supabase as any).from('fleet_settlement_plans').insert([danePlanu]).select('id'),
          `Dodanie planu ${danePlanu.name}`,
        );
        planId = (wiersze[0] as any).id;
      }

      const wspolne = { fleet_id: fleetId, plan_id: planId, city_name: finalneMiasto, is_active: true };
      const ustawieniaBolt = {
        ...wspolne,
        platform: 'bolt',
        settlement_mode: boltMode,
        vat_rate: liczba(boltVat, 0),
        base_fee: liczba(boltBaseFee, 0),
        additional_percent_rate: liczba(boltAdditional, 0),
        secondary_vat_rate: liczba(boltSecondaryVat, 23),
        invoice_email: boltEmail.trim() || null,
        uber_calculation_mode: null,
      };
      const ustawieniaUber = {
        ...wspolne,
        platform: 'uber',
        settlement_mode: uberMode,
        vat_rate: liczba(uberVat, 0),
        base_fee: liczba(uberBaseFee, 0),
        additional_percent_rate: liczba(uberAdditional, 0),
        secondary_vat_rate: liczba(uberSecondaryVat, 23),
        invoice_email: null,
        uber_calculation_mode: uberCalcMode,
      };

      for (const [ustawienia, istniejace] of [
        [ustawieniaBolt, edytowany?.bolt],
        [ustawieniaUber, edytowany?.uber],
      ] as const) {
        if (istniejace) {
          await wykonajZapis(
            (supabase as any).from('fleet_city_settings').update(ustawienia).eq('id', istniejace.id).select('id'),
            `Zapis ustawień ${ustawienia.platform} planu ${danePlanu.name}`,
          );
        } else {
          await wykonajZapis(
            (supabase as any).from('fleet_city_settings').insert([ustawienia]).select('id'),
            `Dodanie ustawień ${ustawienia.platform} planu ${danePlanu.name}`,
          );
        }
      }

      toast.success(edytowany ? `Plan „${danePlanu.name}" zapisany` : `Plan „${danePlanu.name}" dodany`);
      setOknoOtwarte(false);
      await odswiez();
    } catch (blad: any) {
      toast.error(blad instanceof BladZapisu ? blad.message : `Błąd zapisu: ${blad?.message || 'nieznany'}`);
    } finally {
      setZapisuje(false);
    }
  };

  const usun = async (plan: PlanFloty) => {
    if (!confirm(`Usunąć plan „${plan.name}"? Kierowcy z tym planem wrócą na ustawienia miasta.`)) return;
    try {
      // Ustawienia Bolt/Uber znikają razem z planem (ON DELETE CASCADE).
      await wykonajZapis(
        (supabase as any).from('fleet_settlement_plans').delete().eq('id', plan.id).select('id'),
        `Usunięcie planu ${plan.name}`,
      );
      toast.success(`Usunięto plan „${plan.name}"`);
      await odswiez();
    } catch (blad: any) {
      toast.error(blad instanceof BladZapisu ? blad.message : `Błąd usuwania: ${blad?.message || 'nieznany'}`);
      await odswiez();
    }
  };

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
              Każdy plan ma nazwę, własne stawki Bolt i Uber oraz opcjonalne miasto.
              Plan przypisujesz kierowcy na jego karcie albo w popoverze „i" w tabeli rozliczeń —
              obowiązuje od tygodnia, na którym stoisz, w przód.
            </CardDescription>
          </div>
          <Button size="sm" onClick={() => otworzNowy()} className="gap-1">
            <Plus className="h-3 w-3" /> Dodaj plan
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="text-sm text-destructive py-4">Nie udało się wczytać planów: {(error as any)?.message}</div>
        ) : isLoading ? (
          <div className="text-center py-4 text-muted-foreground text-sm">Ładowanie…</div>
        ) : !plany || plany.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            Brak planów. Dopóki ich nie ma, wszyscy kierowcy liczą się po ustawieniach miasta.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Nazwa planu</TableHead>
                  <TableHead className="text-xs">Bolt</TableHead>
                  <TableHead className="text-xs">Uber</TableHead>
                  <TableHead className="text-xs">Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plany.map((plan) => (
                  <TableRow key={plan.id} className="hover:bg-primary/10">
                    <TableCell className="text-sm font-medium">
                      <span className="flex items-center gap-2 flex-wrap">
                        {plan.name}
                        {plan.is_default && <Badge variant="secondary" className="text-[10px]">domyślny</Badge>}
                        {plan.city_name && <Badge variant="outline" className="text-[10px]">{plan.city_name}</Badge>}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">{opisPlanu(plan)}</span>
                    </TableCell>
                    <TableCell className="text-xs">
                      {plan.bolt ? (
                        <div className="space-y-0.5">
                          <Badge variant={plan.bolt.settlement_mode === 'dual_tax' ? 'default' : 'secondary'} className="text-[10px]">
                            {plan.bolt.settlement_mode === 'dual_tax' ? 'Dwa podatki' : 'Jeden podatek'}
                          </Badge>
                          <div className="text-muted-foreground">VAT {plan.bolt.vat_rate}% · {plan.bolt.base_fee} zł</div>
                        </div>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {plan.uber ? (
                        <div className="space-y-0.5">
                          <Badge variant={plan.uber.settlement_mode === 'dual_tax' ? 'default' : 'secondary'} className="text-[10px]">
                            {plan.uber.settlement_mode === 'dual_tax' ? 'Dwa podatki' : 'Jeden podatek'}
                          </Badge>
                          {plan.uber.uber_calculation_mode === 'brutto' && (
                            <Badge variant="outline" className="text-[9px] ml-1">od brutto</Badge>
                          )}
                          <div className="text-muted-foreground">VAT {plan.uber.vat_rate}% · {plan.uber.base_fee} zł</div>
                        </div>
                      ) : <span className="text-muted-foreground">—</span>}
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
      </CardContent>

      <Dialog open={oknoOtwarte} onOpenChange={setOknoOtwarte}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{edytowany ? `Edytuj plan — ${edytowany.name}` : 'Nowy plan rozliczeń'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nazwa planu *</Label>
              <Input
                value={nazwa}
                onChange={(e) => setNazwa(e.target.value)}
                placeholder="np. Warszawa 8% + 50 albo Ryczałt 159 bez podatku"
              />
              <p className="text-[9px] text-muted-foreground mt-0.5">Po tej nazwie wybierasz plan przy kierowcy.</p>
            </div>

            <div>
              <Label className="text-xs">Miasto (opcjonalnie)</Label>
              <Select value={miasto} onValueChange={setMiasto}>
                <SelectTrigger><SelectValue placeholder="Bez miasta" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="brak"><span className="text-muted-foreground">Bez miasta</span></SelectItem>
                  {dostepneMiasta.map((c) => (
                    <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                  ))}
                  <SelectItem value="__nowe__">+ Dodaj nowe miasto…</SelectItem>
                </SelectContent>
              </Select>
              {miasto === '__nowe__' && (
                <Input
                  className="mt-2"
                  value={noweMiasto}
                  onChange={(e) => setNoweMiasto(e.target.value)}
                  placeholder="Wpisz nazwę nowego miasta"
                />
              )}
              <p className="text-[9px] text-muted-foreground mt-0.5">
                Po mieście liczą się tygodnie sprzed pierwszego przypisania planu.
              </p>
            </div>

            <div className="flex items-center justify-between rounded-md border p-2">
              <div>
                <p className="text-xs font-medium">Domyślny</p>
                <p className="text-[10px] text-muted-foreground">
                  Ten plan dostaje każdy nowy kierowca floty. Kierowców już przypisanych nie rusza.
                </p>
              </div>
              <Switch checked={domyslny} onCheckedChange={setDomyslny} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <Card className="border-green-500/30">
              <CardContent className="pt-4 pb-3">
                <PanelPlatformy
                  platform="bolt"
                  mode={boltMode} setMode={setBoltMode}
                  vat={boltVat} setVat={setBoltVat}
                  baseFee={boltBaseFee} setBaseFee={setBoltBaseFee}
                  additional={boltAdditional} setAdditional={setBoltAdditional}
                  secondaryVat={boltSecondaryVat} setSecondaryVat={setBoltSecondaryVat}
                  email={boltEmail} setEmail={setBoltEmail}
                />
              </CardContent>
            </Card>
            <Card className="border-black/20">
              <CardContent className="pt-4 pb-3">
                <PanelPlatformy
                  platform="uber"
                  mode={uberMode} setMode={setUberMode}
                  vat={uberVat} setVat={setUberVat}
                  baseFee={uberBaseFee} setBaseFee={setUberBaseFee}
                  additional={uberAdditional} setAdditional={setUberAdditional}
                  secondaryVat={uberSecondaryVat} setSecondaryVat={setUberSecondaryVat}
                  calcMode={uberCalcMode} setCalcMode={setUberCalcMode}
                />
              </CardContent>
            </Card>
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

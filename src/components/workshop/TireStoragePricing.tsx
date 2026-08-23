import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export const RODZAJE_FELG = [
  { value: 'stalowe', label: 'Stalowe' },
  { value: 'aluminiowe', label: 'Aluminiowe' },
  { value: 'bez felg', label: 'Bez felg (same opony)' },
  { value: 'dowolne', label: 'Dowolne (stawka zapasowa)' },
] as const;

export function useTirePricing(providerId: string) {
  return useQuery({
    queryKey: ['tire-pricing', providerId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('workshop_tire_pricing')
        .select('*')
        .eq('provider_id', providerId)
        .eq('aktywna', true)
        .order('rozmiar');
      if (error) throw error;
      return data || [];
    },
    enabled: !!providerId,
  });
}

/**
 * Cennik przechowalni: stawka za okres zalezna od rozmiaru opony i rodzaju
 * felgi. Komplet 19" na aluminium zajmuje wiecej miejsca niz 15" na stali
 * i jedna cena za wszystko oznaczala doplacanie do tych wiekszych.
 *
 * Wiersz "dowolne" dziala jako stawka zapasowa dla rozmiaru, gdy nie ma
 * wpisu dla konkretnej felgi.
 */
export function TireStoragePricing({ providerId }: { providerId: string }) {
  const queryClient = useQueryClient();
  const { data: cennik = [], isLoading } = useTirePricing(providerId);

  const [rozmiar, setRozmiar] = useState('');
  const [felga, setFelga] = useState('dowolne');
  const [cena, setCena] = useState('');
  const [okres, setOkres] = useState('6');
  const [zapisuje, setZapisuje] = useState(false);

  const odswiez = () => {
    queryClient.invalidateQueries({ queryKey: ['tire-pricing', providerId] });
    // Kwoty w tabeli licza sie z cennika przez zamrozona stawke, ale nowe
    // przyjecia biora ja stad — odswiezamy tez naleznosci.
    queryClient.invalidateQueries({ queryKey: ['tire-storage-dues', providerId] });
  };

  const dodaj = async () => {
    const wRozmiar = rozmiar.trim();
    const wCena = Number(cena);
    const wOkres = Number(okres);

    if (!wRozmiar) { toast.error('Podaj rozmiar opony'); return; }
    if (!Number.isFinite(wCena) || wCena < 0) { toast.error('Cena nie może być ujemna'); return; }
    if (!Number.isFinite(wOkres) || wOkres < 1 || wOkres > 12) {
      toast.error('Okres musi mieścić się między 1 a 12 miesiącami'); return;
    }

    setZapisuje(true);
    try {
      const { error } = await (supabase as any)
        .from('workshop_tire_pricing')
        .insert({
          provider_id: providerId,
          rozmiar: wRozmiar,
          rodzaj_felgi: felga,
          cena_za_okres: wCena,
          okres_miesiecy: wOkres,
        });
      if (error) {
        // Baza pilnuje, by nie bylo dwoch stawek na te sama pare — inaczej
        // przy przyjeciu nie wiadomo, ktora obowiazuje.
        if ((error as any).code === '23505') {
          toast.error('Ten rozmiar i rodzaj felgi już są w cenniku');
        } else {
          throw error;
        }
        return;
      }
      setRozmiar('');
      setCena('');
      odswiez();
      toast.success('Dodano do cennika');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Nie udało się dodać');
    } finally {
      setZapisuje(false);
    }
  };

  const usun = async (id: string) => {
    // Wylaczamy zamiast kasowac: wpisy przyjete na tej stawce maja ja
    // zamrozona u siebie, ale historia cennika bywa potrzebna przy sporze.
    const { error } = await (supabase as any)
      .from('workshop_tire_pricing')
      .update({ aktywna: false, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) { toast.error(error.message); return; }
    odswiez();
    toast.success('Usunięto z cennika');
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Stawka za jeden okres przechowania. Przy przyjęciu opon system podpowie
        cenę z tego cennika i <strong>zapisze ją na wpisie</strong> — późniejsza
        podwyżka nie zmieni ceny klientowi, który zostawił opony wcześniej.
      </p>

      <div className="grid gap-2 md:grid-cols-[1fr_1fr_100px_110px_auto] items-end">
        <div className="space-y-1.5">
          <Label className="text-xs">Rozmiar</Label>
          <Input
            value={rozmiar}
            onChange={(e) => setRozmiar(e.target.value)}
            placeholder="205/55R16"
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Felgi</Label>
          <Select value={felga} onValueChange={setFelga}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RODZAJE_FELG.map(r => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Cena (zł)</Label>
          <Input
            type="number" min={0} step="10"
            value={cena}
            onChange={(e) => setCena(e.target.value)}
            placeholder="150"
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Za ile miesięcy</Label>
          <Select value={okres} onValueChange={setOkres}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                <SelectItem key={m} value={String(m)}>
                  {m} {m === 1 ? 'miesiąc' : m < 5 ? 'miesiące' : 'miesięcy'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={dodaj} disabled={zapisuje} className="h-9">
          {zapisuje
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <><Plus className="h-4 w-4 mr-1" />Dodaj</>}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : cennik.length === 0 ? (
        <div className="text-center py-6 border-2 border-dashed rounded-lg text-sm text-muted-foreground">
          Cennik jest pusty. Bez niego cena przy przyjęciu wpisuje się ręcznie,
          tak jak dotąd.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rozmiar</TableHead>
              <TableHead>Felgi</TableHead>
              <TableHead>Cena</TableHead>
              <TableHead>Okres</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {cennik.map((c: any) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-sm">{c.rozmiar}</TableCell>
                <TableCell>
                  <Badge variant={c.rodzaj_felgi === 'dowolne' ? 'outline' : 'secondary'}>
                    {RODZAJE_FELG.find(r => r.value === c.rodzaj_felgi)?.label ?? c.rodzaj_felgi}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium">
                  {Number(c.cena_za_okres).toFixed(2)} zł
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {c.okres_miesiecy} mies.
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => usun(c.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Save } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

/**
 * Zasady przechowalni: oplata po terminie i rytm przypomnien.
 *
 * Domyslnie stawka wynosi zero — dopoki warsztat sam jej nie ustawi, nikomu
 * nic nie doliczamy. To umowa warsztatu z klientem, nie nasza decyzja.
 */
export function TireStorageRulesDialog({
  open, onOpenChange, providerId,
}: { open: boolean; onOpenChange: (v: boolean) => void; providerId: string }) {
  const queryClient = useQueryClient();
  const [ladowanie, setLadowanie] = useState(true);
  const [zapisuje, setZapisuje] = useState(false);

  const [oplata, setOplata] = useState('0');
  const [karencja, setKarencja] = useState('0');
  const [maks, setMaks] = useState('');
  const [coIleDni, setCoIleDni] = useState('30');
  const [ileMax, setIleMax] = useState('6');
  const [dniNieodebrane, setDniNieodebrane] = useState('180');

  useEffect(() => {
    if (!open || !providerId) return;
    let anulowane = false;

    (async () => {
      setLadowanie(true);
      const { data } = await (supabase as any)
        .from('workshop_tire_storage_settings')
        .select('*')
        .eq('provider_id', providerId)
        .maybeSingle();
      if (anulowane) return;
      if (data) {
        setOplata(String(data.oplata_za_dzien ?? 0));
        setKarencja(String(data.dni_karencji ?? 0));
        setMaks(data.oplata_maksymalna == null ? '' : String(data.oplata_maksymalna));
        setCoIleDni(String(data.co_ile_dni_przypominac ?? 30));
        setIleMax(String(data.ile_przypomnien_max ?? 6));
        setDniNieodebrane(String(data.dni_do_nieodebranych ?? 180));
      }
      setLadowanie(false);
    })();

    return () => { anulowane = true; };
  }, [open, providerId]);

  const zapisz = async () => {
    const liczba = (v: string) => (v.trim() === '' ? null : Number(v));

    const wOplata = Number(oplata);
    const wKarencja = Number(karencja);
    const wMaks = liczba(maks);
    const wCoIle = Number(coIleDni);
    const wIle = Number(ileMax);
    const wNieodebrane = Number(dniNieodebrane);

    if (!Number.isFinite(wOplata) || wOplata < 0) {
      toast.error('Opłata za dzień nie może być ujemna'); return;
    }
    if (!Number.isFinite(wKarencja) || wKarencja < 0) {
      toast.error('Karencja nie może być ujemna'); return;
    }
    if (wMaks !== null && (!Number.isFinite(wMaks) || wMaks < 0)) {
      toast.error('Górna granica opłaty nie może być ujemna'); return;
    }
    if (!Number.isFinite(wCoIle) || wCoIle < 1 || wCoIle > 365) {
      toast.error('Odstęp przypomnień musi mieścić się między 1 a 365 dniami'); return;
    }
    if (!Number.isFinite(wIle) || wIle < 0 || wIle > 60) {
      toast.error('Liczba przypomnień musi mieścić się między 0 a 60'); return;
    }

    setZapisuje(true);
    try {
      const { error } = await (supabase as any)
        .from('workshop_tire_storage_settings')
        .upsert({
          provider_id: providerId,
          oplata_za_dzien: wOplata,
          dni_karencji: wKarencja,
          oplata_maksymalna: wMaks,
          co_ile_dni_przypominac: wCoIle,
          ile_przypomnien_max: wIle,
          dni_do_nieodebranych: wNieodebrane,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'provider_id' });
      if (error) throw error;

      // Kwoty w tabeli licza sie z tych zasad — bez odswiezenia pokazywalyby stare.
      queryClient.invalidateQueries({ queryKey: ['tire-storage-dues', providerId] });
      toast.success('Zasady zapisane');
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Nie udało się zapisać');
    } finally {
      setZapisuje(false);
    }
  };

  const podglad = (() => {
    const st = Number(oplata);
    const kar = Number(karencja);
    if (!Number.isFinite(st) || st <= 0) {
      return 'Naliczanie wyłączone — po terminie klient płaci tylko cenę przechowania.';
    }
    const dni = 60;
    const platne = Math.max(0, dni - (Number.isFinite(kar) ? kar : 0));
    let kwota = platne * st;
    const gorna = Number(maks);
    if (maks.trim() !== '' && Number.isFinite(gorna)) kwota = Math.min(kwota, gorna);
    return `Przykład: komplet 60 dni po terminie — dopłata ${kwota.toFixed(2)} zł.`;
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Zasady przechowalni</DialogTitle>
          <DialogDescription>
            Opłata za przetrzymanie i rytm przypomnień. Dotyczy wszystkich kompletów
            w tym warsztacie.
          </DialogDescription>
        </DialogHeader>

        {ladowanie ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Opłata za dzień po terminie (zł)</Label>
                <Input type="number" min={0} step="0.5" value={oplata}
                       onChange={e => setOplata(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Dni bez opłaty po terminie</Label>
                <Input type="number" min={0} value={karencja}
                       onChange={e => setKarencja(e.target.value)} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Górna granica opłaty (zł) — puste znaczy bez granicy</Label>
                <Input type="number" min={0} value={maks} placeholder="np. 300"
                       onChange={e => setMaks(e.target.value)} />
              </div>
            </div>

            <p className="text-sm text-muted-foreground border-l-2 border-primary/40 pl-3">
              {podglad}
            </p>

            <div className="grid grid-cols-2 gap-3 pt-2 border-t">
              <div className="space-y-1.5">
                <Label>Przypominaj co ile dni</Label>
                <Input type="number" min={1} max={365} value={coIleDni}
                       onChange={e => setCoIleDni(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Najwyżej ile przypomnień</Label>
                <Input type="number" min={0} max={60} value={ileMax}
                       onChange={e => setIleMax(e.target.value)} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Po ilu dniach proponować uznanie za nieodebrane</Label>
                <Input type="number" min={0} value={dniNieodebrane}
                       onChange={e => setDniNieodebrane(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Anuluj</Button>
          <Button onClick={zapisz} disabled={zapisuje || ladowanie}>
            {zapisuje
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <Save className="h-4 w-4 mr-2" />}
            Zapisz
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

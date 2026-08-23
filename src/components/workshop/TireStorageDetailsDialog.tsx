import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Car, Loader2, Save, Send } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const zl = (v: unknown) => `${Number(v ?? 0).toFixed(2)} zł`;
const data = (v: unknown) => (v ? new Date(v as string).toLocaleDateString('pl-PL') : '—');

function Pole({ etykieta, children }: { etykieta: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{etykieta}</p>
      <p className="text-sm font-medium">{children}</p>
    </div>
  );
}

/**
 * Szczegoly kompletu. Do tej pory kliknięcie w wiersz nic nie robilo,
 * a czesc danych (bieznik, DOT, felgi, rozbicie naleznosci) nie miala
 * gdzie sie pokazac.
 *
 * Tutaj tez ustawia sie przypomnienia dla tego konkretnego kompletu —
 * rytm bywa inny dla roznych klientow.
 */
export function TireStorageDetailsDialog({
  record, onOpenChange, providerId,
}: {
  record: any | null;
  onOpenChange: (v: boolean) => void;
  providerId: string;
}) {
  const queryClient = useQueryClient();
  const [wlaczone, setWlaczone] = useState(true);
  const [coIleMiesiecy, setCoIleMiesiecy] = useState('6');
  const [kanal, setKanal] = useState('sms');
  const [zapisuje, setZapisuje] = useState(false);
  const [wysyla, setWysyla] = useState(false);

  useEffect(() => {
    if (!record) return;
    const k = record.reminder_channel ?? 'sms';
    setWlaczone(k !== 'none');
    setKanal(k === 'none' ? 'sms' : k);
    setCoIleMiesiecy(String(record.reminder_months ?? 6));
  }, [record]);

  if (!record) return null;

  const d = record.dlug ?? {};
  const pojazd = record.workshop_vehicles;
  const klient = record.client_name
    || [record.workshop_clients?.first_name, record.workshop_clients?.last_name].filter(Boolean).join(' ')
    || record.workshop_clients?.company_name
    || '—';

  const bieznik = ([
    ['Lewa przód', record.tread_lp_mm],
    ['Prawa przód', record.tread_pp_mm],
    ['Lewa tył', record.tread_lt_mm],
    ['Prawa tył', record.tread_pt_mm],
  ] as const).filter(([, v]) => v != null);

  const doplata = Number(d.do_zaplaty ?? 0) - Number(record.storage_cost ?? 0);

  const odswiez = () => {
    queryClient.invalidateQueries({ queryKey: ['tire-storage'] });
    queryClient.invalidateQueries({ queryKey: ['tire-storage-dues', providerId] });
  };

  const zapisz = async () => {
    setZapisuje(true);
    try {
      const { error } = await (supabase as any)
        .from('workshop_tire_storage')
        .update({
          reminder_channel: wlaczone ? kanal : 'none',
          reminder_months: Number(coIleMiesiecy),
        })
        .eq('id', record.id);
      if (error) throw error;
      odswiez();
      toast.success(wlaczone
        ? `Przypomnienia co ${coIleMiesiecy} mies. przez ${kanal === 'email' ? 'e-mail' : 'SMS'}`
        : 'Przypomnienia wyłączone dla tego kompletu');
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Nie udało się zapisać');
    } finally {
      setZapisuje(false);
    }
  };

  const wyslijTeraz = async () => {
    if (!record.client_phone && !record.workshop_clients?.phone) {
      toast.error('Ten klient nie ma numeru telefonu');
      return;
    }
    setWysyla(true);
    try {
      // Wysylka idzie ta sama droga co cron, ale zawezona do jednego warsztatu.
      // Nic nie wyjdzie, jesli wpis nie jest akurat nalezny — to celowe:
      // recznym klikaniem nie da sie obejsc odstepu miedzy przypomnieniami.
      const { data: wynik, error } = await supabase.functions.invoke('workshop-tire-reminders', {
        body: { providerId },
      });
      if (error) throw error;
      const ile = Number((wynik as any)?.sms ?? 0) + Number((wynik as any)?.email ?? 0);
      odswiez();
      toast.success(ile > 0
        ? `Wysłano przypomnienia: ${ile}`
        : 'Nic nie wysłano — żaden komplet nie jest teraz należny');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Nie udało się wysłać');
    } finally {
      setWysyla(false);
    }
  };

  return (
    <Dialog open={!!record} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-base">{record.storage_number || 'Komplet'}</span>
            <span className="text-muted-foreground font-normal">·</span>
            <span>{klient}</span>
            {pojazd?.plate && (
              <Badge variant="secondary" className="gap-1 font-mono">
                <Car className="h-3 w-3" />{pojazd.plate}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {pojazd
              ? `${[pojazd.brand, pojazd.model].filter(Boolean).join(' ')}`
              : 'Komplet nie jest przypisany do pojazdu'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Pole etykieta="Opony">
              {[record.tire_brand, record.tire_model].filter(Boolean).join(' ') || '—'}
            </Pole>
            <Pole etykieta="Rozmiar">{record.tire_size || '—'}</Pole>
            <Pole etykieta="Sztuk">{record.quantity ?? '—'}</Pole>
            <Pole etykieta="Felgi">{record.rim_type || '—'}</Pole>
            <Pole etykieta="DOT">{record.dot_code || '—'}</Pole>
            <Pole etykieta="Sezon">{record.season || '—'}</Pole>
            <Pole etykieta="Miejsce">{record.location_name || '—'}</Pole>
            <Pole etykieta="Przyjęto">{data(record.stored_at)}</Pole>
            <Pole etykieta="Termin odbioru">
              {d.termin ? (
                <span className={d.dni_po_terminie > 0 ? 'text-destructive' : ''}>
                  {data(d.termin)}
                  {d.dni_po_terminie > 0 && ` · ${d.dni_po_terminie} dni po`}
                </span>
              ) : '—'}
            </Pole>
          </section>

          {bieznik.length > 0 && (
            <section>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
                Bieżnik
              </p>
              <div className="grid grid-cols-4 gap-2">
                {bieznik.map(([opis, v]) => (
                  <div key={opis} className="rounded-md border p-2 text-center">
                    <p className="text-sm font-semibold">{Number(v).toFixed(1)} mm</p>
                    <p className="text-[10px] text-muted-foreground">{opis}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-lg border p-3 bg-muted/30">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Do zapłaty</span>
              <span className="text-xl font-bold">{zl(d.do_zaplaty)}</span>
            </div>
            <div className="mt-2 space-y-0.5 text-sm text-muted-foreground">
              {record.cena_za_okres && record.okres_miesiecy ? (
                <p>
                  Przechowanie: {d.okresow} × {zl(record.cena_za_okres)} (co {record.okres_miesiecy} mies.)
                </p>
              ) : (
                <p>Przechowanie: {zl(record.storage_cost)} — kwota jednorazowa</p>
              )}
              {doplata > 0.005 && (
                <p className="text-destructive">Za przetrzymanie po terminie: {zl(doplata)}</p>
              )}
            </div>
          </section>

          <section className="rounded-lg border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-semibold">Przypomnienia o odbiorze</Label>
                <p className="text-xs text-muted-foreground">
                  Po wydaniu kompletu przestają wychodzić same.
                </p>
              </div>
              <Switch checked={wlaczone} onCheckedChange={setWlaczone} />
            </div>

            {wlaczone && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Co ile miesięcy</Label>
                  <Select value={coIleMiesiecy} onValueChange={setCoIleMiesiecy}>
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
                <div className="space-y-1.5">
                  <Label className="text-xs">Czym</Label>
                  <Select value={kanal} onValueChange={setKanal}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sms">SMS-em</SelectItem>
                      <SelectItem value="email">E-mailem</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {record.reminder_count > 0
                ? `Wysłano już ${record.reminder_count}, ostatnie ${data(record.reminder_sent_at)}.`
                : 'Jeszcze nic nie wysłano.'}
            </p>
          </section>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={wyslijTeraz} disabled={wysyla || !wlaczone}>
            {wysyla
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <Send className="h-4 w-4 mr-2" />}
            Wyślij przypomnienie teraz
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Zamknij</Button>
            <Button onClick={zapisz} disabled={zapisuje}>
              {zapisuje
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <Save className="h-4 w-4 mr-2" />}
              Zapisz
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

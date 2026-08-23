import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Loader2, MessageSquare, Copy, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/** SMS z polskimi znakami idzie po 70 znakow na czesc, bez nich po 160. */
const bezOgonkow = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L');

const czesciSms = (t: string) => {
  const polskie = /[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(t);
  const limit = polskie ? 70 : 160;
  return Math.max(1, Math.ceil(t.length / limit));
};

/**
 * Potwierdzenie przyjecia opon SMS-em, proponowane zaraz po zapisaniu wpisu.
 *
 * Tresc jest przygotowana, ale wyslanie wymaga klikniecia — SMS kosztuje
 * warsztat, wiec nie wychodzi sam z siebie.
 */
export function TireStorageSmsDialog({
  wpis, onOpenChange, providerId,
}: {
  wpis: any | null;
  onOpenChange: (v: boolean) => void;
  providerId: string;
}) {
  const [telefon, setTelefon] = useState('');
  const [tresc, setTresc] = useState('');
  const [kod, setKod] = useState<string | null>(null);
  const [wysyla, setWysyla] = useState(false);
  const [skopiowane, setSkopiowane] = useState(false);

  useEffect(() => {
    if (!wpis?.id) return;
    let anulowane = false;
    setTelefon(wpis.client_phone ?? '');

    (async () => {
      // Kod potwierdzenia tworzy trigger przy zapisie, wiec dopiero teraz
      // mozemy go odczytac i wkleic do wiadomosci.
      const { data } = await (supabase as any)
        .from('workshop_tire_receipts')
        .select('kod')
        .eq('storage_id', wpis.id)
        .maybeSingle();
      if (!anulowane) setKod(data?.kod ?? null);
    })();

    return () => { anulowane = true; };
  }, [wpis?.id]);

  const domyslnaTresc = useMemo(() => {
    if (!wpis) return '';
    const warsztat = wpis.__warsztat ?? '';
    const adres = wpis.__adres ?? '';
    const opony = [wpis.tire_brand, wpis.tire_model].filter(Boolean).join(' ');
    const felgi = (wpis.rim_type && wpis.rim_type !== 'bez felg')
      ? `na felgach ${wpis.rim_type}`
      : 'bez felg';
    const auto = [wpis.__pojazd, wpis.__rejestracja].filter(Boolean).join(' ');

    const czesci = [
      [warsztat, adres].filter(Boolean).join(', ') + ':',
      'przyjelismy opony',
      [opony, wpis.tire_size].filter(Boolean).join(' '),
      wpis.quantity ? `${wpis.quantity} szt.` : '',
      felgi + '.',
      auto ? `Auto: ${auto}.` : '',
      wpis.storage_number ? `Nr ${wpis.storage_number}.` : '',
      kod ? `Potwierdzenie: getrido.pl/p/${kod}` : '',
    ].filter(Boolean).join(' ');

    // Bez ogonkow miesci sie 160 znakow zamiast 70 — przy tej dlugosci
    // roznica to jedna czesc zamiast trzech.
    return bezOgonkow(czesci).replace(/\s+/g, ' ').trim();
  }, [wpis, kod]);

  useEffect(() => { setTresc(domyslnaTresc); }, [domyslnaTresc]);

  if (!wpis) return null;

  const czesci = czesciSms(tresc);

  const wyslij = async () => {
    const nr = telefon.replace(/[^\d+]/g, '');
    if (nr.length < 9) {
      toast.error('Podaj numer telefonu klienta');
      return;
    }
    if (!tresc.trim()) {
      toast.error('Treść wiadomości jest pusta');
      return;
    }

    setWysyla(true);
    try {
      const { error } = await (supabase as any).from('workshop_sms_log').insert({
        provider_id: providerId,
        client_id: wpis.client_id ?? null,
        phone: nr,
        message: tresc.trim(),
        sms_type: 'tire_storage_confirmation',
        status: 'scheduled',
        scheduled_at: new Date().toISOString(),
      });
      if (error) throw error;
      toast.success(`SMS zakolejkowany na ${nr}`);
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Nie udało się zakolejkować SMS-a');
    } finally {
      setWysyla(false);
    }
  };

  const kopiujLink = async () => {
    if (!kod) return;
    await navigator.clipboard.writeText(`https://getrido.pl/p/${kod}`);
    setSkopiowane(true);
    setTimeout(() => setSkopiowane(false), 2000);
  };

  return (
    <Dialog open={!!wpis} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Wysłać potwierdzenie klientowi?</DialogTitle>
          <DialogDescription>
            Opony przyjęte{wpis.storage_number ? ` — nr ${wpis.storage_number}` : ''}.
            Klient dostanie SMS z linkiem do potwierdzenia, które zostaje u niego
            także po odbiorze.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Numer telefonu</Label>
            <Input
              value={telefon}
              onChange={(e) => setTelefon(e.target.value)}
              placeholder="np. 512 345 678"
              className="h-9"
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Treść</Label>
              <span className={`text-[11px] ${czesci > 2 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                {tresc.length} znaków · {czesci} {czesci === 1 ? 'wiadomość' : 'części'}
              </span>
            </div>
            <Textarea
              value={tresc}
              onChange={(e) => setTresc(e.target.value)}
              rows={5}
              className="text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              Bez polskich znaków — dzięki temu mieści się 160 znaków na część
              zamiast 70, co realnie zmniejsza koszt.
            </p>
          </div>

          {kod && (
            <div className="flex items-center gap-2 rounded-md border p-2">
              <span className="text-xs text-muted-foreground shrink-0">Link:</span>
              <span className="text-xs font-mono truncate flex-1">getrido.pl/p/{kod}</span>
              <Button variant="ghost" size="sm" className="h-7 shrink-0" onClick={kopiujLink}>
                {skopiowane ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Nie wysyłaj
          </Button>
          <Button onClick={wyslij} disabled={wysyla}>
            {wysyla
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <MessageSquare className="h-4 w-4 mr-2" />}
            Wyślij SMS
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

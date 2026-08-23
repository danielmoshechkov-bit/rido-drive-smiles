import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Loader2, MessageSquare, Copy, Check, Phone, Mail, PackageCheck, ChevronDown,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { opisRozmiaru } from './tireStorageFormat';
import { buildStorageReceiptHtml } from './tireStorageReceipt';
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
 * Potwierdzenie przyjecia opon, proponowane zaraz po zapisaniu wpisu.
 *
 * Ten sam uklad co potwierdzenie zlecenia warsztatowego — warsztat zna juz
 * ten ekran i nie musi uczyc sie drugiego.
 *
 * Tresc jest gotowa, ale wyslanie wymaga klikniecia: SMS kosztuje warsztat,
 * wiec nie wychodzi sam z siebie.
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
  const [pokazTresc, setPokazTresc] = useState(false);
  const [kanal, setKanal] = useState<'sms' | 'email'>('sms');
  const [email, setEmail] = useState('');

  useEffect(() => {
    if (!wpis?.id) return;
    let anulowane = false;
    setTelefon(wpis.client_phone ?? '');
    setEmail(wpis.__email ?? '');
    setKanal('sms');
    setPokazTresc(false);

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

    const opony = [wpis.tire_brand, wpis.tire_model].filter(Boolean).join(' ');
    const felgi = (wpis.rim_type && wpis.rim_type !== 'bez felg')
      ? `na felgach ${wpis.rim_type}`
      : 'bez felg';
    const auto = [wpis.__pojazd, wpis.__rejestracja].filter(Boolean).join(' ');
    const adres = wpis.__adres ?? '';
    // Kod pocztowy i miasto nic klientowi nie mowia — zna warsztat, w ktorym
    // wlasnie byl. Ulica wystarcza, a to 15 znakow mniej.
    const ulica = adres.split(',')[0]?.trim() ?? '';

    const zlozTresc = (co: {
      adres?: boolean; opony?: boolean; felgi?: boolean; auto?: boolean; numer?: boolean;
    }) => bezOgonkow([
      [wpis.__warsztat ?? '', co.adres ? ulica : ''].filter(Boolean).join(', ') + ':',
      'przyjelismy opony',
      co.opony ? [opony, opisRozmiaru(wpis)].filter(Boolean).join(' ') : opisRozmiaru(wpis),
      wpis.quantity ? `${wpis.quantity} szt.` : '',
      co.felgi ? felgi + '.' : '.',
      co.auto && auto ? `Auto: ${auto}.` : '',
      co.numer && wpis.storage_number ? `Nr ${wpis.storage_number}.` : '',
      kod ? `Potwierdzenie: getrido.pl/p/${kod}` : '',
    ].filter(Boolean).join(' ')).replace(/\s+/g, ' ').replace(/\s\./g, '.').trim();

    // Skladamy od wersji pelnej i odejmujemy najmniej wazne czesci, dopoki
    // wiadomosc nie zmiesci sie w jednej. Dwie czesci to dwa razy drozej
    // za te sama informacje, a numer i marke opon klient ma pod linkiem.
    const warianty = [
      { adres: true,  opony: true,  felgi: true,  auto: true,  numer: true  },
      { adres: true,  opony: true,  felgi: true,  auto: false, numer: true  },
      { adres: true,  opony: true,  felgi: true,  auto: false, numer: false },
      { adres: true,  opony: false, felgi: true,  auto: false, numer: false },
      { adres: false, opony: false, felgi: true,  auto: false, numer: false },
      { adres: false, opony: false, felgi: false, auto: false, numer: false },
    ];

    for (const w of warianty) {
      const tekst = zlozTresc(w);
      if (tekst.length <= 160) return tekst;
    }
    // Nawet najkrotsza wersja nie weszla — oddajemy ja i tak, licznik
    // w oknie pokaze, ile czesci z tego wyjdzie.
    return zlozTresc(warianty[warianty.length - 1]);
  }, [wpis, kod]);

  useEffect(() => { setTresc(domyslnaTresc); }, [domyslnaTresc]);

  if (!wpis) return null;

  const czesci = czesciSms(tresc);
  const numerOk = telefon.replace(/[^\d]/g, '').length >= 9;

  const wyslij = async () => {
    const nr = telefon.replace(/[^\d+]/g, '');
    if (!numerOk) {
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
      toast.success(`SMS wysłany na ${nr}`);
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Nie udało się wysłać SMS-a');
    } finally {
      setWysyla(false);
    }
  };

  const wyslijMail = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error('Podaj adres e-mail klienta');
      return;
    }
    setWysyla(true);
    try {
      // Ten sam dokument, ktory idzie na wydruk. PDF robi z niego istniejacy
      // generator po stronie serwera — nie budujemy drugiego.
      const html = buildStorageReceiptHtml(wpis, 'przyjęcia', {
        companyName: wpis.__warsztat ?? null,
        address: wpis.__adres ?? null,
        nip: wpis.__nip ?? null,
        logoUrl: wpis.__logo ?? null,
        phone: wpis.__telefonWarsztatu ?? null,
        website: wpis.__strona ?? null,
      });

      const { data, error } = await supabase.functions.invoke('workshop-send-document-email', {
        body: {
          providerId,
          do: email.trim(),
          html,
          tytulDokumentu: 'Potwierdzenie przechowania opon',
          numer: wpis.storage_number ?? null,
          nazwaPliku: `potwierdzenie-${(wpis.storage_number ?? 'opony').replace(/\//g, '-')}.pdf`,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      toast.success((data as any)?.zZalacznikiem
        ? `Mail wysłany na ${email.trim()}`
        : `Mail wysłany, ale bez załącznika — PDF się nie wygenerował`);
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Nie udało się wysłać maila');
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
      <DialogContent className="max-w-md max-h-[92vh] overflow-y-auto">
        <div className="mx-auto w-full max-w-sm space-y-6 py-4 text-center">
          <div className="space-y-3">
            <div className="mx-auto w-16 h-16 rounded-full bg-accent flex items-center justify-center">
              <PackageCheck className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-xl font-bold">Opony przyjęte!</h3>
            <p className="text-muted-foreground">
              Czy wysłać klientowi potwierdzenie przechowania?
            </p>
            {wpis.storage_number && (
              <p className="text-sm font-mono text-muted-foreground">{wpis.storage_number}</p>
            )}
          </div>

          <div className="space-y-4">
            <Label className="text-sm font-semibold">Sposób wysyłki</Label>
            <div className="flex gap-2 justify-center">
              <Button
                variant={kanal === 'sms' ? 'default' : 'outline'}
                size="sm"
                className="gap-2"
                onClick={() => setKanal('sms')}
              >
                <Phone className="h-4 w-4" /> SMS
              </Button>
              <Button
                variant={kanal === 'email' ? 'default' : 'outline'}
                size="sm"
                className="gap-2"
                onClick={() => setKanal('email')}
              >
                <Mail className="h-4 w-4" /> E-mail
              </Button>
            </div>

            {kanal === 'email' ? (
              <div className="space-y-1.5 max-w-sm mx-auto text-left">
                <Label className="text-xs">Adres e-mail klienta</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="klient@example.com"
                />
                <p className="text-[11px] text-muted-foreground">
                  Klient dostanie potwierdzenie jako PDF w załączniku — ten sam
                  dokument co z przycisku „Pokwitowanie".
                </p>
              </div>
            ) : wpis.client_phone ? (
              <p className="text-sm">
                Na numer: <span className="font-semibold text-foreground">{telefon}</span>
              </p>
            ) : (
              <div className="space-y-1.5 max-w-sm mx-auto text-left">
                <Label className="text-xs text-destructive font-medium">
                  Klient nie ma zapisanego numeru — wpisz go
                </Label>
                <Input
                  value={telefon}
                  onChange={(e) => setTelefon(e.target.value)}
                  placeholder="np. 512 345 678"
                />
              </div>
            )}

            {kod && kanal === 'sms' && (
              <div className="flex items-center gap-2 rounded-md border p-2 text-left">
                <span className="text-xs text-muted-foreground shrink-0">Link:</span>
                <span className="text-xs font-mono truncate flex-1">getrido.pl/p/{kod}</span>
                <Button variant="ghost" size="sm" className="h-7 shrink-0" onClick={kopiujLink}>
                  {skopiowane ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            )}

            {/* Tresc schowana, bo w zwyklym uzyciu nikt jej nie zmienia —
                ale bywa potrzebna, wiec jest na jedno klikniecie. */}
            {kanal === 'sms' && <button
              type="button"
              onClick={() => setPokazTresc(v => !v)}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 mx-auto"
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${pokazTresc ? 'rotate-180' : ''}`} />
              {pokazTresc ? 'Ukryj treść' : 'Podejrzyj lub zmień treść'}
            </button>}

            {pokazTresc && kanal === 'sms' && (
              <div className="space-y-1.5 text-left">
                <Textarea
                  value={tresc}
                  onChange={(e) => setTresc(e.target.value)}
                  rows={5}
                  className="text-sm"
                />
                <p className="text-[11px] text-muted-foreground">
                  {tresc.length} znaków · {czesci} {czesci === 1 ? 'wiadomość' : 'części'}.
                  Bez polskich znaków, bo wtedy mieści się 160 znaków na część zamiast 70.
                </p>
              </div>
            )}
          </div>

          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Nie, pomiń
            </Button>
            <Button
              onClick={kanal === 'email' ? wyslijMail : wyslij}
              disabled={wysyla || (kanal === 'sms' ? !numerOk : !email.trim())}
              className="gap-2"
            >
              {wysyla
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : kanal === 'email' ? <Mail className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
              {kanal === 'email' ? 'Wyślij e-mail' : 'Wyślij SMS'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

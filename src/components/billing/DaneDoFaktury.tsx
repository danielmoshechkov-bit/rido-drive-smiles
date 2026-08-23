import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';

/**
 * Krok „Dane do faktury" — PRZED wyborem metody płatności.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DLACZEGO PYTAMY PRZED, A NIE PO
 * ═══════════════════════════════════════════════════════════════════════════
 * Faktury z pustym albo błędnym nabywcą nie da się poprawić edycją. Wymaga
 * korekty, a korekta idzie do KSeF i zostaje w ewidencji na zawsze.
 *
 * Moment przed płatnością jest najtańszy w całym procesie: klient już
 * zdecydował, że płaci, i ma dane pod ręką. Ten sam ekran po płatności
 * to prośba do kogoś, kto właśnie skończył i zamknął kartę.
 *
 * Dane, które już mamy, pokazujemy DO POTWIERDZENIA — jednym kliknięciem
 * dalej. Kazanie przepisywać to, co system wie, jest karą za bycie klientem
 * od dawna.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * OSOBA FIZYCZNA TEŻ KUPUJE
 * ═══════════════════════════════════════════════════════════════════════════
 * Warsztat prowadzony bez firmy ma móc zapłacić. NIP jest wymagany wyłącznie
 * przy wyborze „firma"; przy „osobie prywatnej" liczą się imię, nazwisko
 * i adres. Blokowanie zakupu za brak NIP-u odcinałoby klientów, którzy mają
 * pieniądze i chcą zapłacić.
 */

export interface DaneNabywcy {
  rodzaj: 'firma' | 'osoba';
  nazwa: string;
  nip: string;
  adres: string;
  kod: string;
  miasto: string;
  email: string;
}

const PUSTE: DaneNabywcy = { rodzaj: 'firma', nazwa: '', nip: '', adres: '', kod: '', miasto: '', email: '' };

/** Suma kontrolna NIP-u — ta sama, co w bazie. Tu po to, żeby powiedzieć
 *  o literówce OD RAZU, a nie po kliknięciu „Dalej". */
export function nipPoprawny(nip: string): boolean {
  const c = nip.replace(/[^0-9]/g, '');
  if (!/^[0-9]{10}$/.test(c)) return false;
  const wagi = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const suma = wagi.reduce((s, w, i) => s + w * Number(c[i]), 0);
  return suma % 11 === Number(c[9]);
}

export function DaneDoFaktury({
  providerId, onGotowe, onWstecz,
}: {
  providerId: string | null;
  onGotowe: () => void;
  onWstecz: () => void;
}) {
  const [dane, setDane] = useState<DaneNabywcy>(PUSTE);
  const [komplet, setKomplet] = useState<boolean | null>(null);
  const [edycja, setEdycja] = useState(false);
  const [zapis, setZapis] = useState(false);

  useEffect(() => {
    if (!providerId) return;
    (async () => {
      const [{ data: sp }, { data: ok }] = await Promise.all([
        supabase.from('service_providers')
          .select('company_name, company_nip, company_address, company_postal_code, company_city, company_email, faktura_rodzaj_nabywcy')
          .eq('id', providerId).maybeSingle(),
        (supabase as any).rpc('billing_dane_nabywcy_kompletne', { p_provider_id: providerId }),
      ]);
      const w = sp as any;
      setDane({
        rodzaj: (w?.faktura_rodzaj_nabywcy as 'firma' | 'osoba') ?? 'firma',
        nazwa: w?.company_name ?? '',
        nip: w?.company_nip ?? '',
        adres: w?.company_address ?? '',
        kod: w?.company_postal_code ?? '',
        miasto: w?.company_city ?? '',
        email: w?.company_email ?? '',
      });
      setKomplet(ok === true);
      setEdycja(ok !== true);
    })();
  }, [providerId]);

  const zapisz = async () => {
    if (!providerId || zapis) return;
    if (dane.rodzaj === 'firma' && !nipPoprawny(dane.nip)) {
      toast.error('NIP wygląda na niepoprawny — sprawdź cyfry.');
      return;
    }
    setZapis(true);
    try {
      // `as any`: wygenerowany `types.ts` nie zna jeszcze tej funkcji —
      // odświeża go Lovable, a plik jest w repozytorium tylko do odczytu.
      const { error } = await (supabase as any).rpc('billing_zapisz_dane_nabywcy', {
        p_provider_id: providerId,
        p_rodzaj: dane.rodzaj,
        p_nazwa: dane.nazwa,
        p_nip: dane.rodzaj === 'firma' ? dane.nip : null,
        p_adres: dane.adres,
        p_kod: dane.kod,
        p_miasto: dane.miasto,
        p_email: dane.email || null,
      });
      if (error) throw error;
      onGotowe();
    } catch (e) {
      const tresc = e instanceof Error ? e.message : '';
      // Kody z bazy tłumaczymy na zdania. Klient nie ma oglądać `BRAK_ADRESU`.
      const komunikat =
        tresc.includes('ZLY_NIP') ? 'NIP wygląda na niepoprawny — sprawdź cyfry.'
        : tresc.includes('BRAK_ADRESU') ? 'Uzupełnij ulicę, kod pocztowy i miasto.'
        : tresc.includes('BRAK_NAZWY') ? (dane.rodzaj === 'firma' ? 'Podaj nazwę firmy.' : 'Podaj imię i nazwisko.')
        : 'Nie udało się zapisać danych do faktury.';
      toast.error(komunikat);
    } finally {
      setZapis(false);
    }
  };

  if (komplet === null) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  // ── mamy komplet: do potwierdzenia jednym kliknięciem ──
  if (!edycja) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-border p-4">
          <p className="font-semibold">{dane.nazwa}</p>
          {dane.rodzaj === 'firma' && dane.nip && (
            <p className="text-sm text-muted-foreground">NIP {dane.nip}</p>
          )}
          <p className="mt-1 text-sm text-muted-foreground">
            {dane.adres}<br />{dane.kod} {dane.miasto}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setEdycja(true)}>
            <Pencil className="mr-2 h-4 w-4" /> Zmień dane
          </Button>
          <Button className="flex-1" onClick={onGotowe}>To się zgadza</Button>
        </div>
        <button type="button" onClick={onWstecz} className="text-sm text-muted-foreground hover:text-foreground">
          Wstecz
        </button>
      </div>
    );
  }

  // ── brak danych albo edycja ──
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(['firma', 'osoba'] as const).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setDane((d) => ({ ...d, rodzaj: r }))}
            className={
              'flex-1 rounded-lg border p-3 text-sm transition ' +
              (dane.rodzaj === r ? 'border-primary bg-primary/5 font-medium' : 'border-border hover:border-primary/50')
            }
          >
            {r === 'firma' ? 'Firma' : 'Osoba prywatna'}
          </button>
        ))}
      </div>

      <div className="grid gap-3">
        <div>
          <Label htmlFor="nab-nazwa">{dane.rodzaj === 'firma' ? 'Nazwa firmy' : 'Imię i nazwisko'}</Label>
          <Input id="nab-nazwa" value={dane.nazwa}
            onChange={(e) => setDane((d) => ({ ...d, nazwa: e.target.value }))} />
        </div>

        {dane.rodzaj === 'firma' && (
          <div>
            <Label htmlFor="nab-nip">NIP</Label>
            <Input id="nab-nip" value={dane.nip} inputMode="numeric"
              onChange={(e) => setDane((d) => ({ ...d, nip: e.target.value }))} />
            {dane.nip.replace(/[^0-9]/g, '').length === 10 && !nipPoprawny(dane.nip) && (
              <p className="mt-1 text-xs text-destructive">Ten NIP nie przechodzi sumy kontrolnej.</p>
            )}
          </div>
        )}

        <div>
          <Label htmlFor="nab-adres">Ulica i numer</Label>
          <Input id="nab-adres" value={dane.adres}
            onChange={(e) => setDane((d) => ({ ...d, adres: e.target.value }))} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label htmlFor="nab-kod">Kod</Label>
            <Input id="nab-kod" value={dane.kod} placeholder="00-000"
              onChange={(e) => setDane((d) => ({ ...d, kod: e.target.value }))} />
          </div>
          <div className="col-span-2">
            <Label htmlFor="nab-miasto">Miasto</Label>
            <Input id="nab-miasto" value={dane.miasto}
              onChange={(e) => setDane((d) => ({ ...d, miasto: e.target.value }))} />
          </div>
        </div>

        <div>
          <Label htmlFor="nab-email">E-mail do faktur (opcjonalnie)</Label>
          <Input id="nab-email" type="email" value={dane.email}
            onChange={(e) => setDane((d) => ({ ...d, email: e.target.value }))} />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Zapisujemy je w ustawieniach warsztatu, więc przy następnym zakupie
        wystarczy potwierdzić.
      </p>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onWstecz}>Wstecz</Button>
        <Button className="flex-1" onClick={zapisz} disabled={zapis}>
          {zapis && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Zapisz i przejdź dalej
        </Button>
      </div>
    </div>
  );
}

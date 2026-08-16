import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useGusLookup, cleanNip, isValidNip } from '@/hooks/useGusLookup';
import { ShortenLegalFormCheckbox } from '@/components/shared/ShortenLegalFormCheckbox';
import { Building2, Clock, Wrench, FileText, Search, Loader2, Plus, Trash2, ArrowRight, Check, ExternalLink } from 'lucide-react';

/**
 * Pierwsze uruchomienie warsztatu — dane firmy, godziny, stanowiska, KSeF.
 *
 * Dlaczego okno, a nie „uzupełnij kiedyś w ustawieniach": na tych danych
 * wystawiamy faktury i to one idą w SMS-ach do klienta („Cart78Garage: wizyta…"),
 * na karcie zlecenia i na kosztorysie. Warsztat, który zacznie pracę bez nich,
 * wystawi pierwszy dokument z pustym sprzedawcą i wyśle SMS bez nazwy — a to
 * wychodzi dopiero przy kliencie.
 *
 * Dlatego dane firmy są WYMAGANE, a godziny pracy i stanowiska można pominąć:
 * bez nich system działa, tylko rezerwacje online nie wiedzą, kiedy warsztat
 * pracuje. Ostatni krok to instrukcja KSeF — nie da się jej za nikogo wyklikać,
 * bo token generuje sam podatnik w portalu Ministerstwa Finansów.
 *
 * Zapis idzie w to samo miejsce co ekran Ustawienia → Zakład
 * (workshop_settings + odbicie w service_providers), więc po zamknięciu okna
 * wszystko jest tam do poprawienia.
 */

const DNI = [
  { klucz: 'monday', nazwa: 'Poniedziałek' },
  { klucz: 'tuesday', nazwa: 'Wtorek' },
  { klucz: 'wednesday', nazwa: 'Środa' },
  { klucz: 'thursday', nazwa: 'Czwartek' },
  { klucz: 'friday', nazwa: 'Piątek' },
  { klucz: 'saturday', nazwa: 'Sobota' },
  { klucz: 'sunday', nazwa: 'Niedziela' },
];

const GODZINY_DOMYSLNE = DNI.map((_, i) => ({ open: i < 5, from: '08:00', to: '17:00' }));

interface Props {
  open: boolean;
  onZamknij: () => void;
}

export function WorkshopSetupWizard({ open, onZamknij }: Props) {
  const [krok, setKrok] = useState(1);
  const [zapisuje, setZapisuje] = useState(false);

  const [firma, setFirma] = useState({
    firm_name: '', short_name: '', nip: '', address: '', postal_code: '', city: '',
    phone: '', email: '', website: '', bank_account: '',
  });
  const [godziny, setGodziny] = useState(GODZINY_DOMYSLNE);
  const [stanowiska, setStanowiska] = useState<Array<{ name: string; active: boolean }>>([]);
  const [noweStanowisko, setNoweStanowisko] = useState('');
  const [settingsId, setSettingsId] = useState<string | null>(null);

  const { lookup, loading: szukaNip, shorten, setShorten } = useGusLookup();

  // Dociągamy to, co już jest — konto mogło mieć część danych z rejestracji.
  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await (supabase as any)
        .from('workshop_settings')
        .select('id, firm_name, short_name, nip, address, postal_code, city, phone, email, website, bank_account, working_hours, work_stations')
        .eq('user_id', user.id)
        .maybeSingle();
      if (data) {
        setSettingsId(data.id);
        setFirma((f) => ({
          firm_name: data.firm_name || f.firm_name,
          short_name: data.short_name || f.short_name,
          nip: data.nip || f.nip,
          address: data.address || f.address,
          postal_code: data.postal_code || f.postal_code,
          city: data.city || f.city,
          phone: data.phone || f.phone,
          email: data.email || f.email,
          website: data.website || f.website,
          bank_account: data.bank_account || f.bank_account,
        }));
        if (Array.isArray(data.working_hours) && data.working_hours.length === 7) setGodziny(data.working_hours);
        if (Array.isArray(data.work_stations)) setStanowiska(data.work_stations);
      }
      if (!data?.email) {
        setFirma((f) => ({ ...f, email: f.email || user.email || '' }));
      }
    })();
  }, [open]);

  const pobierzZGus = async () => {
    const czysty = cleanNip(firma.nip);
    if (!isValidNip(czysty)) { toast.error('Numer NIP wygląda na niepoprawny'); return; }
    const dane = await lookup(czysty);
    if (!dane) { toast.error('Nie znaleziono firmy o tym numerze NIP'); return; }
    setFirma((f) => ({
      ...f,
      firm_name: dane.nazwa || f.firm_name,
      short_name: f.short_name || dane.nazwa_skrocona || '',
      address: dane.adres || f.address,
      postal_code: dane.kod_pocztowy || f.postal_code,
      city: dane.miasto || f.city,
    }));
    toast.success('Dane firmy pobrane z bazy GUS');
  };

  const brakujace = () => {
    const wymagane: Array<[keyof typeof firma, string]> = [
      ['firm_name', 'nazwa firmy'], ['nip', 'NIP'], ['address', 'adres'],
      ['postal_code', 'kod pocztowy'], ['city', 'miasto'], ['phone', 'telefon'], ['email', 'e-mail'],
    ];
    return wymagane.filter(([pole]) => !String(firma[pole] || '').trim()).map(([, opis]) => opis);
  };

  const zapisz = async (dodatkowe: Record<string, unknown> = {}) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Sesja wygasła — zaloguj się ponownie');
    const payload = {
      user_id: user.id,
      firm_name: firma.firm_name,
      short_name: firma.short_name || firma.firm_name,
      nip: cleanNip(firma.nip),
      address: firma.address,
      postal_code: firma.postal_code,
      city: firma.city,
      phone: firma.phone,
      email: firma.email,
      website: firma.website,
      bank_account: firma.bank_account,
      updated_at: new Date().toISOString(),
      ...dodatkowe,
    };
    if (settingsId) {
      const { error } = await (supabase as any).from('workshop_settings').update(payload).eq('id', settingsId);
      if (error) throw error;
    } else {
      const { data, error } = await (supabase as any).from('workshop_settings').insert(payload).select('id').single();
      if (error) throw error;
      setSettingsId(data.id);
    }

    // Odbicie w service_providers — stamtąd dane bierze karta klienta, SMS-y
    // i publiczna wizytówka. Bez tego nazwa firmy byłaby w dwóch miejscach różna.
    const { data: sp } = await supabase
      .from('service_providers').select('id').eq('user_id', user.id)
      .order('created_at', { ascending: true }).limit(1).maybeSingle();
    if (sp) {
      await supabase.from('service_providers').update({
        company_name: firma.firm_name,
        company_nip: cleanNip(firma.nip),
        company_address: firma.address,
        company_city: firma.city,
        company_postal_code: firma.postal_code,
        company_phone: firma.phone,
        owner_email: firma.email,
        company_website: firma.website,
      }).eq('id', sp.id);
    }
  };

  const dalejZDanymi = async () => {
    const braki = brakujace();
    if (braki.length) {
      toast.error(`Uzupełnij: ${braki.join(', ')}`);
      return;
    }
    setZapisuje(true);
    try {
      await zapisz();
      toast.success('Dane firmy zapisane');
      setKrok(2);
    } catch (e: any) {
      toast.error(e.message || 'Nie udało się zapisać');
    } finally {
      setZapisuje(false);
    }
  };

  const zapiszGodziny = async (idzDalej: boolean) => {
    setZapisuje(true);
    try {
      await zapisz({ working_hours: godziny });
      setKrok(idzDalej ? 3 : 3);
    } catch (e: any) {
      toast.error(e.message || 'Nie udało się zapisać');
    } finally {
      setZapisuje(false);
    }
  };

  const zapiszStanowiska = async () => {
    setZapisuje(true);
    try {
      await zapisz({ work_stations: stanowiska });
      setKrok(4);
    } catch (e: any) {
      toast.error(e.message || 'Nie udało się zapisać');
    } finally {
      setZapisuje(false);
    }
  };

  const naglowek = (ikona: JSX.Element, tytul: string, opis: string) => (
    <div className="flex items-start gap-3 mb-4">
      <div className="rounded-lg bg-primary/10 p-2 text-primary">{ikona}</div>
      <div>
        <h2 className="text-lg font-semibold">{tytul}</h2>
        <p className="text-sm text-muted-foreground">{opis}</p>
      </div>
    </div>
  );

  const kropki = (
    <div className="flex items-center gap-1.5 justify-center mb-4">
      {[1, 2, 3, 4].map((n) => (
        <span
          key={n}
          className={`h-1.5 rounded-full transition-all ${n === krok ? 'w-6 bg-primary' : n < krok ? 'w-3 bg-primary/40' : 'w-3 bg-muted'}`}
        />
      ))}
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(otwarte) => {
        if (otwarte) return;
        // Krok 1 jest obowiązkowy, ale zamiast martwego krzyżyka mówimy DLACZEGO.
        // Puste zamknięcie ekranu wygląda jak awaria.
        if (krok === 1) {
          toast.error('Najpierw dane firmy — bez nich faktura wyjdzie bez sprzedawcy, a SMS bez nazwy warsztatu');
          return;
        }
        onZamknij();
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {kropki}

        {krok === 1 && (
          <div>
            {naglowek(<Building2 className="h-5 w-5" />, 'Dane zakładu',
              'Na tych danych wystawimy faktury, a nazwa skrócona pojawi się w SMS-ach do klientów. Bez nich nie da się zacząć.')}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2 grid gap-3 sm:grid-cols-[1fr_auto]">
                <div className="space-y-1.5">
                  <Label>NIP *</Label>
                  <div className="flex gap-2">
                    <Input
                      onFocus={(e) => e.currentTarget.select()}
                      value={firma.nip}
                      onChange={(e) => setFirma({ ...firma, nip: e.target.value })}
                      placeholder="5223247450"
                    />
                    <Button type="button" variant="outline" onClick={pobierzZGus} disabled={szukaNip} title="Pobierz dane z bazy GUS">
                      {szukaNip ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    </Button>
                  </div>
                  <ShortenLegalFormCheckbox checked={shorten} onCheckedChange={setShorten} />
                </div>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label>Nazwa firmy *</Label>
                <Input onFocus={(e) => e.currentTarget.select()} value={firma.firm_name}
                  onChange={(e) => setFirma({ ...firma, firm_name: e.target.value })} placeholder="CART78GARAGE sp. z o.o." />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label>Nazwa skrócona (widoczna w SMS i dokumentach)</Label>
                <Input onFocus={(e) => e.currentTarget.select()} value={firma.short_name}
                  onChange={(e) => setFirma({ ...firma, short_name: e.target.value })} placeholder="Cart78Garage" />
                <p className="text-[11px] text-muted-foreground">Puste = użyjemy pełnej nazwy. Krótka mieści się w SMS-ie.</p>
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label>Adres *</Label>
                <Input onFocus={(e) => e.currentTarget.select()} value={firma.address}
                  onChange={(e) => setFirma({ ...firma, address: e.target.value })} placeholder="ul. Borsucza 13" />
              </div>

              <div className="space-y-1.5">
                <Label>Kod pocztowy *</Label>
                <Input onFocus={(e) => e.currentTarget.select()} value={firma.postal_code}
                  onChange={(e) => setFirma({ ...firma, postal_code: e.target.value })} placeholder="02-213" />
              </div>
              <div className="space-y-1.5">
                <Label>Miasto *</Label>
                <Input onFocus={(e) => e.currentTarget.select()} value={firma.city}
                  onChange={(e) => setFirma({ ...firma, city: e.target.value })} placeholder="Warszawa" />
              </div>

              <div className="space-y-1.5">
                <Label>Telefon *</Label>
                <Input onFocus={(e) => e.currentTarget.select()} value={firma.phone}
                  onChange={(e) => setFirma({ ...firma, phone: e.target.value })} placeholder="796386382" />
              </div>
              <div className="space-y-1.5">
                <Label>E-mail *</Label>
                <Input onFocus={(e) => e.currentTarget.select()} value={firma.email}
                  onChange={(e) => setFirma({ ...firma, email: e.target.value })} placeholder="kontakt@warsztat.pl" />
              </div>

              <div className="space-y-1.5">
                <Label>Strona WWW</Label>
                <Input onFocus={(e) => e.currentTarget.select()} value={firma.website}
                  onChange={(e) => setFirma({ ...firma, website: e.target.value })} placeholder="warsztat.pl" />
              </div>
              <div className="space-y-1.5">
                <Label>Nr konta bankowego</Label>
                <Input onFocus={(e) => e.currentTarget.select()} value={firma.bank_account}
                  onChange={(e) => setFirma({ ...firma, bank_account: e.target.value })} placeholder="44 1140 2004 0000 3202 8676 2125" />
                <p className="text-[11px] text-muted-foreground">Potrzebne na fakturach z przelewem.</p>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground mt-3">
              Logo dodasz w Ustawienia → Zakład. Pojawi się na karcie klienta i na dokumentach.
            </p>

            <div className="flex justify-end mt-5">
              <Button onClick={dalejZDanymi} disabled={zapisuje}>
                {zapisuje ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Zapisz i dalej <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {krok === 2 && (
          <div>
            {naglowek(<Clock className="h-5 w-5" />, 'Godziny pracy',
              'Z nich wynika, kiedy klient może zarezerwować wizytę online i jak wygląda siatka terminarza.')}

            <div className="space-y-2">
              {DNI.map((d, i) => (
                <div key={d.klucz} className="flex items-center gap-3 rounded-lg border px-3 py-2">
                  <Switch
                    checked={godziny[i].open}
                    onCheckedChange={(v) => setGodziny(g => g.map((x, j) => j === i ? { ...x, open: v } : x))}
                  />
                  <span className="w-28 text-sm">{d.nazwa}</span>
                  <Input type="time" className="w-28 h-9" value={godziny[i].from} disabled={!godziny[i].open}
                    onChange={(e) => setGodziny(g => g.map((x, j) => j === i ? { ...x, from: e.target.value } : x))} />
                  <span className="text-muted-foreground">—</span>
                  <Input type="time" className="w-28 h-9" value={godziny[i].to} disabled={!godziny[i].open}
                    onChange={(e) => setGodziny(g => g.map((x, j) => j === i ? { ...x, to: e.target.value } : x))} />
                </div>
              ))}
            </div>

            <div className="flex justify-between mt-5">
              <Button variant="ghost" onClick={() => setKrok(3)}>Pominę na razie</Button>
              <Button onClick={() => zapiszGodziny(true)} disabled={zapisuje}>
                {zapisuje ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Zapisz i dalej <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {krok === 3 && (
          <div>
            {naglowek(<Wrench className="h-5 w-5" />, 'Stanowiska',
              'Podnośnik, kanał, hala lakiernicza — dzięki nim terminarz wie, ile aut przyjmiesz naraz.')}

            <div className="flex gap-2">
              <Input
                onFocus={(e) => e.currentTarget.select()}
                value={noweStanowisko}
                onChange={(e) => setNoweStanowisko(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && noweStanowisko.trim()) {
                    setStanowiska(s => [...s, { name: noweStanowisko.trim(), active: true }]);
                    setNoweStanowisko('');
                  }
                }}
                placeholder="np. Podnośnik 1"
              />
              <Button variant="outline" onClick={() => {
                if (!noweStanowisko.trim()) { toast.error('Wpisz nazwę stanowiska'); return; }
                setStanowiska(s => [...s, { name: noweStanowisko.trim(), active: true }]);
                setNoweStanowisko('');
              }}>
                <Plus className="h-4 w-4 mr-1" /> Dodaj
              </Button>
            </div>

            <div className="space-y-2 mt-3">
              {stanowiska.length === 0 && (
                <p className="text-sm text-muted-foreground">Nie masz jeszcze stanowisk. Możesz je dodać teraz albo później w Ustawieniach.</p>
              )}
              {stanowiska.map((s, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  <span className="text-sm">{s.name}</span>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setStanowiska(x => x.filter((_, j) => j !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex justify-between mt-5">
              <Button variant="ghost" onClick={() => setKrok(4)}>Pominę na razie</Button>
              <Button onClick={zapiszStanowiska} disabled={zapisuje}>
                {zapisuje ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Zapisz i dalej <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}

        {krok === 4 && (
          <div>
            {naglowek(<FileText className="h-5 w-5" />, 'Faktury i KSeF',
              'Od 2026 faktury dla firm idą przez Krajowy System e-Faktur. Tego kroku nie zrobimy za Ciebie — token generuje sam podatnik.')}

            <ol className="space-y-3 text-sm">
              <li className="rounded-lg border p-3">
                <b>1. Wejdź na ksef.mf.gov.pl</b> i zaloguj się jako podatnik — podpisem kwalifikowanym,
                Profilem Zaufanym albo pieczęcią elektroniczną firmy.
              </li>
              <li className="rounded-lg border p-3">
                <b>2. Wygeneruj token</b> w sekcji „Tokeny" → „Wygeneruj token". Zaznacz uprawnienia
                do <i>wystawiania</i> i <i>przeglądania</i> faktur. Token pokazuje się <b>tylko raz</b> —
                skopiuj go od razu.
              </li>
              <li className="rounded-lg border p-3">
                <b>3. Wklej token u nas:</b> Księgowość → KSeF → Ustawienia. Wybierz środowisko
                („Demo" do testów, „Produkcja" do prawdziwych faktur) i wklej token w pole
                „Token autoryzacyjny KSeF".
              </li>
              <li className="rounded-lg border p-3">
                <b>4. Kliknij „Testuj połączenie".</b> Przycisk jest pod polem tokena. Gdy wszystko
                gra, status zmieni się na zielony „Połączony" — i tyle, nie musisz nic wysyłać
                na próbę.
              </li>
            </ol>

            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-800 dark:text-amber-300 mt-3">
              Bez tokena wystawisz faktury normalnie — po prostu nie polecą automatycznie do KSeF.
              Możesz wrócić do tego, gdy będziesz mieć token pod ręką.
            </div>

            <div className="flex justify-between mt-5 gap-2 flex-wrap">
              <Button variant="ghost" onClick={onZamknij}>Zrobię to później</Button>
              <div className="flex gap-2">
                <Button variant="outline" asChild>
                  <a href="https://ksef.mf.gov.pl" target="_blank" rel="noopener noreferrer">
                    Otwórz portal KSeF <ExternalLink className="h-4 w-4 ml-1" />
                  </a>
                </Button>
                <Button onClick={onZamknij}>
                  <Check className="h-4 w-4 mr-1" /> Gotowe, zaczynam pracę
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

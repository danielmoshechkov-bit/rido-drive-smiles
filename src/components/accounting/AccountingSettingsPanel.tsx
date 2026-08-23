import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Building2, Hash, Shield, Mail, Loader2, Plus, Pencil, Save, Link2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { CompanySetupWizard } from '@/components/invoices/CompanySetupWizard';
import { KsefUserSettings } from '@/components/ksef/KsefUserSettings';
import { InvoiceEmailSetup } from '@/components/invoices/InvoiceEmailSetup';

/**
 * Jedno miejsce na wszystkie ustawienia ksiegowosci: dane firmy, numeracja,
 * KSeF i e-mail do faktur.
 *
 * Te same ustawienia sa nadal dostepne w swoich kaflach (KSeF, Email faktury)
 * — to dokladnie te same komponenty i te same tabele, wiec zmiana zrobiona
 * tutaj jest widoczna tam i odwrotnie. Nie ma dwoch kopii ustawien.
 *
 * Dane firmy sa dodatkowo zsynchronizowane miedzy `entities` a
 * `company_settings` po stronie bazy, wiec ekran zapisujacy do jednej z nich
 * aktualizuje takze druga.
 */
export function AccountingSettingsPanel() {
  const [ladowanie, setLadowanie] = useState(true);
  const [firmy, setFirmy] = useState<any[]>([]);
  const [kreatorOtwarty, setKreatorOtwarty] = useState(false);
  const [edytowana, setEdytowana] = useState<any>(null);

  // Domyslne wartosci faktur trzymane w `company_settings`.
  const [prefiks, setPrefiks] = useState('');
  const [terminDni, setTerminDni] = useState('');
  const [vat, setVat] = useState('');
  const [waluta, setWaluta] = useState('');
  const [zapisuje, setZapisuje] = useState(false);
  const [maUstawienia, setMaUstawienia] = useState(false);

  const wczytaj = async () => {
    setLadowanie(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: e } = await supabase
        .from('entities')
        .select('*')
        .eq('owner_user_id', user.id)
        .order('created_at', { ascending: false });
      setFirmy(e ?? []);

      const { data: cs } = await supabase
        .from('company_settings')
        .select('invoice_prefix, payment_days, default_vat, currency')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cs) {
        setMaUstawienia(true);
        setPrefiks(cs.invoice_prefix ?? '');
        setTerminDni(cs.payment_days == null ? '' : String(cs.payment_days));
        setVat(cs.default_vat == null ? '' : String(cs.default_vat));
        setWaluta(cs.currency ?? '');
      }
    } finally {
      setLadowanie(false);
    }
  };

  useEffect(() => { wczytaj(); }, []);

  const zapiszDomyslne = async () => {
    const dni = terminDni.trim() === '' ? null : Number(terminDni);
    const stawka = vat.trim() === '' ? null : Number(vat);

    if (dni !== null && (!Number.isFinite(dni) || dni < 0)) {
      toast.error('Termin płatności musi być liczbą dni, zero lub więcej');
      return;
    }
    if (stawka !== null && (!Number.isFinite(stawka) || stawka < 0 || stawka > 100)) {
      toast.error('Stawka VAT musi mieścić się między 0 a 100');
      return;
    }

    setZapisuje(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const wartosci = {
        invoice_prefix: prefiks.trim() || null,
        payment_days: dni,
        default_vat: stawka,
        currency: waluta.trim() || null,
      };

      // Wpis ustawien moze jeszcze nie istniec — wtedy zakladamy go, zamiast
      // po cichu nie zapisac niczego.
      const { error } = maUstawienia
        ? await supabase.from('company_settings').update(wartosci).eq('user_id', user.id)
        : await supabase.from('company_settings').insert({ ...wartosci, user_id: user.id });

      if (error) throw error;
      setMaUstawienia(true);
      toast.success('Zapisano ustawienia faktur');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Nie udało się zapisać');
    } finally {
      setZapisuje(false);
    }
  };

  if (ladowanie) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-start gap-3 py-4">
          <Link2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            Te ustawienia są wspólne dla całego konta. Zmiana zrobiona tutaj jest
            widoczna wszędzie tam, gdzie te dane są używane — na fakturach, w KSeF
            i w pozostałych kaflach księgowości. Nie trzeba poprawiać ich dwa razy.
          </p>
        </CardContent>
      </Card>

      <Accordion type="multiple" defaultValue={['firma']} className="space-y-3">
        {/* ------------------------------------------------------ dane firmy */}
        <AccordionItem value="firma" className="border rounded-lg px-4 bg-card">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              <span className="font-semibold">Dane firmy</span>
              <Badge variant="outline" className="ml-2">
                {firmy.length === 0 ? 'brak' : `${firmy.length}`}
              </Badge>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <p className="text-sm text-muted-foreground mb-3">
              Wystawca na fakturach: nazwa, NIP, adres, konto bankowe i logo.
            </p>
            {firmy.length === 0 ? (
              <div className="text-center py-6 border-2 border-dashed rounded-lg">
                <Building2 className="h-10 w-10 mx-auto mb-3 text-primary/40" />
                <p className="text-sm text-muted-foreground mb-3">
                  Nie ma jeszcze żadnej firmy — bez niej nie wystawisz faktury.
                </p>
                <Button onClick={() => { setEdytowana(null); setKreatorOtwarty(true); }}>
                  <Plus className="h-4 w-4 mr-2" />Dodaj firmę
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {firmy.map((f) => (
                  <div key={f.id} className="flex items-center justify-between border rounded-lg p-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{f.name}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {f.nip ? `NIP ${f.nip}` : (
                          <span className="text-destructive">brak NIP — faktura nie wyjdzie</span>
                        )}
                        {f.address_city ? ` · ${f.address_city}` : ''}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setEdytowana(f); setKreatorOtwarty(true); }}
                    >
                      <Pencil className="h-4 w-4 mr-1" />Edytuj
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => { setEdytowana(null); setKreatorOtwarty(true); }}
                >
                  <Plus className="h-4 w-4 mr-2" />Dodaj kolejną firmę
                </Button>
              </div>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* ------------------------------------------------- numeracja/faktury */}
        <AccordionItem value="faktury" className="border rounded-lg px-4 bg-card">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-primary" />
              <span className="font-semibold">Domyślne na fakturach</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <p className="text-sm text-muted-foreground mb-4">
              Wartości podpowiadane przy wystawianiu. Na pojedynczej fakturze
              nadal można je zmienić.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Przedrostek numeru</Label>
                <Input
                  value={prefiks}
                  onChange={(e) => setPrefiks(e.target.value)}
                  placeholder="np. FV"
                />
              </div>
              <div className="space-y-2">
                <Label>Termin płatności (dni)</Label>
                <Input
                  type="number"
                  min={0}
                  value={terminDni}
                  onChange={(e) => setTerminDni(e.target.value)}
                  placeholder="np. 14"
                />
              </div>
              <div className="space-y-2">
                <Label>Domyślna stawka VAT (%)</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={vat}
                  onChange={(e) => setVat(e.target.value)}
                  placeholder="np. 23"
                />
              </div>
              <div className="space-y-2">
                <Label>Waluta</Label>
                <Input
                  value={waluta}
                  onChange={(e) => setWaluta(e.target.value)}
                  placeholder="np. PLN"
                />
              </div>
            </div>
            <Button className="mt-4" onClick={zapiszDomyslne} disabled={zapisuje}>
              {zapisuje
                ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                : <Save className="h-4 w-4 mr-2" />}
              Zapisz
            </Button>
          </AccordionContent>
        </AccordionItem>

        {/* ------------------------------------------------------------- KSeF */}
        <AccordionItem value="ksef" className="border rounded-lg px-4 bg-card">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <span className="font-semibold">KSeF</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <KsefUserSettings />
          </AccordionContent>
        </AccordionItem>

        {/* ----------------------------------------------------- email faktur */}
        <AccordionItem value="email" className="border rounded-lg px-4 bg-card">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              <span className="font-semibold">Faktury z e-maila</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <InvoiceEmailSetup />
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <CompanySetupWizard
        open={kreatorOtwarty}
        onOpenChange={setKreatorOtwarty}
        editEntity={edytowana}
        onCreated={() => { setKreatorOtwarty(false); setEdytowana(null); wczytaj(); }}
      />
    </div>
  );
}

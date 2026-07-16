import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  DEFAULT_NUMBERING, NumberingMode, NumberingPattern, NUMBERING_PATTERNS, buildInvoiceNumber,
} from '@/utils/invoiceNumbering';

// USTAWIENIA FAKTUR — jedno miejsce na STAŁĄ konfigurację firmy (nie dane
// pojedynczej faktury): tryb numeracji A/B/C + format numeru (wzór, prefiks).
// Dostępne z widoku listy faktur (przycisk „Ustawienia faktur").
// Formularz wystawiania tylko CZYTA te ustawienia.

interface InvoiceSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Wywoływane po zapisie — lista/formularz mogą odświeżyć ustawienia. */
  onSaved?: () => void;
}

const MODES: { value: NumberingMode; label: string; desc: string }[] = [
  { value: 'continuous', label: 'Ciągła bez cofania (zalecana)', desc: 'zawsze kolejny numer po najwyższej aktywnej fakturze; numery usuniętych przepadają' },
  { value: 'fill_gaps', label: 'Odzyskiwanie luk', desc: 'najniższy wolny numer — numer usuniętej faktury wraca do puli' },
  { value: 'manual', label: 'Ręczna z walidacją', desc: 'propozycja kolejnego numeru, pełna swoboda zmiany; blokowane są tylko duplikaty' },
];

export function InvoiceSettingsDialog({ open, onOpenChange, onSaved }: InvoiceSettingsDialogProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [mode, setMode] = useState<NumberingMode>(DEFAULT_NUMBERING.mode);
  const [pattern, setPattern] = useState<NumberingPattern>(DEFAULT_NUMBERING.pattern);
  const [prefix, setPrefix] = useState(DEFAULT_NUMBERING.prefix);
  const [mppWarning, setMppWarning] = useState(true);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data: company } = await (supabase
        .from('user_invoice_companies')
        .select('id, name, numbering_mode, numbering_pattern, numbering_prefix, mpp_warning_enabled') as any)
        .eq('user_id', user.id)
        .eq('is_default', true)
        .maybeSingle();
      if (cancelled) return;
      if (company) {
        setCompanyId(company.id);
        setCompanyName(company.name || '');
        if (['continuous', 'fill_gaps', 'manual'].includes(company.numbering_mode)) setMode(company.numbering_mode);
        if (['RRRR/MM/NNN', 'RRRR/NNN', 'NNN/RRRR', 'NNN'].includes(company.numbering_pattern)) setPattern(company.numbering_pattern);
        if (company.numbering_prefix) setPrefix(company.numbering_prefix);
        if (typeof company.mpp_warning_enabled === 'boolean') setMppWarning(company.mpp_warning_enabled);
      } else {
        setCompanyId(null);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open]);

  const preview = buildInvoiceNumber({ prefix: prefix || 'FV', pattern, mode }, new Date(), 7);

  const handleSave = async () => {
    if (!companyId) return;
    setSaving(true);
    try {
      const { error } = await (supabase.from('user_invoice_companies') as any)
        .update({
          numbering_mode: mode,
          numbering_pattern: pattern,
          numbering_prefix: (prefix || 'FV').trim(),
          mpp_warning_enabled: mppWarning,
        })
        .eq('id', companyId);
      if (error) throw error;
      toast.success('Ustawienia faktur zapisane');
      onOpenChange(false);
      onSaved?.();
    } catch (e: any) {
      toast.error('Błąd zapisu ustawień: ' + (e.message || ''));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" /> Ustawienia faktur
          </DialogTitle>
          <DialogDescription>
            Stała konfiguracja numeracji{companyName ? ` — ${companyName}` : ''}. Formularz
            wystawiania korzysta z tych ustawień automatycznie.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !companyId ? (
          <p className="text-sm text-muted-foreground py-4">
            Brak zapisanej firmy — wystaw pierwszą fakturę (dane sprzedawcy zapiszą się jako firma),
            a potem wróć tu skonfigurować numerację.
          </p>
        ) : (
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">Tryb numeracji</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as NumberingMode)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MODES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">{MODES.find(m => m.value === mode)?.desc}</p>
            </div>

            <div>
              <Label className="mb-2 block">Wzór numeru</Label>
              <Select value={pattern} onValueChange={(v) => setPattern(v as NumberingPattern)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NUMBERING_PATTERNS.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label} — {p.reset}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="mb-2 block">Prefiks</Label>
              <Input
                value={prefix}
                onChange={(e) => setPrefix(e.target.value.replace(/\s/g, '').slice(0, 12))}
                placeholder="FV"
              />
              <p className="text-xs text-muted-foreground mt-1">np. FV, FAKTURA, F</p>
            </div>

            <div className="rounded-md border bg-muted/40 px-3 py-2">
              <span className="text-xs text-muted-foreground">Podgląd numeru: </span>
              <span className="font-semibold">{preview}</span>
            </div>

            <p className="text-xs text-muted-foreground">
              Numer proponowany jest zawsze na podstawie AKTYWNYCH faktur w serii. Duplikaty
              aktywnych numerów są blokowane w każdym trybie; numer niższy/wyższy niż kolejny
              wywoła żółte ostrzeżenie (chronologia / pominięcie), które nie blokuje zapisu.
            </p>

            <div className="border-t pt-3 flex items-start justify-between gap-4">
              <div>
                <Label className="block">Ostrzeżenie MPP (split payment)</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Pokazuj okno o mechanizmie podzielonej płatności przy wystawianiu faktury
                  powyżej 15 000 zł. Zalecane włączone — brak wymaganej adnotacji MPP grozi
                  sankcją 30% VAT.
                </p>
              </div>
              <Switch checked={mppWarning} onCheckedChange={setMppWarning} className="mt-1 shrink-0" />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Anuluj</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Zapisz ustawienia
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

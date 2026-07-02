import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Loader2, Search, CheckCircle, XCircle, Building2, MapPin, FileText } from 'lucide-react';
import { useGusLookup, isValidNip, cleanNip, GusCompanyData } from '@/hooks/useGusLookup';
import { shortenLegalForm } from '@/utils/legalFormShortener';

interface NipLookupFieldProps {
  /** Wywoływany po pobraniu danych z GUS — tu formularz mapuje pola. */
  onCompanyFound?: (data: GusCompanyData) => void;
  initialNip?: string;
  label?: string;
  /** Automatyczny lookup po wpisaniu poprawnego NIP (domyślnie true). */
  autoLookup?: boolean;
  /** Zwięzły wariant bez karty podglądu wyniku. */
  compact?: boolean;
  disabled?: boolean;
}

/**
 * Współdzielone pole NIP z lupką — pobiera dane firmy z GUS REGON (Edge Function gus-lookup).
 * Jedyny mechanizm lookupu NIP na platformie; nie dodawaj nowych per-formularz.
 */
export function NipLookupField({
  onCompanyFound,
  initialNip,
  label = 'NIP firmy',
  autoLookup = true,
  compact = false,
  disabled = false,
}: NipLookupFieldProps) {
  const [nip, setNip] = useState(initialNip || '');
  const [shortenForm, setShortenForm] = useState(true);
  const { lookup, loading, error, company, reset } = useGusLookup();
  const lastLookedUp = useRef<string>('');

  // Do formularza trafia kopia z ewentualnie skróconą nazwą — oryginalne dane
  // z GUS (stan `company` w hooku) zostają nietknięte.
  const withNameVariant = (data: GusCompanyData, shorten: boolean): GusCompanyData => ({
    ...data,
    nazwa: shorten ? shortenLegalForm(data.nazwa) : data.nazwa,
  });

  const runLookup = async (value: string) => {
    const clean = cleanNip(value);
    if (!isValidNip(clean)) {
      toast.error('NIP ma nieprawidłową sumę kontrolną');
      return;
    }
    lastLookedUp.current = clean;
    const result = await lookup(clean);
    if (result) {
      onCompanyFound?.(withNameVariant(result, shortenForm));
    }
  };

  const handleShortenToggle = (checked: boolean) => {
    setShortenForm(checked);
    // Przełączenie PO lookupie podmienia nazwę w polu formularza.
    if (company) {
      onCompanyFound?.(withNameVariant(company, checked));
    }
  };

  useEffect(() => {
    const clean = cleanNip(nip);
    if (clean.length < 10) {
      reset();
      lastLookedUp.current = '';
      return;
    }
    if (autoLookup && isValidNip(clean) && clean !== lastLookedUp.current) {
      runLookup(clean);
    }
  }, [nip]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  const formatNip = (val: string) => {
    const digits = val.replace(/\D/g, '').slice(0, 10);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    if (digits.length <= 8) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`;
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5 text-sm font-medium">
          <Building2 className="h-4 w-4 text-primary" />
          {label}
        </Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              value={nip}
              onChange={(e) => setNip(formatNip(e.target.value))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  runLookup(nip);
                }
              }}
              placeholder="000-000-00-00"
              className="font-mono pr-10"
              maxLength={13}
              disabled={disabled}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {loading && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
              {!loading && company && <CheckCircle className="h-4 w-4 text-green-500" />}
              {!loading && error && <XCircle className="h-4 w-4 text-destructive" />}
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => runLookup(nip)}
            disabled={disabled || loading || cleanNip(nip).length < 10}
            title="Pobierz dane firmy z GUS"
          >
            <Search className="h-4 w-4" />
          </Button>
        </div>

        <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer w-fit">
          <Checkbox
            checked={shortenForm}
            onCheckedChange={(checked) => handleShortenToggle(checked === true)}
            disabled={disabled}
          />
          Skróć formę prawną (sp. z o.o.)
        </label>

        {error && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <XCircle className="h-3 w-3" /> {error}
          </p>
        )}
      </div>

      {company && !compact && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-sm leading-tight">
              {shortenForm ? shortenLegalForm(company.nazwa) : company.nazwa}
            </p>
            <Badge
              variant={company.status === 'aktywny' ? 'default' : 'destructive'}
              className="text-[10px] shrink-0"
            >
              {company.status === 'aktywny' ? 'Aktywna' : 'Zakończona'}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {[company.adres, company.kod_pocztowy, company.miasto].filter(Boolean).join(', ')}
            </span>
            <span>
              <FileText className="h-3 w-3 inline mr-1" />
              REGON: {company.regon}
            </span>
            {company.krs && <span>KRS: {company.krs}</span>}
            {company.forma_prawna && <span>{company.forma_prawna}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

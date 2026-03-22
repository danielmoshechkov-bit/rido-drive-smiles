import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, CheckCircle, XCircle, Building2, MapPin, FileText } from 'lucide-react';
import { useNipLookup, CompanyData } from '@/hooks/useNipLookup';

interface NipLookupFieldProps {
  onCompanyFound?: (data: CompanyData) => void;
  initialNip?: string;
  label?: string;
}

export function NipLookupField({ onCompanyFound, initialNip, label = 'NIP firmy' }: NipLookupFieldProps) {
  const [nip, setNip] = useState(initialNip || '');
  const { lookup, loading, error, company, reset } = useNipLookup();

  useEffect(() => {
    const clean = nip.replace(/[\s-]/g, '');
    if (clean.length === 10) {
      lookup(clean);
    } else {
      reset();
    }
  }, [nip]);

  useEffect(() => {
    if (company && onCompanyFound) {
      onCompanyFound(company);
    }
  }, [company]);

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
              placeholder="000-000-00-00"
              className="font-mono pr-10"
              maxLength={13}
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
            onClick={() => lookup(nip)}
            disabled={loading || nip.replace(/\D/g, '').length < 10}
            title="Szukaj firmy po NIP"
          >
            <Search className="h-4 w-4" />
          </Button>
        </div>

        {error && (
          <p className="text-xs text-destructive flex items-center gap-1">
            <XCircle className="h-3 w-3" /> {error}
          </p>
        )}
      </div>

      {company && (
        <div className="rounded-lg border bg-muted/30 p-3 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-sm leading-tight">{company.name}</p>
            <Badge
              variant={company.isVatPayer ? 'default' : 'secondary'}
              className="text-[10px] shrink-0"
            >
              VAT: {company.statusVat}
            </Badge>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {company.city}{company.province ? `, ${company.province}` : ''}
            </span>
            <span>📮 {company.postalCode}</span>
            <span>
              <FileText className="h-3 w-3 inline mr-1" />
              REGON: {company.regon}
            </span>
            <span>NIP: {company.nip}</span>
          </div>
          {company.fullAddress && (
            <p className="text-xs text-muted-foreground border-t pt-1.5 mt-1">
              🗺️ {company.fullAddress}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

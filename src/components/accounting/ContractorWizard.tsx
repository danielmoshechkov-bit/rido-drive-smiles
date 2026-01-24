import { useState, useEffect } from "react";
import { 
  Building2, 
  Search, 
  Check, 
  AlertTriangle, 
  Loader2, 
  ShieldCheck,
  ShieldX,
  ExternalLink,
  RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription 
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Json } from "@/integrations/supabase/types";

interface GUSData {
  name: string;
  nip: string;
  regon: string;
  address: string;
  city: string;
  postalCode: string;
  voivodeship: string;
  status: string;
}

interface WhitelistData {
  nip: string;
  name: string;
  statusVat: string;
  regon: string;
  residenceAddress?: string;
  workingAddress?: string;
  accountNumbers?: string[];
  statusLabel?: string;
  isActiveVat?: boolean;
}

interface ContractorWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  onContractorAdded?: (contractor: { id: string; name: string; nip: string }) => void;
  initialNip?: string;
}

type WizardStep = 'nip' | 'verify' | 'confirm' | 'save';

export function ContractorWizard({ 
  open, 
  onOpenChange, 
  entityId, 
  onContractorAdded,
  initialNip 
}: ContractorWizardProps) {
  const [step, setStep] = useState<WizardStep>('nip');
  const [nip, setNip] = useState(initialNip || '');
  const [isLoading, setIsLoading] = useState(false);
  const [gusData, setGusData] = useState<GUSData | null>(null);
  const [whitelistData, setWhitelistData] = useState<WhitelistData | null>(null);
  const [gusError, setGusError] = useState<string | null>(null);
  const [whitelistError, setWhitelistError] = useState<string | null>(null);
  
  // Editable fields
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [email, setEmail] = useState('');
  const [bankAccount, setBankAccount] = useState('');

  useEffect(() => {
    if (open) {
      setStep('nip');
      setNip(initialNip || '');
      setGusData(null);
      setWhitelistData(null);
      setGusError(null);
      setWhitelistError(null);
      resetForm();
    }
  }, [open, initialNip]);

  const resetForm = () => {
    setName('');
    setAddress('');
    setCity('');
    setPostalCode('');
    setEmail('');
    setBankAccount('');
  };

  const cleanNip = (value: string) => {
    return value.replace(/[\s-]/g, '').replace(/^PL/i, '');
  };

  const validateNip = (value: string) => {
    const clean = cleanNip(value);
    return /^\d{10}$/.test(clean);
  };

  const fetchGUSData = async () => {
    const clean = cleanNip(nip);
    if (!validateNip(clean)) {
      toast.error('Nieprawidłowy format NIP (wymagane 10 cyfr)');
      return;
    }

    setIsLoading(true);
    setGusError(null);

    try {
      const response = await fetch(
        'https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/registry-gus',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbHJyeXRtcnNjcXZzeXh5dm5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4NzcxNjAsImV4cCI6MjA3MTQ1MzE2MH0.AUBGgRgUfLkb2X5DXWat2uCa52ptLzQkEigUnNUXtqk',
          },
          body: JSON.stringify({ nip: clean }),
        }
      );

      const result = await response.json();

      if (result.success && result.data) {
        setGusData(result.data);
        setName(result.data.name);
        setAddress(result.data.address);
        setCity(result.data.city);
        setPostalCode(result.data.postalCode);
      } else {
        setGusError(result.error || 'Nie znaleziono danych w GUS');
      }
    } catch (error) {
      console.error('GUS fetch error:', error);
      setGusError('Błąd połączenia z API GUS');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchWhitelistData = async () => {
    const clean = cleanNip(nip);
    setIsLoading(true);
    setWhitelistError(null);

    try {
      const response = await fetch(
        'https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/registry-whitelist',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbHJyeXRtcnNjcXZzeXh5dm5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4NzcxNjAsImV4cCI6MjA3MTQ1MzE2MH0.AUBGgRgUfLkb2X5DXWat2uCa52ptLzQkEigUnNUXtqk',
          },
          body: JSON.stringify({ nip: clean, bankAccount }),
        }
      );

      const result = await response.json();

      if (result.success && result.data) {
        setWhitelistData(result.data);
      } else {
        setWhitelistError(result.error || 'Nie znaleziono w Wykazie VAT');
      }
    } catch (error) {
      console.error('Whitelist fetch error:', error);
      setWhitelistError('Błąd połączenia z API Ministerstwa Finansów');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async () => {
    await Promise.all([fetchGUSData(), fetchWhitelistData()]);
    setStep('verify');
  };

  const handleConfirm = () => {
    setStep('confirm');
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Nazwa kontrahenta jest wymagana');
      return;
    }

    setIsLoading(true);

    try {
      const insertData: {
        entity_id: string;
        name: string;
        nip: string;
        address_street: string | null;
        address_city: string | null;
        address_postal_code: string | null;
        email: string | null;
        bank_account: string | null;
        verification_status: string;
        gus_data: Json | null;
        whitelist_data: Json | null;
        last_verified_at: string;
      } = {
        entity_id: entityId,
        name: name.trim(),
        nip: cleanNip(nip),
        address_street: address.trim() || null,
        address_city: city.trim() || null,
        address_postal_code: postalCode.trim() || null,
        email: email.trim() || null,
        bank_account: bankAccount.trim() || null,
        verification_status: whitelistData?.isActiveVat ? 'verified' : 'unverified',
        gus_data: gusData ? JSON.parse(JSON.stringify(gusData)) : null,
        whitelist_data: whitelistData ? JSON.parse(JSON.stringify(whitelistData)) : null,
        last_verified_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('invoice_recipients')
        .insert([insertData])
        .select()
        .single();

      if (error) throw error;

      toast.success('Kontrahent został dodany');
      onContractorAdded?.({ id: data.id, name: data.name, nip: data.nip || '' });
      onOpenChange(false);

    } catch (error) {
      console.error('Save contractor error:', error);
      toast.error('Błąd podczas zapisywania kontrahenta');
    } finally {
      setIsLoading(false);
    }
  };

  const renderNipStep = () => (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="nip">NIP kontrahenta</Label>
        <div className="flex gap-2">
          <Input
            id="nip"
            value={nip}
            onChange={(e) => setNip(e.target.value)}
            placeholder="np. 1234567890"
            className="flex-1"
          />
          <Button
            onClick={handleVerify}
            disabled={!validateNip(nip) || isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                Szukaj
              </>
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Wpisz 10-cyfrowy NIP. System automatycznie pobierze dane z GUS i sprawdzi status VAT.
        </p>
      </div>
    </div>
  );

  const renderVerifyStep = () => (
    <div className="space-y-4">
      {/* GUS Results */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium text-sm">Dane z GUS/REGON</span>
            </div>
            <Button variant="ghost" size="sm" onClick={fetchGUSData} disabled={isLoading}>
              <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
            </Button>
          </div>

          {gusError ? (
            <div className="flex items-center gap-2 text-destructive text-sm">
              <AlertTriangle className="h-4 w-4" />
              <span>{gusError}</span>
            </div>
          ) : gusData ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                <span className="font-medium">{gusData.name}</span>
              </div>
              <p className="text-muted-foreground pl-6">
                {gusData.address}, {gusData.postalCode} {gusData.city}
              </p>
              <p className="text-muted-foreground pl-6">
                REGON: {gusData.regon}
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Ładowanie...</p>
          )}
        </CardContent>
      </Card>

      {/* Whitelist Results */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {whitelistData?.isActiveVat ? (
                <ShieldCheck className="h-4 w-4 text-green-600" />
              ) : (
                <ShieldX className="h-4 w-4 text-amber-600" />
              )}
              <span className="font-medium text-sm">Status VAT (Biała Lista)</span>
            </div>
            <Button variant="ghost" size="sm" onClick={fetchWhitelistData} disabled={isLoading}>
              <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} />
            </Button>
          </div>

          {whitelistError ? (
            <div className="flex items-center gap-2 text-amber-600 text-sm">
              <AlertTriangle className="h-4 w-4" />
              <span>{whitelistError}</span>
            </div>
          ) : whitelistData ? (
            <div className="space-y-2 text-sm">
              <Badge 
                variant={whitelistData.isActiveVat ? "default" : "secondary"}
                className={cn(
                  whitelistData.isActiveVat 
                    ? "bg-green-100 text-green-800 hover:bg-green-100" 
                    : "bg-amber-100 text-amber-800"
                )}
              >
                {whitelistData.statusLabel || whitelistData.statusVat}
              </Badge>
              {whitelistData.accountNumbers && whitelistData.accountNumbers.length > 0 && (
                <p className="text-muted-foreground">
                  Zarejestrowane rachunki: {whitelistData.accountNumbers.length}
                </p>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Ładowanie...</p>
          )}
        </CardContent>
      </Card>

      <div className="flex items-start gap-2 p-3 bg-muted rounded-lg text-sm">
        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
        <p className="text-muted-foreground">
          Sprawdź czy to właściwa firma. Kliknij "Potwierdź" aby kontynuować lub wróć aby zmienić NIP.
        </p>
      </div>
    </div>
  );

  const renderConfirmStep = () => (
    <div className="space-y-4">
      <div className="grid gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">Nazwa firmy</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nazwa firmy"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="nip-confirm">NIP</Label>
            <Input id="nip-confirm" value={cleanNip(nip)} disabled />
          </div>
          <div className="space-y-2">
            <Label htmlFor="postal">Kod pocztowy</Label>
            <Input
              id="postal"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              placeholder="00-000"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="address">Adres</Label>
          <Input
            id="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="ul. Przykładowa 1"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="city">Miasto</Label>
          <Input
            id="city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Warszawa"
          />
        </div>

        <Separator />

        <div className="space-y-2">
          <Label htmlFor="email">Email (opcjonalnie)</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="faktury@firma.pl"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="bank">Numer konta (opcjonalnie)</Label>
          <Input
            id="bank"
            value={bankAccount}
            onChange={(e) => setBankAccount(e.target.value)}
            placeholder="PL00 0000 0000 0000 0000 0000 0000"
          />
        </div>
      </div>
    </div>
  );

  const getStepTitle = () => {
    switch (step) {
      case 'nip': return 'Dodaj kontrahenta';
      case 'verify': return 'Weryfikacja danych';
      case 'confirm': return 'Potwierdź dane';
      default: return 'Dodaj kontrahenta';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {getStepTitle()}
          </DialogTitle>
          <DialogDescription>
            {step === 'nip' && 'Podaj NIP kontrahenta, a system automatycznie pobierze dane.'}
            {step === 'verify' && 'Sprawdź pobrane dane i potwierdź kontrahenta.'}
            {step === 'confirm' && 'Zweryfikuj i uzupełnij dane przed zapisaniem.'}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {step === 'nip' && renderNipStep()}
          {step === 'verify' && renderVerifyStep()}
          {step === 'confirm' && renderConfirmStep()}
        </div>

        <DialogFooter>
          {step === 'nip' && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Anuluj
            </Button>
          )}
          
          {step === 'verify' && (
            <>
              <Button variant="outline" onClick={() => setStep('nip')}>
                Wstecz
              </Button>
              <Button onClick={handleConfirm} disabled={!gusData && !name}>
                <Check className="h-4 w-4 mr-2" />
                Potwierdź
              </Button>
            </>
          )}
          
          {step === 'confirm' && (
            <>
              <Button variant="outline" onClick={() => setStep('verify')}>
                Wstecz
              </Button>
              <Button onClick={handleSave} disabled={isLoading || !name.trim()}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Zapisz kontrahenta
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

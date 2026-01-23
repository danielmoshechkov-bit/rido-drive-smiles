import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Loader2, Save, Check, AlertCircle, CheckCircle2, ExternalLink, FileText, Shield } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface DriverB2BProfileProps {
  driverId: string;
}

interface B2BProfileData {
  company_name: string;
  nip: string;
  regon: string;
  address_street: string;
  address_city: string;
  address_postal_code: string;
  bank_name: string;
  bank_account: string;
  email: string;
  phone: string;
  vat_payer: boolean;
  vat_verification_status?: string;
  vat_verified_at?: string;
}

interface ConsentData {
  consent_self_billing: boolean;
  consent_terms: boolean;
  status: string;
  accepted_at?: string;
}

const EMPTY_PROFILE: B2BProfileData = {
  company_name: "",
  nip: "",
  regon: "",
  address_street: "",
  address_city: "",
  address_postal_code: "",
  bank_name: "",
  bank_account: "",
  email: "",
  phone: "",
  vat_payer: false,
};

const TERMS_VERSION = "1.0";

export function DriverB2BProfile({ driverId }: DriverB2BProfileProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [verifyingNip, setVerifyingNip] = useState(false);
  const [profileData, setProfileData] = useState<B2BProfileData>(EMPTY_PROFILE);
  const [consent, setConsent] = useState<ConsentData>({ consent_self_billing: false, consent_terms: false, status: 'pending' });
  const [hasProfile, setHasProfile] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    loadProfile();
  }, [driverId]);

  const loadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      // Load B2B profile
      const { data, error } = await supabase
        .from("driver_b2b_profiles")
        .select("*")
        .eq("driver_user_id", user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setProfileData({
          company_name: data.company_name || "",
          nip: data.nip || "",
          regon: data.regon || "",
          address_street: data.address_street || "",
          address_city: data.address_city || "",
          address_postal_code: data.address_postal_code || "",
          bank_name: data.bank_name || "",
          bank_account: data.bank_account || "",
          email: data.email || "",
          phone: data.phone || "",
          vat_payer: data.vat_payer || false,
          vat_verification_status: data.vat_verification_status,
          vat_verified_at: data.vat_verified_at,
        });
        setHasProfile(true);
      }

      // Load consent
      const { data: consentData } = await supabase
        .from('auto_invoicing_consents')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();

      if (consentData) {
        setConsent({
          consent_self_billing: consentData.consent_self_billing,
          consent_terms: consentData.consent_terms,
          status: consentData.status,
          accepted_at: consentData.accepted_at,
        });
      }

    } catch (error) {
      console.error("Error loading B2B profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof B2BProfileData, value: string | boolean) => {
    let formattedValue = value;
    
    if (field === 'nip' && typeof value === 'string') {
      formattedValue = formatNip(value);
    } else if (field === 'regon' && typeof value === 'string') {
      formattedValue = formatRegon(value);
    } else if (field === 'address_postal_code' && typeof value === 'string') {
      formattedValue = formatPostalCode(value);
    } else if (field === 'bank_account' && typeof value === 'string') {
      formattedValue = formatBankAccount(value);
    }

    setProfileData((prev) => ({ ...prev, [field]: formattedValue }));
    setDirty(true);
  };

  const formatNip = (value: string) => {
    return value.replace(/\D/g, "").slice(0, 10);
  };

  const formatRegon = (value: string) => {
    return value.replace(/\D/g, "").slice(0, 14);
  };

  const formatPostalCode = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 5);
    if (digits.length > 2) {
      return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    }
    return digits;
  };

  const formatBankAccount = (value: string) => {
    return value.replace(/[^A-Z0-9]/gi, "").toUpperCase().slice(0, 28);
  };

  const validateNip = (nip: string): boolean => {
    if (nip.length !== 10) return false;
    const weights = [6, 5, 7, 2, 3, 4, 5, 6, 7];
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += parseInt(nip[i]) * weights[i];
    }
    return sum % 11 === parseInt(nip[9]);
  };

  const handleVerifyNip = async () => {
    const cleanNip = profileData.nip.replace(/\D/g, '');
    
    if (!validateNip(cleanNip)) {
      toast.error("Nieprawidłowy NIP - sprawdź sumę kontrolną");
      return;
    }

    setVerifyingNip(true);
    try {
      const response = await fetch(
        'https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/verify-vat',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
          },
          body: JSON.stringify({ 
            nip: cleanNip,
            driver_id: driverId 
          })
        }
      );

      const result = await response.json();

      if (result.valid) {
        setProfileData(prev => ({
          ...prev,
          vat_verification_status: 'verified',
          vat_verified_at: result.verifiedAt,
          company_name: prev.company_name || result.name || '',
        }));
        toast.success("NIP zweryfikowany pomyślnie w VIES!");
      } else if (result.status === 'invalid') {
        setProfileData(prev => ({ ...prev, vat_verification_status: 'invalid' }));
        toast.error("NIP nie jest zarejestrowany jako czynny podatnik VAT");
      } else {
        setProfileData(prev => ({ ...prev, vat_verification_status: 'error' }));
        toast.warning(result.error || "Nie udało się zweryfikować NIP. Spróbuj później.");
      }
    } catch (error) {
      console.error("NIP verification error:", error);
      toast.error("Błąd weryfikacji NIP");
    } finally {
      setVerifyingNip(false);
    }
  };

  const handleConsentChange = (field: 'consent_self_billing' | 'consent_terms', value: boolean) => {
    setConsent(prev => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    if (!userId) return;

    if (profileData.nip && !validateNip(profileData.nip)) {
      toast.error("Nieprawidłowy numer NIP");
      return;
    }

    setSaving(true);
    try {
      const profilePayload = {
        driver_user_id: userId,
        driver_id: driverId,
        company_name: profileData.company_name,
        nip: profileData.nip,
        regon: profileData.regon || null,
        address_street: profileData.address_street || null,
        address_city: profileData.address_city || null,
        address_postal_code: profileData.address_postal_code?.replace("-", "") || null,
        bank_name: profileData.bank_name || null,
        bank_account: profileData.bank_account || null,
        email: profileData.email || null,
        phone: profileData.phone || null,
        vat_payer: profileData.vat_payer,
      };

      const { error } = await supabase
        .from("driver_b2b_profiles")
        .upsert(profilePayload, { onConflict: "driver_user_id" });

      if (error) throw error;

      // Save consent if both checkboxes are checked
      if (consent.consent_self_billing && consent.consent_terms) {
        // First revoke any existing active consents
        await supabase
          .from('auto_invoicing_consents')
          .update({ status: 'revoked', revoked_at: new Date().toISOString() })
          .eq('user_id', userId)
          .eq('status', 'active');

        // Insert new consent
        const { error: consentError } = await supabase
          .from('auto_invoicing_consents')
          .insert({
            user_id: userId,
            driver_id: driverId,
            consent_self_billing: true,
            consent_terms: true,
            terms_version: TERMS_VERSION,
            accepted_at: new Date().toISOString(),
            status: 'active',
          });

        if (consentError) throw consentError;
        setConsent(prev => ({ ...prev, status: 'active', accepted_at: new Date().toISOString() }));
      }

      setHasProfile(true);
      setDirty(false);
      toast.success("Dane firmy zapisane");
    } catch (error: any) {
      console.error("Error saving B2B profile:", error);
      toast.error(error.message || "Błąd podczas zapisywania");
    } finally {
      setSaving(false);
    }
  };

  const isAutoInvoicingActive = consent.consent_self_billing && consent.consent_terms && consent.status === 'active';

  if (loading) {
    return (
      <Card className="shadow-sm">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="shadow-sm">
        <CardHeader className="py-2 px-3">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <Building2 className="h-3.5 w-3.5" />
            Dane firmy (B2B)
            {hasProfile ? (
              <Check className="h-3.5 w-3.5 text-green-600 ml-auto" />
            ) : (
              <AlertCircle className="h-3.5 w-3.5 text-amber-500 ml-auto" />
            )}
          </CardTitle>
          {isAutoInvoicingActive && (
            <Badge variant="outline" className="text-green-600 border-green-600 text-xs w-fit">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Autofakturowanie aktywne
            </Badge>
          )}
        </CardHeader>
        <CardContent className="px-3 pb-3 pt-0 space-y-4">
          {!hasProfile && (
            <div className="p-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md text-xs text-amber-800 dark:text-amber-200">
              ⚠️ Uzupełnij dane firmy, aby móc korzystać z autofakturowania
            </div>
          )}

          {/* Company Name */}
          <div className="space-y-1.5">
            <Label htmlFor="company_name" className="text-xs">
              Nazwa firmy *
            </Label>
            <Input
              id="company_name"
              value={profileData.company_name}
              onChange={(e) => handleChange("company_name", e.target.value)}
              placeholder="np. Jan Kowalski Transport"
              className="h-8 text-sm"
            />
          </div>

          {/* NIP & REGON */}
          <div className="space-y-1.5">
            <Label htmlFor="nip" className="text-xs flex items-center gap-2">
              NIP *
              {profileData.vat_verification_status === 'verified' && (
                <Badge variant="outline" className="text-green-600 border-green-600 text-xs py-0">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  VIES OK
                </Badge>
              )}
              {profileData.vat_verification_status === 'invalid' && (
                <Badge variant="outline" className="text-red-600 border-red-600 text-xs py-0">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Nieaktywny
                </Badge>
              )}
            </Label>
            <div className="flex gap-2">
              <Input
                id="nip"
                value={profileData.nip}
                onChange={(e) => handleChange("nip", e.target.value)}
                placeholder="1234567890"
                className="h-8 text-sm font-mono flex-1"
                maxLength={10}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={handleVerifyNip}
                disabled={verifyingNip || !profileData.nip}
              >
                {verifyingNip ? <Loader2 className="h-3 w-3 animate-spin" /> : "Sprawdź"}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="regon" className="text-xs">
              REGON
            </Label>
            <Input
              id="regon"
              value={profileData.regon}
              onChange={(e) => handleChange("regon", e.target.value)}
              placeholder="123456789"
              className="h-8 text-sm font-mono"
              maxLength={14}
            />
          </div>

          {/* Address */}
          <div className="space-y-1.5">
            <Label className="text-xs">Adres firmy</Label>
            <div className="grid grid-cols-1 gap-2">
              <Input
                value={profileData.address_street}
                onChange={(e) => handleChange("address_street", e.target.value)}
                placeholder="Ulica i numer"
                className="h-8 text-sm"
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={profileData.address_postal_code}
                  onChange={(e) => handleChange("address_postal_code", e.target.value)}
                  placeholder="00-000"
                  className="h-8 text-sm"
                  maxLength={6}
                />
                <Input
                  value={profileData.address_city}
                  onChange={(e) => handleChange("address_city", e.target.value)}
                  placeholder="Miasto"
                  className="h-8 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Bank details */}
          <div className="space-y-1.5">
            <Label className="text-xs">Dane bankowe</Label>
            <div className="grid grid-cols-1 gap-2">
              <Input
                value={profileData.bank_name}
                onChange={(e) => handleChange("bank_name", e.target.value)}
                placeholder="Nazwa banku"
                className="h-8 text-sm"
              />
              <Input
                value={profileData.bank_account}
                onChange={(e) => handleChange("bank_account", e.target.value)}
                placeholder="Numer konta (IBAN)"
                className="h-8 text-sm font-mono"
                maxLength={28}
              />
            </div>
          </div>

          {/* Contact */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="b2b_email" className="text-xs">
                Email firmowy
              </Label>
              <Input
                id="b2b_email"
                type="email"
                value={profileData.email}
                onChange={(e) => handleChange("email", e.target.value)}
                placeholder="firma@email.pl"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b2b_phone" className="text-xs">
                Telefon firmowy
              </Label>
              <Input
                id="b2b_phone"
                value={profileData.phone}
                onChange={(e) => handleChange("phone", e.target.value)}
                placeholder="+48 123 456 789"
                className="h-8 text-sm"
              />
            </div>
          </div>

          {/* VAT payer checkbox */}
          <div className="flex items-center gap-2 pt-1">
            <Checkbox
              id="vat_payer"
              checked={profileData.vat_payer}
              onCheckedChange={(checked) => handleChange("vat_payer", checked as boolean)}
            />
            <Label htmlFor="vat_payer" className="text-xs cursor-pointer">
              Jestem płatnikiem VAT
            </Label>
          </div>

          {/* Auto-invoicing section */}
          <div className="pt-3 border-t space-y-3">
            <div className="flex items-center gap-2">
              <FileText className="h-3.5 w-3.5 text-primary" />
              <Label className="text-xs font-semibold">Autofakturowanie (art. 106d VAT)</Label>
            </div>
            
            {isAutoInvoicingActive ? (
              <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-2">
                <p className="text-xs text-green-700 dark:text-green-300">
                  ✓ System automatycznie wystawia faktury na koniec każdego miesiąca.
                </p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                  Aktywowano: {consent.accepted_at ? new Date(consent.accepted_at).toLocaleDateString('pl-PL') : '-'}
                </p>
              </div>
            ) : (
              <div className="bg-muted/50 rounded-lg p-2 space-y-2">
                <label className="flex items-start gap-2">
                  <Checkbox
                    checked={consent.consent_self_billing}
                    onCheckedChange={(v) => handleConsentChange('consent_self_billing', Boolean(v))}
                    className="mt-0.5"
                  />
                  <span className="text-xs">
                    Wyrażam zgodę na autofakturowanie (art. 106d VAT)
                  </span>
                </label>
                
                <label className="flex items-start gap-2">
                  <Checkbox
                    checked={consent.consent_terms}
                    onCheckedChange={(v) => handleConsentChange('consent_terms', Boolean(v))}
                    className="mt-0.5"
                  />
                  <span className="text-xs">
                    Akceptuję{" "}
                    <button
                      type="button"
                      onClick={() => setShowTermsModal(true)}
                      className="text-primary hover:underline inline-flex items-center gap-0.5"
                    >
                      Regulamin
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  </span>
                </label>
              </div>
            )}
          </div>

          {/* Save button */}
          <Button
            onClick={handleSave}
            disabled={saving || (!dirty && hasProfile)}
            className="w-full h-8 text-sm"
            size="sm"
          >
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                Zapisywanie...
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5 mr-2" />
                {hasProfile ? "Zapisz zmiany" : "Zapisz dane firmy"}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Terms Modal */}
      <Dialog open={showTermsModal} onOpenChange={setShowTermsModal}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4 text-primary" />
              Regulamin Autofakturowania
            </DialogTitle>
            <DialogDescription className="text-xs">
              Podstawa prawna: art. 106d ustawy o VAT
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-xs">
            <ol className="list-decimal list-inside space-y-2">
              <li>Użytkownik upoważnia operatora (CAR4RIDE SP. Z O.O.) do wystawiania faktur w jego imieniu.</li>
              <li>Faktury są wystawiane elektronicznie i wysyłane na wskazany email.</li>
              <li>Użytkownik akceptuje faktury, o ile nie zgłosi sprzeciwu w terminie 7 dni.</li>
              <li>Faktury mają odrębną serię numeracji: AF/RRRR/MM/NNN.</li>
              <li>Zgodę można cofnąć w każdej chwili w ustawieniach konta.</li>
              <li>Każda faktura zawiera adnotację o trybie autofakturowania.</li>
            </ol>
            
            <div className="bg-muted/50 rounded p-2 mt-3">
              <p className="text-xs text-muted-foreground">
                <strong>Administrator:</strong> CAR4RIDE SP. Z O.O., ul. Borsucza 13, 02-213 Warszawa
              </p>
              <p className="text-xs text-muted-foreground">Wersja: {TERMS_VERSION}</p>
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <Button size="sm" onClick={() => setShowTermsModal(false)}>Zamknij</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

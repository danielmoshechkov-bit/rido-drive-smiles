import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { Building2, Loader2, Save, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";

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

export function DriverB2BProfile({ driverId }: DriverB2BProfileProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileData, setProfileData] = useState<B2BProfileData>(EMPTY_PROFILE);
  const [hasProfile, setHasProfile] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    loadProfile();
  }, [driverId]);

  const loadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

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
        });
        setHasProfile(true);
      }
    } catch (error) {
      console.error("Error loading B2B profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: keyof B2BProfileData, value: string | boolean) => {
    setProfileData((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  // Format NIP: remove non-digits and validate length
  const formatNip = (value: string) => {
    return value.replace(/\D/g, "").slice(0, 10);
  };

  // Format REGON: remove non-digits
  const formatRegon = (value: string) => {
    return value.replace(/\D/g, "").slice(0, 14);
  };

  // Format postal code to 99-999
  const formatPostalCode = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 5);
    if (digits.length > 2) {
      return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    }
    return digits;
  };

  // Format bank account (IBAN)
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

  const handleSave = async () => {
    // Validate NIP
    if (profileData.nip && !validateNip(profileData.nip)) {
      toast.error("Nieprawidłowy numer NIP");
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Nie jesteś zalogowany");

      const profilePayload = {
        driver_user_id: user.id,
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
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0 space-y-4">
        {!hasProfile && (
          <div className="p-2 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800">
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
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="nip" className="text-xs">
              NIP *
            </Label>
            <Input
              id="nip"
              value={profileData.nip}
              onChange={(e) => handleChange("nip", formatNip(e.target.value))}
              placeholder="1234567890"
              className="h-8 text-sm font-mono"
              maxLength={10}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="regon" className="text-xs">
              REGON
            </Label>
            <Input
              id="regon"
              value={profileData.regon}
              onChange={(e) => handleChange("regon", formatRegon(e.target.value))}
              placeholder="123456789"
              className="h-8 text-sm font-mono"
              maxLength={14}
            />
          </div>
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
                onChange={(e) => handleChange("address_postal_code", formatPostalCode(e.target.value))}
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
              onChange={(e) => handleChange("bank_account", formatBankAccount(e.target.value))}
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
  );
}

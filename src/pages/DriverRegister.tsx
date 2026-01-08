import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, Check, X, Banknote, CreditCard, Globe, Building2 } from "lucide-react";
import { useTranslation } from "react-i18next";

const languages = [
  { code: "pl", label: "Polski", flag: "🇵🇱" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "ru", label: "Русский", flag: "🇷🇺" },
  { code: "ua", label: "Українська", flag: "🇺🇦" },
  { code: "kz", label: "Қазақша", flag: "🇰🇿" },
];

export default function DriverRegister() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t, i18n } = useTranslation();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [cityId, setCityId] = useState<string>("");
  const [cities, setCities] = useState<{id: string; name: string}[]>([]);
  const [rodo, setRodo] = useState(false);
  const [terms, setTerms] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(i18n.language || "pl");
  
  // Fleet registration
  const fleetCode = searchParams.get('fleet');
  const [fleetInfo, setFleetInfo] = useState<{id: string; name: string} | null>(null);
  const [fleetLoading, setFleetLoading] = useState(false);
  
  // Payment method
  const [paymentMethod, setPaymentMethod] = useState<"transfer" | "cash">("transfer");
  const [iban, setIban] = useState("");

  // Password validation
  const passwordRequirements = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password)
  };

  const isPasswordValid = Object.values(passwordRequirements).every(Boolean);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  useEffect(() => {
    const loadCities = async () => {
      const { data } = await supabase.from("cities").select("id,name").order("name");
      setCities(data || []);
    };
    loadCities();
  }, []);

  // Load fleet info if code provided
  useEffect(() => {
    if (fleetCode) {
      setFleetLoading(true);
      supabase
        .from('fleets')
        .select('id, name')
        .eq('registration_code', fleetCode)
        .maybeSingle()
        .then(({ data, error }) => {
          if (!error && data) {
            setFleetInfo(data);
          }
          setFleetLoading(false);
        });
    }
  }, [fleetCode]);

  const handleLanguageChange = (langCode: string) => {
    setSelectedLanguage(langCode);
    i18n.changeLanguage(langCode);
  };

  const submit = async () => {
    if (!firstName || !lastName || !email || !phone || !cityId || !password) {
      return toast.error(t("register.fillAllFields"));
    }
    if (paymentMethod === "transfer" && !iban) {
      return toast.error(t("register.ibanRequired"));
    }
    if (!isPasswordValid) {
      return toast.error(t("register.passwordInvalid"));
    }
    if (!passwordsMatch) {
      return toast.error(t("register.passwordsMismatch"));
    }
    if (!rodo || !terms) {
      return toast.error(t("register.acceptRequired"));
    }

    setLoading(true);
    try {
      const response = await fetch(
        'https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/register-driver',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbHJyeXRtcnNjcXZzeXh5dm5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4NzcxNjAsImV4cCI6MjA3MTQ1MzE2MH0.AUBGgRgUfLkb2X5DXWat2uCa52ptLzQkEigUnNUXtqk`
          },
          body: JSON.stringify({
            first_name: firstName,
            last_name: lastName,
            email,
            phone,
            city_id: cityId,
            password,
            payment_method: paymentMethod,
            iban: paymentMethod === "transfer" ? iban : null,
            language: selectedLanguage,
            fleet_code: fleetCode || null
          })
        }
      );

      const result = await response.json();

      if (!response.ok || result.error) {
        let errorMessage = result.error || t("register.error");
        
        if (errorMessage.includes("already been registered") || errorMessage.includes("already exists")) {
          errorMessage = t("register.emailExists");
        }
        
        toast.error(errorMessage);
        return;
      }

      toast.success(t("register.success"));
      navigate("/register-success");

    } catch (error: any) {
      console.error("Registration error:", error);
      toast.error(t("register.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-accent/5 flex items-center justify-center p-4">
      <div className="container mx-auto max-w-2xl">
        <Card>
          <CardHeader className="text-center">
            {/* Language selector */}
            <div className="flex justify-end mb-4">
              <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-1">
                <Globe className="h-4 w-4 text-muted-foreground ml-2" />
                {languages.map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => handleLanguageChange(lang.code)}
                    className={`px-2 py-1 rounded text-sm transition-all ${
                      selectedLanguage === lang.code
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-muted"
                    }`}
                    title={lang.label}
                  >
                    {lang.flag}
                  </button>
                ))}
              </div>
            </div>
            
            <CardTitle className="text-3xl">{t("register.title")}</CardTitle>
            <p className="text-muted-foreground">{t("register.subtitle")}</p>
            
            {/* Fleet info banner */}
            {fleetCode && (
              <div className={`mt-4 p-3 rounded-lg border ${fleetInfo ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800' : 'bg-muted/50 border-border'}`}>
                {fleetLoading ? (
                  <p className="text-sm text-muted-foreground">Sprawdzanie kodu floty...</p>
                ) : fleetInfo ? (
                  <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-green-600" />
                    <div className="text-left">
                      <p className="text-sm font-medium text-green-800 dark:text-green-200">
                        Rejestrujesz się do floty:
                      </p>
                      <p className="text-lg font-bold text-green-900 dark:text-green-100">
                        {fleetInfo.name}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-amber-600">⚠️ Nieprawidłowy kod floty</p>
                )}
              </div>
            )}
            
            <p className="text-xs text-muted-foreground mt-2">{t("register.requiredFields")}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="firstName">{t("register.firstName")} *</Label>
                <Input
                  id="firstName"
                  placeholder={t("register.firstNamePlaceholder")}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="lastName">{t("register.lastName")} *</Label>
                <Input
                  id="lastName"
                  placeholder={t("register.lastNamePlaceholder")}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>
            
            <div className="space-y-1">
              <Label htmlFor="email">{t("register.email")} *</Label>
              <Input
                id="email"
                placeholder={t("register.emailPlaceholder")}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            
            <div className="space-y-1">
              <Label htmlFor="phone">{t("register.phone")} *</Label>
              <Input
                id="phone"
                placeholder={t("register.phonePlaceholder")}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            
            <div className="space-y-1">
              <Label htmlFor="city">{t("register.city")} *</Label>
              <select
                id="city"
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={cityId}
                onChange={(e) => setCityId(e.target.value)}
              >
                <option value="">{t("register.selectCity")}</option>
                {cities.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            
            {/* Sposób rozliczenia */}
            <div className="space-y-3 p-4 bg-muted/30 rounded-lg border">
              <Label className="text-base font-semibold">{t("register.paymentMethod")} *</Label>
              <RadioGroup
                value={paymentMethod}
                onValueChange={(v) => setPaymentMethod(v as "transfer" | "cash")}
                className="grid grid-cols-2 gap-4"
              >
                <div className={`flex items-center space-x-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                  paymentMethod === "transfer" 
                    ? "border-primary bg-primary/5" 
                    : "border-border hover:border-primary/50"
                }`}>
                  <RadioGroupItem value="transfer" id="transfer" />
                  <Label htmlFor="transfer" className="flex items-center gap-2 cursor-pointer">
                    <CreditCard className="h-4 w-4" />
                    {t("register.bankTransfer")}
                  </Label>
                </div>
                <div className={`flex items-center space-x-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                  paymentMethod === "cash" 
                    ? "border-primary bg-primary/5" 
                    : "border-border hover:border-primary/50"
                }`}>
                  <RadioGroupItem value="cash" id="cash" />
                  <Label htmlFor="cash" className="flex items-center gap-2 cursor-pointer">
                    <Banknote className="h-4 w-4" />
                    {t("register.cash")}
                  </Label>
                </div>
              </RadioGroup>
              
              {paymentMethod === "transfer" && (
                <div className="space-y-1 mt-3">
                  <Label htmlFor="iban">{t("register.iban")} *</Label>
                  <Input
                    id="iban"
                    placeholder="PL00 0000 0000 0000 0000 0000 0000"
                    value={iban}
                    onChange={(e) => setIban(e.target.value)}
                  />
                </div>
              )}
              
              {paymentMethod === "cash" && (
                <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                  <p className="text-sm text-amber-800 dark:text-amber-200 flex items-center gap-2">
                    <Banknote className="h-4 w-4 flex-shrink-0" />
                    {t("register.cashInfo")}
                  </p>
                </div>
              )}
            </div>
            
            <div className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="password">{t("register.password")} *</Label>
                <div className="relative">
                  <Input
                    id="password"
                    placeholder={t("register.passwordPlaceholder")}
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="confirmPassword">{t("register.confirmPassword")} *</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    placeholder={t("register.confirmPasswordPlaceholder")}
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {password && (
                <div className="bg-muted/50 p-3 rounded-md space-y-2">
                  <p className="text-sm font-medium">{t("register.passwordRequirements")}:</p>
                  <div className="grid grid-cols-1 gap-1 text-xs">
                    <div className={`flex items-center gap-2 ${passwordRequirements.minLength ? 'text-green-600' : 'text-red-500'}`}>
                      {passwordRequirements.minLength ? <Check size={12} /> : <X size={12} />}
                      {t("register.minLength")}
                    </div>
                    <div className={`flex items-center gap-2 ${passwordRequirements.hasUppercase ? 'text-green-600' : 'text-red-500'}`}>
                      {passwordRequirements.hasUppercase ? <Check size={12} /> : <X size={12} />}
                      {t("register.uppercase")}
                    </div>
                    <div className={`flex items-center gap-2 ${passwordRequirements.hasLowercase ? 'text-green-600' : 'text-red-500'}`}>
                      {passwordRequirements.hasLowercase ? <Check size={12} /> : <X size={12} />}
                      {t("register.lowercase")}
                    </div>
                    <div className={`flex items-center gap-2 ${passwordRequirements.hasNumber ? 'text-green-600' : 'text-red-500'}`}>
                      {passwordRequirements.hasNumber ? <Check size={12} /> : <X size={12} />}
                      {t("register.number")}
                    </div>
                    <div className={`flex items-center gap-2 ${passwordRequirements.hasSpecialChar ? 'text-green-600' : 'text-red-500'}`}>
                      {passwordRequirements.hasSpecialChar ? <Check size={12} /> : <X size={12} />}
                      {t("register.specialChar")}
                    </div>
                  </div>
                  {confirmPassword && (
                    <div className={`flex items-center gap-2 ${passwordsMatch ? 'text-green-600' : 'text-red-500'}`}>
                      {passwordsMatch ? <Check size={12} /> : <X size={12} />}
                      {t("register.passwordsMatch")}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-3 pt-4">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox 
                  checked={rodo} 
                  onCheckedChange={(v) => setRodo(Boolean(v))}
                />
                {t("register.rodo")} *
              </label>
              
              <label className="flex items-center gap-2 text-sm">
                <Checkbox 
                  checked={terms} 
                  onCheckedChange={(v) => setTerms(Boolean(v))}
                />
                {t("register.terms")} *
              </label>
            </div>

            <Button 
              onClick={submit} 
              className="w-full"
              disabled={loading || !isPasswordValid || !passwordsMatch}
            >
              {loading ? t("register.loading") : t("register.submit")}
            </Button>

            <div className="text-center text-sm text-muted-foreground">
              {t("register.hasAccount")} <a href="/auth" className="text-primary hover:underline">{t("register.login")}</a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

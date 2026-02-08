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
import { Eye, EyeOff, Check, X, Banknote, CreditCard, Globe, Building2, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PasswordStrengthIndicator } from "@/components/auth/PasswordStrengthIndicator";

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
  
  // Check if user is already logged in
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  
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
  
  // Fleet NIP - for connecting to existing fleet
  const fleetNipFromUrl = searchParams.get('nip');
  const [fleetNip, setFleetNip] = useState(fleetNipFromUrl || "");
  const [fleetInfo, setFleetInfo] = useState<{id: string; name: string} | null>(null);
  const [fleetLoading, setFleetLoading] = useState(false);
  
  // Payment method
  const [paymentMethod, setPaymentMethod] = useState<"transfer" | "cash">("transfer");
  const [iban, setIban] = useState("");

  // Password validation (only for new users)
  const passwordRequirements = {
    minLength: password.length >= 6,
    hasUppercase: /[A-Z]/.test(password),
    hasSpecialChar: /[!@#$%^&*(),.?":{}|<>]/.test(password)
  };

  const isPasswordValid = Object.values(passwordRequirements).every(Boolean);
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  // Check auth status on mount
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setIsLoggedIn(true);
        setCurrentUser(session.user);
        setEmail(session.user.email || "");
        
        // Check if user is already a driver
        const { data: existingDriver } = await supabase
          .from("driver_app_users")
          .select("driver_id")
          .eq("user_id", session.user.id)
          .maybeSingle();
        
        if (existingDriver?.driver_id) {
          toast.info("Masz już konto kierowcy");
          navigate("/driver");
          return;
        }
        
        // Pre-fill from marketplace profile if exists
        const { data: profile } = await supabase
          .from("marketplace_user_profiles")
          .select("first_name, last_name, phone")
          .eq("user_id", session.user.id)
          .maybeSingle();
        
        if (profile) {
          if (profile.first_name) setFirstName(profile.first_name);
          if (profile.last_name) setLastName(profile.last_name);
          if (profile.phone) setPhone(profile.phone);
        }
      }
      setCheckingAuth(false);
    };
    
    checkAuth();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setIsLoggedIn(true);
        setCurrentUser(session.user);
        setEmail(session.user.email || "");
      } else {
        setIsLoggedIn(false);
        setCurrentUser(null);
      }
    });
    
    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    const loadCities = async () => {
      const { data } = await supabase.from("cities").select("id,name").order("name");
      setCities(data || []);
    };
    loadCities();
  }, []);

  // Load fleet info when NIP changes
  useEffect(() => {
    const checkFleetNip = async () => {
      if (!fleetNip || fleetNip.length < 10) {
        setFleetInfo(null);
        return;
      }
      
      const cleanNip = fleetNip.replace(/[\s-]/g, "");
      if (cleanNip.length !== 10) {
        setFleetInfo(null);
        return;
      }
      
      setFleetLoading(true);
      const { data, error } = await supabase
        .from('fleets')
        .select('id, name')
        .eq('nip', cleanNip)
        .maybeSingle();
      
      if (!error && data) {
        setFleetInfo(data);
      } else {
        setFleetInfo(null);
      }
      setFleetLoading(false);
    };
    
    const timer = setTimeout(checkFleetNip, 500);
    return () => clearTimeout(timer);
  }, [fleetNip]);

  const handleLanguageChange = (langCode: string) => {
    setSelectedLanguage(langCode);
    i18n.changeLanguage(langCode);
  };

  const submit = async () => {
    if (!firstName || !lastName || !phone || !cityId) {
      return toast.error(t("register.fillAllFields"));
    }
    
    // For new users, require email and password
    if (!isLoggedIn) {
      if (!email) {
        return toast.error(t("register.fillAllFields"));
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
    }
    
    if (paymentMethod === "transfer" && !iban) {
      return toast.error(t("register.ibanRequired"));
    }

    setLoading(true);
    try {
      const cleanFleetNip = fleetNip ? fleetNip.replace(/[\s-]/g, "") : null;
      
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
            email: isLoggedIn ? currentUser.email : email,
            phone,
            city_id: cityId,
            password: isLoggedIn ? null : password, // No password needed for logged in users
            payment_method: paymentMethod,
            iban: paymentMethod === "transfer" ? iban : null,
            language: selectedLanguage,
            fleet_nip: cleanFleetNip && cleanFleetNip.length === 10 ? cleanFleetNip : null,
            existing_user_id: isLoggedIn ? currentUser.id : null // Pass existing user ID
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

      if (isLoggedIn) {
        toast.success("Konto kierowcy zostało utworzone!");
        navigate("/driver");
      } else {
        toast.success(t("register.success"));
        navigate("/register-success");
      }

    } catch (error: any) {
      console.error("Registration error:", error);
      toast.error(t("register.error"));
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-accent/5 flex items-center justify-center p-4">
      <div className="container mx-auto max-w-2xl">
        {/* Back button for logged-in users */}
        {isLoggedIn && (
          <Button 
            variant="ghost" 
            onClick={() => navigate('/klient')}
            className="mb-4"
          >
            ← Powrót
          </Button>
        )}
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
            <p className="text-muted-foreground">
              {isLoggedIn 
                ? "Uzupełnij dane, aby aktywować konto kierowcy" 
                : t("register.subtitle")
              }
            </p>
            
            
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
            
            {/* Email - only for new users */}
            {!isLoggedIn && (
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
            )}
            
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
            
            {/* Fleet NIP - optional connection to fleet */}
            <div className="space-y-2 p-4 bg-blue-50/50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <Label htmlFor="fleetNip" className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                NIP partnera flotowego (opcjonalnie)
              </Label>
              <Input
                id="fleetNip"
                placeholder="1234567890"
                value={fleetNip}
                onChange={(e) => setFleetNip(e.target.value)}
                maxLength={13}
              />
              <p className="text-xs text-muted-foreground">
                Jeśli masz NIP od partnera flotowego, wprowadź go tutaj aby dołączyć do jego floty
              </p>
              
              {fleetLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sprawdzanie NIP...
                </div>
              )}
              
              {!fleetLoading && fleetNip && fleetNip.replace(/[\s-]/g, "").length === 10 && (
                fleetInfo ? (
                  <div className="flex items-center gap-2 p-2 bg-green-100 dark:bg-green-900/30 rounded text-green-800 dark:text-green-200">
                    <Check className="h-4 w-4" />
                    <span className="text-sm">Dołączysz do floty: <strong>{fleetInfo.name}</strong></span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 p-2 bg-amber-100 dark:bg-amber-900/30 rounded text-amber-800 dark:text-amber-200">
                    <X className="h-4 w-4" />
                    <span className="text-sm">Nie znaleziono floty o podanym NIP</span>
                  </div>
                )
              )}
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
            
            {/* Password fields - only for new users */}
            {!isLoggedIn && (
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

                {/* Password strength indicator */}
                {password && (
                  <PasswordStrengthIndicator password={password} />
                )}
                
                {confirmPassword && password !== confirmPassword && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <X size={14} /> Hasła nie są takie same
                  </p>
                )}
              </div>
            )}

            {/* Terms and RODO - only for new users */}
            {!isLoggedIn && (
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
            )}

            <Button 
              onClick={submit} 
              className="w-full"
              disabled={loading || (!isLoggedIn && (!isPasswordValid || !passwordsMatch))}
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t("register.loading")}
                </>
              ) : isLoggedIn ? (
                "Aktywuj konto kierowcy"
              ) : (
                t("register.submit")
              )}
            </Button>

            {!isLoggedIn && (
              <div className="text-center text-sm text-muted-foreground">
                {t("register.hasAccount")} <a href="/auth" className="text-primary hover:underline">{t("register.login")}</a>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

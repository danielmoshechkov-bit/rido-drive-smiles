import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Check, X, Banknote, CreditCard } from "lucide-react";

export default function DriverRegister() {
  const navigate = useNavigate();
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

  const submit = async () => {
    if (!firstName || !lastName || !email || !phone || !cityId || !password) {
      return toast.error("Uzupełnij wszystkie pola oznaczone *");
    }
    if (paymentMethod === "transfer" && !iban) {
      return toast.error("Podaj numer konta bankowego (IBAN)");
    }
    if (!isPasswordValid) {
      return toast.error("Hasło nie spełnia wymagań");
    }
    if (!passwordsMatch) {
      return toast.error("Hasła nie są identyczne");
    }
    if (!rodo || !terms) {
      return toast.error("Zaznacz wymagane zgody");
    }

    setLoading(true);
    try {
      // Rejestracja użytkownika
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin + "/driver",
          data: {
            first_name: firstName,
            last_name: lastName,
            phone: phone
          }
        }
      });

      if (signUpError) {
        toast.error(signUpError.message);
        return;
      }

      // Szukaj kierowcy po EMAIL lub TELEFONIE
      let driverId: string | undefined;
      const { data: existingByEmail } = await supabase
        .from("drivers")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      const { data: existingByPhone } = await supabase
        .from("drivers")
        .select("id")
        .eq("phone", phone)
        .maybeSingle();

      const existing = existingByEmail || existingByPhone;

      if (existing?.id) {
        driverId = existing.id;
        // Zaktualizuj istniejący rekord z wszystkimi danymi
        await supabase
          .from("drivers")
          .update({
            first_name: firstName,
            last_name: lastName,
            phone: phone,
            email: email,
            city_id: cityId,
            payment_method: paymentMethod,
            iban: paymentMethod === "transfer" ? iban : null,
            registration_date: new Date().toISOString()
          })
          .eq("id", driverId);
      } else {
        // Utwórz nowy rekord
        const { data: newDriver, error: driverError } = await supabase
          .from("drivers")
          .insert([{
            first_name: firstName,
            last_name: lastName,
            email: email,
            phone: phone,
            city_id: cityId,
            payment_method: paymentMethod,
            iban: paymentMethod === "transfer" ? iban : null,
            user_role: 'kierowca',
            registration_date: new Date().toISOString()
          }])
          .select("id")
          .single();

        if (driverError) {
          toast.error(driverError.message);
          return;
        }
        driverId = newDriver.id;
      }

      // Powiąż z driver_app_users
      if (signUpData.user?.id && driverId) {
        const { error } = await supabase.from("driver_app_users").insert([{
          user_id: signUpData.user.id,
          driver_id: driverId,
          city_id: cityId,
          phone: phone,
          rodo_accepted_at: new Date().toISOString(),
          terms_accepted_at: new Date().toISOString()
        }]);

        if (error) {
          toast.error(error.message);
          return;
        }
      }

      // Send registration email
      try {
        await supabase.functions.invoke('send-registration-email', {
          body: {
            email,
            first_name: firstName,
            last_name: lastName,
            activation_link: `${window.location.origin}/email-confirmed`,
            is_test: false,
          },
        });
      } catch (emailError) {
        console.error("Error sending registration email:", emailError);
        // Don't block registration if email fails
      }

      // Navigate to success page
      navigate("/register-success");

    } catch (error) {
      toast.error("Wystąpił błąd podczas rejestracji");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-accent/5 flex items-center justify-center p-4">
      <div className="container mx-auto max-w-2xl">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-3xl">Rejestracja kierowcy</CardTitle>
            <p className="text-muted-foreground">Dołącz do naszej platformy</p>
            <p className="text-xs text-muted-foreground mt-2">Pola oznaczone * są wymagane</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="firstName">Imię *</Label>
                <Input
                  id="firstName"
                  placeholder="Wprowadź imię"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="lastName">Nazwisko *</Label>
                <Input
                  id="lastName"
                  placeholder="Wprowadź nazwisko"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </div>
            </div>
            
            <div className="space-y-1">
              <Label htmlFor="email">E-mail *</Label>
              <Input
                id="email"
                placeholder="twoj@email.pl"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            
            <div className="space-y-1">
              <Label htmlFor="phone">Telefon *</Label>
              <Input
                id="phone"
                placeholder="+48 123 456 789"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            
            <div className="space-y-1">
              <Label htmlFor="city">Miasto *</Label>
              <select
                id="city"
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={cityId}
                onChange={(e) => setCityId(e.target.value)}
              >
                <option value="">Wybierz miasto</option>
                {cities.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            
            {/* Sposób rozliczenia */}
            <div className="space-y-3 p-4 bg-muted/30 rounded-lg border">
              <Label className="text-base font-semibold">Sposób rozliczenia *</Label>
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
                    Przelew bankowy
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
                    Gotówka
                  </Label>
                </div>
              </RadioGroup>
              
              {paymentMethod === "transfer" && (
                <div className="space-y-1 mt-3">
                  <Label htmlFor="iban">Numer konta bankowego (IBAN) *</Label>
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
                    Gotówka do odbioru w każdy wtorek w naszym biurze
                  </p>
                </div>
              )}
            </div>
            
            <div className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="password">Hasło *</Label>
                <div className="relative">
                  <Input
                    id="password"
                    placeholder="Wprowadź hasło"
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
                <Label htmlFor="confirmPassword">Powtórz hasło *</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    placeholder="Powtórz hasło"
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
                  <p className="text-sm font-medium">Wymagania hasła:</p>
                  <div className="grid grid-cols-1 gap-1 text-xs">
                    <div className={`flex items-center gap-2 ${passwordRequirements.minLength ? 'text-green-600' : 'text-red-500'}`}>
                      {passwordRequirements.minLength ? <Check size={12} /> : <X size={12} />}
                      Minimum 8 znaków
                    </div>
                    <div className={`flex items-center gap-2 ${passwordRequirements.hasUppercase ? 'text-green-600' : 'text-red-500'}`}>
                      {passwordRequirements.hasUppercase ? <Check size={12} /> : <X size={12} />}
                      Duża litera
                    </div>
                    <div className={`flex items-center gap-2 ${passwordRequirements.hasLowercase ? 'text-green-600' : 'text-red-500'}`}>
                      {passwordRequirements.hasLowercase ? <Check size={12} /> : <X size={12} />}
                      Mała litera
                    </div>
                    <div className={`flex items-center gap-2 ${passwordRequirements.hasNumber ? 'text-green-600' : 'text-red-500'}`}>
                      {passwordRequirements.hasNumber ? <Check size={12} /> : <X size={12} />}
                      Cyfra
                    </div>
                    <div className={`flex items-center gap-2 ${passwordRequirements.hasSpecialChar ? 'text-green-600' : 'text-red-500'}`}>
                      {passwordRequirements.hasSpecialChar ? <Check size={12} /> : <X size={12} />}
                      Znak specjalny
                    </div>
                  </div>
                  {confirmPassword && (
                    <div className={`flex items-center gap-2 ${passwordsMatch ? 'text-green-600' : 'text-red-500'}`}>
                      {passwordsMatch ? <Check size={12} /> : <X size={12} />}
                      Hasła są identyczne
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
                Akceptuję zasady przetwarzania danych osobowych (RODO) *
              </label>
              
              <label className="flex items-center gap-2 text-sm">
                <Checkbox 
                  checked={terms} 
                  onCheckedChange={(v) => setTerms(Boolean(v))}
                />
                Akceptuję regulamin korzystania z platformy *
              </label>
            </div>

            <Button 
              onClick={submit} 
              className="w-full"
              disabled={loading || !isPasswordValid || !passwordsMatch}
            >
              {loading ? "Rejestrowanie..." : "Zarejestruj się"}
            </Button>

            <div className="text-center text-sm text-muted-foreground">
              Masz już konto? <a href="/auth" className="text-primary hover:underline">Zaloguj się</a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

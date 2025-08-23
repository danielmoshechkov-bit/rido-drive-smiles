import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Check, X } from "lucide-react";

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
      return toast.error("Uzupełnij wszystkie pola");
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

      // Utwórz lub zaktualizuj rekord w drivers
      let driverId: string | undefined;
      const { data: existing } = await supabase
        .from("drivers")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (existing?.id) {
        driverId = existing.id;
        // Zaktualizuj istniejący rekord
        await supabase
          .from("drivers")
          .update({
            first_name: firstName,
            last_name: lastName,
            phone: phone,
            city_id: cityId,
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

      toast.success("Rejestracja wysłana! Sprawdź e-mail i potwierdź konto.");
      setTimeout(() => navigate("/"), 2000);

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
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                placeholder="Imię"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
              <Input
                placeholder="Nazwisko"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
            
            <Input
              placeholder="E-mail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            
            <Input
              placeholder="Telefon"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            
            <select
              className="w-full border rounded-md px-3 py-2 text-sm bg-background"
              value={cityId}
              onChange={(e) => setCityId(e.target.value)}
            >
              <option value="">Wybierz miasto</option>
              {cities.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            
            <div className="space-y-4">
              <div className="relative">
                <Input
                  placeholder="Hasło *"
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

              <div className="relative">
                <Input
                  placeholder="Powtórz hasło *"
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
                Akceptuję zasady przetwarzania danych osobowych (RODO)
              </label>
              
              <label className="flex items-center gap-2 text-sm">
                <Checkbox 
                  checked={terms} 
                  onCheckedChange={(v) => setTerms(Boolean(v))}
                />
                Akceptuję regulamin korzystania z platformy
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
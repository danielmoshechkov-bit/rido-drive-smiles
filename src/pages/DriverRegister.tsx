import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

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
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadCities = async () => {
      const { data } = await supabase.from("cities").select("id,name").order("name");
      setCities(data || []);
    };
    loadCities();
  }, []);

  const submit = async () => {
    if (!firstName || !lastName || !email || !phone || !cityId) {
      return toast.error("Uzupełnij wszystkie pola");
    }
    if (!rodo || !terms) {
      return toast.error("Zaznacz wymagane zgody");
    }

    setLoading(true);
    try {
      // Rejestracja użytkownika
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password: password || Math.random().toString(36).slice(2, 12),
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
            city_id: cityId
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
            user_role: 'kierowca'
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
            
            <Input
              placeholder="Hasło (opcjonalne - wyślemy link aktywacyjny)"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />

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
              disabled={loading}
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
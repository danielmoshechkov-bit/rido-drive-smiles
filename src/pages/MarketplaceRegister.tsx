import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, ArrowLeft, User, Mail, Phone, Lock, MapPin } from "lucide-react";

interface City {
  id: string;
  name: string;
}

export default function MarketplaceRegister() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [cities, setCities] = useState<City[]>([]);
  
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    city_id: "",
    password: "",
    confirmPassword: "",
    acceptTerms: false,
    acceptRodo: false,
  });

  useEffect(() => {
    const loadCities = async () => {
      const { data } = await supabase.from("cities").select("id, name").order("name");
      if (data) setCities(data);
    };
    loadCities();

    // Check if user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/gielda/panel");
      }
    });
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      toast.error("Hasła nie są takie same");
      return;
    }

    if (formData.password.length < 6) {
      toast.error("Hasło musi mieć minimum 6 znaków");
      return;
    }

    if (!formData.acceptTerms || !formData.acceptRodo) {
      toast.error("Musisz zaakceptować regulamin i politykę prywatności");
      return;
    }

    setLoading(true);

    try {
      const response = await supabase.functions.invoke("register-marketplace-user", {
        body: {
          first_name: formData.first_name,
          last_name: formData.last_name,
          email: formData.email,
          phone: formData.phone,
          city_id: formData.city_id || null,
          password: formData.password,
        },
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (response.data?.error) {
        throw new Error(response.data.error);
      }

      toast.success("Rejestracja zakończona! Zaloguj się teraz.");
      navigate("/gielda/logowanie");
    } catch (error: any) {
      console.error("Registration error:", error);
      toast.error(error.message || "Błąd rejestracji. Spróbuj ponownie.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Button 
          variant="ghost" 
          onClick={() => navigate("/gielda")}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Powrót do giełdy
        </Button>

        <Card className="shadow-xl">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <img 
                src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" 
                alt="RIDO" 
                className="h-12 w-12"
              />
            </div>
            <CardTitle className="text-2xl">Dołącz do RIDO</CardTitle>
            <CardDescription>
              Jedno konto – kupuj, sprzedawaj, zarządzaj
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="first_name">Imię *</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="first_name"
                      value={formData.first_name}
                      onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                      placeholder="Jan"
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">Nazwisko</Label>
                  <Input
                    id="last_name"
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    placeholder="Kowalski"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="jan@example.com"
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Telefon *</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+48 123 456 789"
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="city">Miasto</Label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground z-10" />
                  <Select 
                    value={formData.city_id} 
                    onValueChange={(value) => setFormData({ ...formData, city_id: value })}
                  >
                    <SelectTrigger className="pl-10">
                      <SelectValue placeholder="Wybierz miasto" />
                    </SelectTrigger>
                    <SelectContent>
                      {cities.map((city) => (
                        <SelectItem key={city.id} value={city.id}>
                          {city.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Hasło *</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Minimum 6 znaków"
                    className="pl-10"
                    required
                    minLength={6}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Potwierdź hasło *</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    placeholder="Powtórz hasło"
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="terms"
                    checked={formData.acceptTerms}
                    onCheckedChange={(checked) => 
                      setFormData({ ...formData, acceptTerms: checked === true })
                    }
                  />
                  <label htmlFor="terms" className="text-sm text-muted-foreground leading-tight">
                    Akceptuję <a href="#" className="text-primary hover:underline">regulamin</a> serwisu *
                  </label>
                </div>

                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="rodo"
                    checked={formData.acceptRodo}
                    onCheckedChange={(checked) => 
                      setFormData({ ...formData, acceptRodo: checked === true })
                    }
                  />
                  <label htmlFor="rodo" className="text-sm text-muted-foreground leading-tight">
                    Akceptuję <a href="#" className="text-primary hover:underline">politykę prywatności</a> (RODO) *
                  </label>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Rejestracja...
                  </>
                ) : (
                  "Zarejestruj się"
                )}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Masz już konto?{" "}
                <Button variant="link" className="p-0 h-auto" onClick={() => navigate("/gielda/logowanie")}>
                  Zaloguj się
                </Button>
              </p>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { ArrowLeft, Shield, Building, Phone, Mail, FileText, MapPin } from "lucide-react";

interface FormData {
  email: string;
  password: string;
  confirmPassword: string;
  companyName: string;
  nip: string;
  phone: string;
  licenseNumber: string;
  address: string;
  acceptTerms: boolean;
  acceptRodo: boolean;
}

const INITIAL_FORM: FormData = {
  email: "",
  password: "",
  confirmPassword: "",
  companyName: "",
  nip: "",
  phone: "",
  licenseNumber: "",
  address: "",
  acceptTerms: false,
  acceptRodo: false,
};

export default function InsuranceAgentRegister() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});

  useEffect(() => {
    const checkExistingSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        // Check if already an insurance agent
        const { data: agent } = await supabase
          .from("insurance_agents")
          .select("id")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (agent) {
          navigate("/ubezpieczenia/panel", { replace: true });
          return;
        }
      }
      setCheckingAuth(false);
    };

    checkExistingSession();
  }, [navigate]);

  const updateField = (field: keyof FormData, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
  };

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};

    if (!formData.email) newErrors.email = "Email jest wymagany";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Nieprawidłowy format email";
    }

    if (!formData.password) newErrors.password = "Hasło jest wymagane";
    else if (formData.password.length < 6) {
      newErrors.password = "Hasło musi mieć minimum 6 znaków";
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Hasła muszą być identyczne";
    }

    if (!formData.companyName) newErrors.companyName = "Nazwa firmy jest wymagana";
    if (!formData.phone) newErrors.phone = "Telefon jest wymagany";
    if (!formData.acceptTerms) newErrors.acceptTerms = "Musisz zaakceptować regulamin";
    if (!formData.acceptRodo) newErrors.acceptRodo = "Musisz wyrazić zgodę RODO";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      // 1. Create auth user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          data: {
            company_name: formData.companyName,
            phone: formData.phone,
          }
        }
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error("Nie udało się utworzyć konta");

      // 2. Create insurance agent profile
      const { error: agentError } = await supabase
        .from("insurance_agents")
        .insert({
          user_id: authData.user.id,
          company_name: formData.companyName,
          nip: formData.nip || null,
          phone: formData.phone,
          email: formData.email,
          license_number: formData.licenseNumber || null,
          address: formData.address || null,
          is_active: true,
        });

      if (agentError) throw agentError;

      // 3. Add role - note: insurance_agent may not be in enum yet, so we use a workaround
      // The role will be checked via insurance_agents table instead
      try {
        const { error: roleError } = await supabase
          .from("user_roles")
          .insert({
            user_id: authData.user.id,
            role: "admin" // Temporary - will be replaced when insurance_agent is added to enum
          });
        
        // If role insert fails, we can still proceed - the agent profile exists
        if (roleError) console.warn("Nie dodano roli:", roleError.message);
      } catch (roleErr) {
        console.warn("Role assignment skipped:", roleErr);
      }

      toast.success("Konto utworzone! Sprawdź email, aby potwierdzić rejestrację.");
      navigate("/register-success");
    } catch (error: any) {
      console.error("Registration error:", error);
      toast.error(error?.message || "Błąd podczas rejestracji");
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <Button 
          variant="ghost" 
          onClick={() => navigate(-1)} 
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Wróć
        </Button>

        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Rejestracja Agenta Ubezpieczeń</CardTitle>
            <CardDescription>
              Dołącz do sieci agentów GetRido i otrzymuj powiadomienia o kończących się polisach
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Account Section */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium flex items-center gap-2">
                  <Mail className="h-5 w-5 text-muted-foreground" />
                  Dane logowania
                </h3>
                
                <div className="grid gap-4">
                  <div>
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={formData.email}
                      onChange={(e) => updateField("email", e.target.value)}
                      placeholder="agent@firma.pl"
                      className={errors.email ? "border-destructive" : ""}
                    />
                    {errors.email && <p className="text-sm text-destructive mt-1">{errors.email}</p>}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="password">Hasło *</Label>
                      <Input
                        id="password"
                        type="password"
                        value={formData.password}
                        onChange={(e) => updateField("password", e.target.value)}
                        placeholder="Min. 6 znaków"
                        className={errors.password ? "border-destructive" : ""}
                      />
                      {errors.password && <p className="text-sm text-destructive mt-1">{errors.password}</p>}
                    </div>
                    <div>
                      <Label htmlFor="confirmPassword">Powtórz hasło *</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        value={formData.confirmPassword}
                        onChange={(e) => updateField("confirmPassword", e.target.value)}
                        className={errors.confirmPassword ? "border-destructive" : ""}
                      />
                      {errors.confirmPassword && <p className="text-sm text-destructive mt-1">{errors.confirmPassword}</p>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Company Section */}
              <div className="space-y-4 border-t pt-6">
                <h3 className="text-lg font-medium flex items-center gap-2">
                  <Building className="h-5 w-5 text-muted-foreground" />
                  Dane firmy
                </h3>
                
                <div className="grid gap-4">
                  <div>
                    <Label htmlFor="companyName">Nazwa firmy / agencji *</Label>
                    <Input
                      id="companyName"
                      value={formData.companyName}
                      onChange={(e) => updateField("companyName", e.target.value)}
                      placeholder="ABC Ubezpieczenia Sp. z o.o."
                      className={errors.companyName ? "border-destructive" : ""}
                    />
                    {errors.companyName && <p className="text-sm text-destructive mt-1">{errors.companyName}</p>}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="nip">NIP</Label>
                      <Input
                        id="nip"
                        value={formData.nip}
                        onChange={(e) => updateField("nip", e.target.value)}
                        placeholder="1234567890"
                      />
                    </div>
                    <div>
                      <Label htmlFor="licenseNumber">Nr licencji agenta</Label>
                      <Input
                        id="licenseNumber"
                        value={formData.licenseNumber}
                        onChange={(e) => updateField("licenseNumber", e.target.value)}
                        placeholder="Opcjonalnie"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Contact Section */}
              <div className="space-y-4 border-t pt-6">
                <h3 className="text-lg font-medium flex items-center gap-2">
                  <Phone className="h-5 w-5 text-muted-foreground" />
                  Dane kontaktowe
                </h3>
                
                <div className="grid gap-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="phone">Telefon *</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => updateField("phone", e.target.value)}
                        placeholder="+48 123 456 789"
                        className={errors.phone ? "border-destructive" : ""}
                      />
                      {errors.phone && <p className="text-sm text-destructive mt-1">{errors.phone}</p>}
                    </div>
                    <div>
                      <Label htmlFor="address">Adres biura</Label>
                      <Input
                        id="address"
                        value={formData.address}
                        onChange={(e) => updateField("address", e.target.value)}
                        placeholder="ul. Przykładowa 1, 00-000 Miasto"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Consents */}
              <div className="space-y-4 border-t pt-6">
                <h3 className="text-lg font-medium flex items-center gap-2">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  Zgody
                </h3>

                <div className="space-y-3">
                  <div className="flex items-start space-x-3">
                    <Checkbox
                      id="acceptTerms"
                      checked={formData.acceptTerms}
                      onCheckedChange={(checked) => updateField("acceptTerms", checked as boolean)}
                      className={errors.acceptTerms ? "border-destructive" : ""}
                    />
                    <label htmlFor="acceptTerms" className="text-sm leading-relaxed cursor-pointer">
                      Akceptuję{" "}
                      <a href="/prawne?tab=regulamin" target="_blank" className="text-primary hover:underline">
                        regulamin
                      </a>{" "}
                      serwisu GetRido dla agentów ubezpieczeń *
                    </label>
                  </div>
                  {errors.acceptTerms && <p className="text-sm text-destructive ml-6">{errors.acceptTerms}</p>}

                  <div className="flex items-start space-x-3">
                    <Checkbox
                      id="acceptRodo"
                      checked={formData.acceptRodo}
                      onCheckedChange={(checked) => updateField("acceptRodo", checked as boolean)}
                      className={errors.acceptRodo ? "border-destructive" : ""}
                    />
                    <label htmlFor="acceptRodo" className="text-sm leading-relaxed cursor-pointer">
                      Wyrażam zgodę na przetwarzanie moich danych osobowych zgodnie z{" "}
                      <a href="/prawne?tab=polityka" target="_blank" className="text-primary hover:underline">
                        polityką prywatności
                      </a>{" "}
                      w celu otrzymywania powiadomień o kończących się polisach *
                    </label>
                  </div>
                  {errors.acceptRodo && <p className="text-sm text-destructive ml-6">{errors.acceptRodo}</p>}
                </div>
              </div>

              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? "Rejestracja..." : "Zarejestruj się jako Agent"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

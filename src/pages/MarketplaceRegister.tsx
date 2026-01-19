import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, ArrowLeft, User, Mail, Lock, ShieldCheck } from "lucide-react";

interface FieldErrors {
  email?: string;
  password?: string;
  confirmPassword?: string;
  first_name?: string;
  general?: string;
}

export default function MarketplaceRegister() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isHuman, setIsHuman] = useState(false);
  const [honeypot, setHoneypot] = useState(""); // Anti-bot honeypot
  
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    confirmPassword: "",
    acceptTerms: false,
    acceptRodo: false,
  });

  useEffect(() => {
    // Check if user is already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/gielda/panel");
      }
    });
  }, [navigate]);

  const validateForm = (): boolean => {
    const errors: FieldErrors = {};
    
    if (!formData.first_name.trim()) {
      errors.first_name = "Imię jest wymagane";
    }
    
    if (!formData.email.trim()) {
      errors.email = "Email jest wymagany";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = "Niepoprawny format email";
    }
    
    if (formData.password.length < 6) {
      errors.password = "Hasło musi mieć minimum 6 znaków";
    }
    
    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = "Hasła nie są takie same";
    }
    
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    
    // Anti-bot check
    if (honeypot) {
      console.log("Bot detected");
      return;
    }
    
    if (!isHuman) {
      toast.error("Potwierdź, że nie jesteś robotem");
      return;
    }
    
    if (!validateForm()) {
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
          password: formData.password,
        },
      });

      // Check for field-specific errors
      if (response.data?.error) {
        if (response.data.field) {
          setFieldErrors({ [response.data.field]: response.data.error });
        } else if (response.data.error.includes("email") || response.data.error.includes("zarejestrowany")) {
          setFieldErrors({ email: response.data.error });
        } else {
          setFieldErrors({ general: response.data.error });
        }
        return;
      }

      if (response.error) {
        throw new Error(response.error.message);
      }

      toast.success("Rejestracja zakończona!", {
        duration: 8000,
        description: response.data?.message || "Możesz się teraz zalogować"
      });
      navigate("/gielda/logowanie");
    } catch (error: any) {
      console.error("Registration error:", error);
      setFieldErrors({ general: error.message || "Błąd rejestracji. Spróbuj ponownie." });
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
            {fieldErrors.general && (
              <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-md">
                <p className="text-sm text-destructive">{fieldErrors.general}</p>
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Honeypot - hidden from users, bots fill it */}
              <input
                type="text"
                name="website"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                className="hidden"
                tabIndex={-1}
                autoComplete="off"
              />
              
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
                      className={`pl-10 ${fieldErrors.first_name ? 'border-destructive ring-1 ring-destructive' : ''}`}
                      required
                    />
                  </div>
                  {fieldErrors.first_name && (
                    <p className="text-sm text-destructive">{fieldErrors.first_name}</p>
                  )}
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
                    onChange={(e) => {
                      setFormData({ ...formData, email: e.target.value });
                      if (fieldErrors.email) setFieldErrors({ ...fieldErrors, email: undefined });
                    }}
                    placeholder="jan@example.com"
                    className={`pl-10 ${fieldErrors.email ? 'border-destructive ring-1 ring-destructive' : ''}`}
                    required
                  />
                </div>
                {fieldErrors.email && (
                  <p className="text-sm text-destructive">{fieldErrors.email}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Hasło *</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => {
                      setFormData({ ...formData, password: e.target.value });
                      if (fieldErrors.password) setFieldErrors({ ...fieldErrors, password: undefined });
                    }}
                    placeholder="Minimum 6 znaków"
                    className={`pl-10 ${fieldErrors.password ? 'border-destructive ring-1 ring-destructive' : ''}`}
                    required
                    minLength={6}
                  />
                </div>
                {fieldErrors.password && (
                  <p className="text-sm text-destructive">{fieldErrors.password}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Potwierdź hasło *</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) => {
                      setFormData({ ...formData, confirmPassword: e.target.value });
                      if (fieldErrors.confirmPassword) setFieldErrors({ ...fieldErrors, confirmPassword: undefined });
                    }}
                    placeholder="Powtórz hasło"
                    className={`pl-10 ${fieldErrors.confirmPassword ? 'border-destructive ring-1 ring-destructive' : ''}`}
                    required
                  />
                </div>
                {fieldErrors.confirmPassword && (
                  <p className="text-sm text-destructive">{fieldErrors.confirmPassword}</p>
                )}
              </div>

              <div className="space-y-3 pt-2">
                {/* Human verification checkbox */}
                <div className="flex items-center space-x-2 p-3 bg-muted rounded-lg border">
                  <Checkbox
                    id="human"
                    checked={isHuman}
                    onCheckedChange={(checked) => setIsHuman(checked === true)}
                  />
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-green-600" />
                    <label htmlFor="human" className="text-sm font-medium leading-tight">
                      Nie jestem robotem
                    </label>
                  </div>
                </div>
                
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="terms"
                    checked={formData.acceptTerms}
                    onCheckedChange={(checked) => 
                      setFormData({ ...formData, acceptTerms: checked === true })
                    }
                  />
                  <label htmlFor="terms" className="text-sm text-muted-foreground leading-tight">
                    Akceptuję <a href="/prawne?tab=regulamin" className="text-primary hover:underline">regulamin</a> serwisu *
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
                    Akceptuję <a href="/prawne?tab=prywatnosc" className="text-primary hover:underline">politykę prywatności</a> (RODO) *
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
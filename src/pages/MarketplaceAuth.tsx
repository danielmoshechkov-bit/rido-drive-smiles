import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Mail, Lock } from "lucide-react";

export default function MarketplaceAuth() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    // Check if already logged in
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        checkUserTypeAndRedirect(session.user.id);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) {
        checkUserTypeAndRedirect(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const checkUserTypeAndRedirect = async (userId: string) => {
    // Check if this is a marketplace user
    const { data: marketplaceProfile } = await supabase
      .from("marketplace_user_profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (marketplaceProfile) {
      navigate("/gielda/panel");
      return;
    }

    // Check if this is a driver
    const { data: driverUser } = await supabase
      .from("driver_app_users")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (driverUser) {
      navigate("/driver");
      return;
    }

    // Check user roles
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (roles?.some(r => r.role === "admin")) {
      navigate("/admin/dashboard");
      return;
    }

    if (roles?.some(r => r.role === "fleet_settlement" || r.role === "fleet_rental")) {
      navigate("/fleet/dashboard");
      return;
    }

    // Default to marketplace panel
    navigate("/gielda/panel");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (error.message.includes("Invalid login credentials")) {
          toast.error("Nieprawidłowy email lub hasło");
        } else {
          toast.error(error.message);
        }
        return;
      }

      if (data.user) {
        toast.success("Zalogowano pomyślnie!");
        // Redirect will happen via onAuthStateChange
      }
    } catch (error: any) {
      console.error("Login error:", error);
      toast.error("Błąd logowania. Spróbuj ponownie.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast.error("Wpisz adres email");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      toast.success("Link do resetowania hasła został wysłany na Twój email");
    } catch (error: any) {
      toast.error(error.message || "Błąd wysyłania linku");
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
            <CardTitle className="text-2xl">Zaloguj się</CardTitle>
            <CardDescription>
              Wejdź na swoje konto RIDO
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jan@example.com"
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Hasło</Label>
                  <Button 
                    type="button"
                    variant="link" 
                    className="p-0 h-auto text-xs"
                    onClick={handleForgotPassword}
                  >
                    Zapomniałeś hasła?
                  </Button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Twoje hasło"
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Logowanie...
                  </>
                ) : (
                  "Zaloguj się"
                )}
              </Button>

              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">lub</span>
                </div>
              </div>

              <p className="text-center text-sm text-muted-foreground">
                Nie masz jeszcze konta?{" "}
                <Button variant="link" className="p-0 h-auto" onClick={() => navigate("/gielda/rejestracja")}>
                  Zarejestruj się za darmo
                </Button>
              </p>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-4">
          Jesteś kierowcą RIDO?{" "}
          <Button variant="link" className="p-0 h-auto text-xs" onClick={() => navigate("/auth")}>
            Zaloguj się tutaj
          </Button>
        </p>
      </div>
    </div>
  );
}

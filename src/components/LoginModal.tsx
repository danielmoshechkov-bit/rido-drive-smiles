import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { signUpClient, resendActivationEmail, isEmailNotConfirmedError, getModuleRedirect } from "@/services/authService";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff } from "lucide-react";

interface LoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  redirectTo?: string;
  onSuccess?: () => void;
}

export function LoginModal({ open, onOpenChange, redirectTo = '/klient', onSuccess }: LoginModalProps) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [showResend, setShowResend] = useState(false);

  const handleResendActivation = async () => {
    if (!email) {
      toast.error("Podaj adres email");
      return;
    }
    setIsLoading(true);
    try {
      const result = await resendActivationEmail(email);
      if (result.success) {
        toast.success(result.message);
        setShowResend(false);
      } else {
        toast.error(result.error);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setConfirmPassword("");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error("Wypełnij wszystkie pola");
      return;
    }

    setIsLoading(true);
    try {
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        if (isEmailNotConfirmedError(error.message)) {
          setShowResend(true);
          toast.error("Konto nie zostało jeszcze aktywowane. Sprawdź email lub wyślij link ponownie.");
          return;
        }
        throw error;
      }

      toast.success("Zalogowano pomyślnie!");
      onOpenChange(false);
      resetForm();
      
      if (onSuccess) {
        onSuccess();
      } else {
        // Konto zarejestrowane na moduł (np. warsztat) → panel modułu zamiast domyślnego celu.
        // Force full page reload to ensure fresh session is used
        window.location.href = getModuleRedirect(authData.user) || redirectTo;
      }
    } catch (error: any) {
      console.error("Login error:", error);
      toast.error(error.message || "Błąd logowania");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !confirmPassword) {
      toast.error("Wypełnij wszystkie pola");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Hasła nie są takie same");
      return;
    }

    if (password.length < 6) {
      toast.error("Hasło musi mieć minimum 6 znaków");
      return;
    }

    setIsLoading(true);
    try {
      const result = await signUpClient(email, password);

      if (!result.success) {
        toast.error(result.error || "Błąd rejestracji");
        return;
      }

      // Konto powstało, ale mail nie wyszedł: zielony komunikat „gotowe" byłby
      // nieprawdą — klient czekałby na wiadomość, która nigdy nie przyjdzie.
      if (result.emailFailed) {
        toast.warning(result.message || "Konto utworzone, ale mail aktywacyjny nie wyszedł.");
      } else {
        toast.success(result.message || "Konto utworzone! Sprawdź email, aby potwierdzić rejestrację.");
      }
      setMode('login');
      setPassword("");
      setConfirmPassword("");
    } catch (error: any) {
      console.error("Register error:", error);
      toast.error(error.message || "Błąd rejestracji");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error("Podaj adres email");
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) throw error;

      toast.success("Link do resetowania hasła został wysłany na email");
      setMode('login');
    } catch (error: any) {
      console.error("Reset password error:", error);

      /**
       * KOMUNIKAT MA POWIEDZIEĆ, CO ZROBIĆ — nie „błąd wysyłania".
       *
       * Dwa realne powody, oba wyglądały dotąd tak samo:
       *
       *  1. LIMIT CZĘSTOTLIWOŚCI. Supabase przepuszcza jedno żądanie na minutę
       *     dla adresu i odpowiada 429 po angielsku. Człowiek, któremu mail nie
       *     przyszedł w pięć sekund, klika drugi raz — czyli dokładnie ten,
       *     kto najbardziej potrzebuje pomocy, dostaje komunikat o błędzie
       *     i przestaje próbować.
       *
       *  2. NIEUDANA WYSYŁKA. Przekaźnik odrzuca adres (nieistniejąca domena,
       *     pełna skrzynka). Wtedy ponawianie nic nie da i klient ma się
       *     dowiedzieć, że problem jest po stronie adresu, a nie kliknięcia.
       */
      const tresc = String(error?.message ?? "");
      const kod = String(error?.code ?? error?.error_code ?? "");
      const sekundy = tresc.match(/after (\d+) seconds?/i)?.[1];

      if (error?.status === 429 || kod.includes("rate_limit")) {
        toast.error(
          sekundy
            ? `Link można wysłać raz na minutę. Spróbuj ponownie za ${sekundy} s — poprzedni mógł już dojść, sprawdź też SPAM.`
            : "Link można wysłać raz na minutę. Odczekaj chwilę i spróbuj ponownie — sprawdź też folder SPAM.",
        );
      } else if (/send|smtp|mail/i.test(tresc)) {
        toast.error(
          "Nie udało się wysłać wiadomości na ten adres. Sprawdź, czy nie ma literówki — jeśli jest poprawny, napisz do nas, ustawimy hasło ręcznie.",
        );
      } else {
        toast.error(tresc || "Nie udało się wysłać linku. Napisz do nas, pomożemy.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader className="flex flex-col items-center gap-3">
          {/* Logo section */}
          <div className="flex items-center gap-3">
            <img 
              src="/getrido-mascot.png" 
              alt="GetRido" 
              className="h-12 w-12 rounded-xl"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            <div>
              <DialogTitle className="text-xl font-bold text-left">
                {mode === 'login' && 'Zaloguj się'}
                {mode === 'register' && 'Dołącz do GetRido'}
                {mode === 'reset' && 'Resetuj hasło'}
              </DialogTitle>
              <DialogDescription className="text-left">
                {mode === 'login' && 'Zaloguj się, aby kontynuować'}
                {mode === 'register' && 'Jedno konto – kupuj, sprzedawaj, zarządzaj'}
                {mode === 'reset' && 'Podaj email, aby otrzymać link do resetowania hasła'}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={mode === 'login' ? handleLogin : mode === 'register' ? handleRegister : handleResetPassword} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="twoj@email.com"
              disabled={isLoading}
            />
          </div>

          {mode !== 'reset' && (
            <div className="space-y-2">
              <Label htmlFor="password">Hasło</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}

          {mode === 'register' && (
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Potwierdź hasło</Label>
              <Input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isLoading}
              />
            </div>
          )}

          {mode === 'login' && (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="rememberMe"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                />
                <label htmlFor="rememberMe" className="text-sm text-muted-foreground cursor-pointer">
                  Zapamiętaj mnie
                </label>
              </div>
              <button
                type="button"
                className="text-sm text-primary hover:underline"
                onClick={() => setMode('reset')}
              >
                Zapomniałeś hasła?
              </button>
            </div>
          )}

          {mode === 'login' && showResend && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={isLoading}
              onClick={handleResendActivation}
            >
              Wyślij link aktywacyjny ponownie
            </Button>
          )}

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Ładowanie...
              </>
            ) : (
              <>
                {mode === 'login' && 'Zaloguj się'}
                {mode === 'register' && 'Utwórz konto'}
                {mode === 'reset' && 'Wyślij link'}
              </>
            )}
          </Button>

          <div className="text-center text-sm">
            {mode === 'login' && (
              <p className="text-muted-foreground">
                Nie masz konta?{' '}
                <button
                  type="button"
                  className="text-primary hover:underline font-medium"
                  onClick={() => setMode('register')}
                >
                  Zarejestruj się
                </button>
              </p>
            )}
            {mode === 'register' && (
              <p className="text-muted-foreground">
                Masz już konto?{' '}
                <button
                  type="button"
                  className="text-primary hover:underline font-medium"
                  onClick={() => setMode('login')}
                >
                  Zaloguj się
                </button>
              </p>
            )}
            {mode === 'reset' && (
              <button
                type="button"
                className="text-primary hover:underline font-medium"
                onClick={() => setMode('login')}
              >
                Powrót do logowania
              </button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

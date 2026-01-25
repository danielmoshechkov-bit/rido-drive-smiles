import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      toast.success("Zalogowano pomyślnie!");
      onOpenChange(false);
      resetForm();
      
      if (onSuccess) {
        onSuccess();
      } else {
        // Force full page reload to ensure fresh session is used
        window.location.href = redirectTo;
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
      const { error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;

      toast.success("Konto utworzone! Sprawdź email, aby potwierdzić rejestrację.");
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
      toast.error(error.message || "Błąd wysyłania linku");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-center">
            {mode === 'login' && 'Zaloguj się'}
            {mode === 'register' && 'Utwórz konto'}
            {mode === 'reset' && 'Resetuj hasło'}
          </DialogTitle>
          <DialogDescription className="text-center">
            {mode === 'login' && 'Zaloguj się, aby uzyskać dostęp do swojego konta'}
            {mode === 'register' && 'Stwórz konto, aby korzystać z pełnych możliwości'}
            {mode === 'reset' && 'Podaj email, aby otrzymać link do resetowania hasła'}
          </DialogDescription>
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

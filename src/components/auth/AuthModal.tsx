import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { signUpMarketplace, resendActivationEmail, getModuleRedirect } from "@/services/authService";
import { getStoredReferralCode, clearReferralCode } from "@/lib/referralTracking";
import { toast } from "sonner";
import { Loader2, User, Mail, Lock, ShieldCheck, ArrowLeft, CheckCircle, Phone } from "lucide-react";
import { PasswordStrengthIndicator, validatePassword } from "./PasswordStrengthIndicator";
interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: "login" | "register";
  onSuccess?: () => void;
  redirectAfterLogin?: string;
  /** Custom description to show in the header (e.g., "Zaloguj się, aby zobaczyć kontakt") */
  customDescription?: string;
  /** Rejestracja z landingu modułu (np. { module: 'warsztat', plan: 'pro' }) — trafia do edge fn. */
  signupContext?: { module: string; plan?: string };
}

export function AuthModal({
  open,
  onOpenChange,
  initialMode = "login",
  onSuccess,
  redirectAfterLogin,
  customDescription,
  signupContext
}: AuthModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<"login" | "register" | "success">(initialMode);
  const [loading, setLoading] = useState(false);
  
  // Login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  // Terms acceptance only for registration, not login
  
  // Register state
  const [registerData, setRegisterData] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    password: "",
    confirmPassword: "",
    acceptTerms: false,
    acceptRodo: false,
  });
  const [isHuman, setIsHuman] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  
  // Reset password state
  const [showResetForm, setShowResetForm] = useState(false);
  const [resetEmail, setResetEmail] = useState("");

  // Reset form when modal opens/closes
  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setShowResetForm(false);
      setFieldErrors({});
    }
  }, [open, initialMode]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // No terms validation required for login
    setLoading(true);
    
    try {
      // Force sign out first to prevent stale sessions
      await supabase.auth.signOut();
      
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });

      if (authError) {
        if (authError.message.includes("Invalid login credentials")) {
          toast.error(t("auth.invalidCredentials"));
        } else if (authError.message.includes("Email not confirmed")) {
          toast.error(t("auth.accountNotActivated"));
        } else {
          toast.error(authError.message);
        }
        return;
      }

      // Check if email is confirmed
      if (authData.user && !authData.user.email_confirmed_at) {
        await supabase.auth.signOut();
        toast.error(t("auth.accountNotActivated"));
        return;
      }
      
      if (rememberMe) {
        localStorage.setItem('rido_remember_me', 'true');
      } else {
        localStorage.removeItem('rido_remember_me');
        sessionStorage.setItem('rido_session_active', 'true');
      }

      if (!authData.user) {
        toast.error(t("auth.loginError"));
        return;
      }

      toast.success(t("auth.loginSuccess"));
      onOpenChange(false);

      const moduleRedirect = getModuleRedirect(authData.user);
      if (onSuccess) {
        onSuccess();
      } else if (moduleRedirect) {
        // Konto zarejestrowane na moduł (np. warsztat) → od razu do panelu modułu
        navigate(moduleRedirect);
      } else if (redirectAfterLogin) {
        navigate(redirectAfterLogin);
      } else {
        const redirectTarget = `${location.pathname}${location.search}${location.hash}`;
        navigate(redirectTarget, { replace: true });
      }
    } catch (error) {
      console.error('Login error:', error);
      toast.error(t("auth.loginError"));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    
    // Anti-bot check
    if (honeypot) {
      return;
    }
    
    if (!isHuman) {
      toast.error(t("register.confirmNotRobot"));
      return;
    }
    
    // Validation
    const errors: Record<string, string> = {};
    
    if (!registerData.first_name.trim()) {
      errors.first_name = t("register.firstNameRequired");
    }
    if (!registerData.email.trim()) {
      errors.email = t("register.emailRequired");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registerData.email)) {
      errors.email = t("register.emailInvalid");
    }
    
    // Password strength validation
    const passwordValidation = validatePassword(registerData.password);
    if (!passwordValidation.valid) {
      errors.password = passwordValidation.errors[0];
    }
    
    if (registerData.password !== registerData.confirmPassword) {
      errors.confirmPassword = t("auth.passwordsNotSame");
    }
    
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    if (!registerData.acceptTerms || !registerData.acceptRodo) {
      toast.error(t("register.mustAcceptTermsAndPrivacy"));
      return;
    }

    setLoading(true);

    try {
      const result = await signUpMarketplace({
        first_name: registerData.first_name,
        last_name: registerData.last_name,
        phone: registerData.phone,
        email: registerData.email,
        password: registerData.password,
        referral_code: getStoredReferralCode() || undefined,
        module: signupContext?.module,
        plan: signupContext?.plan,
      });

      if (!result.success) {
        const errorMessage = result.error || t("auth.registerError");
        const errorField = result.field || "general";
        if (errorField === "email" || errorMessage.toLowerCase().includes("email") || errorMessage.includes("zarejestrowany")) {
          setFieldErrors({ email: errorMessage });
        } else if (errorField === "password" || errorMessage.includes("hasło") || errorMessage.includes("password")) {
          setFieldErrors({ password: errorMessage });
        } else {
          setFieldErrors({ general: errorMessage });
        }
        return;
      }

      // Konto powstało, ale mail aktywacyjny NIE wyszedł — nie udawaj sukcesu
      if (result.emailFailed) {
        toast.error("Konto utworzone, ale nie udało się wysłać maila aktywacyjnego.", {
          duration: 15000,
          description: "Kliknij, aby wysłać link ponownie.",
          action: {
            label: "Wyślij ponownie",
            onClick: async () => {
              const resend = await resendActivationEmail(registerData.email);
              if (resend.success) {
                toast.success(resend.message);
              } else {
                toast.error(resend.error);
              }
            },
          },
        });
      }

      // Close modal and redirect to success page with download instructions
      clearReferralCode();
      onOpenChange(false);
      navigate("/register-success");
    } catch (error: any) {
      console.error("Registration error:", error);
      setFieldErrors({ general: t("auth.connectionError") });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!resetEmail) {
      toast.error(t("auth.enterEmailAddress"));
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.functions.invoke('send-password-reset-email', {
        body: { email: resetEmail, language: 'pl' }
      });
      if (error) {
        toast.error(t("auth.resetLinkError"));
      } else {
        toast.success(t("auth.resetLinkSent"));
        setShowResetForm(false);
        setResetEmail('');
      }
    } catch (err) {
      console.error('Password reset error:', err);
      toast.error(t("auth.resetLinkError"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header with logo */}
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-6 pb-4 shrink-0">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <img 
                src="/lovable-uploads/253e522c-702e-4ce9-9429-10ddbde63878.png" 
                alt="RIDO" 
                className="h-10 w-10"
              />
              <div>
                <DialogTitle className="text-xl font-bold">
                  {mode === "success"
                    ? t("auth.checkInboxTitle")
                    : showResetForm
                      ? t("auth.resetPasswordTitle")
                      : mode === "login"
                        ? t("auth.login")
                        : t("auth.joinGetRido")
                  }
                </DialogTitle>
                <DialogDescription className="text-sm">
                  {mode === "success"
                    ? t("auth.activationEmailSent")
                    : showResetForm
                      ? t("auth.resetDescShort")
                      : customDescription
                        ? customDescription
                        : mode === "login"
                          ? t("auth.loginToContinue")
                          : t("auth.joinGetRidoSubtitle")
                  }
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>
        
        <div className="p-6 pt-4 overflow-y-auto flex-1">
          {/* Registration Success Screen */}
          {mode === "success" ? (
            <div className="space-y-6 text-center py-4">
              <div className="flex justify-center">
                <div className="p-4 bg-green-100 rounded-full">
                  <CheckCircle className="h-12 w-12 text-green-600" />
                </div>
              </div>
              
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">{t("auth.thankYouRegister")}</h3>
                <p className="text-muted-foreground">
                  {t("auth.activationSentToPrefix")} <strong>{registerData.email}</strong> {t("auth.activationSentToSuffix")}
                </p>
              </div>
              
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-center gap-2 text-primary">
                  <Mail className="h-5 w-5" />
                  <span className="font-medium">{t("auth.checkYourInbox")}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("auth.clickLinkToActivate")}
                </p>
              </div>

              <div className="text-sm text-muted-foreground">
                {t("auth.notSeeingEmail")}
              </div>
              
              <Button 
                variant="outline" 
                className="w-full"
                onClick={() => {
                  setMode("login");
                  setLoginEmail(registerData.email);
                }}
              >
                {t("auth.goToLogin")}
              </Button>
            </div>
          ) : showResetForm ? (
            /* Password Reset Form */
            <div className="space-y-4">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowResetForm(false)}
                className="mb-2 -ml-2"
              >
                <ArrowLeft className="h-4 w-4 mr-1" />
                {t("common.back")}
              </Button>

              <div className="space-y-2">
                <Label htmlFor="reset-email">{t("auth.emailLabel")}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="reset-email"
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    placeholder={t("auth.emailPlaceholder")}
                    className="pl-10"
                  />
                </div>
              </div>
              
              <Button 
                onClick={handlePasswordReset}
                className="w-full"
                disabled={loading || !resetEmail}
              >
                {loading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("auth.sending")}</>
                ) : (
                  t("auth.sendResetLink")
                )}
              </Button>
            </div>
          ) : mode === "login" ? (
            /* Login Form */
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">{t("auth.emailLabel")}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="login-email"
                    type="email"
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder={t("auth.emailPlaceholder")}
                    className="pl-10"
                    required
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="login-password">{t("auth.password")}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="login-password"
                    type="password"
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    className="pl-10"
                    required
                  />
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="remember-me"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                />
                <label htmlFor="remember-me" className="text-sm">
                  {t("auth.rememberMe")}
                </label>
              </div>
              
              {/* Terms checkbox removed from login - only required during registration */}
              
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("auth.loggingIn")}</>
                ) : (
                  t("auth.login")
                )}
              </Button>

              <div className="text-center space-y-2">
                <button
                  type="button"
                  onClick={() => setShowResetForm(true)}
                  className="text-primary hover:underline text-sm"
                >
                  {t("auth.forgotPassword")}
                </button>
                <p className="text-sm text-muted-foreground">
                  {t("auth.noAccountQuestion")}{" "}
                  <button
                    type="button"
                    onClick={() => setMode("register")}
                    className="text-primary hover:underline font-medium"
                  >
                    {t("auth.register")}
                  </button>
                </p>
              </div>
            </form>
          ) : (
            /* Register Form */
            <form onSubmit={handleRegister} className="space-y-4">
              {/* Honeypot */}
              <input
                type="text"
                name="website"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
                className="hidden"
                tabIndex={-1}
                autoComplete="off"
              />
              
              {fieldErrors.general && (
                <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md">
                  <p className="text-sm text-destructive">{fieldErrors.general}</p>
                </div>
              )}
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="reg-first-name">{t("register.firstName")} *</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="reg-first-name"
                      value={registerData.first_name}
                      onChange={(e) => setRegisterData({ ...registerData, first_name: e.target.value })}
                      placeholder={t("register.firstNameExample")}
                      className={`pl-10 ${fieldErrors.first_name ? 'border-destructive' : ''}`}
                      required
                    />
                  </div>
                  {fieldErrors.first_name && (
                    <p className="text-xs text-destructive">{fieldErrors.first_name}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-last-name">{t("register.lastName")}</Label>
                  <Input
                    id="reg-last-name"
                    value={registerData.last_name}
                    onChange={(e) => setRegisterData({ ...registerData, last_name: e.target.value })}
                    placeholder={t("register.lastNameExample")}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="reg-email">{t("auth.emailLabel")} *</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="reg-email"
                    type="email"
                    value={registerData.email}
                    onChange={(e) => {
                      setRegisterData({ ...registerData, email: e.target.value });
                      if (fieldErrors.email) setFieldErrors({ ...fieldErrors, email: "" });
                    }}
                    placeholder={t("register.emailExample")}
                    className={`pl-10 ${fieldErrors.email ? 'border-destructive' : ''}`}
                    required
                  />
                </div>
                {fieldErrors.email && (
                  <p className="text-xs text-destructive">{fieldErrors.email}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="reg-phone">{t("auth.phoneLabel")} *</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="reg-phone"
                    type="tel"
                    value={registerData.phone}
                    onChange={(e) => setRegisterData({ ...registerData, phone: e.target.value })}
                    placeholder={t("register.phonePlaceholder")}
                    className={`pl-10 ${fieldErrors.phone ? 'border-destructive' : ''}`}
                    required
                  />
                </div>
                {fieldErrors.phone && (
                  <p className="text-xs text-destructive">{fieldErrors.phone}</p>
                )}
              </div>
              
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="reg-password">{t("auth.password")} *</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="reg-password"
                      type="password"
                      value={registerData.password}
                      onChange={(e) => setRegisterData({ ...registerData, password: e.target.value })}
                      placeholder={t("auth.createStrongPassword")}
                      className={`pl-10 ${fieldErrors.password ? 'border-destructive' : ''}`}
                      required
                    />
                  </div>
                  <PasswordStrengthIndicator password={registerData.password} />
                  {fieldErrors.password && (
                    <p className="text-xs text-destructive">{fieldErrors.password}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-confirm">{t("auth.confirmPassword")} *</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="reg-confirm"
                      type="password"
                      value={registerData.confirmPassword}
                      onChange={(e) => setRegisterData({ ...registerData, confirmPassword: e.target.value })}
                      placeholder={t("register.confirmPasswordPlaceholder")}
                      className={`pl-10 ${fieldErrors.confirmPassword ? 'border-destructive' : ''}`}
                      required
                    />
                  </div>
                  {fieldErrors.confirmPassword && (
                    <p className="text-xs text-destructive">{fieldErrors.confirmPassword}</p>
                  )}
                </div>
              </div>
              
              <div className="space-y-3 pt-2">
                <div className="flex items-center space-x-2 p-3 bg-muted rounded-lg border">
                  <Checkbox
                    id="reg-human"
                    checked={isHuman}
                    onCheckedChange={(checked) => setIsHuman(checked === true)}
                  />
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-green-600" />
                    <label htmlFor="reg-human" className="text-sm font-medium">
                      {t("register.notRobot")}
                    </label>
                  </div>
                </div>
                
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="reg-terms"
                    checked={registerData.acceptTerms}
                    onCheckedChange={(checked) => 
                      setRegisterData({ ...registerData, acceptTerms: checked === true })
                    }
                  />
                  <label htmlFor="reg-terms" className="text-xs text-muted-foreground leading-tight">
                    {t("register.acceptPrefix")} <a href="/prawne?tab=regulamin" className="text-primary hover:underline" target="_blank">{t("register.termsLink")}</a> *
                  </label>
                </div>

                <div className="flex items-start space-x-2">
                  <Checkbox
                    id="reg-rodo"
                    checked={registerData.acceptRodo}
                    onCheckedChange={(checked) => 
                      setRegisterData({ ...registerData, acceptRodo: checked === true })
                    }
                  />
                  <label htmlFor="reg-rodo" className="text-xs text-muted-foreground leading-tight">
                    {t("register.acceptPrefix")} <a href="/prawne?tab=prywatnosc" className="text-primary hover:underline" target="_blank">{t("register.privacyLink")}</a> *
                  </label>
                </div>
              </div>
              
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("register.registering")}</>
                ) : (
                  t("register.submit")
                )}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                {t("register.hasAccount")}{" "}
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="text-primary hover:underline font-medium"
                >
                  {t("auth.login")}
                </button>
              </p>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

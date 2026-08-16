import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { KontoJuzIstnieje } from '@/components/auth/KontoJuzIstnieje';
import { supabase } from "@/integrations/supabase/client";
import { signUpMarketplace, resendActivationEmail } from "@/services/authService";
import { getStoredReferralCode, clearReferralCode } from "@/lib/referralTracking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2, ArrowLeft, User, Mail, Lock, ShieldCheck } from "lucide-react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useTranslation } from "react-i18next";

interface FieldErrors {
  email?: string;
  password?: string;
  confirmPassword?: string;
  first_name?: string;
  general?: string;
}

export default function MarketplaceRegister() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isHuman, setIsHuman] = useState(false);
  // Osobno od `fieldErrors`: konto istnieje to nie błąd walidacji pola, tylko
  // rozwidlenie ścieżki — użytkownik ma iść do logowania, nie poprawiać adres.
  const [kontoIstnieje, setKontoIstnieje] = useState<string | null>(null);
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
        navigate("/klient");
      }
    });
  }, [navigate]);

  const validateForm = (): boolean => {
    const errors: FieldErrors = {};
    
    if (!formData.first_name.trim()) {
      errors.first_name = t("register.firstNameRequired");
    }

    if (!formData.email.trim()) {
      errors.email = t("register.emailRequired");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = t("register.emailInvalid");
    }

    if (formData.password.length < 6) {
      errors.password = t("register.passwordMinLength");
    }

    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = t("register.passwordsMismatch");
    }
    
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setKontoIstnieje(null);
    
    // Anti-bot check
    if (honeypot) {
      console.log("Bot detected");
      return;
    }
    
    if (!isHuman) {
      toast.error(t("register.confirmNotRobot"));
      return;
    }

    if (!validateForm()) {
      return;
    }

    if (!formData.acceptTerms || !formData.acceptRodo) {
      toast.error(t("register.mustAcceptTermsAndPrivacy"));
      return;
    }

    setLoading(true);

    try {
      const result = await signUpMarketplace({
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        password: formData.password,
        referral_code: getStoredReferralCode() || undefined,
      });

      // Check for field-specific errors
      if (!result.success) {
        if (result.code === "EMAIL_EXISTS") {
          setKontoIstnieje(formData.email);
          return;
        }
        const errorMsg = result.error || t("register.errorRetry");
        if (result.field) {
          setFieldErrors({ [result.field]: errorMsg });
        } else if (errorMsg.includes("email") || errorMsg.includes("zarejestrowany")) {
          setFieldErrors({ email: errorMsg });
        } else {
          setFieldErrors({ general: errorMsg });
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
              const resend = await resendActivationEmail(formData.email);
              if (resend.success) {
                toast.success(resend.message);
              } else {
                toast.error(resend.error);
              }
            },
          },
        });
        clearReferralCode();
        navigate("/gielda/logowanie");
        return;
      }

      toast.success(t("register.successShort"), {
        duration: 8000,
        description: result.message || t("register.canLoginNow")
      });
      clearReferralCode();
      navigate("/gielda/logowanie");
    } catch (error: any) {
      console.error("Registration error:", error);
      setFieldErrors({ general: error.message || t("register.errorRetry") });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-background">
      {/* Header */}
      <div className="flex justify-between items-center p-4 border-b">
        <div className="flex items-center gap-4 cursor-pointer" onClick={() => navigate('/')}>
          <img 
            src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" 
            alt="Get RIDO Logo" 
            className="h-8 w-8"
          />
          <span className="text-xl font-bold text-primary">Get RIDO</span>
          <span className="text-muted-foreground">|</span>
          <span className="text-sm text-muted-foreground">{t("header.home")}</span>
        </div>
        <LanguageSwitcher variant="outline" />
      </div>
      
      <div className="flex items-center justify-center p-4 py-8">
        <div className="w-full max-w-md">
          <Button 
            variant="ghost" 
            onClick={() => navigate("/gielda")}
            className="mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t("register.backToMarketplace")}
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
            <CardTitle className="text-2xl">{t("register.joinRido")}</CardTitle>
            <CardDescription>
              {t("register.joinRidoSubtitle")}
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            {fieldErrors.general && (
              <div className="mb-4 p-3 bg-destructive/10 border border-destructive/30 rounded-md">
                <p className="text-sm text-destructive">{fieldErrors.general}</p>
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="space-y-4">
              {kontoIstnieje && (
                <KontoJuzIstnieje
                  email={kontoIstnieje}
                  onZaloguj={() => navigate('/auth', { state: { email: kontoIstnieje } })}
                  onResetHasla={() => navigate('/auth', { state: { email: kontoIstnieje, reset: true } })}
                />
              )}
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
                  <Label htmlFor="first_name">{t("register.firstName")} *</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="first_name"
                      value={formData.first_name}
                      onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                      placeholder={t("register.firstNameExample")}
                      className={`pl-10 ${fieldErrors.first_name ? 'border-destructive ring-1 ring-destructive' : ''}`}
                      required
                    />
                  </div>
                  {fieldErrors.first_name && (
                    <p className="text-sm text-destructive">{fieldErrors.first_name}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="last_name">{t("register.lastName")}</Label>
                  <Input
                    id="last_name"
                    value={formData.last_name}
                    onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                    placeholder={t("register.lastNameExample")}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{t("register.email")} *</Label>
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
                    placeholder={t("register.emailExample")}
                    className={`pl-10 ${fieldErrors.email ? 'border-destructive ring-1 ring-destructive' : ''}`}
                    required
                  />
                </div>
                {fieldErrors.email && (
                  <p className="text-sm text-destructive">{fieldErrors.email}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">{t("register.password")} *</Label>
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
                    placeholder={t("register.passwordMinPlaceholder")}
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
                <Label htmlFor="confirmPassword">{t("auth.confirmPassword")} *</Label>
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
                    placeholder={t("register.confirmPasswordPlaceholder")}
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
                      {t("register.notRobot")}
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
                    {t("register.acceptPrefix")} <a href="/prawne?tab=regulamin" className="text-primary hover:underline">{t("register.termsLink")}</a> {t("register.serviceSuffix")} *
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
                    {t("register.acceptPrefix")} <a href="/prawne?tab=prywatnosc" className="text-primary hover:underline">{t("register.privacyLink")}</a> (RODO) *
                  </label>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t("register.registering")}
                  </>
                ) : (
                  t("register.submit")
                )}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                {t("register.hasAccount")}{" "}
                <Button variant="link" className="p-0 h-auto" onClick={() => navigate("/gielda/logowanie")}>
                  {t("register.login")}
                </Button>
              </p>
            </form>
          </CardContent>
        </Card>
        </div>
      </div>
    </div>
  );
}
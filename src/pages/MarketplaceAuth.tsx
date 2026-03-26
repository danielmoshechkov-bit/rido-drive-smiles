import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import LanguageSelector from "@/components/LanguageSelector";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const MarketplaceAuth = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [showTermsError, setShowTermsError] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!acceptedTerms) {
      setShowTermsError(true);
      return;
    }
    setShowTermsError(false);
    setIsLoading(true);
    
    try {
      // If rememberMe is false, sign out first to clear any existing session
      if (!rememberMe) {
        await supabase.auth.signOut();
      }
      
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        console.error('Auth error:', authError);
        if (authError.message.includes("Invalid login credentials")) {
          toast.error("Nieprawidłowy email lub hasło");
        } else {
          toast.error(authError.message);
        }
        return;
      }
      
      // Store rememberMe preference in localStorage
      if (rememberMe) {
        localStorage.setItem('rido_remember_me', 'true');
      } else {
        localStorage.removeItem('rido_remember_me');
        // For non-remembered sessions, we'll check on page load
        sessionStorage.setItem('rido_session_active', 'true');
      }

      if (!authData.user) {
        toast.error('Błąd logowania!');
        return;
      }

      // Check user roles and redirect appropriately
      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('role, fleet_id')
        .eq('user_id', authData.user.id);

      if (rolesError) {
        console.error('Error fetching roles:', rolesError);
        toast.error('Błąd pobierania uprawnień!');
        return;
      }

      if (userRoles && userRoles.length > 0) {
        const roles = userRoles.map((r: any) => r.role);
        
        if (roles.includes('admin')) {
          navigate('/admin/dashboard');
          return;
        } else if (roles.includes('fleet_settlement') || roles.includes('fleet_rental')) {
          navigate('/fleet/dashboard');
          return;
        } else if (roles.includes('driver')) {
          navigate('/driver');
          return;
        } else if (roles.includes('marketplace_user')) {
          navigate('/klient');
          return;
        }
      }

      // Check if marketplace user without role
      const { data: marketplaceProfile } = await supabase
        .from("marketplace_user_profiles")
        .select("id")
        .eq("user_id", authData.user.id)
        .maybeSingle();

      if (marketplaceProfile) {
        navigate("/gielda/panel");
        return;
      }

      // Check if driver without role
      const { data: driverUser } = await supabase
        .from("driver_app_users")
        .select("id")
        .eq("user_id", authData.user.id)
        .maybeSingle();

      if (driverUser) {
        navigate("/driver");
        return;
      }

      // Default to marketplace panel for marketplace login page
      navigate("/gielda/panel");
    } catch (error) {
      console.error('Login error:', error);
      toast.error('Wystąpił błąd podczas logowania!');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!resetEmail) {
      toast.error(t('auth.enterYourEmail'));
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.functions.invoke('send-password-reset-email', {
        body: { 
          email: resetEmail,
          language: i18n.language
        }
      });
      if (error) {
        toast.error(t('auth.passwordResetError'));
      } else {
        toast.success(t('auth.passwordResetEmailSent'));
        setShowResetModal(false);
        setResetEmail('');
      }
    } catch (err) {
      console.error('Password reset error:', err);
      toast.error(t('auth.passwordResetError'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-purple-50 to-blue-50">
      {/* Background Animation with Mascots */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <img src="/lovable-uploads/253e522c-702e-4ce9-9429-10ddbde63878.png" alt="Get RIDO Mascot" className="absolute top-[10%] left-[15%] h-8 w-8 animate-float-slow opacity-5" />
        <img src="/lovable-uploads/253e522c-702e-4ce9-9429-10ddbde63878.png" alt="Get RIDO Mascot" className="absolute top-[25%] right-[20%] h-6 w-6 animate-float-medium opacity-6" />
        <img src="/lovable-uploads/253e522c-702e-4ce9-9429-10ddbde63878.png" alt="Get RIDO Mascot" className="absolute bottom-[20%] left-[10%] h-10 w-10 animate-float-fast opacity-7" />
        <img src="/lovable-uploads/253e522c-702e-4ce9-9429-10ddbde63878.png" alt="Get RIDO Mascot" className="absolute bottom-[30%] right-[15%] h-7 w-7 animate-float-slow opacity-5" />
      </div>

      {/* Header with UniversalHomeButton */}
      <div className="relative z-10 flex justify-between items-center p-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center space-x-2 cursor-pointer" onClick={() => navigate('/')}>
            <img 
              src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" 
              alt="Get RIDO Logo" 
              className="h-8 w-8"
            />
            <span className="text-xl font-bold text-primary">Get RIDO</span>
          </div>
          <span className="text-muted-foreground">|</span>
          <span className="text-sm text-muted-foreground">Strona główna</span>
        </div>
        <LanguageSelector />
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex items-center justify-center px-4 py-8" style={{ minHeight: 'calc(100vh - 200px)', marginTop: '-40px' }}>
        <Card className="w-full max-w-md bg-white/95 backdrop-blur shadow-xl">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">
              {t('auth.login')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="email">{t('auth.email')}</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="mt-1"
                />
              </div>
              
              <div>
                <Label htmlFor="password">{t('auth.password')}</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="mt-1"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="rememberMe"
                  checked={rememberMe}
                  onCheckedChange={(checked) => setRememberMe(checked as boolean)}
                />
                <label
                  htmlFor="rememberMe"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {t('auth.rememberMe')}
                </label>
              </div>

              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="terms"
                    checked={acceptedTerms}
                    onCheckedChange={(checked) => {
                      setAcceptedTerms(checked as boolean);
                      if (checked) setShowTermsError(false);
                    }}
                    className={showTermsError ? "border-red-500" : ""}
                  />
                  <label
                    htmlFor="terms"
                    className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${showTermsError ? "text-red-500" : ""}`}
                  >
                    {t('auth.accept')}{' '}
                    <a href="/regulamin" className="text-primary hover:underline" target="_blank">
                      {t('auth.termsAndPrivacy')}
                    </a>
                  </label>
                </div>
                {showTermsError && (
                  <p className="text-sm text-red-500 ml-6">
                    {t('auth.mustAcceptTerms')}
                  </p>
                )}
              </div>

              <Button 
                type="submit" 
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? 'Logowanie...' : t('auth.loginButton')}
              </Button>
            </form>

            <div className="text-center space-y-2">
              <button
                type="button"
                onClick={() => setShowResetModal(true)}
                className="text-primary hover:underline text-sm block w-full"
              >
                {t('auth.forgotPassword')}
              </button>
              <Link
                to="/gielda/rejestracja"
                className="text-primary hover:underline text-sm block"
              >
                {t('auth.noAccount')}
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Password Reset Modal */}
      <Dialog open={showResetModal} onOpenChange={setShowResetModal}>
        <DialogContent className="sm:max-w-[400px] p-6 bg-background">
          <DialogHeader className="space-y-3 text-center">
            <DialogTitle className="text-xl font-semibold text-foreground">
              {t('auth.resetPasswordTitle')}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {t('auth.resetPasswordDescription')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 pt-4">
            <div className="space-y-2">
              <Label htmlFor="reset-email" className="text-sm font-medium">
                {t('auth.email')}
              </Label>
              <Input
                id="reset-email"
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                placeholder={t('auth.enterYourEmail')}
                className="h-10"
              />
            </div>
            <Button 
              onClick={handlePasswordReset}
              className="w-full h-10"
              disabled={isLoading || !resetEmail}
            >
              {isLoading ? t('common.loading') : t('auth.sendResetLink')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MarketplaceAuth;

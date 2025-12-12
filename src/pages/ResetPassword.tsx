import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LanguageSelector from "@/components/LanguageSelector";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Eye, EyeOff, Lock, AlertCircle } from "lucide-react";

const ResetPassword = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSessionValid, setIsSessionValid] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const initializeSession = async () => {
      setIsCheckingSession(true);
      setErrorMessage(null);
      
      try {
        // Parse hash fragment for tokens (Supabase sends tokens in hash)
        const hashParams = new URLSearchParams(location.hash.substring(1));
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');
        const type = hashParams.get('type');
        
        console.log('Reset password - hash params:', { hasAccessToken: !!accessToken, type });
        
        // If we have tokens in the URL, set the session
        if (accessToken && type === 'recovery') {
          console.log('Found recovery tokens, setting session...');
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken || '',
          });
          
          if (error) {
            console.error('Error setting session:', error);
            setErrorMessage(t('auth.invalidResetLink'));
          } else if (data.session) {
            console.log('Session set successfully');
            setIsSessionValid(true);
          }
        } else {
          // Check if we already have an active session
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            console.log('Existing session found');
            setIsSessionValid(true);
          } else {
            // Set up listener for auth state changes
            const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
              console.log('Auth state changed:', event);
              if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
                setIsSessionValid(true);
                setIsCheckingSession(false);
              }
            });
            
            // Timeout after 5 seconds if no session established
            setTimeout(() => {
              if (!isSessionValid) {
                console.log('Session timeout - no valid session found');
                setErrorMessage(t('auth.invalidResetLink'));
                setIsCheckingSession(false);
              }
            }, 5000);
            
            return () => subscription.unsubscribe();
          }
        }
      } catch (error) {
        console.error('Error initializing session:', error);
        setErrorMessage(t('auth.invalidResetLink'));
      } finally {
        setIsCheckingSession(false);
      }
    };
    
    initializeSession();
  }, [location.hash, t]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password.length < 6) {
      toast.error(t('auth.passwordMinLength'));
      return;
    }
    
    if (password !== confirmPassword) {
      toast.error(t('auth.passwordsDoNotMatch'));
      return;
    }
    
    setIsLoading(true);
    
    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });
      
      if (error) {
        console.error('Password reset error:', error);
        toast.error(t('auth.passwordResetFailed'));
      } else {
        toast.success(t('auth.passwordResetSuccess'));
        // Sign out after password change and redirect to login
        await supabase.auth.signOut();
        navigate('/auth');
      }
    } catch (error) {
      console.error('Error resetting password:', error);
      toast.error(t('auth.passwordResetFailed'));
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

      {/* Header */}
      <div className="relative z-10 flex justify-between items-center p-6">
        <div className="flex items-center space-x-2">
          <img 
            src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" 
            alt="Get RIDO Logo" 
            className="h-8 w-8"
          />
          <span className="text-xl font-bold text-primary">Get RIDO</span>
        </div>
        <LanguageSelector />
      </div>

      {/* Main Content */}
      <div className="relative z-10 flex items-center justify-center px-4 py-8" style={{ minHeight: 'calc(100vh - 200px)', marginTop: '-40px' }}>
        <Card className="w-full max-w-md bg-white/95 backdrop-blur shadow-xl">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 rounded-full bg-primary/10">
                <Lock className="h-8 w-8 text-primary" />
              </div>
            </div>
            <CardTitle className="text-2xl font-bold">
              {t('auth.resetPassword')}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-2">
              {t('auth.enterNewPassword')}
            </p>
          </CardHeader>
          <CardContent>
            {isCheckingSession ? (
              <div className="text-center py-4">
                <p className="text-muted-foreground">{t('common.loading')}...</p>
              </div>
            ) : errorMessage ? (
              <div className="text-center py-4 space-y-4">
                <div className="flex justify-center">
                  <div className="p-3 rounded-full bg-destructive/10">
                    <AlertCircle className="h-8 w-8 text-destructive" />
                  </div>
                </div>
                <p className="text-destructive">{errorMessage}</p>
                <Button 
                  variant="outline" 
                  onClick={() => navigate('/auth')}
                  className="mt-4"
                >
                  {t('auth.backToLogin')}
                </Button>
              </div>
            ) : !isSessionValid ? (
              <div className="text-center py-4 space-y-4">
                <p className="text-muted-foreground">{t('auth.invalidResetLink')}</p>
                <Button 
                  variant="outline" 
                  onClick={() => navigate('/auth')}
                >
                  {t('auth.backToLogin')}
                </Button>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">{t('auth.newPassword')}</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={6}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('auth.passwordMinLength')}
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">{t('auth.confirmNewPassword')}</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={isLoading}
                >
                  {isLoading ? t('common.loading') + '...' : t('auth.changePassword')}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ResetPassword;

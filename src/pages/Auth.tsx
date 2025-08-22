import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import LanguageSelector from "@/components/LanguageSelector";

const Auth = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Simple test login
    if (isLogin && email === 'test' && password === 'test') {
      navigate('/admin/dashboard');
      return;
    }
    
    // For now, just show success message
    alert(isLogin ? 'Zalogowano pomyślnie!' : 'Zarejestrowano pomyślnie!');
  };

  return (
    <div 
      className="min-h-screen relative overflow-hidden bg-gradient-subtle"
      style={{
        backgroundImage: `url(/lovable-uploads/253e522c-702e-4ce9-9429-10ddbde63878.png)`,
        backgroundSize: '50px 50px',
        backgroundRepeat: 'repeat'
      }}
    >
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
      <div className="relative z-10 flex items-center justify-center min-h-[calc(100vh-100px)] px-4">
        <Card className="w-full max-w-md bg-white/95 backdrop-blur shadow-xl">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold">
              {isLogin ? t('auth.login') : t('auth.register')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="email">{t('auth.email')}</Label>
                <Input
                  id="email"
                  type="email"
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
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="mt-1"
                />
              </div>

              {!isLogin && (
                <div>
                  <Label htmlFor="confirmPassword">{t('auth.confirmPassword')}</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="mt-1"
                  />
                </div>
              )}

              {!isLogin && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="acceptTerms"
                    checked={acceptTerms}
                    onCheckedChange={(checked) => setAcceptTerms(checked === true)}
                  />
                  <Label htmlFor="acceptTerms" className="text-sm">
                    {t('auth.acceptTerms')}
                  </Label>
                </div>
              )}

              <Button 
                type="submit" 
                className="w-full"
                disabled={!isLogin && (!acceptTerms || password !== confirmPassword)}
              >
                {isLogin ? t('auth.loginButton') : t('auth.registerButton')}
              </Button>
            </form>

            <div className="text-center">
              <button
                onClick={() => setIsLogin(!isLogin)}
                className="text-primary hover:underline text-sm"
              >
                {isLogin 
                  ? `${t('auth.register')}?`
                  : `${t('auth.login')}?`
                }
              </button>
            </div>

            {isLogin && (
              <div className="text-center text-xs text-muted-foreground">
                Test login: email "test", password "test"
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Auth;
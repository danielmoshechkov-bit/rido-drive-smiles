import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LanguageSelector from "@/components/LanguageSelector";
import { supabase } from "@/integrations/supabase/client";

const Auth = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      // Logowanie przez Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        console.error('Auth error:', authError);
        alert('Nieprawidłowy email lub hasło!');
        return;
      }

      if (!authData.user) {
        alert('Błąd logowania!');
        return;
      }

      // Sprawdź rolę użytkownika w tabeli drivers
      const { data: driverData, error: driverError } = await supabase
        .from('drivers')
        .select('user_role, first_name, last_name')
        .eq('id', authData.user.id)
        .single();

      if (driverError) {
        console.error('Driver lookup error:', driverError);
        // Jeśli nie ma w drivers, może to być admin (test/test)
        if (email === 'test' || email === 'daniel.moshechkov@gmail.com') {
          navigate('/admin/dashboard');
          return;
        }
        alert('Nie znaleziono profilu użytkownika!');
        return;
      }

      // Przekieruj na podstawie roli
      if (driverData.user_role === 'admin' || driverData.user_role === 'pracownik') {
        navigate('/admin/dashboard');
      } else {
        // Kierowca lub partner - zapisz dane do localStorage
        localStorage.setItem('testUser', JSON.stringify({ 
          email: authData.user.email,
          type: 'driver',
          name: `${driverData.first_name} ${driverData.last_name}`
        }));
        navigate('/driver');
      }
    } catch (error) {
      console.error('Login error:', error);
      alert('Wystąpił błąd podczas logowania!');
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-purple-50 to-blue-50"
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
              {t('auth.login')}
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

              <Button 
                type="submit" 
                className="w-full"
              >
                {t('auth.loginButton')}
              </Button>
            </form>

            <div className="text-center">
              <Link
                to="/driver/register"
                className="text-primary hover:underline text-sm"
              >
                Nie masz konta? Zarejestruj się jako kierowca
              </Link>
            </div>

            <div className="text-center text-xs text-muted-foreground space-y-1">
              <div>Admin: email "test", password "test"</div>
              <div>Kierowca: email "test@test.pl", password "12345"</div>
              <div>Kierowca: email "anastasia.loktionova1991@gmail.com", password "Test12345!"</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Auth;
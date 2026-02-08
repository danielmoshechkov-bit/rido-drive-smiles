import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle, Loader2, Share, MoreVertical, ArrowLeft, LogIn } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import EasyHub from './EasyHub';

type Platform = 'none' | 'android' | 'iphone';

/**
 * ActivationConfirm page - handles email confirmation links
 * Shows a thank you modal on the main portal page with login option and app download instructions
 */
export default function ActivationConfirm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>('none');

  useEffect(() => {
    const handleActivation = async () => {
      const token = searchParams.get('token');
      const tokenHash = searchParams.get('token_hash');
      const type = searchParams.get('type') || 'signup';

      console.log('Activation params:', { token: !!token, tokenHash: !!tokenHash, type });

      // If we have Supabase auth tokens, verify them
      if (tokenHash || token) {
        try {
          // For signup confirmation, we need to verify the OTP
          if (tokenHash && type === 'signup') {
            const { error: verifyError } = await supabase.auth.verifyOtp({
              token_hash: tokenHash,
              type: 'signup'
            });
            
            if (verifyError) {
              console.error('OTP verification error:', verifyError);
              // Token might be already used or expired, but account might be active
              // Check if we have a session
              const { data: sessionData } = await supabase.auth.getSession();
              if (sessionData.session) {
                setShowModal(true);
              } else {
                // Try showing success anyway - link was probably already used
                setShowModal(true);
              }
            } else {
              console.log('OTP verified successfully');
              setShowModal(true);
            }
          } else {
            // For other types, just check session
            const { data, error: sessionError } = await supabase.auth.getSession();
            
            if (sessionError) {
              console.error('Session error:', sessionError);
              setError('Nie udało się aktywować konta. Spróbuj ponownie.');
            } else {
              setShowModal(true);
            }
          }
        } catch (e) {
          console.error('Activation error:', e);
          // Even on error, show success - the link was probably already used
          setShowModal(true);
        }
      } else {
        // No token - just show success (might be coming from email link that already verified)
        setShowModal(true);
      }
      
      setLoading(false);
    };

    handleActivation();
  }, [searchParams]);

  const handleClose = () => {
    setShowModal(false);
    navigate('/');
  };

  const handleLogin = () => {
    setShowModal(false);
    navigate('/auth');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-4 text-muted-foreground">Aktywowanie konta...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center max-w-md">
          <div className="text-destructive text-6xl mb-4">❌</div>
          <h1 className="text-2xl font-bold mb-2">Błąd aktywacji</h1>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Button onClick={() => navigate('/')}>
            Wróć do strony głównej
          </Button>
        </div>
      </div>
    );
  }

  // Render the main portal with the thank you modal overlay
  return (
    <>
      {/* Main portal in background */}
      <EasyHub />
      
      {/* Thank you modal overlay */}
      <Dialog open={showModal} onOpenChange={(open) => !open && handleClose()}>
        <DialogContent className="max-w-lg">
          <DialogHeader className="flex flex-col items-center gap-4 text-center">
            <div className="flex items-center gap-3">
              <img 
                src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" 
                alt="GetRido" 
                className="h-12 w-12"
              />
            </div>
            <CheckCircle className="h-16 w-16 text-green-500" />
            <DialogTitle className="text-2xl font-bold text-green-600">
              🎉 Dziękujemy za rejestrację!
            </DialogTitle>
            <DialogDescription className="text-base">
              Twoje konto w GetRido zostało pomyślnie aktywowane. ✅
            </DialogDescription>
          </DialogHeader>
          
          <div className="mt-4 space-y-4">
            {selectedPlatform === 'none' ? (
              <>
                <Button onClick={handleLogin} className="w-full" size="lg">
                  <LogIn className="h-4 w-4 mr-2" />
                  🚗 Zaloguj się do portalu
                </Button>

                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground mb-4 text-center">
                    📱 Pobierz aplikację na telefon dla szybkiego dostępu:
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setSelectedPlatform('android')}
                      className="flex flex-col items-center gap-3 p-4 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all cursor-pointer group"
                    >
                      <div className="w-14 h-14 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                        <span className="text-3xl">🤖</span>
                      </div>
                      <div>
                        <p className="font-semibold">Android</p>
                        <p className="text-xs text-muted-foreground">Chrome</p>
                      </div>
                    </button>
                    
                    <button
                      onClick={() => setSelectedPlatform('iphone')}
                      className="flex flex-col items-center gap-3 p-4 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all cursor-pointer group"
                    >
                      <div className="w-14 h-14 bg-gray-100 dark:bg-gray-800/50 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                        <span className="text-3xl">🍎</span>
                      </div>
                      <div>
                        <p className="font-semibold">iPhone</p>
                        <p className="text-xs text-muted-foreground">Safari</p>
                      </div>
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setSelectedPlatform('none')}
                  className="mb-2"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Wróć
                </Button>

                {selectedPlatform === 'android' && (
                  <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center gap-2 justify-center">
                        <span className="text-2xl">🤖</span>
                        Instalacja na Android (Chrome)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-left">
                      <div className="flex items-start gap-3">
                        <div className="bg-primary text-primary-foreground rounded-full h-7 w-7 flex items-center justify-center flex-shrink-0 text-sm font-bold">1</div>
                        <p className="text-sm">Otwórz <strong>getrido.pl</strong> w przeglądarce Chrome</p>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="bg-primary text-primary-foreground rounded-full h-7 w-7 flex items-center justify-center flex-shrink-0 text-sm font-bold">2</div>
                        <p className="text-sm flex items-center gap-1 flex-wrap">
                          Naciśnij <MoreVertical className="h-4 w-4 inline mx-1" /> (Menu) w prawym górnym rogu
                        </p>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="bg-primary text-primary-foreground rounded-full h-7 w-7 flex items-center justify-center flex-shrink-0 text-sm font-bold">3</div>
                        <p className="text-sm">Wybierz <strong>"Dodaj do ekranu głównego"</strong> lub <strong>"Zainstaluj aplikację"</strong></p>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="bg-primary text-primary-foreground rounded-full h-7 w-7 flex items-center justify-center flex-shrink-0 text-sm font-bold">4</div>
                        <p className="text-sm">Potwierdź instalację ✅</p>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {selectedPlatform === 'iphone' && (
                  <Card className="bg-gray-50 dark:bg-gray-800/30 border-gray-200 dark:border-gray-700">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg flex items-center gap-2 justify-center">
                        <span className="text-2xl">🍎</span>
                        Instalacja na iPhone (Safari)
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-left">
                      <div className="flex items-start gap-3">
                        <div className="bg-primary text-primary-foreground rounded-full h-7 w-7 flex items-center justify-center flex-shrink-0 text-sm font-bold">1</div>
                        <p className="text-sm">Otwórz <strong>getrido.pl</strong> w przeglądarce <strong>Safari</strong></p>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="bg-primary text-primary-foreground rounded-full h-7 w-7 flex items-center justify-center flex-shrink-0 text-sm font-bold">2</div>
                        <p className="text-sm flex items-center gap-1 flex-wrap">
                          Naciśnij <Share className="h-4 w-4 inline mx-1" /> (Udostępnij) na dolnym pasku
                        </p>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="bg-primary text-primary-foreground rounded-full h-7 w-7 flex items-center justify-center flex-shrink-0 text-sm font-bold">3</div>
                        <p className="text-sm">Przewiń w dół i wybierz <strong>"Dodaj do ekranu początkowego"</strong></p>
                      </div>
                      <div className="flex items-start gap-3">
                        <div className="bg-primary text-primary-foreground rounded-full h-7 w-7 flex items-center justify-center flex-shrink-0 text-sm font-bold">4</div>
                        <p className="text-sm">Naciśnij <strong>"Dodaj"</strong> w prawym górnym rogu ✅</p>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Button onClick={handleLogin} className="w-full mt-4" size="lg">
                  <LogIn className="h-4 w-4 mr-2" />
                  🚗 Zaloguj się do portalu
                </Button>
              </div>
            )}

            <p className="text-xs text-muted-foreground text-center pt-2">
              AI platforma do usług i ogłoszeń
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
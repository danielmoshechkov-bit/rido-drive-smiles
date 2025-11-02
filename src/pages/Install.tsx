import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Smartphone, Share, MoreVertical, Download, ArrowRight } from 'lucide-react';

export default function Install() {
  const navigate = useNavigate();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }

    // Capture the install prompt event
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    
    setDeferredPrompt(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 to-background flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-center mb-4">
            <img 
              src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" 
              alt="RIDO Logo" 
              className="h-20 w-20 rounded-xl"
            />
          </div>
          <CardTitle className="text-center text-2xl">
            {isInstalled ? '✓ Aplikacja zainstalowana!' : 'Zainstaluj aplikację RIDO'}
          </CardTitle>
          <CardDescription className="text-center">
            {isInstalled 
              ? 'RIDO Portal został pomyślnie zainstalowany na Twoim urządzeniu'
              : 'Zainstaluj aplikację na swoim telefonie i miej szybki dostęp do swojego panelu kierowcy'
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isInstalled ? (
            <div className="text-center space-y-4">
              <div className="flex items-center justify-center text-green-600 mb-4">
                <Download className="h-16 w-16" />
              </div>
              <Button onClick={() => navigate('/auth')} className="w-full" size="lg">
                Przejdź do aplikacji
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              {deferredPrompt && (
                <Button onClick={handleInstallClick} className="w-full" size="lg">
                  <Download className="mr-2 h-5 w-5" />
                  Zainstaluj teraz
                </Button>
              )}

              <div className="space-y-4 pt-4">
                <h3 className="font-semibold text-lg">Instrukcja instalacji:</h3>
                
                <Card className="bg-muted/50 border-2">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Smartphone className="h-5 w-5 text-primary" />
                      Na iPhone (Safari)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex items-start gap-3">
                      <div className="bg-primary text-primary-foreground rounded-full h-6 w-6 flex items-center justify-center flex-shrink-0 text-xs font-bold">1</div>
                      <p>Otwórz stronę w przeglądarce Safari</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="bg-primary text-primary-foreground rounded-full h-6 w-6 flex items-center justify-center flex-shrink-0 text-xs font-bold">2</div>
                      <p className="flex items-center gap-1">
                        Naciśnij przycisk <Share className="h-4 w-4 inline mx-1" /> (Udostępnij) na dolnym pasku
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="bg-primary text-primary-foreground rounded-full h-6 w-6 flex items-center justify-center flex-shrink-0 text-xs font-bold">3</div>
                      <p>Przewiń w dół i wybierz <strong>"Dodaj do ekranu początkowego"</strong></p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="bg-primary text-primary-foreground rounded-full h-6 w-6 flex items-center justify-center flex-shrink-0 text-xs font-bold">4</div>
                      <p>Naciśnij <strong>"Dodaj"</strong> w prawym górnym rogu</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-muted/50 border-2">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Smartphone className="h-5 w-5 text-primary" />
                      Na Androidzie (Chrome)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex items-start gap-3">
                      <div className="bg-primary text-primary-foreground rounded-full h-6 w-6 flex items-center justify-center flex-shrink-0 text-xs font-bold">1</div>
                      <p>Otwórz stronę w przeglądarce Chrome</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="bg-primary text-primary-foreground rounded-full h-6 w-6 flex items-center justify-center flex-shrink-0 text-xs font-bold">2</div>
                      <p className="flex items-center gap-1">
                        Naciśnij przycisk <MoreVertical className="h-4 w-4 inline mx-1" /> (Menu) w prawym górnym rogu
                      </p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="bg-primary text-primary-foreground rounded-full h-6 w-6 flex items-center justify-center flex-shrink-0 text-xs font-bold">3</div>
                      <p>Wybierz <strong>"Dodaj do ekranu głównego"</strong> lub <strong>"Zainstaluj aplikację"</strong></p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="bg-primary text-primary-foreground rounded-full h-6 w-6 flex items-center justify-center flex-shrink-0 text-xs font-bold">4</div>
                      <p>Potwierdź instalację naciskając <strong>"Zainstaluj"</strong></p>
                    </div>
                  </CardContent>
                </Card>

                <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <p className="text-sm text-blue-900 dark:text-blue-100">
                    💡 <strong>Wskazówka:</strong> Po zainstalowaniu aplikacja pojawi się na ekranie głównym Twojego telefonu z ikoną RIDO
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t">
                <Button variant="outline" onClick={() => navigate('/auth')} className="w-full">
                  Pomiń i przejdź do logowania
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

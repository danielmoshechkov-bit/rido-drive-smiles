import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Smartphone, Share, MoreVertical, Download } from 'lucide-react';

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
    <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-4">
      <Card className="max-w-2xl w-full">
        <CardHeader>
          <div className="flex items-center justify-center mb-4">
            <img 
              src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" 
              alt="RIDO Logo" 
              className="h-16 w-16"
            />
          </div>
          <CardTitle className="text-center text-2xl">
            {isInstalled ? 'Aplikacja zainstalowana!' : 'Zainstaluj aplikację RIDO'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {isInstalled ? (
            <div className="text-center space-y-4">
              <p className="text-muted-foreground">
                Aplikacja RIDO jest już zainstalowana na Twoim urządzeniu.
              </p>
              <Button onClick={() => navigate('/')} className="w-full">
                Przejdź do aplikacji
              </Button>
            </div>
          ) : (
            <>
              <p className="text-center text-muted-foreground">
                Zainstaluj aplikację RIDO na swoim telefonie i miej szybki dostęp do swojego panelu kierowcy.
              </p>

              {deferredPrompt && (
                <Button onClick={handleInstallClick} className="w-full" size="lg">
                  <Download className="mr-2 h-5 w-5" />
                  Zainstaluj teraz
                </Button>
              )}

              <div className="space-y-4 pt-4">
                <h3 className="font-semibold text-lg">Instrukcja instalacji:</h3>
                
                <Card className="bg-muted/50">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Smartphone className="h-5 w-5" />
                      Na iPhone (Safari)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
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
                      <p>Przewiń w dół i wybierz "Dodaj do ekranu początkowego"</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="bg-primary text-primary-foreground rounded-full h-6 w-6 flex items-center justify-center flex-shrink-0 text-xs font-bold">4</div>
                      <p>Naciśnij "Dodaj" w prawym górnym rogu</p>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-muted/50">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Smartphone className="h-5 w-5" />
                      Na Androidzie (Chrome)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
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
                      <p>Wybierz "Dodaj do ekranu głównego" lub "Zainstaluj aplikację"</p>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="bg-primary text-primary-foreground rounded-full h-6 w-6 flex items-center justify-center flex-shrink-0 text-xs font-bold">4</div>
                      <p>Potwierdź instalację</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="pt-4 border-t">
                <Button variant="outline" onClick={() => navigate('/')} className="w-full">
                  Pomiń i przejdź do aplikacji
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

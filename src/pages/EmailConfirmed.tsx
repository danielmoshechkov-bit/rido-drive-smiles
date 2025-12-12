import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, LogIn, Smartphone, Share, MoreVertical, ArrowLeft } from "lucide-react";

type Platform = 'none' | 'android' | 'iphone';

const EmailConfirmed = () => {
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>('none');

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-accent/5 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg text-center">
        <CardHeader className="space-y-4">
          <div className="mx-auto">
            <img 
              src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" 
              alt="Get RIDO Logo" 
              className="h-16 w-16 mx-auto mb-4"
            />
          </div>
          <div className="flex justify-center">
            <CheckCircle className="h-16 w-16 text-green-500" />
          </div>
          <CardTitle className="text-2xl font-bold text-green-600">
            🎉 Gratulacje!
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <p className="text-lg font-medium">
              Twoje konto zostało aktywowane! ✅
            </p>
            <p className="text-muted-foreground">
              Możesz teraz zalogować się do portalu kierowcy i korzystać z wszystkich funkcji.
            </p>
          </div>
          
          {selectedPlatform === 'none' ? (
            <>
              <div className="space-y-3">
                <Button asChild className="w-full" size="lg">
                  <Link to="/auth">
                    <LogIn className="h-4 w-4 mr-2" />
                    🚗 Zaloguj się do portalu
                  </Link>
                </Button>
              </div>

              <div className="pt-4 border-t">
                <p className="text-sm text-muted-foreground mb-4">
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

              <Button asChild className="w-full mt-4" size="lg">
                <Link to="/auth">
                  <LogIn className="h-4 w-4 mr-2" />
                  🚗 Zaloguj się do portalu
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default EmailConfirmed;

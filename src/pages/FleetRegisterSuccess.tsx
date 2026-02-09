import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Smartphone, Home, Mail, Share, MoreVertical, ArrowLeft, CheckCircle, Building2, Users, Receipt, BarChart3 } from "lucide-react";

type Platform = 'none' | 'android' | 'iphone';

export default function FleetRegisterSuccess() {
  const navigate = useNavigate();
  const [selectedPlatform, setSelectedPlatform] = useState<Platform>('none');

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-accent/5 flex items-center justify-center p-4">
      <div className="container mx-auto max-w-lg">
        <Card className="text-center">
          <CardHeader className="pb-2">
            <div className="flex justify-center items-center gap-4 mb-4">
              <div className="h-20 w-20 bg-primary rounded-2xl flex items-center justify-center">
                <Building2 className="h-12 w-12 text-primary-foreground" />
              </div>
              <img
                src="/lovable-uploads/rido-mascot-transparent.png"
                alt="RIDO Mascot"
                className="h-20 w-20 object-contain animate-bounce-slow"
              />
            </div>
            <div className="flex justify-center mb-4">
              <CheckCircle className="h-12 w-12 text-green-500" />
            </div>
            <h1 className="text-2xl font-bold text-foreground">
              Dziękujemy za rejestrację floty!
            </h1>
            <p className="text-muted-foreground mt-2">
              Portal do zarządzania Flotą
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-center gap-2 text-primary">
                <Mail className="h-5 w-5" />
                <span className="font-medium">Sprawdź swoją skrzynkę e-mail</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Wysłaliśmy link aktywacyjny na podany adres email. Kliknij w link, aby aktywować konto floty.
              </p>
            </div>

            {/* Features preview */}
            <div className="grid grid-cols-2 gap-3 text-left">
              <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg">
                <Users className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium">Zarządzaj kierowcami</span>
              </div>
              <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg">
                <Receipt className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium">Twórz rozliczenia</span>
              </div>
              <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg">
                <BarChart3 className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium">Analizuj przychody</span>
              </div>
              <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg">
                <Building2 className="h-5 w-5 text-primary" />
                <span className="text-sm font-medium">Generuj faktury</span>
              </div>
            </div>

            {selectedPlatform === 'none' ? (
              <>
                <div className="border-t pt-4">
                  <p className="text-sm text-muted-foreground mb-4">
                    📱 Zainstaluj aplikację na telefonie dla szybkiego dostępu
                  </p>
                  <div className="grid grid-cols-2 gap-3 mb-4">
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

                <Button
                  variant="outline"
                  onClick={() => navigate("/")}
                  className="w-full gap-2"
                >
                  <Home className="h-4 w-4" />
                  Wróć na stronę główną
                </Button>
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

                <Button
                  variant="outline"
                  onClick={() => navigate("/")}
                  className="w-full gap-2 mt-4"
                >
                  <Home className="h-4 w-4" />
                  Wróć na stronę główną
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

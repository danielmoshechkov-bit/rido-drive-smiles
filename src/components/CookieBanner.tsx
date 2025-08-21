import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { X, Cookie, Shield } from "lucide-react";

const CookieBanner = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Sprawdź czy użytkownik już zaakceptował cookies
    const cookiesAccepted = localStorage.getItem('cookies-accepted');
    if (!cookiesAccepted) {
      setIsVisible(true);
    }
  }, []);

  const acceptCookies = () => {
    localStorage.setItem('cookies-accepted', 'true');
    setIsVisible(false);
  };

  const declineCookies = () => {
    localStorage.setItem('cookies-accepted', 'false');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4">
      <Card className="mx-auto max-w-4xl bg-card shadow-gold border-2 border-primary/20">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
                <Cookie className="h-6 w-6 text-primary" />
              </div>
            </div>
            
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-foreground">
                  Cookies i ochrona danych osobowych
                </h3>
                <Shield className="h-5 w-5 text-primary" />
              </div>
              
              <p className="text-sm text-muted-foreground leading-relaxed">
                Ta strona wykorzystuje pliki cookies oraz inne technologie śledzące w celu zapewnienia najlepszego doświadczenia użytkownika, 
                analizy ruchu i personalizacji treści. Przetwarzamy Twoje dane osobowe zgodnie z RODO. 
                Więcej informacji znajdziesz w naszej{" "}
                <a href="/privacy-policy" className="text-primary hover:underline">
                  Polityce Prywatności
                </a>.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button 
                  onClick={acceptCookies}
                  variant="accent" 
                  size="sm"
                  className="sm:order-2"
                >
                  Akceptuję wszystkie
                </Button>
                <Button 
                  onClick={declineCookies}
                  variant="outline" 
                  size="sm"
                  className="sm:order-1"
                >
                  Tylko niezbędne
                </Button>
              </div>
            </div>

            <Button
              onClick={declineCookies}
              variant="ghost"
              size="icon"
              className="flex-shrink-0 h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default CookieBanner;
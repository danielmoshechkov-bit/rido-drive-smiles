// GetRido Maps - GPS Consent Gate (Fullscreen Overlay)
import { useState, useEffect } from 'react';
import { Navigation, MapPin, Truck, ChevronDown, ChevronUp, AlertTriangle, Smartphone, Settings, ExternalLink, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { GpsState } from './useUserLocation';

interface GpsConsentGateProps {
  gps: GpsState;
  onAccept: () => Promise<void>;
  onDismiss: () => void;
}

type PermissionStateType = 'granted' | 'prompt' | 'denied' | 'unknown';

const GpsConsentGate = ({ gps, onAccept, onDismiss }: GpsConsentGateProps) => {
  const [permissionState, setPermissionState] = useState<PermissionStateType>('unknown');
  const [showInstructions, setShowInstructions] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);

  // Check permission state on mount
  useEffect(() => {
    const checkPermission = async () => {
      if ('permissions' in navigator) {
        try {
          const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
          setPermissionState(result.state as PermissionStateType);
          
          result.onchange = () => {
            setPermissionState(result.state as PermissionStateType);
          };
        } catch {
          setPermissionState('unknown');
        }
      }
    };
    
    checkPermission();
  }, []);

  const handleAccept = async () => {
    setIsRequesting(true);
    try {
      await onAccept();
    } finally {
      setIsRequesting(false);
    }
  };

  const isDenied = permissionState === 'denied';

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-6 space-y-6 shadow-2xl">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <Navigation className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-bold">
            Włącz lokalizację, aby korzystać z Map i Rozliczeń
          </h2>
          <p className="text-sm text-muted-foreground">
            GetRido potrzebuje dostępu do lokalizacji, aby działały:
          </p>
        </div>

        {/* Features list */}
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <MapPin className="h-5 w-5 text-green-600 flex-shrink-0" />
            <div>
              <p className="font-medium text-sm">Nawigacja</p>
              <p className="text-xs text-muted-foreground">Wyznaczanie trasy i prowadzenie do celu</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
            <Truck className="h-5 w-5 text-blue-600 flex-shrink-0" />
            <div>
              <p className="font-medium text-sm">Tryb pracy (Fleet Live)</p>
              <p className="text-xs text-muted-foreground">Wysyłanie pozycji do panelu floty</p>
            </div>
          </div>
        </div>

        {/* PWA/Web limitation notice */}
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
          <div className="flex items-start gap-2">
            <Smartphone className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-700">
              <strong>Ważne:</strong> Na web/PWA śledzenie działa gdy aplikacja jest otwarta (jak nawigacja Google Maps). Po zamknięciu apki tracking może zostać przerwany.
            </p>
          </div>
        </div>

        {/* Denied state - red alert */}
        {isDenied && (
          <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-destructive text-sm">Lokalizacja zablokowana</p>
                <p className="text-xs text-destructive/80 mt-1">
                  Masz zablokowaną lokalizację w ustawieniach systemu lub przeglądarki. Musisz ją włączyć ręcznie.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="space-y-3">
          {!isDenied ? (
            <Button 
              className="w-full gap-2 h-12 text-base"
              onClick={handleAccept}
              disabled={isRequesting}
            >
              <Navigation className="h-5 w-5" />
              {isRequesting ? 'Włączanie...' : 'Włącz lokalizację'}
            </Button>
          ) : (
            <Button 
              variant="outline"
              className="w-full gap-2 h-12"
              onClick={() => setShowInstructions(!showInstructions)}
            >
              <Settings className="h-5 w-5" />
              Jak włączyć w ustawieniach
              {showInstructions ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          )}

          {/* How to enable button (for non-denied state) */}
          {!isDenied && (
            <Button 
              variant="ghost"
              className="w-full text-sm text-muted-foreground gap-1"
              onClick={() => setShowInstructions(!showInstructions)}
            >
              Jak włączyć w ustawieniach?
              {showInstructions ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          )}
        </div>

        {/* Instructions accordion */}
        {showInstructions && (
          <div className="space-y-4 pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Instrukcja dla Twojego urządzenia:
            </p>
            
            {/* iOS Safari / PWA */}
            <div className="p-3 bg-muted/30 rounded-lg space-y-2">
              <p className="font-medium text-sm flex items-center gap-2">
                🍎 iPhone (Safari / PWA)
              </p>
              <ol className="text-xs text-muted-foreground space-y-1.5 ml-4 list-decimal">
                <li>Otwórz <strong>Ustawienia</strong> na iPhonie</li>
                <li>Przejdź do <strong>Prywatność i ochrona</strong></li>
                <li>Wybierz <strong>Usługi lokalizacji</strong></li>
                <li>Znajdź <strong>Safari</strong> (lub nazwę PWA)</li>
                <li>Ustaw na <strong>„Podczas używania"</strong></li>
              </ol>
            </div>

            {/* Android Chrome */}
            <div className="p-3 bg-muted/30 rounded-lg space-y-2">
              <p className="font-medium text-sm flex items-center gap-2">
                🤖 Android (Chrome)
              </p>
              <ol className="text-xs text-muted-foreground space-y-1.5 ml-4 list-decimal">
                <li>Kliknij <strong>ikonę kłódki</strong> 🔒 obok adresu strony</li>
                <li>Wybierz <strong>Uprawnienia</strong></li>
                <li>Znajdź <strong>Lokalizacja</strong></li>
                <li>Zmień na <strong>Zezwól</strong></li>
                <li>Odśwież stronę</li>
              </ol>
            </div>

            {/* Desktop browsers */}
            <div className="p-3 bg-muted/30 rounded-lg space-y-2">
              <p className="font-medium text-sm flex items-center gap-2">
                💻 Przeglądarka na komputerze
              </p>
              <ol className="text-xs text-muted-foreground space-y-1.5 ml-4 list-decimal">
                <li>Kliknij ikonę kłódki/info obok adresu</li>
                <li>Znajdź uprawnienia do lokalizacji</li>
                <li>Zmień na „Zezwól"</li>
                <li>Odśwież stronę</li>
              </ol>
            </div>
          </div>
        )}

        {/* Dismiss button */}
        <Button 
          variant="ghost" 
          className="w-full text-muted-foreground"
          onClick={onDismiss}
        >
          Później (funkcje będą zablokowane)
        </Button>
      </Card>
    </div>
  );
};

export default GpsConsentGate;

/*
 * TEST CHECKLIST:
 * 
 * 1. iOS Safari/PWA:
 *    - [ ] Odmowa GPS → fullscreen overlay z instrukcją iOS
 *    - [ ] Przyciski "Wyznacz", "Prowadź", "Tryb pracy" zablokowane
 *    - [ ] Po akceptacji → wszystko działa
 * 
 * 2. Android Chrome:
 *    - [ ] Odmowa GPS → overlay z instrukcją Android
 *    - [ ] Akceptacja → GPS działa
 * 
 * 3. Tryb Praca ON:
 *    - [ ] Wysyłka co 5s widoczna w konsoli [FleetLive]
 *    - [ ] Offline → kolejka rośnie, badge "Offline — X pkt"
 *    - [ ] Online → auto-flush kolejki
 * 
 * 4. Filtr jazdy:
 *    - [ ] Chodzenie (2-8 km/h) → isDriving: false
 *    - [ ] Jazda (>8 km/h) → isDriving: true
 *    - [ ] Stanie → stationary
 * 
 * 5. Fleet Live Map:
 *    - [ ] Checkbox "Tylko jadący" filtruje kierowców
 *    - [ ] Markery aktualizują się co 5s
 */

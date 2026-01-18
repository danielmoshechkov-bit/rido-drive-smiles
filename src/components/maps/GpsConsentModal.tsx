import { MapPin, Navigation, Shield } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface GpsConsentModalProps {
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

const GpsConsentModal = ({ open, onAccept, onDecline }: GpsConsentModalProps) => {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onDecline()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center sm:text-left">
          <div className="mx-auto sm:mx-0 mb-4 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Navigation className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-lg">
            Wymagana zgoda na lokalizację GPS
          </DialogTitle>
          <DialogDescription className="space-y-3 pt-2">
            <p>
              Aby korzystać z funkcji Map, wymagana jest zgoda na udostępnienie lokalizacji GPS.
            </p>
            
            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-foreground">Twoja pozycja na mapie</p>
                <p className="text-muted-foreground">
                  Wyświetlimy marker z Twoją aktualną lokalizacją
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
              <Shield className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-foreground">Prywatność</p>
                <p className="text-muted-foreground">
                  Dane lokalizacji są wykorzystywane do analizy ruchu i jakości tras. Nie są publicznie widoczne.
                </p>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>
        
        <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0 pt-4">
          <Button variant="outline" onClick={onDecline} className="w-full sm:w-auto">
            Anuluj
          </Button>
          <Button onClick={onAccept} className="w-full sm:w-auto gap-2">
            <Navigation className="h-4 w-4" />
            Akceptuję i włączam GPS
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GpsConsentModal;

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGoToSettings: () => void;
}

export function RidoPartsConfigModal({ open, onOpenChange, onGoToSettings }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Skonfiguruj integrację z hurtownią
          </DialogTitle>
          <DialogDescription>
            Aby korzystać z automatycznego wyszukiwania i zamawiania części, musisz podłączyć API swojej hurtowni.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <p className="text-sm font-semibold">Dostępne integracje:</p>

          {/* HART */}
          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">🟡</span>
              <span className="font-semibold">HART</span>
              <span className="text-xs text-muted-foreground">(hartphp.com.pl)</span>
            </div>
            <p className="text-sm text-muted-foreground font-medium">Jak uzyskać dostęp:</p>
            <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
              <li>Skontaktuj się ze swoim opiekunem handlowym w Hart</li>
              <li>Poproś o dane dostępowe do REST API (login i hasło do API — to inne dane niż do sklepu)</li>
              <li>Podaj że chcesz dostęp do środowiska sandbox (testowego) i produkcyjnego</li>
              <li>Otrzymasz username i password do API</li>
              <li>Wejdź w <span className="font-medium text-foreground">Ustawienia → Integracje → Hart</span> i wpisz te dane</li>
            </ol>
            <p className="text-xs text-muted-foreground">Kontakt: hart@hartphp.com.pl</p>
          </div>

          {/* AUTO PARTNER */}
          <div className="rounded-lg border p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔵</span>
              <span className="font-semibold">AUTO PARTNER</span>
              <span className="text-xs text-muted-foreground">(autopartner.dev)</span>
            </div>
            <p className="text-sm text-muted-foreground font-medium">Jak uzyskać dostęp:</p>
            <ol className="text-sm text-muted-foreground list-decimal list-inside space-y-1">
              <li>Skontaktuj się z opiekunem handlowym Auto Partner</li>
              <li>Poproś o dostęp do CustomerAPI Auto Partner</li>
              <li>Otrzymasz Client Code, WS Password i Client Password</li>
              <li>Wejdź w <span className="font-medium text-foreground">Ustawienia → Integracje → Auto Partner</span> i wpisz te dane</li>
            </ol>
            <p className="text-xs text-muted-foreground">Kontakt: przez opiekuna handlowego Auto Partner</p>
          </div>

          <p className="text-sm text-muted-foreground italic">➕ Więcej integracji będzie dodawanych wkrótce.</p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Zamknij</Button>
          <Button onClick={onGoToSettings}>Przejdź do ustawień</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

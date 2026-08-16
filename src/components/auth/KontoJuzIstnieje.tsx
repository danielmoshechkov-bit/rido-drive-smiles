import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { UserCheck } from 'lucide-react';

/**
 * Komunikat przy próbie rejestracji na adres, który już ma konto.
 *
 * Mówi wprost, że konto istnieje, i daje od razu dwa wyjścia — zamiast
 * zostawiać człowieka z informacją i kazać mu szukać. Przy rejestracji
 * z landingu modułu dochodzi zdanie, że modułu nie trzeba zakładać od nowa:
 * dojdzie do istniejącego konta po zalogowaniu.
 *
 * ŚWIADOMA DECYZJA (Daniel, 16.08.2026): potwierdzanie wprost, że adres jest
 * w bazie, pozwala sprawdzać cudze adresy. Przyjęte — sprzedajemy warsztatom,
 * które i tak są publiczne na `/uslugi`, a wygoda przy rejestracji waży
 * więcej. Wyliczanie bazy na skalę ogranicza limit pięciu prób na godzinę
 * z jednego adresu IP, naliczany PRZED sprawdzeniem, czy konto istnieje —
 * więc próby zakończone „już istnieje" też się liczą.
 */
export function KontoJuzIstnieje({
  email,
  zModulu,
  onZaloguj,
  onResetHasla,
}: {
  email: string;
  /** Rejestracja szła z landingu modułu (np. `/warsztat-info`). */
  zModulu?: boolean;
  onZaloguj: () => void;
  onResetHasla: () => void;
}) {
  return (
    <Alert className="border-primary/40 bg-primary/5">
      <UserCheck className="h-4 w-4 text-primary" />
      <AlertDescription className="space-y-3">
        <div className="space-y-1">
          <p className="font-medium text-foreground">
            Konto z adresem {email} już istnieje.
          </p>
          <p className="text-sm text-muted-foreground">
            {zModulu
              ? 'Nie zakładaj nowego — zaloguj się, a moduł dodamy do konta, które już masz.'
              : 'Zaloguj się na istniejące konto albo odzyskaj hasło.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="sm" onClick={onZaloguj}>
            Zaloguj się
          </Button>
          <button
            type="button"
            onClick={onResetHasla}
            className="text-sm text-primary underline underline-offset-4 hover:text-primary/80"
          >
            Nie pamiętam hasła
          </button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

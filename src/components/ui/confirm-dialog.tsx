import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/**
 * Pytanie „czy na pewno?" w stylu aplikacji.
 *
 * Do tej pory używaliśmy systemowego `confirm()` przeglądarki — działał, ale
 * wyglądał obco: szary pasek u góry ekranu z adresem strony, zwłaszcza rażący
 * na telefonie. Do tego blokuje cały wątek przeglądarki.
 *
 * Ten hook zachowuje wygodę `confirm()` — zwraca obietnicę true/false, więc
 * w kodzie zostaje jedna linia `if (!(await confirmAction(...))) return;` —
 * a pokazuje zwykły dialog aplikacji.
 */

interface Opcje {
  title: string;
  description?: string;
  /** Napis na przycisku potwierdzenia; domyślnie „Usuń". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Czerwony przycisk dla akcji nieodwracalnych (domyślnie tak). */
  destructive?: boolean;
}

type ConfirmFn = (opcje: Opcje) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const [opcje, setOpcje] = useState<Opcje | null>(null);
  const rozstrzygnij = useRef<((wynik: boolean) => void) | null>(null);

  const confirmAction = useCallback<ConfirmFn>((nowe) => {
    setOpcje(nowe);
    return new Promise<boolean>((resolve) => { rozstrzygnij.current = resolve; });
  }, []);

  const zamknij = (wynik: boolean) => {
    rozstrzygnij.current?.(wynik);
    rozstrzygnij.current = null;
    setOpcje(null);
  };

  return (
    <ConfirmContext.Provider value={confirmAction}>
      {children}
      <AlertDialog
        open={!!opcje}
        onOpenChange={(otwarty) => { if (!otwarty) zamknij(false); }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{opcje?.title}</AlertDialogTitle>
            {opcje?.description && <AlertDialogDescription>{opcje.description}</AlertDialogDescription>}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => zamknij(false)}>
              {opcje?.cancelLabel || 'Anuluj'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => zamknij(true)}
              className={opcje?.destructive === false ? '' : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'}
            >
              {opcje?.confirmLabel || 'Usuń'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

/**
 * Zwraca funkcję pytającą o potwierdzenie. Gdy z jakiegoś powodu zabrakłoby
 * providera (np. komponent renderowany poza drzewem aplikacji), wracamy do
 * systemowego okna — lepiej to niż akcja wykonana bez pytania.
 */
export function useConfirm(): ConfirmFn {
  const kontekst = useContext(ConfirmContext);
  return useCallback<ConfirmFn>((opcje) => {
    if (kontekst) return kontekst(opcje);
    return Promise.resolve(window.confirm([opcje.title, opcje.description].filter(Boolean).join('\n\n')));
  }, [kontekst]);
}

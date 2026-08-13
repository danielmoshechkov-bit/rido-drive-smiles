import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * Granica błędu dla całej aplikacji.
 *
 * Bez niej każdy błąd renderowania kończył się BIAŁYM EKRANEM — użytkownik nie
 * wiedział, czy aplikacja padła, czy jeszcze się ładuje, i nie miał co zrobić.
 * Tutaj: czytelny komunikat, przycisk odświeżenia i powrót do panelu, a treść
 * błędu ląduje w konsoli (do zgłoszenia), zamiast znikać bez śladu.
 */

interface Props { children: ReactNode }
interface State { error: Error | null }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[GetRido] Błąd renderowania:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="max-w-md w-full rounded-xl border border-border bg-card p-6 text-center space-y-3">
          <p className="text-2xl">😕</p>
          <h1 className="text-lg font-semibold text-foreground">Ten widok się nie wczytał</h1>
          <p className="text-sm text-muted-foreground">
            Najczęściej wystarczy odświeżyć stronę — zwykle to nieaktualna wersja
            otwarta w tej karcie. Jeśli błąd wróci, napisz do nas w czacie pomocy.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 pt-1">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="flex-1 h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
            >
              Odśwież stronę
            </button>
            <button
              type="button"
              onClick={() => { window.location.href = '/'; }}
              className="flex-1 h-10 rounded-md border border-input bg-background text-sm font-medium hover:bg-accent"
            >
              Strona główna
            </button>
          </div>
          <p className="text-xs text-muted-foreground/80 pt-1 break-words">{error.message}</p>
        </div>
      </div>
    );
  }
}

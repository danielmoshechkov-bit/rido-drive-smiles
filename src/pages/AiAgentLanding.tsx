import { UniversalHomeButton } from '@/components/UniversalHomeButton';
import { StronaAgenta } from '@/components/agent/StronaAgenta';

/**
 * `/ai-agent` — publiczna strona wirtualnej asystentki.
 *
 * Treść jest wspólna z widokiem w panelu (warsztat bez pakietu widzi dokładnie
 * to samo), więc mieszka w `StronaAgenta`. Tutaj zostaje wyłącznie oprawa
 * strony publicznej: powrót na stronę główną i stopka.
 */
export default function AiAgentLanding() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-background/95 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 py-3 flex items-center gap-4">
          <UniversalHomeButton />
          <span className="font-semibold">Wirtualna asystentka</span>
        </div>
      </header>

      <StronaAgenta />

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        GETRIDO sp. z o.o. · NIP 5223377431 ·{' '}
        <a href="mailto:kontakt@getrido.pl" className="underline hover:text-foreground">kontakt@getrido.pl</a>
      </footer>
    </div>
  );
}

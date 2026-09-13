/**
 * KAFELEK „AI AGENT" — DRUGIE WEJŚCIE, NIE DRUGA KOPIA.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DWA WEJŚCIA, JEDEN KOMPONENT
 * ═══════════════════════════════════════════════════════════════════════════
 * Ustawienia asystentki mieszkają w `VoiceAgentPanel`, a lista rozmów
 * w `WorkshopCallsList`. Ten widok tylko je składa — nie powtarza ani
 * jednego pola. Zmiana ustawienia zrobiona tutaj jest tą samą zmianą, co
 * zrobiona w zakładce „Asystent głosowy", bo to ten sam komponent i ta sama
 * tabela.
 *
 * ZAKŁADKA ZOSTAJE GŁÓWNYM WEJŚCIEM. Warsztat może mieć sam pakiet agenta,
 * bez modułu warsztatowego — wtedy tego menu nie ma w ogóle i kafelek nie
 * istnieje. Gdyby ustawienia mieszkały wyłącznie tutaj, taki klient nie
 * miałby jak ich otworzyć.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WYGASŁY PAKIET: HISTORIA ZOSTAJE, USTAWIENIA ZNIKAJĄ
 * ═══════════════════════════════════════════════════════════════════════════
 * Rozmowy są własnością warsztatu i po wygaśnięciu pakietu nadal musi mieć do
 * nich dostęp — to jego klienci i jego ustalenia. Znikają ustawienia i numer,
 * bo to jest produkt, za który przestał płacić. Przy okazji widzi, ile rozmów
 * przechodziło mu przez agenta, zanim pakiet się skończył.
 */
import { useEffect, useState } from 'react';
import { ArrowLeft, Phone, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WorkshopCallsList } from './WorkshopCallsList';
import { VoiceAgentPanel } from '@/components/ai-sales/VoiceAgentPanel';
import { usePakietAgenta } from '@/hooks/usePakietAgenta';
import { oznaczWidziane } from '@/lib/nowePolaczenia';

type Zakladka = 'polaczenia' | 'ustawienia';

export function WidokAgentaWarsztatu({ providerId, onBack, onOpenOrder }: {
  providerId: string;
  onBack: () => void;
  onOpenOrder?: (orderId: string) => void;
}) {
  const { maPakiet, gotowe } = usePakietAgenta();
  const [zakladka, setZakladka] = useState<Zakladka>('polaczenia');

  /**
   * Wejście gasi powiadomienie przy kafelku. Robimy to od razu, a nie po
   * przewinięciu listy: człowiek, który tu wszedł, już wie, że coś przyszło —
   * a wykrzyknik, który nie gaśnie po wejściu, uczy ignorowania siebie.
   */
  useEffect(() => { oznaczWidziane(providerId); }, [providerId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />Wróć
        </Button>
        <div className="ml-auto flex gap-1">
          <Button
            size="sm"
            variant={zakladka === 'polaczenia' ? 'default' : 'outline'}
            onClick={() => setZakladka('polaczenia')}
            className="gap-2"
          >
            <Phone className="h-4 w-4" />Połączenia
          </Button>
          {/* Ustawień nie pokazujemy bez pakietu — nie ma czego ustawiać,
              a przycisk prowadzący do pustki wygląda jak usterka. */}
          {gotowe && maPakiet && (
            <Button
              size="sm"
              variant={zakladka === 'ustawienia' ? 'default' : 'outline'}
              onClick={() => setZakladka('ustawienia')}
              className="gap-2"
            >
              <Settings2 className="h-4 w-4" />Ustawienia asystentki
            </Button>
          )}
        </div>
      </div>

      {zakladka === 'polaczenia'
        ? (
          <>
            <WorkshopCallsList providerId={providerId} onOpenOrder={onOpenOrder} />
            {/* Bez pakietu pod listą staje oferta — ten sam komponent, co na
                stronie sprzedażowej i w zakładce. Warsztat widzi własne rozmowy
                i obok nich, czego przestał używać. */}
            {gotowe && !maPakiet && <VoiceAgentPanel providerId={providerId} />}
          </>
        )
        : <VoiceAgentPanel providerId={providerId} />}
    </div>
  );
}

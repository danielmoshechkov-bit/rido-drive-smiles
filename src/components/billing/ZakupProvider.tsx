import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { OknoZakupu, type ZadanieZakupu } from '@/components/billing/OknoZakupu';

/**
 * Jedno okno zakupu na całą aplikację.
 *
 * Pięć miejsc prowadzi do płatności: plakietka przy nazwie firmy, pasek trybu
 * dokończenia, ekran po twardym bloku, kafelek na cenniku i baner na pulpicie.
 * Wszystkie wołają `otworzZakup` — żadne nie ma własnej ścieżki do operatora.
 *
 * Dostawca stoi nad drzewem tras, więc okno przeżywa nawigację: klient, który
 * kliknie „Wybierz plan" i przejdzie na inną zakładkę, nie traci wyboru.
 */
interface Kontekst {
  otworzZakup: (zadanie?: ZadanieZakupu) => void;
}

const Ctx = createContext<Kontekst | null>(null);

export function useZakup(): Kontekst {
  const c = useContext(Ctx);
  // Fail-loud: brak dostawcy znaczy, że przycisk zakupu stoi poza drzewem
  // i po kliknięciu nie zrobiłby nic. Lepiej, żeby to wyszło od razu.
  if (!c) throw new Error('useZakup wymaga ZakupProvider');
  return c;
}

export function ZakupProvider({ children }: { children: ReactNode }) {
  const [otwarte, setOtwarte] = useState(false);
  const [zadanie, setZadanie] = useState<ZadanieZakupu>({});

  const otworzZakup = useCallback((z: ZadanieZakupu = {}) => {
    setZadanie(z);
    setOtwarte(true);
  }, []);

  return (
    <Ctx.Provider value={{ otworzZakup }}>
      {children}
      <OknoZakupu otwarte={otwarte} onOpenChange={setOtwarte} zadanie={zadanie} />
    </Ctx.Provider>
  );
}

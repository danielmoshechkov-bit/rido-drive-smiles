import { useCallback, useEffect, useState } from 'react';

/**
 * Stan wprowadzenia: który krok, czy w ogóle je pokazywać.
 *
 * Zamknięte znaczy zamknięte — nie wraca przy kolejnym wejściu. Warsztat, który
 * je przerwał, zrobił to świadomie, a okno wyskakujące po raz drugi jest już
 * tylko przeszkodą w pracy.
 *
 * Stan trzymamy w przeglądarce, nie w bazie: to podpowiedź dla osoby przy
 * komputerze, a nie ustawienie firmy. Pracownik na swoim komputerze dostanie
 * je osobno i to jest w porządku — on też pierwszy raz widzi ten ekran.
 */
const KLUCZ = 'rido_wprowadzenie_warsztat_v1';

interface Zapis {
  zamkniete: boolean;
  krok: number;
  /** Ustawiane przyciskiem „Pokaż wprowadzenie od nowa" — panel odpala je przy wejściu. */
  autostart?: boolean;
}

const odczytaj = (): Zapis => {
  try {
    const raw = localStorage.getItem(KLUCZ);
    if (raw) {
      const z = JSON.parse(raw);
      return { zamkniete: !!z.zamkniete, krok: Number(z.krok) || 0, autostart: !!z.autostart };
    }
  } catch { /* brak dostępu do pamięci przeglądarki — pokazujemy od początku */ }
  return { zamkniete: false, krok: 0 };
};

const zapisz = (z: Zapis) => {
  try { localStorage.setItem(KLUCZ, JSON.stringify(z)); } catch { /* ignorujemy */ }
};

/**
 * Włącza wprowadzenie przy najbliższym wejściu w panel warsztatu.
 * Wołane z Ustawień — stamtąd nie mamy dostępu do stanu panelu, a nie chcemy,
 * żeby ktoś musiał czyścić pamięć przeglądarki, żeby obejrzeć je drugi raz.
 */
export function zaplanujWprowadzenie() {
  zapisz({ zamkniete: false, krok: 0, autostart: true });
}

export function useWprowadzenie(ileKrokow: number) {
  const [stan, setStan] = useState<Zapis>(() => odczytaj());
  const [wlaczone, setWlaczone] = useState(false);

  useEffect(() => { zapisz(stan); }, [stan]);

  const zacznij = useCallback(() => {
    setStan({ zamkniete: false, krok: 0 });
    setWlaczone(true);
  }, []);

  // Wejście z Ustawień: „Pokaż wprowadzenie od nowa" ustawia znacznik, a panel
  // odpala je przy najbliższym otwarciu i od razu ten znacznik gasi.
  useEffect(() => {
    if (!stan.autostart) return;
    setStan({ zamkniete: false, krok: 0 });
    setWlaczone(true);
  }, [stan.autostart]);

  const dalej = useCallback(() => {
    setStan((s) => {
      const nastepny = s.krok + 1;
      if (nastepny >= ileKrokow) { setWlaczone(false); return { zamkniete: true, krok: 0 }; }
      return { ...s, krok: nastepny };
    });
  }, [ileKrokow]);

  const zamknij = useCallback(() => {
    setStan({ zamkniete: true, krok: 0 });
    setWlaczone(false);
  }, []);

  return {
    /** Czy rysować nakładkę teraz. */
    aktywne: wlaczone && !stan.zamkniete,
    krok: stan.krok,
    /** Czy w ogóle proponować wprowadzenie (nie zostało zamknięte wcześniej). */
    dostepne: !stan.zamkniete,
    zacznij, dalej, zamknij,
  };
}

import { useUserRole } from '@/hooks/useUserRole';

/**
 * Czy moduł umawiania oglądań nieruchomości jest dostępny dla tego konta.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PO CO
 * ═══════════════════════════════════════════════════════════════════════════
 * Moduł nieruchomości nie jest gotowy i będzie porządkowany osobno. Do tego
 * czasu umawianie oglądań jest dostępne wyłącznie dla administratora, do testów.
 *
 * Drugi powód jest rozliczeniowy: `schedule-viewings` wysyła SMS-y wprost do
 * bramki, z pominięciem `send-sms`, więc nie sprawdza pokrycia, nie zdejmuje
 * jednostki i nie zostawia śladu w księdze. Każdy taki SMS idzie na koszt
 * platformy. Przepięcie na `send-sms` robimy przy porządkowaniu nieruchomości.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * CZEGO TU NIE MA I DLACZEGO
 * ═══════════════════════════════════════════════════════════════════════════
 * Nie ma zaszytego adresu e-mail. Pytamy o ROLĘ — tę samą, której używa reszta
 * systemu. Literał z adresem przestałby działać przy zmianie konta, a za miesiąc
 * nikt by nie wiedział, skąd się w kodzie wziął.
 *
 * Sprawdzamy `roles.includes('admin')`, a nie `isAdmin`. `isAdmin` porównuje
 * JEDNĄ rolę wybraną po priorytecie, więc konto z kilkoma rolami mogłoby wypaść
 * poza bramkę mimo posiadanego uprawnienia.
 *
 * To jest wyłącznie widoczność. Zabezpieczeniem jest bramka w samej funkcji
 * `schedule-viewings` — ukryty przycisk nie chroni przed wywołaniem po adresie.
 */
export const KOMUNIKAT_OGLADANIA = 'Umawianie oglądań będzie dostępne wkrótce';

export function useModulOgladan() {
  const { roles, loading } = useUserRole();
  return {
    dostepny: roles.includes('admin'),
    /** Dopóki role się wczytują, nie pokazujemy ani przycisku, ani odmowy. */
    gotowe: !loading,
  };
}

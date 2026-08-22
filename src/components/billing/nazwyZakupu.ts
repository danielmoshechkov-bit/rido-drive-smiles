import type { DostepWarsztatu } from '@/hooks/useSubscriptionAccess';

/**
 * Nazwa przycisku zakupu zależna od STANU KONTA.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * DLACZEGO NIE JEDNA UNIWERSALNA
 * ═══════════════════════════════════════════════════════════════════════════
 * Wszędzie stało „Przedłuż". Dla klienta w okresie próbnym to nieprawda —
 * on niczego nie przedłuża, tylko po raz pierwszy zaczyna płacić. Przycisk,
 * który opisuje coś innego, niż robi, każe się zastanawiać zamiast klikać.
 *
 * Zasada: przycisk nazywa TO, CO SIĘ STANIE po kliknięciu, nie kategorię
 * „płatność". Przy nieudanej karcie jest to szczególnie ważne — klient już
 * zdecydował, że chce płacić, więc odesłanie go do wyboru planu byłoby
 * cofnięciem o krok.
 */

/** Ile dni przed końcem opłaconego okresu zaczynamy mówić „Przedłuż". */
const PROG_PRZEDLUZENIA_DNI = 14;
/** Ile dni przed końcem okresu próbnego dokładamy powód do przycisku. */
const PROG_PILNOSCI_DNI = 7;

const dniDo = (iso: string | null): number | null => {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
};

export function nazwaZakupu(dostep: DostepWarsztatu, providerPayU = false): string {
  switch (dostep.stan) {
    case 'dokanczanie':
      // „Przedłuż" sugerowałoby, że coś jeszcze trwa. Nie trwa — trwa tylko
      // czas na domknięcie pracy.
      return 'Wykup dostęp';

    case 'zablokowana':
      return dostep.powod === 'platnosc'
        // Problem jest z kartą, nie z decyzją o zakupie.
        ? 'Popraw płatność'
        : 'Odblokuj dostęp';

    case 'karencja':
      return 'Popraw płatność';

    case 'aktywna': {
      if (dostep.okresProbny) {
        const dni = dniDo(dostep.koniecOkresu);
        // Ten sam czyn, ale z powodem — w momencie, w którym decyzja zapada.
        return dni !== null && dni <= PROG_PILNOSCI_DNI
          ? 'Wybierz plan, zanim skończy się okres próbny'
          : 'Wybierz plan';
      }
      // Miesiąc kupiony jednorazowo NIE odnawia się sam. Przycisk ma to
      // powiedzieć wprost, żeby klient nie założył, że coś stanie się bez niego.
      if (providerPayU) return 'Dokup kolejny miesiąc';

      const doKonca = dniDo(dostep.koniecOkresu);
      // Jedyny stan, w którym słowo „przedłuż" jest prawdziwe.
      return doKonca !== null && doKonca <= PROG_PRZEDLUZENIA_DNI ? 'Przedłuż' : 'Zmień plan';
    }

    default:
      return 'Wybierz plan';
  }
}

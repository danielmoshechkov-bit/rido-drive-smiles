/**
 * Terminal płatniczy — brama między wyborem formy płatności a wydrukiem paragonu.
 *
 * ZASADA: paragon fiskalny drukuje się DOPIERO po potwierdzeniu płatności. Odwrotna
 * kolejność jest kosztowna: wydruk trafia do pamięci fiskalnej nieodwracalnie, więc
 * odrzucona karta zostawia obrót, którego nie da się cofnąć inaczej niż wpisem
 * do ewidencji pomyłek. Dlatego przy karcie i BLIK-u najpierw płatność, potem druk.
 *
 * DLACZEGO STEROWNIKI: w Polsce nie ma jednego standardu komunikacji z terminalem —
 * każdy agent rozliczeniowy ma własny protokół ECR albo własne API. Uniwersalny jest
 * natomiast PRZEBIEG, więc to on siedzi tutaj, a różnice zamykamy w sterowniku:
 *
 *   • 'manual' — kwotę wbija kasjer na terminalu, a system czeka na jego potwierdzenie.
 *     Działa z każdym terminalem na rynku i już daje najważniejsze: brak paragonu
 *     do nieudanej płatności oraz możliwość zmiany formy płatności bez utraty pozycji.
 *   • sterowniki 'auto' (chmurowe API terminala albo protokół ECR przez mostek lokalny)
 *     dokładają wysyłkę kwoty na terminal i automatyczny odczyt wyniku. Podpięcie
 *     takiego sterownika nie rusza interfejsu — wystarczy dopisać `request`.
 *
 * Konfiguracja jest ustawieniem KOMPUTERA, nie firmy: terminal stoi na konkretnym
 * stanowisku, tak jak mostek fiskalny.
 */

export type TerminalMethod = 'card' | 'blik';
export type TerminalProviderId = 'manual';

export interface TerminalConfig {
  enabled: boolean;
  provider: TerminalProviderId;
}

export interface TerminalRequest {
  amountGrosze: number;
  method: TerminalMethod;
  /** Opis dla terminala/potwierdzenia — np. numer zlecenia. */
  reference?: string;
}

export interface TerminalResult {
  status: 'approved' | 'declined' | 'cancelled';
  /** Numer referencyjny transakcji z terminala — trafia do logu paragonu. */
  reference?: string;
  message?: string;
}

export interface TerminalProvider {
  id: TerminalProviderId;
  label: string;
  description: string;
  /**
   * 'manual' = wynik potwierdza kasjer w oknie paragonu,
   * 'auto'   = sterownik sam wysyła kwotę i czeka na odpowiedź terminala.
   */
  mode: 'manual' | 'auto';
  request?: (config: TerminalConfig, request: TerminalRequest) => Promise<TerminalResult>;
}

export const TERMINAL_PROVIDERS: Record<TerminalProviderId, TerminalProvider> = {
  manual: {
    id: 'manual',
    label: 'Potwierdzenie kasjera (dowolny terminal)',
    description:
      'Kwotę wbijasz na terminalu ręcznie, a system czeka z wydrukiem paragonu, aż potwierdzisz płatność. ' +
      'Działa z każdym terminalem — nie wymaga integracji z agentem rozliczeniowym.',
    mode: 'manual',
  },
};

export const TERMINAL_METHOD_LABELS: Record<TerminalMethod, string> = {
  card: 'karta',
  blik: 'BLIK',
};

const DEFAULT_CONFIG: TerminalConfig = { enabled: false, provider: 'manual' };

const storageKey = (providerId?: string) => `fiscal_terminal:${providerId ?? 'default'}`;

export function getTerminalConfig(providerId?: string): TerminalConfig {
  try {
    const raw = localStorage.getItem(storageKey(providerId));
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw);
    return {
      enabled: Boolean(parsed.enabled),
      provider: (parsed.provider as TerminalProviderId) in TERMINAL_PROVIDERS ? parsed.provider : 'manual',
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function setTerminalConfig(config: TerminalConfig, providerId?: string): void {
  localStorage.setItem(storageKey(providerId), JSON.stringify(config));
}

/** Czy dla tej formy płatności trzeba przejść przez terminal przed wydrukiem. */
export function needsTerminal(config: TerminalConfig, method: string): method is TerminalMethod {
  return config.enabled && (method === 'card' || method === 'blik');
}

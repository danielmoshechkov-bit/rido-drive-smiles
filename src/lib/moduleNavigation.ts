import type { NavigateFunction } from 'react-router-dom';

/**
 * Jedno źródło prawdy dla wejścia do Portalu Klienta z DOWOLNEGO przełącznika modułów
 * (AccountSwitcherPanel, MyGetRidoButton, MarketplaceHeader, ...).
 *
 * Dodaje intencję ?view=client, którą respektuje ClientPortal guard: usługodawca
 * świadomie przełączający się na Portal Klienta NIE jest odsyłany z powrotem na
 * /uslugi/panel. Domyślne/bezpośrednie wejście na /klient (bez tej intencji) nadal
 * odsyła providera do jego panelu — regresja zachowana.
 */
export const CLIENT_PORTAL_INTENT_PATH = '/klient?view=client';

export function goToClientPortal(navigate: NavigateFunction) {
  navigate(CLIENT_PORTAL_INTENT_PATH);
}

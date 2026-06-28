/**
 * Konfiguracja „Wybierz moduł" dla panelu flotowego.
 * core=true → zawsze widoczny (nie da się ukryć, żeby user nie zgubił nawigacji).
 * Picker steruje tylko modułami opcjonalnymi (per-użytkownik, fleet_nav_preferences).
 */
export interface FleetNavItem { key: string; label: string; core: boolean }

export const FLEET_NAV_ITEMS: FleetNavItem[] = [
  { key: 'settlements', label: 'Rozliczenia', core: true },
  { key: 'fleet', label: 'Flota', core: true },
  { key: 'drivers-list', label: 'Lista kierowców', core: true },
  { key: 'documents', label: 'Dokumenty', core: true },
  { key: 'accounting', label: 'Księgowość', core: false },
  { key: 'rental-payments', label: 'Płatności', core: false },
  { key: 'wynajem', label: 'Flota & Wynajem', core: false },
  { key: 'fleet-settings', label: 'Ustawienia floty', core: false },
  { key: 'informacje', label: 'Informacje', core: false },
];

// Klucze, które picker może ukrywać (opcjonalne).
export const FLEET_OPTIONAL_KEYS = FLEET_NAV_ITEMS.filter(i => !i.core).map(i => i.key);

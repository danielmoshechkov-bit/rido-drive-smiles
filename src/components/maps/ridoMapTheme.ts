// ═══════════════════════════════════════════════════════════════
// RIDO Map Theme - Complete Brand Configuration
// Premium, portal-integrated visual identity for GetRido Maps
// ═══════════════════════════════════════════════════════════════

export type RidoMapTheme = 'light' | 'dark';

export const RIDO_THEME_KEY = 'getrido_map_theme';

// Map style URLs - CartoDB premium minimal (less POI noise, clean look)
export const RIDO_LIGHT_STYLE_URL = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';
export const RIDO_DARK_STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

// ═══════════════════════════════════════════════════════════════
// Full RIDO Color Palette (synced with portal CSS variables)
// ═══════════════════════════════════════════════════════════════

export const RIDO_THEME_COLORS = {
  // Brand Primary - Violet (--primary: 259 65% 58%)
  violetPrimary: '#7c3aed',     // Main brand violet
  violetSoft: '#8b5cf6',        // Lighter for glows
  violetDark: '#5b21b6',        // Darker for outlines
  violetMuted: '#a78bfa',       // Muted for alt routes
  
  // Brand Accent - Gold/Amber (--accent: 51 100% 50%)
  goldAccent: '#fbbf24',        // Main gold
  goldSoft: '#fcd34d',          // Lighter gold
  goldDark: '#d97706',          // Darker gold
  goldMuted: '#f59e0b',         // Muted amber
  
  // Backgrounds (portal-aligned)
  bgLight: '#F9F7FF',           // Jasny fiolet z portalu
  bgDark: '#0f0a1a',            // Ciemny z portalu
  bgCard: 'hsl(var(--card))',   // Card background
  
  // Text colors
  textLight: '#1A103D',         // Dark text on light
  textDark: '#f8fafc',          // Light text on dark
  textMuted: '#94a3b8',         // Muted text
  
  // States
  danger: '#ef4444',
  success: '#22c55e',
  warning: '#f59e0b',
  info: '#3b82f6',
};

// ═══════════════════════════════════════════════════════════════
// Map Element Paint Configurations
// ═══════════════════════════════════════════════════════════════

export const RIDO_MAP_PAINT = {
  // Main route styling
  routeMain: {
    color: RIDO_THEME_COLORS.violetPrimary,
    width: 6,
    glow: {
      color: RIDO_THEME_COLORS.violetSoft,
      width: 14,
      opacity: 0.1,
      blur: 2,
    },
    outline: {
      color: RIDO_THEME_COLORS.violetDark,
      width: 9,
      opacity: 0.25,
    },
  },
  
  // Alternative route
  routeAlt: {
    color: RIDO_THEME_COLORS.violetMuted,
    width: 4,
    dasharray: [3, 2] as [number, number],
    opacity: 0.85,
  },
  
  // Markers
  markers: {
    start: {
      fill: RIDO_THEME_COLORS.violetPrimary,
      border: RIDO_THEME_COLORS.goldAccent,
      glow: RIDO_THEME_COLORS.violetSoft,
    },
    end: {
      fill: RIDO_THEME_COLORS.goldAccent,
      border: '#ffffff',
      glow: RIDO_THEME_COLORS.goldDark,
    },
    incident: {
      fill: RIDO_THEME_COLORS.goldMuted,
      border: '#ffffff',
      glow: RIDO_THEME_COLORS.goldDark,
    },
  },
  
  // User location
  user: {
    fill: RIDO_THEME_COLORS.violetPrimary,
    border: RIDO_THEME_COLORS.goldAccent,
    pulse: RIDO_THEME_COLORS.goldSoft,
    arrow: RIDO_THEME_COLORS.violetPrimary,
  },
  
  // Fleet live drivers
  fleet: {
    active: RIDO_THEME_COLORS.violetPrimary,
    pulse: RIDO_THEME_COLORS.goldAccent,
  },
};

// ═══════════════════════════════════════════════════════════════
// Theme Getters & Setters
// ═══════════════════════════════════════════════════════════════

export const getSavedTheme = (): RidoMapTheme | null => {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(RIDO_THEME_KEY) as RidoMapTheme | null;
};

export const saveTheme = (theme: RidoMapTheme): void => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(RIDO_THEME_KEY, theme);
  }
};

export const getDefaultTheme = (): RidoMapTheme => {
  const saved = getSavedTheme();
  if (saved) return saved;
  // Auto-detect from system preference
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
};

export const getActiveStyleUrl = (theme: RidoMapTheme): string => {
  return theme === 'dark' ? RIDO_DARK_STYLE_URL : RIDO_LIGHT_STYLE_URL;
};

// ═══════════════════════════════════════════════════════════════
// Mascot Speech Messages (ludek mówi w kontekście)
// ═══════════════════════════════════════════════════════════════

export const MASCOT_MESSAGES = {
  idle: 'Gdzie jedziemy? 🚗',
  routeReady: 'Trasa gotowa! 🎉',
  routeClear: 'Droga wolna! ✨',
  hasIncidents: (count: number) => `Uważaj, ${count} ${count === 1 ? 'zdarzenie' : 'zdarzeń'} na trasie 🚧`,
  navigating: 'Prowadzę Cię! 🧭',
  gpsOff: 'Włącz GPS! 📍',
  weakSignal: 'Słaby sygnał GPS 📶',
  arrived: 'Jesteś na miejscu! 🎯',
};

// Get contextual mascot message based on app state
export const getMascotMessage = (state: {
  hasRoute: boolean;
  isNavigating: boolean;
  incidentsCount: number;
  hasGps: boolean;
  gpsAccuracy?: number;
}): string => {
  if (!state.hasGps) return MASCOT_MESSAGES.gpsOff;
  if (state.gpsAccuracy && state.gpsAccuracy > 50) return MASCOT_MESSAGES.weakSignal;
  if (state.isNavigating) return MASCOT_MESSAGES.navigating;
  if (state.hasRoute) {
    if (state.incidentsCount > 0) return MASCOT_MESSAGES.hasIncidents(state.incidentsCount);
    return MASCOT_MESSAGES.routeClear;
  }
  return MASCOT_MESSAGES.idle;
};

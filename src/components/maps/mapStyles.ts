// GetRido Maps - Map Configuration & RIDO Premium Theme

export const DEFAULT_VIEW_STATE = {
  longitude: 21.0122,
  latitude: 52.2297,
  zoom: 11.5,
};

// Map style presets (CartoDB-based for OpenStreetMap)
export const MAP_STYLES = {
  ridoLight: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',   // Jasny, spokojny
  ridoDark: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json', // Ciemny, elegancki
  voyager: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',      // Domyślny kolorowy
};

// Auto-detect preferred map style based on theme setting or system preference
export const getPreferredMapStyle = (): string => {
  const stored = getMapTheme();
  if (stored === 'dark') return MAP_STYLES.ridoDark;
  if (stored === 'light') return MAP_STYLES.ridoLight;
  // Auto-detect from system
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return MAP_STYLES.ridoDark;
  }
  return MAP_STYLES.ridoLight;
};

// Legacy export for backward compatibility
export const MAP_STYLE = MAP_STYLES.voyager;

export const TEST_MARKER = {
  longitude: 21.0122,
  latitude: 52.2297,
  title: 'Punkt testowy GetRido',
  description: 'Centrum Warszawy',
};

// ═══════════════════════════════════════════════════════════════
// RIDO Premium Map Colors (violet + gold brand identity)
// ═══════════════════════════════════════════════════════════════

export const RIDO_COLORS = {
  // Routes - Violet family
  routePrimary: '#7c3aed',      // violet-600 - main route
  routeGlow: '#8b5cf6',         // violet-500 - glow effect
  routeOutline: '#5b21b6',      // violet-800 - outline
  routeAlternative: '#a78bfa',  // violet-400 - alternative route
  
  // Markers - Gold accents
  markerGold: '#fbbf24',        // amber-400 - gold accent
  markerGoldDark: '#d97706',    // amber-600 - darker gold
  markerGoldLight: '#fcd34d',   // amber-300 - lighter gold
  markerViolet: '#7c3aed',      // violet-600 - primary marker
  
  // Incidents
  incidentAmber: '#f59e0b',     // amber-500
  incidentBorder: '#fef3c7',    // amber-100
  
  // User/Fleet Live
  userPulse: '#fbbf24',         // gold pulse
  fleetActive: '#7c3aed',       // violet
  fleetPulse: '#a78bfa',        // lighter violet pulse
};

// Theme persistence in localStorage
export type MapTheme = 'light' | 'dark';

export const getMapTheme = (): MapTheme => 
  (localStorage.getItem('getrido_map_theme') as MapTheme) || 'light';

export const setMapTheme = (theme: MapTheme): void => {
  localStorage.setItem('getrido_map_theme', theme);
};

// ═══════════════════════════════════════════════════════════════
// RIDO Mascot SVG Path Data (inline usage)
// ═══════════════════════════════════════════════════════════════

export const RIDO_MASCOT_PATHS = {
  // Main head circle
  head: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z',
  // Left eye
  eyeLeft: 'M8 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  // Right eye  
  eyeRight: 'M16 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  // Smile
  smile: 'M7 13q5 4 10 0',
  // Left horn/ear
  hornLeft: 'M4 4l3 5-2-1Z',
  // Right horn/ear
  hornRight: 'M20 4l-3 5 2-1Z',
};

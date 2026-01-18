// GetRido Maps - Konfiguracja stylów mapy
// Ten plik zawiera wszystkie ustawienia mapy dla łatwej modyfikacji

// Domyślne centrum mapy - Warszawa
export const DEFAULT_VIEW_STATE = {
  longitude: 21.0122,
  latitude: 52.2297,
  zoom: 11.5,
};

// Główny styl mapy (CartoDB Voyager - nowoczesny, jasny, czytelny)
export const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

// Alternatywne style do przyszłego użycia
export const MAP_STYLES = {
  // Jasne, nowoczesne style
  voyager: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  positron: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  
  // Ciemny styl (dla trybu nocnego)
  darkMatter: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  
  // OpenFreeMap style
  liberty: 'https://tiles.openfreemap.org/styles/liberty',
  bright: 'https://tiles.openfreemap.org/styles/bright',
} as const;

// Testowy marker - centrum Warszawy
export const TEST_MARKER = {
  longitude: 21.0122,
  latitude: 52.2297,
  title: 'Punkt testowy GetRido',
  description: 'Centrum Warszawy',
};

// Limity mapy (opcjonalne, do przyszłego użycia)
export const MAP_BOUNDS = {
  minZoom: 5,
  maxZoom: 18,
};

// Kolory dla przyszłych warstw (ruch, trasy)
export const MAP_COLORS = {
  route: {
    primary: '#7c3aed', // primary purple
    alternative: '#94a3b8', // slate-400
  },
  traffic: {
    smooth: '#22c55e', // green-500
    slow: '#eab308', // yellow-500
    jam: '#ef4444', // red-500
  },
  markers: {
    default: '#7c3aed',
    active: '#f59e0b', // amber-500
    event: '#ef4444',
  },
};

// ═══════════════════════════════════════════════════════════════
// GetRido Maps - Cyberpunk Night Style for Premium 3D Navigation
// Dark futuristic theme with neon accents inspired by Yandex/Tesla
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// Color Palette - Cyberpunk Night (Dark Blue/Violet/Neon)
// ═══════════════════════════════════════════════════════════════

export const CYBERPUNK_COLORS = {
  // Background - very dark navy
  land: '#0a0a1a',
  landAlt: '#0d0d22',
  
  // Water - deep dark blue
  water: '#0f1d3a',
  waterGlow: 'rgba(0, 150, 255, 0.15)',
  
  // Buildings - semi-transparent dark blue (glass effect)
  building: 'rgba(30, 50, 100, 0.65)',
  buildingBase: 'rgba(20, 35, 70, 0.8)',
  buildingHighlight: 'rgba(60, 100, 180, 0.4)',
  
  // Roads - dark with subtle hierarchy
  motorway: '#3a4a6a',
  motorwayOutline: '#2a3a5a',
  primary: '#2d3d5d',
  primaryOutline: '#1d2d4d',
  secondary: '#252a40',
  secondaryOutline: '#1a2035',
  tertiary: '#1f2438',
  tertiaryOutline: '#151a2a',
  residential: '#181c2a',
  residentialOutline: '#12151f',
  
  // Parks/Green - muted dark green
  park: '#0d2a1a',
  forest: '#0a2015',
  
  // Neon accents
  neonCyan: '#00e5ff',
  neonBlue: '#00b4ff',
  neonViolet: '#a855f7',
  neonPink: '#f472b6',
  
  // Text
  text: '#e0e0e0',
  textSecondary: '#8090a0',
  textHalo: 'rgba(10, 10, 26, 0.9)',
};

// ═══════════════════════════════════════════════════════════════
// 3D Building Configuration
// ═══════════════════════════════════════════════════════════════

export const BUILDING_3D_CONFIG = {
  // Min/max heights
  minHeight: 0,
  defaultHeight: 12,
  maxHeight: 200,
  
  // Visual settings
  opacity: 0.65,
  color: CYBERPUNK_COLORS.building,
  baseColor: CYBERPUNK_COLORS.buildingBase,
  
  // Lighting
  lightIntensity: 0.4,
  lightColor: '#ffffff',
  ambientRatio: 0.6,
};

// ═══════════════════════════════════════════════════════════════
// Premium Neon Route Styling (Glow Effect)
// ═══════════════════════════════════════════════════════════════

export const NEON_ROUTE_STYLE = {
  // Outer glow layer (widest, most blur)
  outerGlow: {
    color: 'rgba(0, 229, 255, 0.25)',
    width: 28,
    blur: 16,
  },
  
  // Middle glow layer
  middleGlow: {
    color: 'rgba(0, 180, 255, 0.45)',
    width: 16,
    blur: 6,
  },
  
  // Inner glow layer
  innerGlow: {
    color: 'rgba(100, 220, 255, 0.7)',
    width: 10,
    blur: 2,
  },
  
  // Core line (bright center)
  core: {
    color: '#ffffff',
    width: 4,
  },
  
  // Alternative route (dimmer)
  alternative: {
    color: 'rgba(168, 85, 247, 0.5)',
    width: 6,
    dasharray: [3, 2],
  },
};

// ═══════════════════════════════════════════════════════════════
// Premium 3D Navigation Camera Settings
// ═══════════════════════════════════════════════════════════════

export const PREMIUM_3D_CAMERA = {
  // Navigation mode
  navigation: {
    pitch: 75,     // High pitch for "behind car" view
    zoom: 19,      // Close zoom
    bearing: 0,    // Will be set by GPS heading
  },
  
  // Animation settings
  flyTo: {
    duration: 1500,
    easing: (t: number) => 1 - Math.pow(1 - t, 4), // ease-out quart
  },
  
  // Camera offset behind user (meters)
  behindOffset: 30,
};

// ═══════════════════════════════════════════════════════════════
// HUD Styling for Cyberpunk Theme
// ═══════════════════════════════════════════════════════════════

export const CYBERPUNK_HUD = {
  // Panel background
  panelBg: 'rgba(10, 15, 35, 0.92)',
  panelBorder: 'rgba(0, 180, 255, 0.25)',
  panelGlow: '0 0 30px rgba(0, 180, 255, 0.15)',
  
  // Text colors
  primaryText: '#ffffff',
  secondaryText: '#8090a0',
  accentText: '#00e5ff',
  
  // Speed colors
  speedNormal: '#00e5ff',
  speedWarning: '#f59e0b',
  speedDanger: '#ef4444',
  
  // Icons
  iconGlow: '0 0 8px rgba(0, 229, 255, 0.6)',
};

// ═══════════════════════════════════════════════════════════════
// MapLibre 3D Buildings Layer Spec
// ═══════════════════════════════════════════════════════════════

export const create3DBuildingsLayer = () => ({
  id: 'rido-3d-buildings',
  type: 'fill-extrusion' as const,
  source: 'openmaptiles',
  'source-layer': 'building',
  minzoom: 14,
  paint: {
    'fill-extrusion-color': CYBERPUNK_COLORS.building,
    'fill-extrusion-height': [
      'interpolate',
      ['linear'],
      ['zoom'],
      14, 0,
      15, ['coalesce', ['get', 'render_height'], BUILDING_3D_CONFIG.defaultHeight],
    ],
    'fill-extrusion-base': [
      'interpolate',
      ['linear'],
      ['zoom'],
      14, 0,
      15, ['coalesce', ['get', 'render_min_height'], 0],
    ],
    'fill-extrusion-opacity': [
      'interpolate',
      ['linear'],
      ['zoom'],
      14, 0,
      15, 0.5,
      18, BUILDING_3D_CONFIG.opacity,
    ],
  },
});

// ═══════════════════════════════════════════════════════════════
// Apply Cyberpunk Style Transformations
// ═══════════════════════════════════════════════════════════════

export const applyCyberpunkTheme = (map: any) => {
  if (!map) return;
  
  const style = map.getStyle();
  if (!style?.layers) return;
  
  try {
    // Background
    if (map.getLayer('background')) {
      map.setPaintProperty('background', 'background-color', CYBERPUNK_COLORS.land);
    }
    
    // Water
    ['water', 'waterway'].forEach(layerId => {
      if (map.getLayer(layerId)) {
        try {
          map.setPaintProperty(layerId, 'fill-color', CYBERPUNK_COLORS.water);
        } catch {}
      }
    });
    
    // Buildings (2D fallback) - will be replaced by 3D
    ['building', 'building-top'].forEach(layerId => {
      if (map.getLayer(layerId)) {
        try {
          map.setPaintProperty(layerId, 'fill-color', CYBERPUNK_COLORS.buildingBase);
          map.setPaintProperty(layerId, 'fill-opacity', 0.4);
        } catch {}
      }
    });
    
    // Roads - dark hierarchy
    style.layers.forEach(layer => {
      const id = layer.id.toLowerCase();
      
      if (layer.type === 'line') {
        try {
          if (id.includes('motorway') || id.includes('highway') || id.includes('trunk')) {
            map.setPaintProperty(layer.id, 'line-color', 
              id.includes('casing') ? CYBERPUNK_COLORS.motorwayOutline : CYBERPUNK_COLORS.motorway);
          } else if (id.includes('primary')) {
            map.setPaintProperty(layer.id, 'line-color',
              id.includes('casing') ? CYBERPUNK_COLORS.primaryOutline : CYBERPUNK_COLORS.primary);
          } else if (id.includes('secondary')) {
            map.setPaintProperty(layer.id, 'line-color',
              id.includes('casing') ? CYBERPUNK_COLORS.secondaryOutline : CYBERPUNK_COLORS.secondary);
          } else if (id.includes('tertiary') || id.includes('residential') || id.includes('street')) {
            map.setPaintProperty(layer.id, 'line-color',
              id.includes('casing') ? CYBERPUNK_COLORS.tertiaryOutline : CYBERPUNK_COLORS.tertiary);
          }
        } catch {}
      }
    });
    
    // Parks
    ['landuse_park', 'park', 'landuse-park', 'landcover_grass'].forEach(layerId => {
      if (map.getLayer(layerId)) {
        try {
          map.setPaintProperty(layerId, 'fill-color', CYBERPUNK_COLORS.park);
          map.setPaintProperty(layerId, 'fill-opacity', 0.4);
        } catch {}
      }
    });
    
    // Labels - bright on dark
    style.layers.filter(l => l.type === 'symbol').forEach(layer => {
      try {
        map.setPaintProperty(layer.id, 'text-color', CYBERPUNK_COLORS.text);
        map.setPaintProperty(layer.id, 'text-halo-color', CYBERPUNK_COLORS.textHalo);
        map.setPaintProperty(layer.id, 'text-halo-width', 2);
      } catch {}
    });
    
    console.log('[CyberpunkStyle] Applied successfully');
  } catch (e) {
    console.warn('[CyberpunkStyle] Error applying theme:', e);
  }
};

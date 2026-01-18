// ═══════════════════════════════════════════════════════════════
// GetRido Maps - Clean Map Style for Driving Navigation
// Minimalist, Google-like style with hidden pedestrian elements
// ═══════════════════════════════════════════════════════════════

import type { StyleSpecification, LayerSpecification } from 'maplibre-gl';

// ═══════════════════════════════════════════════════════════════
// Color Palette - Premium, Clean, Easy on Eyes
// ═══════════════════════════════════════════════════════════════

export const RIDO_CLEAN_COLORS = {
  // Background
  land: {
    light: '#f8f9fa',
    dark: '#1a1a2e',
  },
  water: {
    light: '#aad3df',
    dark: '#193c4a',
  },
  
  // Roads - hierarchical contrast
  motorway: {
    light: '#fee090',
    lightOutline: '#dda547',
    dark: '#b5884c',
    darkOutline: '#8a6a3a',
  },
  primary: {
    light: '#fef3cd',
    lightOutline: '#e0c97a',
    dark: '#7d6b42',
    darkOutline: '#5a4d30',
  },
  secondary: {
    light: '#ffffff',
    lightOutline: '#e0e0e0',
    dark: '#404052',
    darkOutline: '#2d2d3d',
  },
  tertiary: {
    light: '#ffffff',
    lightOutline: '#e8e8e8',
    dark: '#353545',
    darkOutline: '#252535',
  },
  residential: {
    light: '#ffffff',
    lightOutline: '#f0f0f0',
    dark: '#2a2a3a',
    darkOutline: '#202030',
  },
  
  // Buildings - subtle
  building: {
    light: '#e8e4e0',
    lightOutline: '#d8d4d0',
    dark: '#252535',
    darkOutline: '#1f1f2f',
  },
  
  // Green areas
  park: {
    light: '#c8e6c9',
    dark: '#1e3d26',
  },
  forest: {
    light: '#a5d6a7',
    dark: '#1a3320',
  },
  
  // Labels
  text: {
    light: '#333333',
    dark: '#e0e0e0',
  },
  textSecondary: {
    light: '#666666',
    dark: '#a0a0a0',
  },
  textHalo: {
    light: '#ffffff',
    dark: '#1a1a2e',
  },
};

// ═══════════════════════════════════════════════════════════════
// Layer Visibility Configuration for Driving Mode
// ═══════════════════════════════════════════════════════════════

// Layers to HIDE when in driving mode (pedestrian/cycling paths, etc.)
export const DRIVING_MODE_HIDDEN_LAYERS = [
  'path',
  'path-fill',
  'footway',
  'cycleway',
  'pedestrian',
  'steps',
  'path-outline',
  'footway-outline',
  'pedestrian-area',
  'pedestrian-fill',
  'pedestrian-outline',
  'pathway',
  'track',
  'bridleway',
];

// Layers to show with reduced opacity when driving
export const DRIVING_MODE_DIMMED_LAYERS = [
  'poi-label',
  'place-other',
  'landuse-label',
];

// ═══════════════════════════════════════════════════════════════
// Style Transformations for Clean Driving View
// ═══════════════════════════════════════════════════════════════

/**
 * Apply clean driving style transformations to a base style
 * Hides pedestrian paths, simplifies POI, and creates cleaner roads
 */
export const applyCleanDrivingStyle = (
  style: StyleSpecification, 
  theme: 'light' | 'dark'
): StyleSpecification => {
  if (!style.layers) return style;

  const colors = {
    land: RIDO_CLEAN_COLORS.land[theme],
    water: RIDO_CLEAN_COLORS.water[theme],
    motorway: RIDO_CLEAN_COLORS.motorway[theme],
    motorwayOutline: RIDO_CLEAN_COLORS.motorway[theme === 'light' ? 'lightOutline' : 'darkOutline'],
    primary: RIDO_CLEAN_COLORS.primary[theme],
    primaryOutline: RIDO_CLEAN_COLORS.primary[theme === 'light' ? 'lightOutline' : 'darkOutline'],
    secondary: RIDO_CLEAN_COLORS.secondary[theme],
    secondaryOutline: RIDO_CLEAN_COLORS.secondary[theme === 'light' ? 'lightOutline' : 'darkOutline'],
    tertiary: RIDO_CLEAN_COLORS.tertiary[theme],
    tertiaryOutline: RIDO_CLEAN_COLORS.tertiary[theme === 'light' ? 'lightOutline' : 'darkOutline'],
    residential: RIDO_CLEAN_COLORS.residential[theme],
    residentialOutline: RIDO_CLEAN_COLORS.residential[theme === 'light' ? 'lightOutline' : 'darkOutline'],
    building: RIDO_CLEAN_COLORS.building[theme],
    buildingOutline: RIDO_CLEAN_COLORS.building[theme === 'light' ? 'lightOutline' : 'darkOutline'],
    park: RIDO_CLEAN_COLORS.park[theme],
    forest: RIDO_CLEAN_COLORS.forest[theme],
    text: RIDO_CLEAN_COLORS.text[theme],
    textSecondary: RIDO_CLEAN_COLORS.textSecondary[theme],
    textHalo: RIDO_CLEAN_COLORS.textHalo[theme],
  };

  const transformedLayers = style.layers.map((layer: LayerSpecification) => {
    const layerId = layer.id.toLowerCase();
    
    // Hide pedestrian-only layers completely
    if (DRIVING_MODE_HIDDEN_LAYERS.some(hiddenId => layerId.includes(hiddenId))) {
      return {
        ...layer,
        layout: {
          ...(layer as any).layout,
          visibility: 'none',
        },
      };
    }

    // Dim POI labels
    if (DRIVING_MODE_DIMMED_LAYERS.some(dimId => layerId.includes(dimId))) {
      if (layer.type === 'symbol') {
        return {
          ...layer,
          paint: {
            ...(layer as any).paint,
            'text-opacity': 0.5,
            'icon-opacity': 0.5,
          },
        };
      }
    }

    // Style roads with clean colors
    if (layer.type === 'line') {
      // Motorway
      if (layerId.includes('motorway') || layerId.includes('highway')) {
        return {
          ...layer,
          paint: {
            ...(layer as any).paint,
            'line-color': layerId.includes('casing') || layerId.includes('outline') 
              ? colors.motorwayOutline 
              : colors.motorway,
          },
        };
      }
      // Primary roads
      if (layerId.includes('primary') || layerId.includes('trunk')) {
        return {
          ...layer,
          paint: {
            ...(layer as any).paint,
            'line-color': layerId.includes('casing') || layerId.includes('outline')
              ? colors.primaryOutline
              : colors.primary,
          },
        };
      }
      // Secondary roads
      if (layerId.includes('secondary')) {
        return {
          ...layer,
          paint: {
            ...(layer as any).paint,
            'line-color': layerId.includes('casing') || layerId.includes('outline')
              ? colors.secondaryOutline
              : colors.secondary,
          },
        };
      }
      // Tertiary roads
      if (layerId.includes('tertiary')) {
        return {
          ...layer,
          paint: {
            ...(layer as any).paint,
            'line-color': layerId.includes('casing') || layerId.includes('outline')
              ? colors.tertiaryOutline
              : colors.tertiary,
          },
        };
      }
      // Residential/local roads
      if (layerId.includes('residential') || layerId.includes('minor') || layerId.includes('street')) {
        return {
          ...layer,
          paint: {
            ...(layer as any).paint,
            'line-color': layerId.includes('casing') || layerId.includes('outline')
              ? colors.residentialOutline
              : colors.residential,
          },
        };
      }
    }

    // Style fill layers (land, buildings, parks)
    if (layer.type === 'fill') {
      if (layerId.includes('background') || layerId.includes('land')) {
        return {
          ...layer,
          paint: {
            ...(layer as any).paint,
            'fill-color': colors.land,
          },
        };
      }
      if (layerId.includes('water')) {
        return {
          ...layer,
          paint: {
            ...(layer as any).paint,
            'fill-color': colors.water,
          },
        };
      }
      if (layerId.includes('building')) {
        return {
          ...layer,
          paint: {
            ...(layer as any).paint,
            'fill-color': colors.building,
            'fill-outline-color': colors.buildingOutline,
            'fill-opacity': 0.7,
          },
        };
      }
      if (layerId.includes('park') || layerId.includes('grass')) {
        return {
          ...layer,
          paint: {
            ...(layer as any).paint,
            'fill-color': colors.park,
            'fill-opacity': 0.6,
          },
        };
      }
      if (layerId.includes('forest') || layerId.includes('wood')) {
        return {
          ...layer,
          paint: {
            ...(layer as any).paint,
            'fill-color': colors.forest,
            'fill-opacity': 0.5,
          },
        };
      }
    }

    // Style text labels
    if (layer.type === 'symbol') {
      const isMainLabel = layerId.includes('place') || layerId.includes('city') || layerId.includes('town');
      return {
        ...layer,
        paint: {
          ...(layer as any).paint,
          'text-color': isMainLabel ? colors.text : colors.textSecondary,
          'text-halo-color': colors.textHalo,
          'text-halo-width': 1.5,
        },
      };
    }

    return layer;
  });

  return {
    ...style,
    layers: transformedLayers,
  };
};

// ═══════════════════════════════════════════════════════════════
// Premium Navigation Route Styling
// ═══════════════════════════════════════════════════════════════

export const RIDO_ROUTE_STYLE = {
  // Main route - Google-like blue with depth
  main: {
    color: '#4285F4', // Google blue - proven readability
    width: 7,
    outlineColor: '#1a73e8',
    outlineWidth: 10,
    glowColor: 'rgba(66, 133, 244, 0.3)',
    glowWidth: 18,
  },
  // Alternative routes
  alt: {
    color: '#9aa0a6',
    width: 5,
    opacity: 0.7,
  },
  // Walked/driven portion
  passed: {
    color: '#5f6368',
    width: 5,
    opacity: 0.5,
  },
};

// ═══════════════════════════════════════════════════════════════
// Clean Marker Styles
// ═══════════════════════════════════════════════════════════════

export const RIDO_MARKER_STYLE = {
  // Start marker (user location or custom start)
  start: {
    outerRing: '#4285F4',
    innerFill: '#ffffff',
    outerSize: 24,
    innerSize: 10,
    shadow: '0 2px 6px rgba(0,0,0,0.3)',
  },
  // Destination marker
  destination: {
    fill: '#ea4335', // Google red
    stroke: '#ffffff',
    size: 32,
    shadow: '0 2px 8px rgba(234,67,53,0.4)',
  },
  // POI marker
  poi: {
    fill: '#ffffff',
    stroke: '#5f6368',
    size: 24,
    shadow: '0 1px 4px rgba(0,0,0,0.2)',
  },
  // Incident marker
  incident: {
    fill: '#fbbc04', // Google yellow
    stroke: '#ffffff',
    size: 28,
    shadow: '0 2px 6px rgba(251,188,4,0.4)',
  },
};

// ═══════════════════════════════════════════════════════════════
// Animation Timing Constants
// ═══════════════════════════════════════════════════════════════

export const MAP_ANIMATION = {
  // Camera movements
  flyTo: {
    duration: 1200,
    easing: (t: number) => 1 - Math.pow(1 - t, 3), // ease-out cubic
  },
  navStart: {
    duration: 1500,
    zoom: 17,
    pitch: 50,
    easing: (t: number) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, // ease-in-out cubic
  },
  recenter: {
    duration: 600,
    easing: (t: number) => 1 - Math.pow(1 - t, 2), // ease-out quad
  },
  // UI elements
  cardAppear: 300,
  markerPulse: 2000,
};

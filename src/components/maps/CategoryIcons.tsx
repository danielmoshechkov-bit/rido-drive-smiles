// GetRido Maps - Premium 3D Category Icons (iOS/Yandex style)
// Modern filled SVG icons with 3D gradients, highlights, and shadows

import React from 'react';

// ═══════════════════════════════════════════════════════════════
// Premium 3D Icons - Yandex/iOS Style with depth and highlights
// ═══════════════════════════════════════════════════════════════

export const FoodIcon = () => (
  <svg viewBox="0 0 32 32" width={22} height={22}>
    <defs>
      <linearGradient id="food3d" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FF8A50"/>
        <stop offset="50%" stopColor="#FF6B35"/>
        <stop offset="100%" stopColor="#E54B1F"/>
      </linearGradient>
      <linearGradient id="foodHighlight" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.5"/>
        <stop offset="30%" stopColor="#ffffff" stopOpacity="0"/>
      </linearGradient>
    </defs>
    {/* Fork & knife */}
    <path d="M12 4v8c0 1.5-1 2.5-2.5 2.5v12h-3v-12C5 14.5 4 13.5 4 12V4h2v7h2V4h2v7h2V4h2z" fill="url(#food3d)"/>
    <path d="M22 4c0 0-4 3-4 8v3h4v11h4V4h-4z" fill="url(#food3d)"/>
    {/* Highlight overlay */}
    <rect x="4" y="4" width="22" height="10" fill="url(#foodHighlight)" rx="2"/>
  </svg>
);

export const ShopIcon = () => (
  <svg viewBox="0 0 32 32" width={22} height={22}>
    <defs>
      <linearGradient id="shop3d" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#64D2FF"/>
        <stop offset="50%" stopColor="#4FC3F7"/>
        <stop offset="100%" stopColor="#2196F3"/>
      </linearGradient>
    </defs>
    {/* Shopping cart */}
    <path d="M10 28c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM24 28c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" fill="url(#shop3d)"/>
    <path d="M4 4h4l4.5 12h11l3.5-8H10" fill="none" stroke="url(#shop3d)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M8.5 16h13c1 0 2-.6 2.3-1.5L28 6H8" fill="url(#shop3d)" opacity="0.3"/>
    {/* Cart body filled */}
    <path d="M7 6l2 10h14l3-8H8" fill="url(#shop3d)"/>
    {/* Highlight */}
    <path d="M9 7l1 6h10" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

export const PharmacyIcon = () => (
  <svg viewBox="0 0 32 32" width={22} height={22}>
    <defs>
      <linearGradient id="pharmacy3d" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#81E06D"/>
        <stop offset="50%" stopColor="#66BB6A"/>
        <stop offset="100%" stopColor="#43A047"/>
      </linearGradient>
    </defs>
    {/* Rounded square with cross */}
    <rect x="4" y="4" width="24" height="24" rx="6" fill="url(#pharmacy3d)"/>
    {/* White cross */}
    <path d="M14 10h4v4h4v4h-4v4h-4v-4h-4v-4h4v-4z" fill="white"/>
    {/* 3D highlight */}
    <path d="M6 6h20c1 0 2 1 2 2v8" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

export const BeautyIcon = () => (
  <svg viewBox="0 0 32 32" width={22} height={22}>
    <defs>
      <linearGradient id="beauty3d" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FF8ED4"/>
        <stop offset="50%" stopColor="#F06292"/>
        <stop offset="100%" stopColor="#D81B60"/>
      </linearGradient>
    </defs>
    {/* Sparkle/star beauty icon */}
    <path d="M16 2l2 6h6l-5 4 2 6-5-4-5 4 2-6-5-4h6z" fill="url(#beauty3d)"/>
    <circle cx="16" cy="22" r="6" fill="url(#beauty3d)"/>
    <circle cx="16" cy="22" r="3" fill="white" opacity="0.5"/>
    {/* Highlight */}
    <path d="M14 4l1 4" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

export const AtmIcon = () => (
  <svg viewBox="0 0 32 32" width={22} height={22}>
    <defs>
      <linearGradient id="atm3d" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#A5E072"/>
        <stop offset="50%" stopColor="#81C784"/>
        <stop offset="100%" stopColor="#4CAF50"/>
      </linearGradient>
    </defs>
    {/* Card shape */}
    <rect x="3" y="8" width="26" height="16" rx="3" fill="url(#atm3d)"/>
    {/* Magnetic strip */}
    <rect x="3" y="12" width="26" height="4" fill="rgba(0,0,0,0.2)"/>
    {/* Chip */}
    <rect x="6" y="18" width="6" height="4" rx="1" fill="#FFD700"/>
    {/* Dollar sign */}
    <text x="22" y="21" fill="white" fontSize="8" fontWeight="bold" fontFamily="system-ui">$</text>
    {/* Highlight */}
    <path d="M5 10h22" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

export const FuelIcon = () => (
  <svg viewBox="0 0 32 32" width={22} height={22}>
    <defs>
      <linearGradient id="fuel3d" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FFE082"/>
        <stop offset="50%" stopColor="#FFD54F"/>
        <stop offset="100%" stopColor="#FF9800"/>
      </linearGradient>
      <linearGradient id="fuelNozzle" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#78909C"/>
        <stop offset="100%" stopColor="#455A64"/>
      </linearGradient>
    </defs>
    {/* Pump body */}
    <rect x="6" y="6" width="14" height="22" rx="2" fill="url(#fuel3d)"/>
    {/* Display screen */}
    <rect x="8" y="8" width="10" height="6" rx="1" fill="white" opacity="0.9"/>
    {/* Numbers on screen */}
    <text x="13" y="13" textAnchor="middle" fill="#333" fontSize="5" fontWeight="bold" fontFamily="monospace">7.89</text>
    {/* Nozzle */}
    <path d="M20 10h4c2 0 3 1 3 3v8c0 1-.5 2-1.5 2s-1.5-1-1.5-2v-6h-1v10" fill="none" stroke="url(#fuelNozzle)" strokeWidth="2.5" strokeLinecap="round"/>
    {/* Hose */}
    <path d="M24 17c0 3-1 4-4 4" fill="none" stroke="url(#fuelNozzle)" strokeWidth="2" strokeLinecap="round"/>
    {/* Highlight */}
    <path d="M8 8v4" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

export const HospitalIcon = () => (
  <svg viewBox="0 0 32 32" width={22} height={22}>
    <defs>
      <linearGradient id="hospital3d" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FF7070"/>
        <stop offset="50%" stopColor="#EF5350"/>
        <stop offset="100%" stopColor="#D32F2F"/>
      </linearGradient>
    </defs>
    {/* Building */}
    <rect x="4" y="4" width="24" height="24" rx="4" fill="url(#hospital3d)"/>
    {/* White H */}
    <path d="M11 9v14M21 9v14M11 16h10" stroke="white" strokeWidth="3" strokeLinecap="round"/>
    {/* 3D highlight */}
    <path d="M6 6c0-1 1-2 2-2h16c1 0 2 1 2 2" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2"/>
  </svg>
);

export const HotelIcon = () => (
  <svg viewBox="0 0 32 32" width={22} height={22}>
    <defs>
      <linearGradient id="hotel3d" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#9FA8DA"/>
        <stop offset="50%" stopColor="#7986CB"/>
        <stop offset="100%" stopColor="#5C6BC0"/>
      </linearGradient>
    </defs>
    {/* Bed frame */}
    <rect x="4" y="14" width="24" height="10" rx="2" fill="url(#hotel3d)"/>
    {/* Pillow */}
    <ellipse cx="10" cy="14" rx="4" ry="3" fill="white" opacity="0.9"/>
    {/* Person sleeping */}
    <circle cx="10" cy="11" r="4" fill="url(#hotel3d)"/>
    {/* Blanket highlight */}
    <path d="M6 16h20" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round"/>
    {/* Legs */}
    <rect x="4" y="24" width="3" height="4" rx="1" fill="url(#hotel3d)"/>
    <rect x="25" y="24" width="3" height="4" rx="1" fill="url(#hotel3d)"/>
  </svg>
);

export const WifiIcon = () => (
  <svg viewBox="0 0 32 32" width={22} height={22}>
    <defs>
      <linearGradient id="wifi3d" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#80DEEA"/>
        <stop offset="50%" stopColor="#4DD0E1"/>
        <stop offset="100%" stopColor="#00ACC1"/>
      </linearGradient>
    </defs>
    {/* WiFi arcs */}
    <path d="M16 26a2 2 0 100-4 2 2 0 000 4z" fill="url(#wifi3d)"/>
    <path d="M8 18c4.4-4.4 11.6-4.4 16 0" fill="none" stroke="url(#wifi3d)" strokeWidth="3" strokeLinecap="round"/>
    <path d="M4 14c6.6-6.6 17.4-6.6 24 0" fill="none" stroke="url(#wifi3d)" strokeWidth="3" strokeLinecap="round"/>
    <path d="M0 10c8.8-8.8 23.2-8.8 32 0" fill="none" stroke="url(#wifi3d)" strokeWidth="3" strokeLinecap="round"/>
    {/* Highlight on center dot */}
    <circle cx="15" cy="23" r="1" fill="white" opacity="0.6"/>
  </svg>
);

export const BarIcon = () => (
  <svg viewBox="0 0 32 32" width={22} height={22}>
    <defs>
      <linearGradient id="bar3d" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FFEE58"/>
        <stop offset="50%" stopColor="#FFCA28"/>
        <stop offset="100%" stopColor="#FFA000"/>
      </linearGradient>
      <linearGradient id="beer3d" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#FFFDE7"/>
        <stop offset="100%" stopColor="#FFECB3"/>
      </linearGradient>
    </defs>
    {/* Beer mug */}
    <rect x="6" y="8" width="16" height="20" rx="3" fill="url(#bar3d)"/>
    {/* Beer inside */}
    <rect x="8" y="12" width="12" height="14" rx="2" fill="url(#beer3d)"/>
    {/* Foam */}
    <ellipse cx="14" cy="12" rx="6" ry="2" fill="white"/>
    <ellipse cx="11" cy="10" rx="2" ry="1.5" fill="white"/>
    <ellipse cx="17" cy="10" rx="2" ry="1.5" fill="white"/>
    {/* Handle */}
    <path d="M22 12h3c2 0 3 2 3 4v4c0 2-1 4-3 4h-3" fill="none" stroke="url(#bar3d)" strokeWidth="3" strokeLinecap="round"/>
    {/* Bubbles */}
    <circle cx="11" cy="18" r="1" fill="white" opacity="0.6"/>
    <circle cx="15" cy="22" r="1" fill="white" opacity="0.6"/>
  </svg>
);

export const MallIcon = () => (
  <svg viewBox="0 0 32 32" width={22} height={22}>
    <defs>
      <linearGradient id="mall3d" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#CE93D8"/>
        <stop offset="50%" stopColor="#AB47BC"/>
        <stop offset="100%" stopColor="#8E24AA"/>
      </linearGradient>
    </defs>
    {/* Shopping bag */}
    <path d="M8 10h16c1 0 2 1 2 2v14c0 1-1 2-2 2H8c-1 0-2-1-2-2V12c0-1 1-2 2-2z" fill="url(#mall3d)"/>
    {/* Handles */}
    <path d="M12 10V8c0-2 2-4 4-4s4 2 4 4v2" fill="none" stroke="url(#mall3d)" strokeWidth="2.5" strokeLinecap="round"/>
    {/* Sparkle/star on bag */}
    <path d="M16 16l1 2 2 0.5-1.5 1.5 0.5 2-2-1-2 1 0.5-2-1.5-1.5 2-0.5z" fill="white" opacity="0.8"/>
    {/* 3D highlight */}
    <path d="M8 12h16" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

export const CinemaIcon = () => (
  <svg viewBox="0 0 32 32" width={22} height={22}>
    <defs>
      <linearGradient id="cinema3d" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#F48FB1"/>
        <stop offset="50%" stopColor="#EC407A"/>
        <stop offset="100%" stopColor="#C2185B"/>
      </linearGradient>
    </defs>
    {/* Film reel / clapperboard */}
    <rect x="4" y="4" width="24" height="24" rx="3" fill="url(#cinema3d)"/>
    {/* Stripes on clapperboard */}
    <path d="M4 8l24 0M8 4l-4 4M14 4l-4 4M20 4l-4 4M26 4l-4 4" stroke="white" strokeWidth="2"/>
    {/* Screen area */}
    <rect x="6" y="12" width="20" height="14" rx="2" fill="white" opacity="0.9"/>
    {/* Play button */}
    <path d="M14 16l6 3-6 3z" fill="url(#cinema3d)"/>
  </svg>
);

export const ParkingIcon = () => (
  <svg viewBox="0 0 32 32" width={22} height={22}>
    <defs>
      <linearGradient id="parking3d" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#64B5F6"/>
        <stop offset="50%" stopColor="#42A5F5"/>
        <stop offset="100%" stopColor="#1E88E5"/>
      </linearGradient>
    </defs>
    {/* Blue circle background */}
    <circle cx="16" cy="16" r="14" fill="url(#parking3d)"/>
    {/* White P */}
    <text x="16" y="22" textAnchor="middle" fill="white" fontSize="18" fontWeight="bold" fontFamily="system-ui">P</text>
    {/* 3D arc highlight */}
    <path d="M6 10c2-4 6-6 10-6s8 2 10 6" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

export const CarWashIcon = () => (
  <svg viewBox="0 0 32 32" width={22} height={22}>
    <defs>
      <linearGradient id="carwash3d" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#81D4FA"/>
        <stop offset="50%" stopColor="#29B6F6"/>
        <stop offset="100%" stopColor="#0288D1"/>
      </linearGradient>
    </defs>
    {/* Water droplets */}
    <path d="M8 6c0 2-2 4-2 4s-2-2-2-4a2 2 0 114 0z" fill="url(#carwash3d)"/>
    <path d="M18 6c0 2-2 4-2 4s-2-2-2-4a2 2 0 114 0z" fill="url(#carwash3d)"/>
    <path d="M28 6c0 2-2 4-2 4s-2-2-2-4a2 2 0 114 0z" fill="url(#carwash3d)"/>
    {/* Car body */}
    <path d="M6 18l2-4h16l2 4v6c0 1-.5 2-1.5 2h-1c-1 0-1.5-1-1.5-2h-12c0 1-.5 2-1.5 2h-1c-1 0-1.5-1-1.5-2v-6z" fill="url(#carwash3d)"/>
    {/* Windows */}
    <path d="M8 14l1.5-3h13l1.5 3" fill="none" stroke="white" strokeWidth="1.5" strokeLinejoin="round"/>
    {/* Wheels */}
    <circle cx="10" cy="22" r="2" fill="#333"/>
    <circle cx="22" cy="22" r="2" fill="#333"/>
    {/* Highlight */}
    <path d="M8 16h16" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

export const ServiceIcon = () => (
  <svg viewBox="0 0 32 32" width={22} height={22}>
    <defs>
      <linearGradient id="service3d" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#A0ADB8"/>
        <stop offset="50%" stopColor="#78909C"/>
        <stop offset="100%" stopColor="#546E7A"/>
      </linearGradient>
    </defs>
    {/* Wrench */}
    <path d="M6 26l8-8c-1-3 0-6 3-8 2-2 5-2 7-1l-4 4 1 3 3 1 4-4c1 2 1 5-1 7-2 3-5 4-8 3l-8 8c-1 1-2 1-3 0l-2-2c-1-1-1-2 0-3z" fill="url(#service3d)"/>
    {/* Highlight */}
    <path d="M8 24l6-6" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round"/>
    {/* Gear teeth indication */}
    <circle cx="19" cy="13" r="2" fill="white" opacity="0.5"/>
  </svg>
);

export const FitnessIcon = () => (
  <svg viewBox="0 0 32 32" width={22} height={22}>
    <defs>
      <linearGradient id="fitness3d" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#B39DDB"/>
        <stop offset="50%" stopColor="#9575CD"/>
        <stop offset="100%" stopColor="#7E57C2"/>
      </linearGradient>
    </defs>
    {/* Dumbbell */}
    <rect x="4" y="12" width="6" height="8" rx="1" fill="url(#fitness3d)"/>
    <rect x="22" y="12" width="6" height="8" rx="1" fill="url(#fitness3d)"/>
    <rect x="10" y="14" width="12" height="4" fill="url(#fitness3d)"/>
    {/* Weight plates */}
    <rect x="2" y="10" width="3" height="12" rx="1" fill="url(#fitness3d)"/>
    <rect x="27" y="10" width="3" height="12" rx="1" fill="url(#fitness3d)"/>
    {/* Highlight */}
    <path d="M4 13h4M24 13h4" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

export const SightIcon = () => (
  <svg viewBox="0 0 32 32" width={22} height={22}>
    <defs>
      <linearGradient id="sight3d" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FFE57F"/>
        <stop offset="50%" stopColor="#FFC107"/>
        <stop offset="100%" stopColor="#FF9800"/>
      </linearGradient>
    </defs>
    {/* Star */}
    <path d="M16 2l4 9h9l-7 6 3 10-9-6-9 6 3-10-7-6h9z" fill="url(#sight3d)"/>
    {/* 3D highlight */}
    <path d="M16 4l2 5" stroke="rgba(255,255,255,0.6)" strokeWidth="2" strokeLinecap="round"/>
    {/* Inner star glow */}
    <path d="M16 8l2 4h4l-3 3 1 5-4-3-4 3 1-5-3-3h4z" fill="white" opacity="0.3"/>
  </svg>
);

// ═══════════════════════════════════════════════════════════════
// AI & Map Control Icons
// ═══════════════════════════════════════════════════════════════

export const AISparkleIcon = () => (
  <svg viewBox="0 0 24 24" width={22} height={22} className="drop-shadow-sm">
    <defs>
      <linearGradient id="aiGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ffffff"/>
        <stop offset="100%" stopColor="#e0e0ff"/>
      </linearGradient>
    </defs>
    <path d="M12 3L14.5 8.5L20 9L16 13.5L17.5 19L12 16L6.5 19L8 13.5L4 9L9.5 8.5L12 3Z" fill="url(#aiGrad)" stroke="white" strokeWidth="0.5"/>
    <circle cx="12" cy="11" r="2" fill="url(#aiGrad)"/>
    <path d="M7 2L8 4L10 5L8 6L7 8L6 6L4 5L6 4L7 2Z" fill="url(#aiGrad)" opacity="0.8"/>
    <path d="M19 14L20 16L22 17L20 18L19 20L18 18L16 17L18 16L19 14Z" fill="url(#aiGrad)" opacity="0.8"/>
  </svg>
);

export const LayersFilledIcon = () => (
  <svg viewBox="0 0 24 24" width={20} height={20}>
    <path d="M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z" fill="currentColor"/>
  </svg>
);

export const IncidentIcon = () => (
  <svg viewBox="0 0 24 24" width={20} height={20}>
    <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" fill="currentColor"/>
  </svg>
);

export const ParkingFilledIcon = () => (
  <svg viewBox="0 0 24 24" width={20} height={20}>
    <rect x="2" y="2" width="20" height="20" rx="4" fill="currentColor"/>
    <text x="12" y="17" textAnchor="middle" fill="white" fontSize="14" fontWeight="bold" fontFamily="system-ui">P</text>
  </svg>
);

export const ZoomInIcon = () => (
  <svg viewBox="0 0 24 24" width={20} height={20}>
    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" fill="currentColor"/>
  </svg>
);

export const ZoomOutIcon = () => (
  <svg viewBox="0 0 24 24" width={20} height={20}>
    <path d="M19 13H5v-2h14v2z" fill="currentColor"/>
  </svg>
);

export const LocationIcon = () => (
  <svg viewBox="0 0 24 24" width={20} height={20}>
    <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" fill="currentColor"/>
  </svg>
);

export const CompassIcon = () => (
  <svg viewBox="0 0 24 24" width={20} height={20}>
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" fill="currentColor"/>
    <path d="M6.5 17.5l5.5-2.5 2.5-5.5-5.5 2.5z" fill="#EF5350"/>
    <path d="M14.5 6.5l-2.5 5.5 5.5-2.5z" fill="currentColor" opacity="0.5"/>
  </svg>
);

export const SunIcon = () => (
  <svg viewBox="0 0 24 24" width={20} height={20}>
    <path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM4 10.5H1v2h3v-2zm9-9.95h-2V3.5h2V.55zm7.45 3.91l-1.41-1.41-1.79 1.79 1.41 1.41 1.79-1.79zm-3.21 13.7l1.79 1.8 1.41-1.41-1.8-1.79-1.4 1.4zM20 10.5v2h3v-2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2v2.95zm-7.45-3.91l1.41 1.41 1.79-1.8-1.41-1.41-1.79 1.8z" fill="currentColor"/>
  </svg>
);

export const MoonIcon = () => (
  <svg viewBox="0 0 24 24" width={20} height={20}>
    <path d="M9 2c-1.05 0-2.05.16-3 .46 4.06 1.27 7 5.06 7 9.54 0 4.48-2.94 8.27-7 9.54.95.3 1.95.46 3 .46 5.52 0 10-4.48 10-10S14.52 2 9 2z" fill="currentColor"/>
  </svg>
);

// ═══════════════════════════════════════════════════════════════
// Premium 3D User Arrow for Navigation
// ═══════════════════════════════════════════════════════════════

export const RidoUserArrow3D = ({ heading, size = 48 }: { heading: number | null; size?: number }) => (
  <div 
    className="relative transition-transform duration-200"
    style={{ 
      transform: heading !== null ? `rotate(${heading}deg)` : undefined,
      width: size,
      height: size,
    }}
  >
    <svg viewBox="0 0 60 80" width={size} height={size * 1.33} className="drop-shadow-xl">
      <defs>
        {/* Gold gradient for arrow body */}
        <linearGradient id="arrowGold3D" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFD700"/>
          <stop offset="30%" stopColor="#FFC107"/>
          <stop offset="70%" stopColor="#FF9800"/>
          <stop offset="100%" stopColor="#F57C00"/>
        </linearGradient>
        
        {/* Violet stroke gradient */}
        <linearGradient id="arrowViolet" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#8B5CF6"/>
          <stop offset="100%" stopColor="#6D28D9"/>
        </linearGradient>
        
        {/* 3D shadow filter */}
        <filter id="arrow3DShadow" x="-50%" y="-30%" width="200%" height="200%">
          <feDropShadow dx="2" dy="4" stdDeviation="4" floodColor="#000" floodOpacity="0.35"/>
        </filter>
        
        {/* Inner glow */}
        <filter id="arrowGlow">
          <feGaussianBlur stdDeviation="1" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      {/* Outer glow ring */}
      <ellipse cx="30" cy="55" rx="18" ry="8" fill="rgba(139, 92, 246, 0.2)" filter="url(#arrowGlow)"/>
      
      {/* Main arrow body - 3D effect */}
      <path 
        d="M30 5 L48 55 L30 45 L12 55 Z"
        fill="url(#arrowGold3D)"
        stroke="url(#arrowViolet)"
        strokeWidth="2.5"
        filter="url(#arrow3DShadow)"
      />
      
      {/* Left highlight for 3D effect */}
      <path 
        d="M30 8 L26 40 L18 50"
        fill="none"
        stroke="rgba(255,255,255,0.7)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      
      {/* Right shadow for 3D depth */}
      <path 
        d="M30 8 L34 40 L42 50"
        fill="none"
        stroke="rgba(0,0,0,0.15)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      
      {/* Center highlight dot */}
      <circle cx="30" cy="30" r="4" fill="rgba(255,255,255,0.8)"/>
    </svg>
  </div>
);

// Accuracy ring for user location
export const AccuracyRing = ({ accuracy, isMoving }: { accuracy: number; isMoving: boolean }) => {
  const size = Math.min(Math.max(accuracy * 0.8, 50), 150);
  return (
    <div 
      className={`absolute rounded-full ${isMoving ? 'animate-pulse' : ''}`}
      style={{ 
        width: size, 
        height: size,
        background: 'radial-gradient(circle, rgba(139, 92, 246, 0.15) 0%, rgba(139, 92, 246, 0.05) 50%, transparent 70%)',
        transform: 'translate(-50%, -50%)',
        left: '50%',
        top: '50%',
      }} 
    />
  );
};

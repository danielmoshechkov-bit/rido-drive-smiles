// GetRido Maps - Rido Style Category Icons (Apple Maps inspired, but unique)
// Simple stroke-based icons with clean lines

import React from 'react';

// ═══════════════════════════════════════════════════════════════
// CATEGORY ICONS - Rido Style (stroke-based, minimalist)
// ═══════════════════════════════════════════════════════════════

export const FoodIcon = () => (
  <svg viewBox="0 0 24 24" width={22} height={22} fill="none">
    {/* Fork */}
    <path d="M7 3v4c0 1.5-1 2.5-1 2.5V21" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M5 3v4" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M9 3v4" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M5 7h4" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    {/* Spoon */}
    <path d="M17 3c-2 0-3 1.5-3 3.5s1 3.5 3 3.5 3-1.5 3-3.5S19 3 17 3z" stroke="white" strokeWidth="2"/>
    <path d="M17 10v11" stroke="white" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

export const ShopIcon = () => (
  <svg viewBox="0 0 24 24" width={22} height={22} fill="none">
    {/* Shopping bag */}
    <path d="M6 8h12l1 13H5L6 8z" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
    <path d="M9 8V6a3 3 0 016 0v2" stroke="white" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

export const PharmacyIcon = () => (
  <svg viewBox="0 0 24 24" width={22} height={22} fill="none">
    {/* Simple cross */}
    <path d="M12 5v14" stroke="white" strokeWidth="3" strokeLinecap="round"/>
    <path d="M5 12h14" stroke="white" strokeWidth="3" strokeLinecap="round"/>
  </svg>
);

export const BeautyIcon = () => (
  <svg viewBox="0 0 24 24" width={22} height={22} fill="none">
    {/* Mirror / Beauty */}
    <circle cx="12" cy="9" r="5" stroke="white" strokeWidth="2"/>
    <path d="M12 14v7" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M9 21h6" stroke="white" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

export const AtmIcon = () => (
  <svg viewBox="0 0 24 24" width={22} height={22} fill="none">
    {/* Banknote */}
    <rect x="2" y="6" width="20" height="12" rx="2" stroke="white" strokeWidth="2"/>
    <circle cx="12" cy="12" r="3" stroke="white" strokeWidth="2"/>
    <path d="M6 12h.01M18 12h.01" stroke="white" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

export const FuelIcon = () => (
  <svg viewBox="0 0 24 24" width={22} height={22} fill="none">
    {/* Fuel pump */}
    <rect x="3" y="4" width="12" height="17" rx="2" stroke="white" strokeWidth="2"/>
    <rect x="5" y="7" width="8" height="5" rx="1" stroke="white" strokeWidth="1.5"/>
    <path d="M15 9h2a2 2 0 012 2v6a1 1 0 01-1 1v0a1 1 0 01-1-1v-4" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M20 7l-2 2" stroke="white" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

export const HospitalIcon = () => (
  <svg viewBox="0 0 24 24" width={22} height={22} fill="none">
    {/* Hospital building with cross */}
    <rect x="4" y="4" width="16" height="17" rx="2" stroke="white" strokeWidth="2"/>
    <path d="M12 8v6" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M9 11h6" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M9 21v-4h6v4" stroke="white" strokeWidth="2"/>
  </svg>
);

export const HotelIcon = () => (
  <svg viewBox="0 0 24 24" width={22} height={22} fill="none">
    {/* Bed */}
    <path d="M3 18v-5a2 2 0 012-2h14a2 2 0 012 2v5" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M3 18h18" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M5 11V8a2 2 0 012-2h2a2 2 0 012 2v3" stroke="white" strokeWidth="2"/>
    <circle cx="7" cy="9" r="1.5" fill="white"/>
  </svg>
);

export const WifiIcon = () => (
  <svg viewBox="0 0 24 24" width={22} height={22} fill="none">
    {/* WiFi signal */}
    <path d="M12 18h.01" stroke="white" strokeWidth="3" strokeLinecap="round"/>
    <path d="M8.5 14.5a5 5 0 017 0" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M5 11a9 9 0 0114 0" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M2 8a13 13 0 0120 0" stroke="white" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

export const BarIcon = () => (
  <svg viewBox="0 0 24 24" width={22} height={22} fill="none">
    {/* Cocktail glass */}
    <path d="M8 3h8l-4 9v6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M6 21h12" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M12 18v-6" stroke="white" strokeWidth="2"/>
    <path d="M7 6h10" stroke="white" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

export const MallIcon = () => (
  <svg viewBox="0 0 24 24" width={22} height={22} fill="none">
    {/* Shopping mall / Store */}
    <path d="M3 9l9-5 9 5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M4 9v11h16V9" stroke="white" strokeWidth="2"/>
    <rect x="9" y="13" width="6" height="7" stroke="white" strokeWidth="2"/>
  </svg>
);

export const CinemaIcon = () => (
  <svg viewBox="0 0 24 24" width={22} height={22} fill="none">
    {/* Movie clapperboard */}
    <path d="M4 6h16v14H4z" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
    <path d="M4 10h16" stroke="white" strokeWidth="2"/>
    <path d="M7 6l2-3h2l-2 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M13 6l2-3h2l-2 3" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export const ParkingIcon = () => (
  <svg viewBox="0 0 24 24" width={22} height={22} fill="none">
    {/* P in circle */}
    <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="2"/>
    <path d="M9 16V8h4a3 3 0 110 6H9" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export const CarWashIcon = () => (
  <svg viewBox="0 0 24 24" width={22} height={22} fill="none">
    {/* Car with water drops */}
    <path d="M5 15h14l1 4H4l1-4z" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
    <path d="M7 15l1-4h8l1 4" stroke="white" strokeWidth="2" strokeLinejoin="round"/>
    <circle cx="7" cy="18" r="1" fill="white"/>
    <circle cx="17" cy="18" r="1" fill="white"/>
    <path d="M8 5v2M12 4v3M16 5v2" stroke="white" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

export const ServiceIcon = () => (
  <svg viewBox="0 0 24 24" width={22} height={22} fill="none">
    {/* Wrench */}
    <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" 
          stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export const FitnessIcon = () => (
  <svg viewBox="0 0 24 24" width={22} height={22} fill="none">
    {/* Dumbbell */}
    <path d="M6 12h12" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
    <rect x="2" y="9" width="4" height="6" rx="1" stroke="white" strokeWidth="2"/>
    <rect x="18" y="9" width="4" height="6" rx="1" stroke="white" strokeWidth="2"/>
    <rect x="4" y="7" width="2" height="10" rx="0.5" stroke="white" strokeWidth="1.5"/>
    <rect x="18" y="7" width="2" height="10" rx="0.5" stroke="white" strokeWidth="1.5"/>
  </svg>
);

export const SightIcon = () => (
  <svg viewBox="0 0 24 24" width={22} height={22} fill="none">
    {/* Camera / Tourism */}
    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" 
          stroke="white" strokeWidth="2" strokeLinejoin="round"/>
    <circle cx="12" cy="13" r="4" stroke="white" strokeWidth="2"/>
  </svg>
);

// ═══════════════════════════════════════════════════════════════
// UI CONTROL ICONS - Keep existing style but ensure consistency
// ═══════════════════════════════════════════════════════════════

export const AISparkleIcon = () => (
  <svg viewBox="0 0 24 24" width={20} height={20} fill="none">
    <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z" 
          stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
  </svg>
);

export const ZoomInIcon = () => (
  <svg viewBox="0 0 24 24" width={20} height={20} fill="none">
    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/>
    <path d="M21 21l-4.35-4.35M11 8v6M8 11h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

export const ZoomOutIcon = () => (
  <svg viewBox="0 0 24 24" width={20} height={20} fill="none">
    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/>
    <path d="M21 21l-4.35-4.35M8 11h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

export const LayersIcon = () => (
  <svg viewBox="0 0 24 24" width={20} height={20} fill="none">
    <path d="M12 2l10 6-10 6L2 8l10-6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
    <path d="M2 12l10 6 10-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M2 17l10 6 10-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export const LayersFilledIcon = () => (
  <svg viewBox="0 0 24 24" width={20} height={20}>
    <path d="M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z" fill="currentColor"/>
  </svg>
);

export const CompassIcon = () => (
  <svg viewBox="0 0 24 24" width={20} height={20} fill="none">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88" 
             stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
  </svg>
);

export const LocateIcon = () => (
  <svg viewBox="0 0 24 24" width={20} height={20} fill="none">
    <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2"/>
    <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

export const LocationIcon = () => (
  <svg viewBox="0 0 24 24" width={20} height={20}>
    <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" fill="currentColor"/>
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

export const SunIcon = () => (
  <svg viewBox="0 0 24 24" width={20} height={20} fill="none">
    <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="2"/>
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" 
          stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

export const MoonIcon = () => (
  <svg viewBox="0 0 24 24" width={20} height={20} fill="none">
    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" 
          stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
  </svg>
);

// ═══════════════════════════════════════════════════════════════
// 3D USER MARKER - Premium gold & violet style
// ═══════════════════════════════════════════════════════════════

export const RidoUserArrow3D = ({ heading, size = 48 }: { heading: number | null; size?: number }) => {
  const rotation = heading !== null ? heading : 0;
  
  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 48 48"
      style={{ 
        transform: `rotate(${rotation}deg)`,
        transition: 'transform 0.3s ease-out',
        filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))'
      }}
    >
      <defs>
        <linearGradient id="arrowGold" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FFD700"/>
          <stop offset="50%" stopColor="#FFA500"/>
          <stop offset="100%" stopColor="#FF8C00"/>
        </linearGradient>
        <linearGradient id="arrowViolet" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#8B5CF6"/>
          <stop offset="100%" stopColor="#6D28D9"/>
        </linearGradient>
        <filter id="arrowGlow">
          <feGaussianBlur stdDeviation="2" result="blur"/>
          <feMerge>
            <feMergeNode in="blur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      
      {/* Outer glow ring */}
      <circle cx="24" cy="24" r="20" fill="none" stroke="url(#arrowViolet)" strokeWidth="2" opacity="0.5"/>
      
      {/* Main arrow body */}
      <path 
        d="M24 6 L34 34 L24 28 L14 34 Z" 
        fill="url(#arrowGold)"
        filter="url(#arrowGlow)"
      />
      
      {/* Inner highlight */}
      <path 
        d="M24 10 L30 30 L24 26 L18 30 Z" 
        fill="white" 
        opacity="0.3"
      />
      
      {/* Center dot */}
      <circle cx="24" cy="22" r="3" fill="white" opacity="0.8"/>
    </svg>
  );
};

// ═══════════════════════════════════════════════════════════════
// ACCURACY RING - Location precision indicator
// ═══════════════════════════════════════════════════════════════

export const AccuracyRing = ({ accuracy, isMoving }: { accuracy: number; isMoving: boolean }) => {
  const size = Math.min(Math.max(accuracy * 2, 40), 200);
  
  return (
    <div
      className={`absolute rounded-full border-2 border-violet-400/30 bg-violet-400/10 ${isMoving ? 'animate-pulse' : ''}`}
      style={{
        width: size,
        height: size,
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none'
      }}
    />
  );
};

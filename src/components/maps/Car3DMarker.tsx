// ═══════════════════════════════════════════════════════════════
// GetRido Maps - Premium 3D Car Marker (view from behind)
// Tesla/Yandex-style car indicator with taillights and glow
// ═══════════════════════════════════════════════════════════════

import { useMemo } from 'react';

interface Car3DMarkerProps {
  heading: number | null;
  isMoving?: boolean;
  accuracy?: number;
  theme?: 'light' | 'dark' | 'cyberpunk';
}

const Car3DMarker = ({ 
  heading, 
  isMoving = false, 
  accuracy = 10,
  theme = 'cyberpunk'
}: Car3DMarkerProps) => {
  
  // Determine colors based on theme
  const colors = useMemo(() => {
    if (theme === 'cyberpunk') {
      return {
        body: 'url(#carGradientCyberpunk)',
        bodyStroke: '#00e5ff',
        taillight: '#ff3366',
        taillightGlow: 'rgba(255, 51, 102, 0.8)',
        shadow: 'rgba(0, 229, 255, 0.3)',
        accuracyRing: 'rgba(0, 229, 255, 0.15)',
      };
    }
    return {
      body: 'url(#carGradientDefault)',
      bodyStroke: '#7C3AED',
      taillight: '#ef4444',
      taillightGlow: 'rgba(239, 68, 68, 0.6)',
      shadow: 'rgba(0, 0, 0, 0.3)',
      accuracyRing: 'rgba(139, 92, 246, 0.15)',
    };
  }, [theme]);

  return (
    <div className="relative flex items-center justify-center">
      {/* Accuracy ring - subtle pulse when moving */}
      <div 
        className={`absolute rounded-full transition-all duration-500 ${isMoving ? 'animate-pulse' : ''}`}
        style={{ 
          width: Math.min(Math.max(accuracy * 0.6, 40), 100), 
          height: Math.min(Math.max(accuracy * 0.6, 40), 100),
          background: `radial-gradient(circle, ${colors.accuracyRing} 0%, transparent 70%)`,
        }} 
      />
      
      {/* Main 3D car SVG - top-down view with 3D perspective */}
      <div 
        className="relative z-10 transition-transform duration-200 ease-out"
        style={{ 
          transform: heading !== null ? `rotate(${heading}deg)` : undefined,
          transformStyle: 'preserve-3d',
        }}
      >
        <svg viewBox="0 0 60 90" width={48} height={72} className="drop-shadow-2xl">
          <defs>
            {/* Cyberpunk gradient - cyan to dark blue */}
            <linearGradient id="carGradientCyberpunk" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1a3a6a" />
              <stop offset="30%" stopColor="#0d2440" />
              <stop offset="70%" stopColor="#0a1a30" />
              <stop offset="100%" stopColor="#061020" />
            </linearGradient>
            
            {/* Default gradient - violet/gold */}
            <linearGradient id="carGradientDefault" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#FFD700" />
              <stop offset="50%" stopColor="#FFC107" />
              <stop offset="100%" stopColor="#FF9800" />
            </linearGradient>
            
            {/* Taillight glow */}
            <filter id="taillightGlow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="2" result="blur"/>
              <feMerge>
                <feMergeNode in="blur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
            
            {/* Car shadow */}
            <filter id="carShadow3D" x="-50%" y="-30%" width="200%" height="200%">
              <feDropShadow dx="0" dy="8" stdDeviation="6" floodColor="#000" floodOpacity="0.5"/>
            </filter>
            
            {/* Neon stroke glow */}
            <filter id="neonStroke" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="1.5" result="blur"/>
              <feMerge>
                <feMergeNode in="blur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          </defs>
          
          {/* Shadow under car */}
          <ellipse 
            cx="30" 
            cy="75" 
            rx="20" 
            ry="8" 
            fill={colors.shadow}
            opacity="0.6"
          />
          
          {/* Car body - rounded rectangle (top-down view) */}
          <path 
            d="M15 15 
               Q15 8, 22 8 
               L38 8 
               Q45 8, 45 15 
               L45 70 
               Q45 78, 38 78 
               L22 78 
               Q15 78, 15 70 
               Z"
            fill={colors.body}
            stroke={colors.bodyStroke}
            strokeWidth="1.5"
            filter="url(#carShadow3D)"
          />
          
          {/* Windshield - darker area at front */}
          <path 
            d="M18 18 
               Q18 13, 23 13 
               L37 13 
               Q42 13, 42 18 
               L42 30 
               L18 30 
               Z"
            fill="rgba(0, 0, 0, 0.4)"
            rx="4"
          />
          
          {/* Rear window */}
          <rect 
            x="20" 
            y="58" 
            width="20" 
            height="14" 
            rx="3"
            fill="rgba(0, 0, 0, 0.35)"
          />
          
          {/* Left taillight */}
          <rect 
            x="16" 
            y="70" 
            width="10" 
            height="4" 
            rx="1"
            fill={colors.taillight}
            filter="url(#taillightGlow)"
            opacity={isMoving ? 1 : 0.7}
          >
            {isMoving && (
              <animate 
                attributeName="opacity" 
                values="0.7;1;0.7" 
                dur="0.8s" 
                repeatCount="indefinite"
              />
            )}
          </rect>
          
          {/* Right taillight */}
          <rect 
            x="34" 
            y="70" 
            width="10" 
            height="4" 
            rx="1"
            fill={colors.taillight}
            filter="url(#taillightGlow)"
            opacity={isMoving ? 1 : 0.7}
          >
            {isMoving && (
              <animate 
                attributeName="opacity" 
                values="0.7;1;0.7" 
                dur="0.8s" 
                repeatCount="indefinite"
              />
            )}
          </rect>
          
          {/* Center brake light */}
          <rect 
            x="25" 
            y="73" 
            width="10" 
            height="2" 
            rx="1"
            fill={colors.taillight}
            opacity="0.5"
          />
          
          {/* Hood highlight - 3D effect */}
          <path 
            d="M22 14 L30 8 L38 14"
            fill="none"
            stroke="rgba(255, 255, 255, 0.4)"
            strokeWidth="2"
            strokeLinecap="round"
          />
          
          {/* Side mirrors */}
          <ellipse cx="12" cy="28" rx="3" ry="2" fill={colors.body} stroke={colors.bodyStroke} strokeWidth="0.5"/>
          <ellipse cx="48" cy="28" rx="3" ry="2" fill={colors.body} stroke={colors.bodyStroke} strokeWidth="0.5"/>
          
          {/* Roof highlight */}
          <ellipse 
            cx="30" 
            cy="42" 
            rx="8" 
            ry="12" 
            fill="rgba(255, 255, 255, 0.08)"
          />
          
          {/* Neon accent line (cyberpunk only) */}
          {theme === 'cyberpunk' && (
            <path 
              d="M18 35 L18 55"
              stroke={colors.bodyStroke}
              strokeWidth="1"
              opacity="0.6"
              filter="url(#neonStroke)"
            />
          )}
          {theme === 'cyberpunk' && (
            <path 
              d="M42 35 L42 55"
              stroke={colors.bodyStroke}
              strokeWidth="1"
              opacity="0.6"
              filter="url(#neonStroke)"
            />
          )}
        </svg>
      </div>
    </div>
  );
};

export default Car3DMarker;

// GetRido Maps - Navigation Debug Overlay
// Shows real-time GPS, map-matching, and navigation diagnostics
// Only visible for admins or when ?debug=nav is in URL

import { useEffect, useState } from 'react';
import { GpsState } from './useUserLocation';
import { NavigationState } from './useNavigation';
import { MapMatchedPosition } from './mapMatchingService';
import { FollowMode } from './useMapCameraController';
import { Badge } from '@/components/ui/badge';
import { 
  Navigation2, 
  Crosshair, 
  Gauge, 
  Compass, 
  Target, 
  AlertTriangle,
  Wifi,
  WifiOff,
  RotateCcw
} from 'lucide-react';

interface NavigationDebugOverlayProps {
  gps: GpsState;
  navigation: NavigationState;
  mapMatched: MapMatchedPosition | null;
  followMode: FollowMode;
  calculatedBearing: number | null;
  isVisible?: boolean;
}

const NavigationDebugOverlay = ({
  gps,
  navigation,
  mapMatched,
  followMode,
  calculatedBearing,
  isVisible = false,
}: NavigationDebugOverlayProps) => {
  const [showDebug, setShowDebug] = useState(false);
  
  // Check if debug mode should be enabled
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const debugParam = urlParams.get('debug');
    setShowDebug(debugParam === 'nav' || debugParam === 'all' || isVisible);
  }, [isVisible]);
  
  if (!showDebug) return null;
  
  const location = gps.location;
  const speedKmh = location?.speed ? Math.round(location.speed * 3.6) : 0;
  const accuracyClass = location?.accuracy 
    ? location.accuracy < 10 ? 'text-green-500' 
    : location.accuracy < 30 ? 'text-yellow-500' 
    : 'text-red-500'
    : 'text-muted-foreground';
    
  const gpsHeading = location?.heading !== null ? location.heading : null;
  
  return (
    <div 
      className="absolute top-20 left-4 z-50 p-3 rounded-lg text-xs font-mono space-y-2 max-w-[280px]"
      style={{
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(139, 92, 246, 0.3)',
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 text-violet-400 font-bold border-b border-violet-500/30 pb-2">
        <Crosshair className="h-4 w-4" />
        NAV DEBUG
        {navigation.isRerouting && (
          <Badge variant="destructive" className="ml-auto animate-pulse text-[10px] px-1.5">
            <RotateCcw className="h-3 w-3 mr-1 animate-spin" />
            REROUTE
          </Badge>
        )}
      </div>
      
      {/* GPS Section */}
      <div className="space-y-1">
        <div className="text-violet-300 flex items-center gap-1">
          {gps.status === 'active' ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
          GPS
        </div>
        <div className="grid grid-cols-2 gap-x-4 text-gray-300">
          <span>Status:</span>
          <span className={gps.status === 'active' ? 'text-green-400' : 'text-yellow-400'}>
            {gps.status}
          </span>
          
          <span>Accuracy:</span>
          <span className={accuracyClass}>
            {location?.accuracy?.toFixed(0) || '—'} m
          </span>
          
          <span>Speed:</span>
          <span className="text-white">{speedKmh} km/h</span>
          
          <span>GPS Heading:</span>
          <span className="text-white">{gpsHeading?.toFixed(0) || '—'}°</span>
          
          <span>Calc Bearing:</span>
          <span className="text-cyan-400">{calculatedBearing?.toFixed(0) || '—'}°</span>
        </div>
      </div>
      
      {/* Map Matching Section */}
      {mapMatched && (
        <div className="space-y-1 border-t border-violet-500/30 pt-2">
          <div className="text-violet-300 flex items-center gap-1">
            <Target className="h-3 w-3" />
            MAP MATCH
          </div>
          <div className="grid grid-cols-2 gap-x-4 text-gray-300">
            <span>Snapped:</span>
            <span className={mapMatched.isSnapped ? 'text-green-400' : 'text-red-400'}>
              {mapMatched.isSnapped ? 'YES' : 'NO'}
            </span>
            
            <span>Dist to route:</span>
            <span className={mapMatched.distanceToRoute > 50 ? 'text-red-400' : 'text-white'}>
              {mapMatched.distanceToRoute.toFixed(0)} m
            </span>
            
            <span>Progress:</span>
            <span className="text-white">{(mapMatched.routeProgress * 100).toFixed(1)}%</span>
            
            <span>Route bearing:</span>
            <span className="text-cyan-400">{mapMatched.bearing?.toFixed(0) || '—'}°</span>
          </div>
        </div>
      )}
      
      {/* Navigation Section */}
      <div className="space-y-1 border-t border-violet-500/30 pt-2">
        <div className="text-violet-300 flex items-center gap-1">
          <Navigation2 className="h-3 w-3" />
          NAVIGATION
        </div>
        <div className="grid grid-cols-2 gap-x-4 text-gray-300">
          <span>Active:</span>
          <span className={navigation.isNavigating ? 'text-green-400' : 'text-gray-500'}>
            {navigation.isNavigating ? 'YES' : 'NO'}
          </span>
          
          <span>Follow mode:</span>
          <span className={
            followMode === 'heading' ? 'text-violet-400' :
            followMode === 'center' ? 'text-blue-400' : 'text-gray-500'
          }>
            {followMode.toUpperCase()}
          </span>
          
          <span>Off-route:</span>
          <span className={navigation.isOffRoute ? 'text-red-400 animate-pulse' : 'text-green-400'}>
            {navigation.isOffRoute ? 'YES ⚠️' : 'NO'}
          </span>
          
          <span>Wake lock:</span>
          <span className={navigation.wakeLockActive ? 'text-green-400' : 'text-gray-500'}>
            {navigation.wakeLockActive ? 'ON' : 'OFF'}
          </span>
          
          {navigation.isNavigating && (
            <>
              <span>Remaining:</span>
              <span className="text-white">{navigation.remainingDistance.toFixed(1)} km</span>
              
              <span>ETA:</span>
              <span className="text-white">
                {navigation.eta ? navigation.eta.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : '—'}
              </span>
            </>
          )}
        </div>
      </div>
      
      {/* Coordinates */}
      {location && (
        <div className="text-[10px] text-gray-500 pt-1 border-t border-gray-700">
          {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
        </div>
      )}
    </div>
  );
};

export default NavigationDebugOverlay;

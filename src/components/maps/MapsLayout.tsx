// GetRido Maps - Layout Component
import { useState, useEffect } from 'react';
import { useRouting } from './useRouting';
import { useUserLocation } from './useUserLocation';
import { useNavigation } from './useNavigation';
import { useIsMobile } from '@/hooks/use-mobile';
import MapsSidebar from './MapsSidebar';
import MapsContainer from './MapsContainer';
import MapsInfoPanel from './MapsInfoPanel';
import GpsConsentGate from './GpsConsentGate';
import MapsBottomSheet from './MapsBottomSheet';
import MapsFABs from './MapsFABs';
import MobileNavigationBar from './MobileNavigationBar';

const CONSENT_DISMISSED_KEY = 'getrido_consent_dismissed';

const MapsLayout = () => {
  const gps = useUserLocation();
  const routing = useRouting(gps.location ? { latitude: gps.location.latitude, longitude: gps.location.longitude } : null);
  const navigation = useNavigation(routing.route, gps);
  const isMobile = useIsMobile();
  
  const [showConsentGate, setShowConsentGate] = useState(!gps.hasConsent);
  const [consentDismissed, setConsentDismissed] = useState(() => 
    localStorage.getItem(CONSENT_DISMISSED_KEY) === 'true'
  );

  // Update consent gate visibility when hasConsent changes
  useEffect(() => {
    if (gps.hasConsent) {
      setShowConsentGate(false);
    }
  }, [gps.hasConsent]);

  const handleAcceptConsent = async () => {
    await gps.requestConsent();
    setShowConsentGate(false);
    localStorage.removeItem(CONSENT_DISMISSED_KEY);
    setConsentDismissed(false);
  };

  const handleDismissConsent = () => {
    setShowConsentGate(false);
    setConsentDismissed(true);
    localStorage.setItem(CONSENT_DISMISSED_KEY, 'true');
  };

  // Show fullscreen consent gate if needed
  const shouldShowConsentGate = showConsentGate && !gps.hasConsent && !consentDismissed;

  // MOBILE LAYOUT (< 768px)
  if (isMobile) {
    return (
      <>
        {shouldShowConsentGate && (
          <GpsConsentGate 
            gps={gps}
            onAccept={handleAcceptConsent}
            onDismiss={handleDismissConsent}
          />
        )}

        <div className="relative h-full w-full overflow-hidden maps-fullscreen">
          {/* Fullscreen Map */}
          <MapsContainer routing={routing} gps={gps} navigation={navigation} />
          
          {/* Mobile Navigation Bar (top, during navigation) */}
          {navigation.isNavigating && (
            <MobileNavigationBar navigation={navigation} gps={gps} />
          )}
          
          {/* FAB buttons */}
          <MapsFABs gps={gps} navigation={navigation} />
          
          {/* Bottom Sheet */}
          <MapsBottomSheet routing={routing} gps={gps} navigation={navigation} />
        </div>
      </>
    );
  }

  // DESKTOP LAYOUT (>= 768px)
  return (
    <>
      {shouldShowConsentGate && (
        <GpsConsentGate 
          gps={gps}
          onAccept={handleAcceptConsent}
          onDismiss={handleDismissConsent}
        />
      )}

      <div className="flex flex-1 h-full overflow-hidden">
        <MapsSidebar routing={routing} gps={gps} navigation={navigation} />
        <MapsContainer routing={routing} gps={gps} navigation={navigation} />
        <MapsInfoPanel gps={gps} />
      </div>
    </>
  );
};

export default MapsLayout;

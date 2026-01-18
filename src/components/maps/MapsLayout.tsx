// GetRido Maps - Layout Component
import { useState } from 'react';
import { useRouting } from './useRouting';
import { useUserLocation } from './useUserLocation';
import { useNavigation } from './useNavigation';
import { useIsMobile } from '@/hooks/use-mobile';
import MapsSidebar from './MapsSidebar';
import MapsContainer from './MapsContainer';
import MapsInfoPanel from './MapsInfoPanel';
import GpsConsentModal from './GpsConsentModal';
import MapsBottomSheet from './MapsBottomSheet';
import MapsFABs from './MapsFABs';
import MobileNavigationBar from './MobileNavigationBar';

const MapsLayout = () => {
  const gps = useUserLocation();
  const routing = useRouting(gps.location ? { latitude: gps.location.latitude, longitude: gps.location.longitude } : null);
  const navigation = useNavigation(routing.route, gps);
  const [showConsentModal, setShowConsentModal] = useState(!gps.hasConsent);
  const isMobile = useIsMobile();

  const handleAcceptConsent = async () => {
    await gps.requestConsent();
    setShowConsentModal(false);
  };

  const handleDeclineConsent = () => {
    setShowConsentModal(false);
  };

  // MOBILE LAYOUT (< 768px)
  if (isMobile) {
    return (
      <>
        <GpsConsentModal 
          open={showConsentModal && !gps.hasConsent}
          onAccept={handleAcceptConsent}
          onDecline={handleDeclineConsent}
        />

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
      <GpsConsentModal 
        open={showConsentModal && !gps.hasConsent}
        onAccept={handleAcceptConsent}
        onDecline={handleDeclineConsent}
      />

      <div className="flex flex-1 h-full overflow-hidden">
        <MapsSidebar routing={routing} gps={gps} navigation={navigation} />
        <MapsContainer routing={routing} gps={gps} navigation={navigation} />
        <MapsInfoPanel gps={gps} />
      </div>
    </>
  );
};

export default MapsLayout;

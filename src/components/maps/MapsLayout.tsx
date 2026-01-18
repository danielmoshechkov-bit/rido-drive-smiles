// GetRido Maps - Layout Component
import { useState } from 'react';
import { useRouting } from './useRouting';
import { useUserLocation } from './useUserLocation';
import { useNavigation } from './useNavigation';
import MapsSidebar from './MapsSidebar';
import MapsContainer from './MapsContainer';
import MapsInfoPanel from './MapsInfoPanel';
import GpsConsentModal from './GpsConsentModal';

const MapsLayout = () => {
  const gps = useUserLocation();
  const routing = useRouting(gps.location ? { latitude: gps.location.latitude, longitude: gps.location.longitude } : null);
  const navigation = useNavigation(routing.route, gps);
  const [showConsentModal, setShowConsentModal] = useState(!gps.hasConsent);

  const handleAcceptConsent = async () => {
    await gps.requestConsent();
    setShowConsentModal(false);
  };

  const handleDeclineConsent = () => {
    setShowConsentModal(false);
  };

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

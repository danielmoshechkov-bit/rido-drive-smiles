// GetRido Maps - Layout Component
import { useState } from 'react';
import { useRouting } from './useRouting';
import { useUserLocation } from './useUserLocation';
import MapsSidebar from './MapsSidebar';
import MapsContainer from './MapsContainer';
import MapsInfoPanel from './MapsInfoPanel';
import GpsConsentModal from './GpsConsentModal';

const MapsLayout = () => {
  const routing = useRouting();
  const gps = useUserLocation();
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
      {/* GPS Consent Modal - shown if no consent */}
      <GpsConsentModal 
        open={showConsentModal && !gps.hasConsent}
        onAccept={handleAcceptConsent}
        onDecline={handleDeclineConsent}
      />

      <div className="flex flex-1 h-full overflow-hidden">
        {/* Left Sidebar */}
        <MapsSidebar routing={routing} />
        
        {/* Center Map Area */}
        <MapsContainer routing={routing} gps={gps} />
        
        {/* Right Info Panel */}
        <MapsInfoPanel gps={gps} />
      </div>
    </>
  );
};

export default MapsLayout;

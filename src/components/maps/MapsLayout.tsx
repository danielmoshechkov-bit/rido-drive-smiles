// GetRido Maps - Layout Component
import { useRouting } from './useRouting';
import MapsSidebar from './MapsSidebar';
import MapsContainer from './MapsContainer';
import MapsInfoPanel from './MapsInfoPanel';

const MapsLayout = () => {
  const routing = useRouting();

  return (
    <div className="flex flex-1 h-full overflow-hidden">
      {/* Left Sidebar */}
      <MapsSidebar routing={routing} />
      
      {/* Center Map Area */}
      <MapsContainer routing={routing} />
      
      {/* Right Info Panel */}
      <MapsInfoPanel />
    </div>
  );
};

export default MapsLayout;

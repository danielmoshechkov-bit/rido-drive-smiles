import MapsSidebar from './MapsSidebar';
import MapsContainer from './MapsContainer';
import MapsInfoPanel from './MapsInfoPanel';

const MapsLayout = () => {
  return (
    <div className="flex flex-1 h-full overflow-hidden">
      {/* Left Sidebar */}
      <MapsSidebar />
      
      {/* Center Map Area */}
      <MapsContainer />
      
      {/* Right Info Panel */}
      <MapsInfoPanel />
    </div>
  );
};

export default MapsLayout;

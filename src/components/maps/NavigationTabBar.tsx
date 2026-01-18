// GetRido Maps - Navigation Tab Bar (Bottom tabs during navigation)
import { Search, Fuel, Bookmark, Settings } from 'lucide-react';
import { useState } from 'react';
import FuelStationsSheet from './FuelStationsSheet';
import { NavigationSettingsSheet } from './NavigationSettingsSheet';

interface NavigationTabBarProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
}

const NavigationTabBar = ({ activeTab = 'nav', onTabChange }: NavigationTabBarProps) => {
  const [showFuelSheet, setShowFuelSheet] = useState(false);
  const [showSettingsSheet, setShowSettingsSheet] = useState(false);
  
  const tabs = [
    { id: 'search', icon: <Search className="h-4 w-4" />, label: 'Szukaj' },
    { id: 'fuel', icon: <Fuel className="h-4 w-4" />, label: 'Stacje' },
    { id: 'saved', icon: <Bookmark className="h-4 w-4" />, label: 'Zakładki' },
    { id: 'settings', icon: <Settings className="h-4 w-4" />, label: 'Ustawienia' },
  ];

  const handleTabClick = (tabId: string) => {
    if (tabId === 'fuel') {
      setShowFuelSheet(true);
    } else if (tabId === 'settings') {
      setShowSettingsSheet(true);
    } else {
      onTabChange?.(tabId);
    }
  };

  return (
    <>
      <div className="flex items-center justify-around py-1 border-t bg-card/95 backdrop-blur-sm">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab || 
                          (tab.id === 'fuel' && showFuelSheet) ||
                          (tab.id === 'settings' && showSettingsSheet);
          
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors ${
                isActive 
                  ? 'text-primary' 
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab.icon}
              <span className="text-[9px] font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
      
      {/* Fuel Stations Sheet */}
      <FuelStationsSheet 
        open={showFuelSheet} 
        onOpenChange={setShowFuelSheet} 
      />
      
      {/* Navigation Settings Sheet */}
      <NavigationSettingsSheet 
        open={showSettingsSheet} 
        onClose={() => setShowSettingsSheet(false)} 
      />
    </>
  );
};

export default NavigationTabBar;

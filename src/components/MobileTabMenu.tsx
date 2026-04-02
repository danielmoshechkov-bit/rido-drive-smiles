import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, DollarSign, Car, Users, Info, Repeat, CreditCard, Settings, MapPin, FileText, Calculator } from "lucide-react";

interface MobileTabMenuProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  canViewTab: (tab: string) => boolean;
  userType: 'admin' | 'fleet';
  roles: string[];
  myDriverId: string | null;
  t: (key: string) => string;
  fleetId?: string | null;
}

export function MobileTabMenu({ 
  activeTab, 
  setActiveTab, 
  canViewTab, 
  userType, 
  roles, 
  myDriverId,
  t,
  fleetId
}: MobileTabMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setIsOpen(false); // Close menu after selection
  };

  const getActiveTabLabel = () => {
    switch (activeTab) {
      case 'weekly-report': return t('admin.weeklyReport');
      case 'settlements': return t('admin.settlements');
      case 'drivers-list': return t('admin.driversList');
      case 'fleet': return 'Flota';
      case 'documents': return 'Dokumenty';
      case 'system-alerts': return 'Informacje';
      case 'settings': return t('admin.settings');
      case 'informacje': return 'Informacje';
      case 'my-settlements': return 'Moje rozliczenia';
      case 'accounts': return 'Wybierz moduł';
      case 'fleet-accounts': return 'Konta flotowe';
      case 'user-roles': return 'Uprawnienia';
      case 'plans': return 'Plany';
      case 'visibility': return 'Widoczność';
      case 'tab-visibility': return 'Widoczność zakładek';
      case 'data-import': return t('admin.dataImport');
      case 'fleet-live': return 'Fleet Live';
      case 'rental-payments': return 'Płatności';
      case 'accounting': return 'Księgowość';
      default: return 'Menu';
    }
  };

  return (
    <div className="md:hidden mb-3">
      <div className="flex items-center gap-2">
        <Collapsible open={isOpen} onOpenChange={setIsOpen} className="flex-1">
          <CollapsibleTrigger className="w-full">
            <div 
              className="flex items-center justify-between text-white px-4 py-2.5 rounded-xl shadow-[0_4px_15px_rgba(108,60,240,0.15)]"
              style={{ backgroundColor: 'var(--nav-bar-color, #6C3CF0)' }}
            >
              <span className="font-medium text-sm truncate">
                {getActiveTabLabel()}
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 ml-2 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1">
            <div className="bg-background border rounded-xl p-2 shadow-lg space-y-1">
              {canViewTab('settlements') && activeTab !== 'settlements' && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="w-full justify-start text-xs"
                  onClick={() => handleTabChange('settlements')}
                >
                  <DollarSign className="h-3 w-3 mr-2" />
                  {t('admin.settlements')}
                </Button>
              )}
              {canViewTab('fleet') && activeTab !== 'fleet' && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="w-full justify-start text-xs"
                  onClick={() => handleTabChange('fleet')}
                >
                  <Car className="h-3 w-3 mr-2" />
                  Flota
                </Button>
              )}
              {canViewTab('drivers-list') && activeTab !== 'drivers-list' && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="w-full justify-start text-xs"
                  onClick={() => handleTabChange('drivers-list')}
                >
                  <Users className="h-3 w-3 mr-2" />
                  {t('admin.driversList')}
                </Button>
              )}
              {userType === 'fleet' && activeTab !== 'informacje' && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="w-full justify-start text-xs"
                  onClick={() => handleTabChange('informacje')}
                >
                  <Info className="h-3 w-3 mr-2" />
                  Informacje
                </Button>
              )}
              {userType === 'fleet' && fleetId && activeTab !== 'accounting' && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="w-full justify-start text-xs"
                  onClick={() => handleTabChange('accounting')}
                >
                  <Calculator className="h-3 w-3 mr-2" />
                  Księgowość
                </Button>
              )}
              {userType === 'fleet' && fleetId && activeTab !== 'rental-payments' && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="w-full justify-start text-xs"
                  onClick={() => handleTabChange('rental-payments')}
                >
                  <CreditCard className="h-3 w-3 mr-2" />
                  Płatności
                </Button>
              )}
              {canViewTab('settings') && activeTab !== 'settings' && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="w-full justify-start text-xs"
                  onClick={() => handleTabChange('settings')}
                >
                  <Settings className="h-3 w-3 mr-2" />
                  {t('admin.settings')}
                </Button>
              )}
              {canViewTab('fleet-live') && activeTab !== 'fleet-live' && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="w-full justify-start text-xs"
                  onClick={() => handleTabChange('fleet-live')}
                >
                  <MapPin className="h-3 w-3 mr-2" />
                  Fleet Live
                </Button>
              )}
              {roles.includes('driver') && myDriverId && !roles.includes('fleet_rental') && !roles.includes('fleet_settlement') && activeTab !== 'my-settlements' && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="w-full justify-start text-xs"
                  onClick={() => handleTabChange('my-settlements')}
                >
                  <DollarSign className="h-3 w-3 mr-2" />
                  Moje rozliczenia
                </Button>
              )}
              {activeTab !== 'accounts' && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="w-full justify-start text-xs"
                  onClick={() => handleTabChange('accounts')}
                >
                  <Repeat className="h-3 w-3 mr-2" />
                  Wybierz moduł
                </Button>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}

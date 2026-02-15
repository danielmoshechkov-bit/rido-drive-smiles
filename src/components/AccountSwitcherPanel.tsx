import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Building2, Lock, Wrench } from "lucide-react";

// Module images
import clientPortalImg from "@/assets/modules/client-portal.jpg";
import driverImg from "@/assets/modules/driver.jpg";
import fleetImg from "@/assets/modules/fleet.jpg";
import salesImg from "@/assets/modules/sales.jpg";
import adminImg from "@/assets/modules/admin.jpg";

interface AccountSwitcherPanelProps {
  isDriverAccount: boolean;
  isFleetAccount: boolean;
  isMarketplaceAccount?: boolean;
  isRealEstateAccount?: boolean;
  isAdminAccount?: boolean;
  isClientPortal?: boolean;
  isSalesAdmin?: boolean;
  isSalesRep?: boolean;
  isMarketplaceEnabled?: boolean;
  isServiceProvider?: boolean;
  currentAccountType: 'driver' | 'fleet' | 'admin' | 'client' | 'sales' | 'service_provider';
  navigate: ReturnType<typeof useNavigate>;
  hideDriverForFleet?: boolean;
}

interface AccountOption {
  type: 'driver' | 'fleet' | 'admin' | 'client' | 'sales' | 'service_provider';
  label: string;
  description: string;
  image: string;
  route: string;
  isEnabled: boolean;
}

interface RegistrationOption {
  id: string;
  label: string;
  description: string;
  image: string;
  route: string;
  available: boolean;
}

export function AccountSwitcherPanel({
  isDriverAccount,
  isFleetAccount,
  isRealEstateAccount = false,
  isAdminAccount = false,
  isClientPortal = true,
  isSalesAdmin = false,
  isSalesRep = false,
  isServiceProvider = false,
  currentAccountType,
  navigate,
  hideDriverForFleet = false
}: AccountSwitcherPanelProps) {
  const [showAddAccountDialog, setShowAddAccountDialog] = useState(false);
  
  const hasSalesAccess = isSalesAdmin || isSalesRep;
  const showDriverOption = isDriverAccount && !hideDriverForFleet;

  // Build list of all available accounts for this user
  const accounts: AccountOption[] = [
    {
      type: 'admin',
      label: 'Administrator',
      description: 'Zarządzaj całym portalem',
      image: adminImg,
      route: '/admin/dashboard',
      isEnabled: isAdminAccount
    },
    {
      type: 'sales',
      label: isSalesAdmin ? 'CRM Sprzedaż' : 'Handlowiec',
      description: 'Kontakty, leady i sprzedaż',
      image: salesImg,
      route: '/sprzedaz',
      isEnabled: hasSalesAccess
    },
    {
      type: 'fleet',
      label: 'Flota',
      description: 'Zarządzaj pojazdami i kierowcami',
      image: fleetImg,
      route: '/fleet/dashboard',
      isEnabled: isFleetAccount
    },
    {
      type: 'driver',
      label: 'Kierowca',
      description: 'Rozliczenia i dokumenty',
      image: driverImg,
      route: '/driver',
      isEnabled: showDriverOption
    },
    {
      type: 'service_provider',
      label: 'Panel Usługodawcy',
      description: 'Zarządzanie usługami i zleceniami',
      image: clientPortalImg,
      route: '/uslugi/panel',
      isEnabled: isServiceProvider
    },
    {
      type: 'client',
      label: 'Portal Klienta',
      description: 'Twoje konto i ustawienia',
      image: clientPortalImg,
      route: '/klient',
      isEnabled: isClientPortal
    }
  ];

  // Filter to only show enabled accounts (excluding client portal which is always base)
  const enabledAccounts = accounts.filter(acc => acc.isEnabled && acc.type !== 'client');

  // Check if user has any specialized accounts
  const hasNoSpecializedAccounts = enabledAccounts.length === 0;

  // Registration options for new accounts
  const registrationOptions: RegistrationOption[] = [
    {
      id: 'driver',
      label: 'Portal Kierowcy',
      description: 'Dla kierowców pracujących we flotach',
      image: driverImg,
      route: '/driver/register',
      available: true
    },
    {
      id: 'fleet',
      label: 'Rozliczenia i Flota',
      description: 'Zarządzanie flotą i kierowcami',
      image: fleetImg,
      route: '/fleet/rejestracja',
      available: true
    },
    {
      id: 'marketplace',
      label: 'Giełda Aut',
      description: 'Kupuj i sprzedawaj pojazdy',
      image: clientPortalImg,
      route: '/gielda/rejestracja',
      available: false
    },
    {
      id: 'real_estate',
      label: 'Nieruchomości',
      description: 'Dla agencji nieruchomości',
      image: clientPortalImg,
      route: '/nieruchomosci/agent/rejestracja',
      available: false
    },
    {
      id: 'services',
      label: 'Usługi',
      description: 'Dla firm usługowych',
      image: clientPortalImg,
      route: '/uslugi/rejestracja',
      available: false
    }
  ];

  // Filter out registration options for accounts user already has
  const availableRegistrationOptions = registrationOptions.filter(opt => {
    if (opt.id === 'driver' && isDriverAccount) return false;
    if (opt.id === 'fleet' && isFleetAccount) return false;
    return true;
  });

  const handleAccountClick = (account: AccountOption) => {
    if (account.type === currentAccountType) return;
    navigate(account.route);
  };

  const handleRegistrationClick = (option: RegistrationOption) => {
    if (!option.available) return;
    setShowAddAccountDialog(false);
    navigate(option.route);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          {hasNoSpecializedAccounts ? "Dodaj nowe konto" : "Wybierz moduł"}
        </CardTitle>
        <CardDescription>
          {hasNoSpecializedAccounts 
            ? "Wybierz rodzaj konta, które chcesz utworzyć"
            : "Przełącz między modułami lub dodaj nowy"
          }
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasNoSpecializedAccounts ? (
          /* Show registration options as tiles when no accounts */
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {availableRegistrationOptions.map((option) => (
              <div
                key={option.id}
                className={`border-2 rounded-xl overflow-hidden transition-all ${
                  option.available 
                    ? 'cursor-pointer hover:shadow-lg hover:border-primary border-border' 
                    : 'opacity-60 cursor-not-allowed bg-muted/30 border-muted'
                }`}
                onClick={() => option.available && handleRegistrationClick(option)}
              >
                <div className="aspect-[4/3] relative overflow-hidden">
                  <img 
                    src={option.image} 
                    alt={option.label}
                    className="w-full h-full object-cover"
                  />
                  {!option.available && (
                    <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                      <Badge variant="secondary" className="text-xs">
                        <Lock className="h-3 w-3 mr-1" />
                        Wkrótce
                      </Badge>
                    </div>
                  )}
                </div>
                <div className="p-3 text-center">
                  <p className="font-medium text-sm">{option.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{option.description}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Show account tiles when user has accounts */
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Portal Klienta - always first */}
            <div 
              className={`border-2 rounded-xl overflow-hidden transition-all ${
                currentAccountType === 'client' 
                  ? 'border-primary ring-2 ring-primary/20' 
                  : 'border-border cursor-pointer hover:shadow-lg hover:border-primary/50'
              }`}
              onClick={() => currentAccountType !== 'client' && navigate('/klient')}
            >
              <div className="aspect-[4/3] relative overflow-hidden">
                <img 
                  src={clientPortalImg} 
                  alt="Portal Klienta"
                  className="w-full h-full object-cover"
                />
                {currentAccountType === 'client' && (
                  <div className="absolute top-2 right-2">
                    <Badge className="text-xs bg-primary">aktywne</Badge>
                  </div>
                )}
              </div>
              <div className="p-3 text-center bg-background">
                <p className="font-medium text-sm">Portal Klienta</p>
                <p className="text-xs text-muted-foreground mt-1">Twoje konto i ustawienia</p>
              </div>
            </div>

            {enabledAccounts.map((account) => {
              const isActive = account.type === currentAccountType;
              return (
                <div 
                  key={account.type}
                  className={`border-2 rounded-xl overflow-hidden transition-all ${
                    isActive 
                      ? 'border-primary ring-2 ring-primary/20' 
                      : 'border-border cursor-pointer hover:shadow-lg hover:border-primary/50'
                  }`}
                  onClick={() => !isActive && handleAccountClick(account)}
                >
                  <div className="aspect-[4/3] relative overflow-hidden">
                    <img 
                      src={account.image} 
                      alt={account.label}
                      className="w-full h-full object-cover"
                    />
                    {isActive && (
                      <div className="absolute top-2 right-2">
                        <Badge className="text-xs bg-primary">aktywne</Badge>
                      </div>
                    )}
                  </div>
                  <div className="p-3 text-center bg-background">
                    <p className="font-medium text-sm">{account.label}</p>
                    <p className="text-xs text-muted-foreground mt-1">{account.description}</p>
                  </div>
                </div>
              );
            })}

            {/* Add account tile */}
            <div 
              className="border-2 border-dashed rounded-xl overflow-hidden cursor-pointer hover:bg-muted/50 hover:border-primary/50 transition-all flex flex-col"
              onClick={() => setShowAddAccountDialog(true)}
            >
              <div className="aspect-[4/3] flex items-center justify-center bg-muted/30">
                <Plus className="h-12 w-12 text-muted-foreground" />
              </div>
              <div className="p-3 text-center bg-background">
                <p className="font-medium text-sm text-muted-foreground">Dodaj moduł</p>
                <p className="text-xs text-muted-foreground mt-1">Rozszerz funkcjonalność</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>

      {/* Add Account Dialog */}
      <Dialog open={showAddAccountDialog} onOpenChange={setShowAddAccountDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Dodaj nowy moduł</DialogTitle>
            <DialogDescription>
              Wybierz moduł, który chcesz aktywować
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 pt-4">
            {availableRegistrationOptions.map((option) => (
              <div
                key={option.id}
                className={`border-2 rounded-xl overflow-hidden transition-all ${
                  option.available 
                    ? 'cursor-pointer hover:shadow-lg hover:border-primary border-border' 
                    : 'opacity-60 cursor-not-allowed bg-muted/30 border-muted'
                }`}
                onClick={() => option.available && handleRegistrationClick(option)}
              >
                <div className="aspect-[16/9] relative overflow-hidden">
                  <img 
                    src={option.image} 
                    alt={option.label}
                    className="w-full h-full object-cover"
                  />
                  {!option.available && (
                    <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                      <Badge variant="secondary" className="text-xs">
                        <Lock className="h-3 w-3 mr-1" />
                        Wkrótce
                      </Badge>
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="font-medium text-sm">{option.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{option.description}</p>
                </div>
              </div>
            ))}

            {availableRegistrationOptions.length === 0 && (
              <p className="col-span-2 text-center text-muted-foreground py-4">
                Masz już wszystkie dostępne typy kont
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

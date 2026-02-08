import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Car, Truck, User, Plus, Building2, Home, Globe, UserCircle, Briefcase, Wrench, Lock } from "lucide-react";

interface AccountSwitcherPanelProps {
  isDriverAccount: boolean;
  isFleetAccount: boolean;
  isMarketplaceAccount?: boolean; // Optional - not used anymore
  isRealEstateAccount?: boolean;
  isAdminAccount?: boolean;
  isClientPortal?: boolean;
  isSalesAdmin?: boolean;
  isSalesRep?: boolean;
  isMarketplaceEnabled?: boolean; // Optional - not used anymore
  currentAccountType: 'driver' | 'fleet' | 'admin' | 'client' | 'sales';
  navigate: ReturnType<typeof useNavigate>;
  hideDriverForFleet?: boolean;
}

interface AccountOption {
  type: 'driver' | 'fleet' | 'admin' | 'client' | 'sales';
  label: string;
  icon: React.ReactNode;
  route: string;
  isEnabled: boolean;
}

interface RegistrationOption {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
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
  currentAccountType,
  navigate,
  hideDriverForFleet = false
}: AccountSwitcherPanelProps) {
  const [showAddAccountDialog, setShowAddAccountDialog] = useState(false);
  
  const hasSalesAccess = isSalesAdmin || isSalesRep;
  const showDriverOption = isDriverAccount && !hideDriverForFleet;

  // Build list of all available accounts for this user (excluding Giełda and Nieruchomości)
  const accounts: AccountOption[] = [
    {
      type: 'admin',
      label: 'Administrator',
      icon: <Globe className="h-8 w-8" />,
      route: '/admin/dashboard',
      isEnabled: isAdminAccount
    },
    {
      type: 'sales',
      label: isSalesAdmin ? 'CRM Sprzedaż' : 'Handlowiec',
      icon: <Briefcase className="h-8 w-8" />,
      route: '/sprzedaz',
      isEnabled: hasSalesAccess
    },
    {
      type: 'fleet',
      label: 'Flota',
      icon: <Truck className="h-8 w-8" />,
      route: '/fleet/dashboard',
      isEnabled: isFleetAccount
    },
    {
      type: 'driver',
      label: 'Kierowca',
      icon: <Car className="h-8 w-8" />,
      route: '/driver',
      isEnabled: showDriverOption
    },
    {
      type: 'client',
      label: 'Portal Klienta',
      icon: <UserCircle className="h-8 w-8" />,
      route: '/klient',
      isEnabled: isClientPortal
    }
    // Removed: marketplace and real_estate - not needed as separate accounts
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
      icon: <Car className="h-5 w-5" />,
      route: '/driver/register',
      available: true // Always available
    },
    {
      id: 'fleet',
      label: 'Rozliczenia i Flota',
      description: 'Zarządzanie flotą i kierowcami',
      icon: <Truck className="h-5 w-5" />,
      route: '/fleet/rejestracja',
      available: true // Always available
    },
    {
      id: 'marketplace',
      label: 'Giełda Aut',
      description: 'Kupuj i sprzedawaj pojazdy',
      icon: <User className="h-5 w-5" />,
      route: '/gielda/rejestracja',
      available: false // Coming soon
    },
    {
      id: 'real_estate',
      label: 'Nieruchomości',
      description: 'Dla agencji nieruchomości',
      icon: <Home className="h-5 w-5" />,
      route: '/nieruchomosci/agent/rejestracja',
      available: false // Coming soon
    },
    {
      id: 'services',
      label: 'Usługi',
      description: 'Dla firm usługowych',
      icon: <Wrench className="h-5 w-5" />,
      route: '/uslugi/rejestracja',
      available: false // Coming soon
    }
  ];

  // Filter out registration options for accounts user already has
  const availableRegistrationOptions = registrationOptions.filter(opt => {
    if (opt.id === 'driver' && isDriverAccount) return false;
    if (opt.id === 'fleet' && isFleetAccount) return false;
    // marketplace and real_estate registration options remain visible but marked as "coming soon"
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
          {hasNoSpecializedAccounts ? "Dodaj nowe konto" : "Twoje konta"}
        </CardTitle>
        <CardDescription>
          {hasNoSpecializedAccounts 
            ? "Wybierz rodzaj konta, które chcesz utworzyć"
            : "Przełącz między swoimi kontami lub dodaj nowe"
          }
        </CardDescription>
      </CardHeader>
      <CardContent>
        {hasNoSpecializedAccounts ? (
          /* Show registration options directly when no accounts */
          <div className="space-y-3">
            {availableRegistrationOptions.map((option) => (
              <div
                key={option.id}
                className={`border rounded-xl p-4 transition-colors ${
                  option.available 
                    ? 'cursor-pointer hover:bg-muted hover:border-primary' 
                    : 'opacity-60 cursor-not-allowed bg-muted/30'
                }`}
                onClick={() => option.available && handleRegistrationClick(option)}
              >
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-lg ${option.available ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    {option.icon}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{option.label}</p>
                      {!option.available && (
                        <Badge variant="secondary" className="text-xs">
                          <Lock className="h-3 w-3 mr-1" />
                          Wkrótce
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{option.description}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Show account tiles when user has accounts */
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Portal Klienta - always first */}
            <div 
              className={`border-2 rounded-xl p-4 text-center transition-colors ${
                currentAccountType === 'client' 
                  ? 'border-primary bg-primary/5' 
                  : 'border-border cursor-pointer hover:bg-muted'
              }`}
              onClick={() => currentAccountType !== 'client' && navigate('/klient')}
            >
              <div className={`mx-auto mb-2 ${currentAccountType === 'client' ? 'text-primary' : 'text-muted-foreground'}`}>
                <UserCircle className="h-8 w-8 mx-auto" />
              </div>
              <p className="font-medium text-sm">Portal Klienta</p>
              {currentAccountType === 'client' && (
                <Badge className="mt-2 text-xs">aktywne</Badge>
              )}
            </div>

            {enabledAccounts.map((account) => {
              const isActive = account.type === currentAccountType;
              return (
                <div 
                  key={account.type}
                  className={`border-2 rounded-xl p-4 text-center transition-colors ${
                    isActive 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border cursor-pointer hover:bg-muted'
                  }`}
                  onClick={() => !isActive && handleAccountClick(account)}
                >
                  <div className={`mx-auto mb-2 ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                    {account.icon}
                  </div>
                  <p className="font-medium text-sm">{account.label}</p>
                  {isActive && (
                    <Badge className="mt-2 text-xs">aktywne</Badge>
                  )}
                </div>
              );
            })}

            {/* Add account tile */}
            <div 
              className="border-2 border-dashed rounded-xl p-4 text-center cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => setShowAddAccountDialog(true)}
            >
              <Plus className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-muted-foreground text-sm">Dodaj konto</p>
            </div>
          </div>
        )}
      </CardContent>

      {/* Add Account Dialog */}
      <Dialog open={showAddAccountDialog} onOpenChange={setShowAddAccountDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dodaj nowe konto</DialogTitle>
            <DialogDescription>
              Wybierz rodzaj konta, które chcesz utworzyć
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-4">
            {availableRegistrationOptions.map((option) => (
              <div
                key={option.id}
                className={`border rounded-lg p-3 transition-colors ${
                  option.available 
                    ? 'cursor-pointer hover:bg-muted hover:border-primary' 
                    : 'opacity-60 cursor-not-allowed bg-muted/30'
                }`}
                onClick={() => option.available && handleRegistrationClick(option)}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${option.available ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    {option.icon}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{option.label}</p>
                      {!option.available && (
                        <Badge variant="secondary" className="text-xs">
                          <Lock className="h-3 w-3 mr-1" />
                          Wkrótce
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{option.description}</p>
                  </div>
                </div>
              </div>
            ))}

            {availableRegistrationOptions.length === 0 && (
              <p className="text-center text-muted-foreground py-4">
                Masz już wszystkie dostępne typy kont
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

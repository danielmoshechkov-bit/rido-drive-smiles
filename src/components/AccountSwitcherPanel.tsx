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
  description: string;
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
      description: 'Zarządzaj całym portalem',
      icon: <Globe className="h-8 w-8" />,
      route: '/admin/dashboard',
      isEnabled: isAdminAccount
    },
    {
      type: 'sales',
      label: isSalesAdmin ? 'CRM Sprzedaż' : 'Handlowiec',
      description: 'Kontakty, leady i sprzedaż',
      icon: <Briefcase className="h-8 w-8" />,
      route: '/sprzedaz',
      isEnabled: hasSalesAccess
    },
    {
      type: 'fleet',
      label: 'Flota',
      description: 'Zarządzaj pojazdami i kierowcami',
      icon: <Truck className="h-8 w-8" />,
      route: '/fleet/dashboard',
      isEnabled: isFleetAccount
    },
    {
      type: 'driver',
      label: 'Kierowca',
      description: 'Rozliczenia i dokumenty',
      icon: <Car className="h-8 w-8" />,
      route: '/driver',
      isEnabled: showDriverOption
    },
    {
      type: 'client',
      label: 'Portal Klienta',
      description: 'Twoje konto i ustawienia',
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
                className={`border-2 rounded-xl p-4 text-center transition-all ${
                  option.available 
                    ? 'cursor-pointer hover:bg-primary/5 hover:border-primary border-primary/30 bg-primary/5' 
                    : 'opacity-60 cursor-not-allowed bg-muted/30 border-muted'
                }`}
                onClick={() => option.available && handleRegistrationClick(option)}
              >
                <div className={`mx-auto mb-2 p-3 rounded-lg w-fit ${
                  option.available ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                }`}>
                  {option.icon}
                </div>
                <p className="font-medium text-sm">{option.label}</p>
                <p className="text-xs text-muted-foreground mt-1">{option.description}</p>
                {!option.available && (
                  <Badge variant="secondary" className="mt-2 text-xs">
                    <Lock className="h-3 w-3 mr-1" />
                    Wkrótce
                  </Badge>
                )}
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
              <div className={`mx-auto mb-3 p-3 rounded-xl w-fit ${currentAccountType === 'client' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                <UserCircle className="h-8 w-8" />
              </div>
              <p className="font-medium text-sm">Portal Klienta</p>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">Twoje konto i ustawienia</p>
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
                  <div className={`mx-auto mb-3 p-3 rounded-xl w-fit ${isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    {account.icon}
                  </div>
                  <p className="font-medium text-sm">{account.label}</p>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{account.description}</p>
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
              <div className="mx-auto mb-3 p-3 rounded-xl w-fit bg-muted/50">
                <Plus className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground text-sm font-medium">Dodaj moduł</p>
              <p className="text-xs text-muted-foreground mt-1">Rozszerz funkcjonalność</p>
            </div>
          </div>
        )}
      </CardContent>

      {/* Add Account Dialog */}
      <Dialog open={showAddAccountDialog} onOpenChange={setShowAddAccountDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dodaj nowy moduł</DialogTitle>
            <DialogDescription>
              Wybierz moduł, który chcesz aktywować
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

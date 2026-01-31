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
import { Car, Truck, User, Plus, Building2, Home, Globe, UserCircle, Briefcase } from "lucide-react";

interface AccountSwitcherPanelProps {
  isDriverAccount: boolean;
  isFleetAccount: boolean;
  isMarketplaceAccount: boolean;
  isRealEstateAccount?: boolean;
  isAdminAccount?: boolean;
  isClientPortal?: boolean;
  isSalesAdmin?: boolean;
  isSalesRep?: boolean;
  isMarketplaceEnabled: boolean;
  currentAccountType: 'driver' | 'fleet' | 'marketplace' | 'real_estate' | 'admin' | 'client' | 'sales';
  navigate: ReturnType<typeof useNavigate>;
  hideDriverForFleet?: boolean;
}

interface AccountOption {
  type: 'driver' | 'fleet' | 'marketplace' | 'real_estate' | 'admin' | 'client' | 'sales';
  label: string;
  icon: React.ReactNode;
  route: string;
  isEnabled: boolean;
}

export function AccountSwitcherPanel({
  isDriverAccount,
  isFleetAccount,
  isMarketplaceAccount,
  isRealEstateAccount = false,
  isAdminAccount = false,
  isClientPortal = true,
  isSalesAdmin = false,
  isSalesRep = false,
  isMarketplaceEnabled,
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
    },
    {
      type: 'marketplace',
      label: 'Giełda',
      icon: <User className="h-8 w-8" />,
      route: '/gielda',
      isEnabled: isMarketplaceAccount
    },
    {
      type: 'real_estate',
      label: 'Nieruchomości',
      icon: <Home className="h-8 w-8" />,
      route: '/nieruchomosci/agent/panel',
      isEnabled: isRealEstateAccount
    }
  ];

  // Filter to only show enabled accounts
  const enabledAccounts = accounts.filter(acc => acc.isEnabled);

  const handleAccountClick = (account: AccountOption) => {
    if (account.type === currentAccountType) return;
    navigate(account.route);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Twoje konta
        </CardTitle>
        <CardDescription>
          Wybierz konto, na które chcesz się przełączyć, lub dodaj nowe
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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

          {/* Add account */}
          <div 
            className="border-2 border-dashed rounded-xl p-4 text-center cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => setShowAddAccountDialog(true)}
          >
            <Plus className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
            <p className="text-muted-foreground text-sm">Dodaj konto</p>
          </div>
        </div>
      </CardContent>

      {/* Add Account Dialog */}
      <Dialog open={showAddAccountDialog} onOpenChange={setShowAddAccountDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dodaj nowe konto</DialogTitle>
            <DialogDescription>
              Wybierz rodzaj konta, które chcesz dodać
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 pt-4">
            {/* Add marketplace account - always show (marketplace is open) */}
            {!isMarketplaceAccount && (
              <Button 
                variant="outline" 
                className="w-full justify-start h-auto py-3"
                onClick={() => {
                  setShowAddAccountDialog(false);
                  navigate("/gielda/rejestracja");
                }}
              >
                <User className="h-5 w-5 mr-3" />
                <div className="text-left">
                  <p className="font-medium">Konto giełda</p>
                  <p className="text-xs text-muted-foreground">Kupuj i sprzedawaj pojazdy</p>
                </div>
              </Button>
            )}

            {/* Add driver account */}
            {!isDriverAccount && (
              <Button 
                variant="outline" 
                className="w-full justify-start h-auto py-3"
                onClick={() => {
                  setShowAddAccountDialog(false);
                  navigate("/driver/register");
                }}
              >
                <Car className="h-5 w-5 mr-3" />
                <div className="text-left">
                  <p className="font-medium">Konto kierowcy</p>
                  <p className="text-xs text-muted-foreground">Pracuj jako kierowca</p>
                </div>
              </Button>
            )}

            {/* Add real estate agent account */}
            {!isRealEstateAccount && (
              <Button 
                variant="outline" 
                className="w-full justify-start h-auto py-3"
                onClick={() => {
                  setShowAddAccountDialog(false);
                  navigate("/nieruchomosci/agent/rejestracja");
                }}
              >
                <Home className="h-5 w-5 mr-3" />
                <div className="text-left">
                  <p className="font-medium">Konto agenta nieruchomości</p>
                  <p className="text-xs text-muted-foreground">Publikuj oferty nieruchomości</p>
                </div>
              </Button>
            )}

            {/* Add fleet account - coming soon */}
            {!isFleetAccount && (
              <Button 
                variant="outline" 
                className="w-full justify-start h-auto py-3"
                disabled
              >
                <Truck className="h-5 w-5 mr-3" />
                <div className="text-left flex-1">
                  <p className="font-medium">Konto flotowe</p>
                  <p className="text-xs text-muted-foreground">Zarządzaj flotą pojazdów</p>
                </div>
                <Badge variant="secondary" className="ml-2">wkrótce</Badge>
              </Button>
            )}

            {/* Show "all accounts" message only when truly all account types are present */}
            {(isDriverAccount || hideDriverForFleet) && 
             isFleetAccount && 
             isMarketplaceAccount &&
             isRealEstateAccount && (
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

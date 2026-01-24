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
import { Car, Truck, User, Plus, Building2, Home, Globe } from "lucide-react";

interface AccountSwitcherPanelProps {
  isDriverAccount: boolean;
  isFleetAccount: boolean;
  isMarketplaceAccount: boolean;
  isRealEstateAccount?: boolean;
  isAdminAccount?: boolean;
  isMarketplaceEnabled: boolean;
  currentAccountType: 'driver' | 'fleet' | 'marketplace' | 'real_estate' | 'admin';
  navigate: ReturnType<typeof useNavigate>;
  hideDriverForFleet?: boolean;
}

export function AccountSwitcherPanel({
  isDriverAccount,
  isFleetAccount,
  isMarketplaceAccount,
  isRealEstateAccount = false,
  isAdminAccount = false,
  isMarketplaceEnabled,
  currentAccountType,
  navigate,
  hideDriverForFleet = false
}: AccountSwitcherPanelProps) {
  const [showAddAccountDialog, setShowAddAccountDialog] = useState(false);
  
  const showDriverOption = isDriverAccount && !hideDriverForFleet;

  const handleAccountClick = (type: 'driver' | 'fleet' | 'marketplace' | 'real_estate' | 'admin') => {
    if (type === currentAccountType) return;
    
    switch (type) {
      case 'driver':
        navigate('/driver');
        break;
      case 'fleet':
        navigate('/fleet/dashboard');
        break;
      case 'marketplace':
        navigate('/gielda');
        break;
      case 'real_estate':
        navigate('/nieruchomosci/agent/panel');
        break;
      case 'admin':
        navigate('/admin/dashboard');
        break;
    }
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
          {/* Admin account */}
          {isAdminAccount && (
            <div 
              className={`border-2 rounded-xl p-4 text-center transition-colors ${
                currentAccountType === 'admin' 
                  ? 'border-primary bg-primary/5' 
                  : 'border-border cursor-pointer hover:bg-muted'
              }`}
              onClick={() => handleAccountClick('admin')}
            >
              <Globe className={`h-8 w-8 mx-auto mb-2 ${currentAccountType === 'admin' ? 'text-primary' : 'text-muted-foreground'}`} />
              <p className="font-medium text-sm">Administrator</p>
              {currentAccountType === 'admin' && (
                <Badge className="mt-2 text-xs">aktywne</Badge>
              )}
            </div>
          )}

          {/* Driver account */}
          {showDriverOption && (
            <div 
              className={`border-2 rounded-xl p-4 text-center transition-colors ${
                currentAccountType === 'driver' 
                  ? 'border-primary bg-primary/5' 
                  : 'border-border cursor-pointer hover:bg-muted'
              }`}
              onClick={() => handleAccountClick('driver')}
            >
              <Car className={`h-8 w-8 mx-auto mb-2 ${currentAccountType === 'driver' ? 'text-primary' : 'text-muted-foreground'}`} />
              <p className="font-medium text-sm">Kierowca</p>
              {currentAccountType === 'driver' && (
                <Badge className="mt-2 text-xs">aktywne</Badge>
              )}
            </div>
          )}

          {/* Fleet account */}
          {isFleetAccount && (
            <div 
              className={`border-2 rounded-xl p-4 text-center transition-colors ${
                currentAccountType === 'fleet' 
                  ? 'border-primary bg-primary/5' 
                  : 'border-border cursor-pointer hover:bg-muted'
              }`}
              onClick={() => handleAccountClick('fleet')}
            >
              <Truck className={`h-8 w-8 mx-auto mb-2 ${currentAccountType === 'fleet' ? 'text-primary' : 'text-muted-foreground'}`} />
              <p className="font-medium text-sm">Flota</p>
              {currentAccountType === 'fleet' && (
                <Badge className="mt-2 text-xs">aktywne</Badge>
              )}
            </div>
          )}

          {/* Marketplace account */}
          {isMarketplaceAccount && (
            <div 
              className={`border-2 rounded-xl p-4 text-center transition-colors ${
                currentAccountType === 'marketplace' 
                  ? 'border-primary bg-primary/5' 
                  : 'border-border cursor-pointer hover:bg-muted'
              }`}
              onClick={() => handleAccountClick('marketplace')}
            >
              <User className={`h-8 w-8 mx-auto mb-2 ${currentAccountType === 'marketplace' ? 'text-primary' : 'text-muted-foreground'}`} />
              <p className="font-medium text-sm">Giełda</p>
              {currentAccountType === 'marketplace' && (
                <Badge className="mt-2 text-xs">aktywne</Badge>
              )}
            </div>
          )}

          {/* Real Estate account */}
          {isRealEstateAccount && (
            <div 
              className={`border-2 rounded-xl p-4 text-center transition-colors ${
                currentAccountType === 'real_estate' 
                  ? 'border-primary bg-primary/5' 
                  : 'border-border cursor-pointer hover:bg-muted'
              }`}
              onClick={() => handleAccountClick('real_estate')}
            >
              <Home className={`h-8 w-8 mx-auto mb-2 ${currentAccountType === 'real_estate' ? 'text-primary' : 'text-muted-foreground'}`} />
              <p className="font-medium text-sm">Nieruchomości</p>
              {currentAccountType === 'real_estate' && (
                <Badge className="mt-2 text-xs">aktywne</Badge>
              )}
            </div>
          )}

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
            {/* Add marketplace account */}
            {!isMarketplaceAccount && isMarketplaceEnabled && (
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
             (isMarketplaceAccount || !isMarketplaceEnabled) &&
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

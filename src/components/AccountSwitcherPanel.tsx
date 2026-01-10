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
import { Car, Truck, User, Plus, Building2 } from "lucide-react";

interface AccountSwitcherPanelProps {
  isDriverAccount: boolean;
  isFleetAccount: boolean;
  isMarketplaceAccount: boolean;
  isMarketplaceEnabled: boolean;
  currentAccountType: 'driver' | 'fleet' | 'marketplace';
  navigate: ReturnType<typeof useNavigate>;
}

export function AccountSwitcherPanel({
  isDriverAccount,
  isFleetAccount,
  isMarketplaceAccount,
  isMarketplaceEnabled,
  currentAccountType,
  navigate
}: AccountSwitcherPanelProps) {
  const [showAddAccountDialog, setShowAddAccountDialog] = useState(false);

  const handleAccountClick = (type: 'driver' | 'fleet' | 'marketplace') => {
    if (type === currentAccountType) return;
    
    switch (type) {
      case 'driver':
        navigate('/driver');
        break;
      case 'fleet':
        navigate('/fleet/dashboard');
        break;
      case 'marketplace':
        navigate('/gielda/panel');
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
          {/* Driver account */}
          {isDriverAccount && (
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

            {isDriverAccount && isFleetAccount && (isMarketplaceAccount || !isMarketplaceEnabled) && (
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

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogIn, User, Heart, Bell, LayoutGrid, Car, Truck, Store, Home } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";

interface MarketplaceHeaderProps {
  user: any;
  favoritesCount?: number;
}

export function MarketplaceHeader({ user, favoritesCount = 0 }: MarketplaceHeaderProps) {
  const navigate = useNavigate();
  const { features } = useFeatureToggles();
  const [isDriverAccount, setIsDriverAccount] = useState(false);
  const [isFleetAccount, setIsFleetAccount] = useState(false);

  useEffect(() => {
    if (user) {
      // Check for driver account
      supabase
        .from("driver_app_users")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle()
        .then(({ data }) => setIsDriverAccount(!!data));

      // Check for fleet account
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["fleet_settlement", "fleet_rental"])
        .then(({ data }) => setIsFleetAccount(!!data && data.length > 0));
    } else {
      setIsDriverAccount(false);
      setIsFleetAccount(false);
    }
  }, [user]);

  const hasMultipleAccounts = isDriverAccount || isFleetAccount;
  const showAccountSwitcher = features?.account_switching_enabled && user && hasMultipleAccounts;

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div 
            className="flex items-center gap-3 cursor-pointer" 
            onClick={() => navigate("/gielda")}
          >
            <img 
              src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" 
              alt="RIDO Logo" 
              className="h-9 w-9"
            />
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                RIDO <span className="text-primary">Marketplace</span>
              </h1>
            </div>
          </div>

          {/* Navigation */}
          <nav className="hidden md:flex items-center gap-6">
            <a 
              href="/easy" 
              className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
            >
              <Home className="h-4 w-4" />
              GetRido Easy
            </a>
            <a href="/gielda" className="text-sm font-medium hover:text-primary transition-colors">
              Pojazdy
            </a>
            <span className="text-sm text-muted-foreground cursor-not-allowed">
              Usługi (wkrótce)
            </span>
            <span className="text-sm text-muted-foreground cursor-not-allowed">
              Mini-market (wkrótce)
            </span>
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {user ? (
              <>
                {/* Account Switcher */}
                {showAccountSwitcher && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon" className="relative">
                        <LayoutGrid className="h-5 w-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>Wybierz moduł</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      
                      {/* Current: Marketplace */}
                      <DropdownMenuItem disabled className="flex items-center gap-2 bg-muted/50">
                        <Store className="h-4 w-4" />
                        <span>Giełda (marketplace)</span>
                        <Badge variant="outline" className="ml-auto text-xs">aktywne</Badge>
                      </DropdownMenuItem>

                      {/* Driver Panel */}
                      {isDriverAccount && (
                        <DropdownMenuItem 
                          onClick={() => navigate('/driver')}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <Car className="h-4 w-4" />
                          <span>Panel kierowcy</span>
                        </DropdownMenuItem>
                      )}

                      {/* Fleet Panel */}
                      {isFleetAccount && (
                        <DropdownMenuItem 
                          onClick={() => navigate('/fleet/dashboard')}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <Truck className="h-4 w-4" />
                          <span>Panel flotowy</span>
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                <Button variant="ghost" size="icon" className="relative">
                  <Heart className="h-5 w-5" />
                  {favoritesCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs w-5 h-5 rounded-full flex items-center justify-center">
                      {favoritesCount}
                    </span>
                  )}
                </Button>
                <Button variant="ghost" size="icon">
                  <Bell className="h-5 w-5" />
                </Button>
                <Button variant="outline" onClick={() => navigate("/gielda/panel")}>
                  <User className="h-4 w-4 mr-2" />
                  Moje konto
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => navigate("/gielda/logowanie")}>
                  <LogIn className="h-4 w-4 mr-2" />
                  Zaloguj
                </Button>
                <Button onClick={() => navigate("/gielda/rejestracja")}>
                  Dołącz za darmo
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

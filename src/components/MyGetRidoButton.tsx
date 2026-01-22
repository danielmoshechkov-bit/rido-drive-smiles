import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { User, ChevronDown, LogOut, Car, Building2, Home as HomeIcon, ShoppingCart, Calculator } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthModal } from "@/components/auth/AuthModal";

interface MyGetRidoButtonProps {
  user: any;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export function MyGetRidoButton({ user, variant = "outline", size = "sm", className }: MyGetRidoButtonProps) {
  const navigate = useNavigate();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [accountTypes, setAccountTypes] = useState<{
    isDriver: boolean;
    isFleet: boolean;
    isMarketplace: boolean;
    isRealEstate: boolean;
    isAdmin: boolean;
    isAccounting: boolean;
  }>({
    isDriver: false,
    isFleet: false,
    isMarketplace: false,
    isRealEstate: false,
    isAdmin: false,
    isAccounting: false,
  });

  useEffect(() => {
    if (!user) return;
    
    const checkAccountTypes = async () => {
      // Check for driver
      const { data: driverApp } = await supabase
        .from("driver_app_users")
        .select("driver_id")
        .eq("user_id", user.id)
        .maybeSingle();
      
      // Check for fleet roles
      const { data: fleetRoles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["fleet_settlement", "fleet_rental"]);
      
      // Check for marketplace
      const { data: marketplaceProfile } = await supabase
        .from("marketplace_user_profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      
      // Check for real estate
      const { data: realEstateRoles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["real_estate_agent", "real_estate_admin"]);
      
      // Check for admin
      const { data: adminRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      
      // Check for accounting admin
      const { data: accountingRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "accounting_admin")
        .maybeSingle();
      
      setAccountTypes({
        isDriver: !!driverApp?.driver_id,
        isFleet: !!fleetRoles && fleetRoles.length > 0,
        isMarketplace: !!marketplaceProfile,
        isRealEstate: !!realEstateRoles && realEstateRoles.length > 0,
        isAdmin: !!adminRole,
        isAccounting: !!accountingRole,
      });
    };
    
    checkAccountTypes();
  }, [user]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  const openLoginModal = () => {
    setAuthMode("login");
    setShowAuthModal(true);
  };

  const openRegisterModal = () => {
    setAuthMode("register");
    setShowAuthModal(true);
  };

  // If user is not logged in, show auth modal trigger
  if (!user) {
    return (
      <>
        <Button 
          variant={variant} 
          size={size} 
          onClick={openLoginModal}
          className={className}
        >
          <User className="h-4 w-4 mr-2" />
          Moje GetRido
        </Button>
        
        <AuthModal 
          open={showAuthModal} 
          onOpenChange={setShowAuthModal}
          initialMode={authMode}
        />
      </>
    );
  }

  // User is logged in - show dropdown with their accounts
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant={variant} size={size} className={className}>
          <User className="h-4 w-4 mr-2" />
          Moje GetRido
          <ChevronDown className="h-3 w-3 ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {accountTypes.isAdmin && (
          <DropdownMenuItem onClick={() => navigate('/admin/dashboard')}>
            <Building2 className="h-4 w-4 mr-2" />
            Panel Administracyjny
          </DropdownMenuItem>
        )}
        {accountTypes.isFleet && (
          <DropdownMenuItem onClick={() => navigate('/fleet')}>
            <Car className="h-4 w-4 mr-2" />
            Zarządzanie Flotą
          </DropdownMenuItem>
        )}
        {accountTypes.isDriver && (
          <DropdownMenuItem onClick={() => navigate('/driver')}>
            <User className="h-4 w-4 mr-2" />
            Portal Kierowcy
          </DropdownMenuItem>
        )}
        {accountTypes.isMarketplace && (
          <DropdownMenuItem onClick={() => navigate('/gielda/panel')}>
            <ShoppingCart className="h-4 w-4 mr-2" />
            Panel Giełdy
          </DropdownMenuItem>
        )}
        {accountTypes.isRealEstate && (
          <DropdownMenuItem onClick={() => navigate('/nieruchomosci/agent/panel')}>
          <HomeIcon className="h-4 w-4 mr-2" />
            Panel Nieruchomości
          </DropdownMenuItem>
        )}
        {(accountTypes.isAccounting || accountTypes.isAdmin) && (
          <DropdownMenuItem onClick={() => navigate('/ksiegowosc')}>
            <Calculator className="h-4 w-4 mr-2" />
            Panel Księgowy
          </DropdownMenuItem>
        )}
        
        {/* If no specific account, go to marketplace panel by default */}
        {!accountTypes.isAdmin && !accountTypes.isFleet && !accountTypes.isDriver && 
         !accountTypes.isMarketplace && !accountTypes.isRealEstate && (
          <DropdownMenuItem onClick={() => navigate('/gielda/panel')}>
            <ShoppingCart className="h-4 w-4 mr-2" />
            Mój panel
          </DropdownMenuItem>
        )}
        
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="text-destructive">
          <LogOut className="h-4 w-4 mr-2" />
          Wyloguj
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { User, ChevronDown, LogOut, Car, Building2, Home as HomeIcon, ShoppingCart, Calculator, FileText, UserCircle, Wrench } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthModal } from "@/components/auth/AuthModal";
import { cn } from "@/lib/utils";

interface MyGetRidoButtonProps {
  user: any;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
}

export function MyGetRidoButton({ user, variant = "outline", size = "sm", className }: MyGetRidoButtonProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [accountTypes, setAccountTypes] = useState<{
    isDriver: boolean;
    isFleet: boolean;
    isMarketplace: boolean;
    isRealEstate: boolean;
    isAdmin: boolean;
    isAccounting: boolean;
    isServiceProvider: boolean;
  }>({
    isDriver: false,
    isFleet: false,
    isMarketplace: false,
    isRealEstate: false,
    isAdmin: false,
    isAccounting: false,
    isServiceProvider: false,
  });

  useEffect(() => {
    if (!user) return;
    
    const checkAccountTypes = async () => {
      // Check for main admin by email first
      const isMainAdmin = user.email === 'daniel.moshechkov@gmail.com';
      
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
      
      // Check for admin role in database
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
      
      // Check for service provider
      const { data: serviceProviderRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "service_provider")
        .maybeSingle();
      
      setAccountTypes({
        isDriver: !!driverApp?.driver_id,
        isFleet: !!fleetRoles && fleetRoles.length > 0,
        isMarketplace: !!marketplaceProfile,
        isRealEstate: !!realEstateRoles && realEstateRoles.length > 0,
        isAdmin: isMainAdmin || !!adminRole,
        isAccounting: !!accountingRole,
        isServiceProvider: !!serviceProviderRole,
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
          className={cn("text-xs sm:text-sm px-2 sm:px-3", className)}
        >
          <User className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
          <span className="hidden sm:inline">{t('myAccount.title')}</span>
          <span className="sm:hidden">{t('myAccount.titleShort')}</span>
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
        <Button variant={variant} size={size} className={cn("text-xs sm:text-sm px-2 sm:px-3", className)}>
          <User className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
          <span className="hidden sm:inline">{t('myAccount.title')}</span>
          <span className="sm:hidden">{t('myAccount.titleShort')}</span>
          <ChevronDown className="h-3 w-3 ml-0.5 sm:ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {accountTypes.isAdmin && (
          <DropdownMenuItem onClick={() => navigate('/admin/dashboard')}>
            <Building2 className="h-4 w-4 mr-2" />
            {t('myAccount.adminPanel')}
          </DropdownMenuItem>
        )}
        {accountTypes.isFleet && (
          <DropdownMenuItem onClick={() => navigate('/fleet/dashboard')}>
            <Car className="h-4 w-4 mr-2" />
            {t('myAccount.fleetPanel')}
          </DropdownMenuItem>
        )}
        {/* Portal Kierowcy - only shown if user has driver role */}
        {/* Panel Giełdy removed - users go through Portal Klienta */}
        {accountTypes.isRealEstate && (
          <DropdownMenuItem onClick={() => navigate('/nieruchomosci/agent/panel')}>
          <HomeIcon className="h-4 w-4 mr-2" />
            {t('myAccount.realEstatePanel')}
          </DropdownMenuItem>
        )}
        {(accountTypes.isAccounting || accountTypes.isAdmin) && (
          <DropdownMenuItem onClick={() => navigate('/ksiegowosc')}>
            <Calculator className="h-4 w-4 mr-2" />
            {t('myAccount.accountingPanel')}
          </DropdownMenuItem>
        )}
        
        {/* Client Portal - always available for logged in users */}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/klient')}>
          <UserCircle className="h-4 w-4 mr-2" />
          {t('myAccount.clientPortal')}
        </DropdownMenuItem>
        
        {/* Service Provider Panel */}
        {accountTypes.isServiceProvider && (
          <DropdownMenuItem onClick={() => navigate('/uslugi/panel')}>
            <Wrench className="h-4 w-4 mr-2" />
            {t('myAccount.servicePanel')}
          </DropdownMenuItem>
        )}
        
        {/* Invoice button - only for users with accounting/service provider accounts */}
        {(accountTypes.isAccounting || accountTypes.isServiceProvider || accountTypes.isAdmin) && (
          <DropdownMenuItem onClick={() => navigate('/faktury')}>
            <FileText className="h-4 w-4 mr-2" />
            {t('myAccount.issueInvoice')}
          </DropdownMenuItem>
        )}
        
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} className="text-destructive">
          <LogOut className="h-4 w-4 mr-2" />
          {t('myAccount.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

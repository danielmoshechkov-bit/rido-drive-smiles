import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Car, Building, Sparkles, ArrowRight, Plus, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import { useUserRole } from "@/hooks/useUserRole";
import { AuthModal } from "@/components/auth/AuthModal";
import { isOwnerEmail } from "@/hooks/useOwnerAccess";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Import tile images
import tileCars from "@/assets/tile-cars.jpg";
import tileRealEstate from "@/assets/tile-realestate.jpg";
import tileHandyman from "@/assets/tile-handyman.jpg";

interface AddListingModalProps {
  user: any;
  trigger?: React.ReactNode;
}

interface CategoryTile {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  image: string;
  link: string;
  featureKey?: string;
  available: boolean;
  ownerOnly?: boolean; // New flag for owner-only features
}

const categories: CategoryTile[] = [
  {
    id: 'vehicles',
    title: 'Giełda Aut',
    description: 'Dodaj pojazd do sprzedaży, wynajmu lub leasingu',
    icon: Car,
    image: tileCars,
    link: '/gielda/dodaj-pojazd',
    featureKey: 'vehicle_marketplace_enabled',
    available: true,
    ownerOnly: true // Blocked for non-owners
  },
  {
    id: 'realestate',
    title: 'Nieruchomości',
    description: 'Dodaj mieszkanie, dom, działkę lub lokal',
    icon: Building,
    image: tileRealEstate,
    link: '/nieruchomosci/agent/panel?tab=add',
    featureKey: 'real_estate_marketplace_enabled',
    available: true,
    ownerOnly: true // Blocked for non-owners
  },
  {
    id: 'services',
    title: 'Usługi',
    description: 'Fachowcy, remonty, serwis',
    icon: Sparkles,
    image: tileHandyman,
    link: '/uslugi/dodaj',
    featureKey: 'services_marketplace_enabled',
    available: false,
    ownerOnly: true // Blocked for non-owners
  }
];

function CategoryTileCard({ 
  tile, 
  onClick,
  isOwner
}: { 
  tile: CategoryTile; 
  onClick: () => void;
  isOwner: boolean;
}) {
  const Icon = tile.icon;
  
  // Check if this tile is accessible
  const isAccessible = tile.available && (!tile.ownerOnly || isOwner);
  const showComingSoon = !tile.available || (tile.ownerOnly && !isOwner);
  
  return (
    <Card 
      className={cn(
        "group relative overflow-hidden cursor-pointer transition-all duration-300",
        "hover:shadow-xl hover:scale-[1.02]",
        "border-0 shadow-md",
        !isAccessible && "opacity-60 cursor-not-allowed hover:scale-100"
      )}
      onClick={() => isAccessible && onClick()}
    >
      {/* Background image */}
      <div 
        className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
        style={{ backgroundImage: `url(${tile.image})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20" />
      </div>
      
      {/* Content */}
      <CardContent className="relative z-10 p-4 h-32 flex flex-col justify-end">
        <div className="mb-2 p-2 rounded-lg w-fit bg-white/20 backdrop-blur-sm">
          <Icon className="h-5 w-5 text-white" />
        </div>
        <h3 className="font-bold text-base text-white leading-tight flex items-center gap-2">
          {tile.title}
          {showComingSoon && <Lock className="h-4 w-4 text-white/70" />}
        </h3>
        <p className="text-xs text-white/80 mt-1 line-clamp-2">
          {tile.description}
        </p>
        
        {showComingSoon && (
          <Badge 
            variant="secondary" 
            className="absolute top-2 right-2 text-xs px-2 py-0.5 bg-white/90"
          >
            Wkrótce
          </Badge>
        )}
        
        {isAccessible && (
          <div className="absolute top-2 right-2 p-1.5 rounded-full bg-white/20 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
            <ArrowRight className="h-3 w-3 text-white" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function AddListingModal({ user, trigger }: AddListingModalProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [pendingCategory, setPendingCategory] = useState<CategoryTile | null>(null);
  const { features } = useFeatureToggles();
  const { isAdmin } = useUserRole();
  const [isOwner, setIsOwner] = useState(false);
  
  // Check if current user is owner
  useEffect(() => {
    const checkOwner = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      setIsOwner(isOwnerEmail(currentUser?.email));
    };
    checkOwner();
  }, []);

  // Filter categories based on feature toggles and admin status
  const availableCategories = categories.map(cat => {
    // Admin/owner can always access Services
    if (cat.id === 'services' && (isAdmin || isOwner)) {
      return { ...cat, available: true };
    }
    return {
      ...cat,
      available: cat.featureKey ? features[cat.featureKey] !== false : cat.available
    };
  });

  const handleOpenModal = () => {
    // Check if user is owner for non-owners show toast
    if (user && !isOwnerEmail(user.email)) {
      toast.info('Ta funkcja będzie dostępna wkrótce');
      return;
    }
    // Always open category selection first, even for non-logged users
    setOpen(true);
  };

  const handleCategoryClick = (tile: CategoryTile) => {
    // Always navigate directly - login will be required at submit time
    setOpen(false);
    navigate(tile.link);
  };

  const handleAuthSuccess = () => {
    // After successful login, navigate to the pending category
    if (pendingCategory) {
      navigate(pendingCategory.link);
      setPendingCategory(null);
    }
  };

  return (
    <>
      {/* Trigger Button */}
      {trigger ? (
        <div onClick={handleOpenModal}>{trigger}</div>
      ) : (
        <Button onClick={handleOpenModal} size="sm" className="rounded-full text-xs sm:text-sm px-2 sm:px-3">
          <Plus className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-0.5 sm:mr-1" />
          <span className="hidden sm:inline">Dodaj ogłoszenie</span>
          <span className="sm:hidden">Dodaj</span>
        </Button>
      )}

      {/* Auth Modal - for non-logged users after category selection */}
      <AuthModal 
        open={showAuthModal} 
        onOpenChange={(open) => {
          setShowAuthModal(open);
          if (!open) setPendingCategory(null);
        }}
        initialMode="login"
        onSuccess={handleAuthSuccess}
      />

      {/* Category Selection Modal - always shown first */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Dodaj ogłoszenie
            </DialogTitle>
            <DialogDescription>
              Wybierz kategorię ogłoszenia, które chcesz dodać.
              {!user && (
                <span className="block mt-1 text-primary">
                  Po wyborze kategorii będziesz mógł się zalogować lub zarejestrować.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            {availableCategories.map((tile) => (
              <CategoryTileCard 
                key={tile.id}
                tile={tile}
                onClick={() => handleCategoryClick(tile)}
                isOwner={isOwner}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

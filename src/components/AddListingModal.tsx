import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Car, Building, Sparkles, ArrowRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";

// Import tile images
import tileCars from "@/assets/tile-cars.jpg";
import tileRealEstate from "@/assets/tile-realestate.jpg";
import tileServices from "@/assets/tile-services.jpg";

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
    available: true
  },
  {
    id: 'realestate',
    title: 'Nieruchomości',
    description: 'Dodaj mieszkanie, dom, działkę lub lokal',
    icon: Building,
    image: tileRealEstate,
    link: '/nieruchomosci/agent/panel?tab=add',
    featureKey: 'real_estate_marketplace_enabled',
    available: true
  },
  {
    id: 'services',
    title: 'Usługi',
    description: 'Fotograf, mechanik, ubezpieczenia...',
    icon: Sparkles,
    image: tileServices,
    link: '/uslugi/dodaj',
    featureKey: 'services_marketplace_enabled',
    available: false
  }
];

function CategoryTileCard({ 
  tile, 
  onClick 
}: { 
  tile: CategoryTile; 
  onClick: () => void 
}) {
  const Icon = tile.icon;
  
  return (
    <Card 
      className={cn(
        "group relative overflow-hidden cursor-pointer transition-all duration-300",
        "hover:shadow-xl hover:scale-[1.02]",
        "border-0 shadow-md",
        !tile.available && "opacity-60 cursor-not-allowed hover:scale-100"
      )}
      onClick={() => tile.available && onClick()}
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
        <h3 className="font-bold text-base text-white leading-tight">
          {tile.title}
        </h3>
        <p className="text-xs text-white/80 mt-1 line-clamp-2">
          {tile.description}
        </p>
        
        {!tile.available && (
          <Badge 
            variant="secondary" 
            className="absolute top-2 right-2 text-xs px-2 py-0.5 bg-white/90"
          >
            Wkrótce
          </Badge>
        )}
        
        {tile.available && (
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
  const [showAuthDialog, setShowAuthDialog] = useState(false);
  const { features } = useFeatureToggles();

  // Filter categories based on feature toggles
  const availableCategories = categories.map(cat => ({
    ...cat,
    available: cat.featureKey ? features[cat.featureKey] !== false : cat.available
  }));

  const handleOpenModal = () => {
    if (!user) {
      setShowAuthDialog(true);
    } else {
      setOpen(true);
    }
  };

  const handleCategoryClick = (tile: CategoryTile) => {
    setOpen(false);
    navigate(tile.link);
  };

  return (
    <>
      {/* Trigger Button */}
      {trigger ? (
        <div onClick={handleOpenModal}>{trigger}</div>
      ) : (
        <Button onClick={handleOpenModal} size="sm" className="rounded-full">
          <Plus className="h-4 w-4 mr-1" />
          Dodaj ogłoszenie
        </Button>
      )}

      {/* Auth Dialog - for non-logged users */}
      <Dialog open={showAuthDialog} onOpenChange={setShowAuthDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <img 
                src="/lovable-uploads/253e522c-702e-4ce9-9429-10ddbde63878.png" 
                alt="RIDO" 
                className="h-8 w-8"
              />
              Dodaj ogłoszenie
            </DialogTitle>
            <DialogDescription>
              Aby dodać ogłoszenie, zaloguj się lub zarejestruj.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 mt-4">
            <Button 
              onClick={() => {
                setShowAuthDialog(false);
                navigate('/auth');
              }}
              className="w-full"
            >
              Zaloguj się
            </Button>
            <Button 
              variant="outline"
              onClick={() => {
                setShowAuthDialog(false);
                navigate('/gielda/rejestracja');
              }}
              className="w-full"
            >
              Zarejestruj się
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Category Selection Modal - for logged users */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Dodaj ogłoszenie
            </DialogTitle>
            <DialogDescription>
              Wybierz kategorię ogłoszenia, które chcesz dodać.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            {availableCategories.map((tile) => (
              <CategoryTileCard 
                key={tile.id}
                tile={tile}
                onClick={() => handleCategoryClick(tile)}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

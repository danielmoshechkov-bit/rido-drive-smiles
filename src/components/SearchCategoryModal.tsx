import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Car, Building, Sparkles, ArrowRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";

// Import tile images
import tileCars from "@/assets/tile-cars.jpg";
import tileRealEstate from "@/assets/tile-realestate.jpg";
import tileHandyman from "@/assets/tile-handyman.jpg";

interface SearchCategoryModalProps {
  searchQuery?: string;
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
    title: 'Pojazdy',
    description: 'Samochody, motocykle, dostawcze',
    icon: Car,
    image: tileCars,
    link: '/gielda',
    featureKey: 'vehicle_marketplace_enabled',
    available: true
  },
  {
    id: 'realestate',
    title: 'Nieruchomości',
    description: 'Mieszkania, domy, działki, lokale',
    icon: Building,
    image: tileRealEstate,
    link: '/nieruchomosci',
    featureKey: 'real_estate_marketplace_enabled',
    available: true
  },
  {
    id: 'services',
    title: 'Usługi',
    description: 'Fachowcy, remonty, serwis',
    icon: Sparkles,
    image: tileHandyman,
    link: '/uslugi',
    featureKey: 'services_marketplace_enabled',
    available: true
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
        <p className="text-xs text-white/80 line-clamp-1 mt-0.5">
          {tile.description}
        </p>
        
        {!tile.available && (
          <Badge 
            variant="secondary" 
            className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 bg-white/90"
          >
            Wkrótce
          </Badge>
        )}
        
        {tile.available && (
          <div className="absolute top-2 right-2 p-1.5 rounded-full bg-white/20 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all">
            <ArrowRight className="h-3 w-3 text-white" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SearchCategoryModal({ searchQuery, trigger }: SearchCategoryModalProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { features } = useFeatureToggles();

  const handleCategorySelect = (tile: CategoryTile) => {
    setOpen(false);
    
    // Navigate to the category with optional search query
    if (searchQuery) {
      navigate(`${tile.link}?search=${encodeURIComponent(searchQuery)}`);
    } else {
      navigate(tile.link);
    }
  };

  // Filter categories based on feature flags
  const availableCategories = categories.map(cat => {
    if (cat.featureKey && features[cat.featureKey] === false) {
      return { ...cat, available: false };
    }
    return cat;
  });

  return (
    <>
      {trigger ? (
        <div onClick={() => setOpen(true)}>
          {trigger}
        </div>
      ) : (
        <Button
          onClick={() => setOpen(true)}
          className="rounded-full h-8 md:h-10 px-4 md:px-6"
        >
          Szukaj
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-4 bg-gradient-to-r from-primary/5 to-primary/10">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Search className="h-5 w-5 text-primary" />
              Gdzie szukasz?
            </DialogTitle>
            <DialogDescription>
              Wybierz kategorię, w której chcesz szukać
            </DialogDescription>
          </DialogHeader>

          <div className="p-6 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {availableCategories.map((tile) => (
                <CategoryTileCard 
                  key={tile.id} 
                  tile={tile} 
                  onClick={() => handleCategorySelect(tile)}
                />
              ))}
            </div>
            
            {/* AI Search hint */}
            <p className="text-center text-xs text-muted-foreground mt-4">
              Możesz też wpisać w wyszukiwarkę i naciśnij Enter dla wyszukiwania AI
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

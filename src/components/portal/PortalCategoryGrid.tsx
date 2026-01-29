import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight } from 'lucide-react';
import { usePortalCategories, PortalCategory } from '@/hooks/usePortalCategories';
import { Skeleton } from '@/components/ui/skeleton';

// Fallback images from existing assets
import tileCleaning from '@/assets/tile-cleaning.jpg';
import tileWorkshop from '@/assets/tile-workshop.jpg';
import tileDetailing from '@/assets/tile-detailing.jpg';
import tileHandyman from '@/assets/tile-handyman.jpg';
import tilePlumber from '@/assets/tile-plumber.jpg';
import tileElectrician from '@/assets/tile-electrician.jpg';
import tileGardener from '@/assets/tile-gardener.jpg';
import tileMoving from '@/assets/tile-moving.jpg';
import tilePpf from '@/assets/tile-ppf.jpg';
import tileInteriorDesign from '@/assets/tile-interior-design.jpg';
import tileRenovation from '@/assets/tile-renovation.jpg';
import tileConstruction from '@/assets/tile-construction.jpg';
import tileCars from '@/assets/tile-cars.jpg';
import tileFleet from '@/assets/tile-fleet.jpg';
import tileDriver from '@/assets/tile-driver.jpg';
import tileRealestate from '@/assets/tile-realestate.jpg';

// Map slugs to fallback images
const fallbackImages: Record<string, string> = {
  'sprzatanie': tileCleaning,
  'warsztat': tileWorkshop,
  'detailing': tileDetailing,
  'zlota-raczka': tileHandyman,
  'hydraulik': tilePlumber,
  'elektryk': tileElectrician,
  'ogrodnik': tileGardener,
  'przeprowadzki': tileMoving,
  'ppf': tilePpf,
  'projektanci': tileInteriorDesign,
  'remonty': tileRenovation,
  'budowlanka': tileConstruction,
  'pojazdy': tileCars,
  'portal-flotowy': tileFleet,
  'portal-kierowcy': tileDriver,
  'nieruchomosci': tileRealestate,
};

interface PortalCategoryTileProps {
  category: PortalCategory;
  onClick: () => void;
}

function PortalCategoryTile({ category, onClick }: PortalCategoryTileProps) {
  const imageUrl = category.image_url || fallbackImages[category.slug] || tileCars;

  return (
    <Card 
      className={cn(
        "group relative overflow-hidden cursor-pointer transition-all duration-300",
        "hover:shadow-xl hover:scale-[1.03] hover:-translate-y-1",
        "border-0 shadow-md"
      )}
      onClick={onClick}
    >
      {/* Background image */}
      <div 
        className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
        style={{ backgroundImage: `url(${imageUrl})` }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20" />
      </div>
      
      {/* Content */}
      <CardContent className="relative z-10 p-3 md:p-4 h-28 md:h-36 flex flex-col justify-end">
        <h3 className="font-bold text-sm md:text-base text-white leading-tight">
          {category.name}
        </h3>
        
        {/* Hover arrow */}
        <div className={cn(
          "absolute top-2 right-2 p-1.5 rounded-full transition-all duration-300",
          "opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0",
          "bg-white/20 backdrop-blur-sm"
        )}>
          <ArrowRight className="h-3 w-3 text-white" />
        </div>
      </CardContent>
    </Card>
  );
}

function PortalCategoryGridSkeleton() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-28 md:h-36 rounded-lg" />
      ))}
    </div>
  );
}

interface PortalCategoryGridProps {
  context: 'motoryzacja' | 'nieruchomosci' | 'uslugi';
  className?: string;
}

export function PortalCategoryGrid({ context, className }: PortalCategoryGridProps) {
  const navigate = useNavigate();
  const { categories, loading } = usePortalCategories(context);

  const handleCategoryClick = (category: PortalCategory) => {
    navigate(category.link_url);
  };

  if (loading) {
    return <PortalCategoryGridSkeleton />;
  }

  if (categories.length === 0) {
    return null;
  }

  return (
    <div className={cn(
      "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4",
      className
    )}>
      {categories.map((category) => (
        <PortalCategoryTile
          key={category.id}
          category={category}
          onClick={() => handleCategoryClick(category)}
        />
      ))}
    </div>
  );
}

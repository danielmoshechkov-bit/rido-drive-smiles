import { cn } from "@/lib/utils";
import { LucideIcon, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

// Image imports
import tileCleaning from "@/assets/tile-cleaning.jpg";
import tileWorkshop from "@/assets/tile-workshop.jpg";
import tileDetailing from "@/assets/tile-detailing.jpg";
import tileHandyman from "@/assets/tile-handyman.jpg";
import tilePlumber from "@/assets/tile-plumber.jpg";
import tileElectrician from "@/assets/tile-electrician.jpg";
import tileGardener from "@/assets/tile-gardener.jpg";
import tileMoving from "@/assets/tile-moving.jpg";
import tilePpf from "@/assets/tile-ppf.jpg";
import tileInteriorDesign from "@/assets/tile-interior-design.jpg";
import tileRenovation from "@/assets/tile-renovation.jpg";
import tileConstruction from "@/assets/tile-construction.jpg";

export const categoryImages: Record<string, string> = {
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
};

interface ServiceCategoryTileProps {
  slug: string;
  name: string;
  description?: string;
  icon?: LucideIcon; // Keep for compatibility but won't display
  onClick: () => void;
}

export function ServiceCategoryTile({ 
  slug, 
  name, 
  description, 
  onClick 
}: ServiceCategoryTileProps) {
  const imageUrl = categoryImages[slug] || tileCleaning;

  // Same style as EasyHub MarketplaceTileCard
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
      
      {/* Content - same height as EasyHub tiles */}
      <CardContent className="relative z-10 p-3 md:p-4 h-28 md:h-36 flex flex-col justify-end">
        <h3 className="font-bold text-sm md:text-base text-white leading-tight">
          {name}
        </h3>
        
        {description && (
          <p className="text-[10px] md:text-xs text-white/80 mt-0.5 line-clamp-2">
            {description}
          </p>
        )}
        
        {/* Hover arrow - same as EasyHub tiles */}
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

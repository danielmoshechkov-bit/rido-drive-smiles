import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

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

  return (
    <button
      onClick={onClick}
      className={cn(
        "relative overflow-hidden rounded-2xl aspect-[4/3] group",
        "transition-all duration-300 hover:scale-[1.02] hover:shadow-2xl",
        "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
      )}
    >
      {/* Background Image */}
      <img
        src={imageUrl}
        alt={name}
        className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
      />
      
      {/* Gradient Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20" />
      
      {/* Content - unified style without icons, matching EasyHub tiles */}
      <div className="absolute inset-0 flex flex-col justify-end p-3 md:p-4 text-left">
        <h3 className="font-bold text-sm md:text-base text-white leading-tight">
          {name}
        </h3>
        
        {description && (
          <p className="text-[10px] md:text-xs text-white/80 mt-0.5 line-clamp-2">
            {description}
          </p>
        )}
      </div>
      
      {/* Hover arrow - same as EasyHub tiles */}
      <div className={cn(
        "absolute top-2 right-2 p-1.5 rounded-full transition-all duration-300",
        "opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0",
        "bg-white/20 backdrop-blur-sm"
      )}>
        <svg className="h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </div>
    </button>
  );
}

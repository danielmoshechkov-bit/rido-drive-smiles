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

export const categoryImages: Record<string, string> = {
  'sprzatanie': tileCleaning,
  'warsztat': tileWorkshop,
  'detailing': tileDetailing,
  'zlota-raczka': tileHandyman,
  'hydraulik': tilePlumber,
  'elektryk': tileElectrician,
  'ogrodnik': tileGardener,
  'przeprowadzki': tileMoving,
};

interface ServiceCategoryTileProps {
  slug: string;
  name: string;
  description?: string;
  icon?: LucideIcon;
  onClick: () => void;
}

export function ServiceCategoryTile({ 
  slug, 
  name, 
  description, 
  icon: Icon,
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
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
      
      {/* Content */}
      <div className="absolute inset-0 flex flex-col justify-end p-4 text-left">
        <div className="flex items-center gap-2 mb-1">
          {Icon && (
            <div className="p-2 rounded-lg bg-white/20 backdrop-blur-sm">
              <Icon className="h-5 w-5 text-white" />
            </div>
          )}
          <h3 className="text-xl font-bold text-white drop-shadow-lg">
            {name}
          </h3>
        </div>
        
        {description && (
          <p className="text-sm text-white/80 line-clamp-2">
            {description}
          </p>
        )}
      </div>
      
      {/* Hover effect border */}
      <div className="absolute inset-0 border-2 border-transparent group-hover:border-white/30 rounded-2xl transition-all duration-300" />
    </button>
  );
}

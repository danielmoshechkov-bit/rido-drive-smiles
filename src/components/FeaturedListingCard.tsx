import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Car,
  Home, 
  Wrench, 
  Heart, 
  ChevronLeft, 
  ChevronRight,
  Calendar,
  Fuel,
  Gauge,
  MapPin,
  Maximize,
  BedDouble,
  Zap,
  Star
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ServiceInfo {
  name: string;
  price: number;
}

interface Listing {
  id: string;
  title: string;
  price: number;
  photos: string[];
  city?: string;
  category: 'vehicle' | 'property' | 'service';
  transaction_type?: string;
  year?: number;
  fuel_type?: string;
  power?: number;
  odometer?: number;
  area?: number;
  rooms?: number;
  rating_avg?: number;
  rating_count?: number;
  price_from?: number;
  featured_services?: ServiceInfo[];
}

interface FeaturedListingCardProps {
  listing: Listing;
  viewMode: 'grid' | 'compact' | 'list';
  onClick: () => void;
}

export function FeaturedListingCard({ listing, viewMode, onClick }: FeaturedListingCardProps) {
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const photos = listing.photos || [];
  const hasMultiplePhotos = photos.length > 1;

  const handlePrevPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentPhotoIndex(prev => (prev > 0 ? prev - 1 : photos.length - 1));
  };

  const handleNextPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentPhotoIndex(prev => (prev < photos.length - 1 ? prev + 1 : 0));
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'vehicle': return <Car className="h-3 w-3" />;
      case 'property': return <Home className="h-3 w-3" />;
      case 'service': return <Wrench className="h-3 w-3" />;
      default: return null;
    }
  };

  return (
    <Card 
      className="group cursor-pointer overflow-hidden hover:shadow-lg transition-all duration-300 border-0 shadow-sm"
      onClick={onClick}
    >
      <div className={cn(
        "relative",
        viewMode === 'list' ? "flex" : ""
      )}>
        {/* Image */}
        <div className={cn(
          "relative overflow-hidden bg-muted",
          viewMode === 'grid' && "aspect-[4/3]",
          viewMode === 'compact' && "aspect-video",
          viewMode === 'list' && "w-48 h-32 shrink-0"
        )}>
          {photos[currentPhotoIndex] ? (
            <img 
              src={photos[currentPhotoIndex]} 
              alt={listing.title}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              {getCategoryIcon(listing.category)}
            </div>
          )}
          
          {/* Favorite button */}
          <button 
            className="absolute top-2 right-2 p-2 rounded-full bg-white/90 hover:bg-white shadow-sm transition-all opacity-0 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              // TODO: Add to favorites
            }}
          >
            <Heart className="h-4 w-4 text-muted-foreground hover:text-red-500" />
          </button>

          {/* Category badge */}
          <Badge 
            className={cn(
              "absolute top-2 left-2 text-[10px] gap-1",
              listing.category === 'vehicle' && "bg-blue-500/90 hover:bg-blue-500",
              listing.category === 'property' && "bg-emerald-500/90 hover:bg-emerald-500",
              listing.category === 'service' && "bg-purple-500/90 hover:bg-purple-500"
            )}
          >
            {getCategoryIcon(listing.category)}
            {listing.category === 'vehicle' && 'Auto'}
            {listing.category === 'property' && 'Nieruchomość'}
            {listing.category === 'service' && 'Usługa'}
          </Badge>

          {/* Transaction type badge for vehicles/properties */}
          {listing.transaction_type && (listing.category === 'vehicle' || listing.category === 'property') && (
            <Badge 
              className={cn(
                "absolute bottom-2 right-2 text-[10px]",
                listing.transaction_type === 'sale' && "bg-emerald-500/90 hover:bg-emerald-500",
                listing.transaction_type === 'rent' && "bg-blue-500/90 hover:bg-blue-500"
              )}
            >
              {listing.transaction_type === 'sale' ? 'Na sprzedaż' : 'Na wynajem'}
            </Badge>
          )}

          {/* Rating badge for services - bottom left on image */}
          {listing.category === 'service' && listing.rating_avg !== undefined && listing.rating_avg > 0 && (
            <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/60 text-white px-2 py-1 rounded-md text-xs">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              <span className="font-medium">{listing.rating_avg.toFixed(1)}</span>
              {listing.rating_count > 0 && (
                <span className="text-white/80">({listing.rating_count})</span>
              )}
            </div>
          )}

          {/* Navigation arrows for gallery - only show if multiple photos */}
          {hasMultiplePhotos && (
            <>
              <button 
                className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
                onClick={handlePrevPhoto}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button 
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
                onClick={handleNextPhoto}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              
              {/* Photo indicators */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                {photos.slice(0, 5).map((_, idx) => (
                  <div 
                    key={idx}
                    className={cn(
                      "w-1.5 h-1.5 rounded-full transition-all",
                      idx === currentPhotoIndex ? "bg-white w-3" : "bg-white/50"
                    )}
                  />
                ))}
                {photos.length > 5 && (
                  <span className="text-[8px] text-white/80 ml-1">+{photos.length - 5}</span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Content */}
        <CardContent className={cn(
          "p-3",
          viewMode === 'list' && "flex-1 flex flex-col justify-center"
        )}>
          <h3 className="font-semibold text-sm line-clamp-2 mb-1 group-hover:text-primary transition-colors">
            {listing.title}
          </h3>

          {/* Vehicle specs row */}
          {listing.category === 'vehicle' && (
            <>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground mb-1">
                {listing.year && (
                  <span className="flex items-center gap-0.5">
                    <Calendar className="h-3 w-3" />
                    {listing.year}
                  </span>
                )}
                {listing.fuel_type && (
                  <span className="flex items-center gap-0.5">
                    <Fuel className="h-3 w-3" />
                    {listing.fuel_type}
                  </span>
                )}
                {listing.power && (
                  <span className="flex items-center gap-0.5">
                    <Zap className="h-3 w-3" />
                    {listing.power} KM
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground mb-1">
                {listing.odometer && (
                  <span className="flex items-center gap-0.5">
                    <Gauge className="h-3 w-3" />
                    {listing.odometer > 1000 ? `${Math.round(listing.odometer / 1000)} tys.` : listing.odometer} km
                  </span>
                )}
                {listing.city && (
                  <span className="flex items-center gap-0.5">
                    <MapPin className="h-3 w-3" />
                    {listing.city}
                  </span>
                )}
              </div>
            </>
          )}

          {/* Property specs row */}
          {listing.category === 'property' && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground mb-1">
              {listing.area && (
                <span className="flex items-center gap-0.5">
                  <Maximize className="h-3 w-3" />
                  {listing.area} m²
                </span>
              )}
              {listing.rooms && (
                <span className="flex items-center gap-0.5">
                  <BedDouble className="h-3 w-3" />
                  {listing.rooms} {listing.rooms === 1 ? 'pokój' : listing.rooms < 5 ? 'pokoje' : 'pokoi'}
                </span>
              )}
              {listing.city && (
                <span className="flex items-center gap-0.5">
                  <MapPin className="h-3 w-3" />
                  {listing.city}
                </span>
              )}
            </div>
          )}

          {/* Service info - show featured services with prices */}
          {listing.category === 'service' && (
            <div className="space-y-1 mb-1">
              {/* Location */}
              {listing.city && (
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <MapPin className="h-3 w-3" />
                  {listing.city}
                </div>
              )}
              
              {/* Featured services with prices */}
              {listing.featured_services && listing.featured_services.length > 0 ? (
                <div className="space-y-0.5">
                  {listing.featured_services.slice(0, 2).map((service, idx) => (
                    <div key={idx} className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground truncate max-w-[70%]">{service.name}</span>
                      <span className="font-medium text-primary">{service.price} zł</span>
                    </div>
                  ))}
                  {listing.featured_services.length > 2 && (
                    <span className="text-[9px] text-muted-foreground">+{listing.featured_services.length - 2} więcej usług</span>
                  )}
                </div>
              ) : null}
            </div>
          )}

          {/* Price */}
          <div className="mt-auto pt-1">
            {listing.category === 'service' ? (
              listing.price_from && listing.price_from > 0 ? (
                <span className="text-sm font-bold text-primary">
                  od {listing.price_from.toLocaleString('pl-PL')} zł
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">Zapytaj o cenę</span>
              )
            ) : (
              <span className="text-sm font-bold text-primary">
                {listing.price?.toLocaleString('pl-PL')} zł
                {listing.transaction_type === 'rent' && (
                  <span className="text-xs font-normal text-muted-foreground">/mies.</span>
                )}
              </span>
            )}
          </div>
        </CardContent>
      </div>
    </Card>
  );
}

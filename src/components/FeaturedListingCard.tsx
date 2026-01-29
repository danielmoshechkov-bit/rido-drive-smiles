import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Star,
  Info,
  ArrowRight
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
  const [showQuickView, setShowQuickView] = useState(false);
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

  const handleQuickView = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowQuickView(true);
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'vehicle': return <Car className="h-3 w-3" />;
      case 'property': return <Home className="h-3 w-3" />;
      case 'service': return <Wrench className="h-3 w-3" />;
      default: return null;
    }
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'vehicle': return 'Auto';
      case 'property': return 'Nieruchomość';
      case 'service': return 'Usługa';
      default: return '';
    }
  };

  const getTransactionLabel = (type?: string) => {
    if (!type) return null;
    if (type === 'sprzedaz' || type === 'sale') return 'Na sprzedaż';
    if (type.includes('wynajem') || type === 'rent') return 'Na wynajem';
    return null;
  };

  // Format price with proper suffix
  const formatPrice = () => {
    if (listing.category === 'service') {
      if (listing.price_from && listing.price_from > 0) {
        return `od ${listing.price_from.toLocaleString('pl-PL')} zł`;
      }
      return 'Zapytaj o cenę';
    }
    
    const priceStr = listing.price?.toLocaleString('pl-PL') || '0';
    const isRent = listing.transaction_type?.includes('wynajem') || listing.transaction_type === 'rent';
    return `${priceStr} zł${isRent ? '/mies.' : ''}`;
  };

  // Build info items for consistent display
  const getInfoItems = () => {
    const items: { icon: React.ReactNode; text: string }[] = [];
    
    if (listing.category === 'vehicle') {
      if (listing.year) items.push({ icon: <Calendar className="h-3 w-3" />, text: String(listing.year) });
      if (listing.fuel_type) items.push({ icon: <Fuel className="h-3 w-3" />, text: listing.fuel_type });
      if (listing.power) items.push({ icon: <Zap className="h-3 w-3" />, text: `${listing.power} KM` });
      if (listing.odometer) {
        const km = listing.odometer > 1000 ? `${Math.round(listing.odometer / 1000)} tys.` : listing.odometer;
        items.push({ icon: <Gauge className="h-3 w-3" />, text: `${km} km` });
      }
    }
    
    if (listing.category === 'property') {
      if (listing.area) items.push({ icon: <Maximize className="h-3 w-3" />, text: `${listing.area} m²` });
      if (listing.rooms) {
        const roomWord = listing.rooms === 1 ? 'pokój' : listing.rooms < 5 ? 'pokoje' : 'pokoi';
        items.push({ icon: <BedDouble className="h-3 w-3" />, text: `${listing.rooms} ${roomWord}` });
      }
    }
    
    if (listing.city) {
      items.push({ icon: <MapPin className="h-3 w-3" />, text: listing.city });
    }
    
    return items;
  };

  const infoItems = getInfoItems();

  return (
    <>
      <Card 
        className="group cursor-pointer overflow-hidden hover:shadow-lg transition-all duration-300 border-0 shadow-sm flex flex-col h-full"
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
              {getCategoryLabel(listing.category)}
            </Badge>

            {/* Transaction type badge for vehicles/properties */}
            {getTransactionLabel(listing.transaction_type) && (listing.category === 'vehicle' || listing.category === 'property') && (
              <Badge 
                className="absolute bottom-2 right-2 text-[10px] bg-primary/90 hover:bg-primary"
              >
                {getTransactionLabel(listing.transaction_type)}
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

          {/* Content - fixed height container for consistent layout */}
          <CardContent className={cn(
            "p-3 flex flex-col",
            viewMode === 'list' ? "justify-center" : "h-[140px]"
          )}>
            {/* Title - max 2 lines */}
            <h3 className="font-semibold text-sm line-clamp-2 mb-1.5 group-hover:text-primary transition-colors leading-tight">
              {listing.title}
            </h3>

            {/* Info items - consistent for all categories, fixed height area */}
            <div className="flex flex-wrap items-start gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground min-h-[36px]">
              {infoItems.slice(0, 4).map((item, idx) => (
                <span key={idx} className="flex items-center gap-0.5">
                  {item.icon}
                  {item.text}
                </span>
              ))}
            </div>

            {/* Service-specific: Featured services list - fixed height */}
            {listing.category === 'service' && listing.featured_services && listing.featured_services.length > 0 && (
              <div className="space-y-0.5 min-h-[40px]">
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
            )}

            {/* Spacer to push price to absolute bottom */}
            <div className="flex-1" />

            {/* Bottom row: Price (left) + Quick view button (right) - ALWAYS at bottom */}
            <div className="flex items-center justify-between pt-1.5 border-t border-border/50 mt-auto">
              <span className={cn(
                "text-sm font-bold",
                listing.category === 'service' && (!listing.price_from || listing.price_from === 0) 
                  ? "text-muted-foreground text-xs font-normal" 
                  : "text-primary"
              )}>
                {formatPrice()}
              </span>
              
              {/* Quick view button */}
              <button
                onClick={handleQuickView}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
              >
                <Info className="h-3 w-3" />
                <span className="hidden sm:inline">Rozwiń</span>
              </button>
            </div>
          </CardContent>
        </div>
      </Card>

      {/* Quick View Modal */}
      <Dialog open={showQuickView} onOpenChange={setShowQuickView}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {getCategoryIcon(listing.category)}
              {listing.title}
            </DialogTitle>
          </DialogHeader>
          
          {/* Image gallery in modal */}
          <div className="relative aspect-video rounded-lg overflow-hidden bg-muted">
            {photos[currentPhotoIndex] ? (
              <img 
                src={photos[currentPhotoIndex]} 
                alt={listing.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                {getCategoryIcon(listing.category)}
              </div>
            )}
            
            {hasMultiplePhotos && (
              <>
                <button 
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
                  onClick={handlePrevPhoto}
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button 
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70"
                  onClick={handleNextPhoto}
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
                
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                  {photos.map((_, idx) => (
                    <div 
                      key={idx}
                      className={cn(
                        "w-2 h-2 rounded-full transition-all cursor-pointer",
                        idx === currentPhotoIndex ? "bg-white" : "bg-white/50"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentPhotoIndex(idx);
                      }}
                    />
                  ))}
                </div>
              </>
            )}
            
            {/* Category badge */}
            <Badge 
              className={cn(
                "absolute top-2 left-2 text-xs gap-1",
                listing.category === 'vehicle' && "bg-blue-500/90",
                listing.category === 'property' && "bg-emerald-500/90",
                listing.category === 'service' && "bg-purple-500/90"
              )}
            >
              {getCategoryIcon(listing.category)}
              {getCategoryLabel(listing.category)}
            </Badge>
            
            {getTransactionLabel(listing.transaction_type) && (
              <Badge className="absolute top-2 right-2 text-xs bg-primary/90">
                {getTransactionLabel(listing.transaction_type)}
              </Badge>
            )}
          </div>

          {/* Details */}
          <div className="space-y-3">
            {/* Info grid */}
            <div className="flex flex-wrap gap-3 text-sm">
              {infoItems.map((item, idx) => (
                <span key={idx} className="flex items-center gap-1.5 text-muted-foreground">
                  {item.icon}
                  {item.text}
                </span>
              ))}
            </div>

            {/* Rating for services */}
            {listing.category === 'service' && listing.rating_avg !== undefined && listing.rating_avg > 0 && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map(star => (
                    <Star 
                      key={star}
                      className={cn(
                        "h-4 w-4",
                        star <= Math.round(listing.rating_avg || 0)
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-muted-foreground/30"
                      )}
                    />
                  ))}
                </div>
                <span className="text-sm text-muted-foreground">
                  {listing.rating_avg.toFixed(1)} ({listing.rating_count} opinii)
                </span>
              </div>
            )}

            {/* Services list */}
            {listing.category === 'service' && listing.featured_services && listing.featured_services.length > 0 && (
              <div className="space-y-1.5">
                <h4 className="text-sm font-medium">Usługi:</h4>
                {listing.featured_services.map((service, idx) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{service.name}</span>
                    <span className="font-medium text-primary">{service.price} zł</span>
                  </div>
                ))}
              </div>
            )}

            {/* Price */}
            <div className="flex items-center justify-between pt-3 border-t">
              <div>
                <span className="text-xs text-muted-foreground">Cena</span>
                <p className="text-xl font-bold text-primary">{formatPrice()}</p>
              </div>
              
              <Button onClick={onClick} className="gap-2">
                Zobacz ogłoszenie
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

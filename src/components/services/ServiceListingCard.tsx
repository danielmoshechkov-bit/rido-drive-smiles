import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  ChevronLeft, ChevronRight, Star, MapPin, 
  Heart, Phone, Mail, Lock
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AuthModal } from "@/components/auth/AuthModal";
import { useNavigate } from "react-router-dom";
import { getServiceCoverImage, getServiceGallery } from "./serviceCategoryImages";

interface Service {
  id: string;
  name: string;
  price: number;
  price_type?: string;
}

interface ServiceListingCardProps {
  provider: {
    id: string;
    company_name: string;
    company_city: string;
    company_phone?: string | null;
    company_email?: string | null;
    description: string;
    logo_url?: string | null;
    cover_image_url?: string | null;
    rating_avg?: number | null;
    rating_count: number;
    category?: { name: string; slug: string };
    services?: Service[];
  };
  onClick?: () => void;
  onFavorite?: () => void;
  isLoggedIn?: boolean;
  isFavorited?: boolean;
  viewMode?: 'grid' | 'compact' | 'list';
}

export function ServiceListingCard({ 
  provider, 
  onClick, 
  onFavorite,
  isLoggedIn = false,
  isFavorited = false,
  viewMode = 'grid'
}: ServiceListingCardProps) {
  const navigate = useNavigate();
  const [currentPhoto, setCurrentPhoto] = useState(0);
  const [showContact, setShowContact] = useState(false);
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Get photos - use cover_image_url, logo_url, or category gallery (3 images)
  const categorySlug = provider.category?.slug;
  const categoryGallery = getServiceGallery(categorySlug);
  
  // Build photos array with provider's images first, then category gallery
  let photos: string[] = [];
  if (provider.cover_image_url) photos.push(provider.cover_image_url);
  if (provider.logo_url && !photos.includes(provider.logo_url)) photos.push(provider.logo_url);
  
  // Fill remaining slots with category gallery images (up to 3 total)
  for (const img of categoryGallery) {
    if (!photos.includes(img) && photos.length < 3) {
      photos.push(img);
    }
  }
  
  // Fallback if still empty
  if (photos.length === 0) photos = categoryGallery;
  
  const displayPhotos = photos;

  const getPhotoSrc = (index: number) => {
    if (imageError) return categoryGallery[0];
    return displayPhotos[index] || categoryGallery[0];
  };

  const nextPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentPhoto((prev) => (prev + 1) % displayPhotos.length);
  };

  const prevPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentPhoto((prev) => (prev - 1 + displayPhotos.length) % displayPhotos.length);
  };

  const handleShowContact = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isLoggedIn) {
      setShowLoginDialog(true);
      return;
    }
    setShowContact(!showContact);
  };

  // Calculate min price from services
  const minPrice = provider.services?.length 
    ? Math.min(...provider.services.map(s => s.price))
    : null;

  // Get first 3 services + count of remaining
  const displayedServices = provider.services?.slice(0, 3) || [];
  const remainingServicesCount = (provider.services?.length || 0) - 3;

  const handleCardClick = () => {
    navigate(`/uslugi/uslugodawca/${provider.id}`);
  };

  return (
    <>
      <Card 
        className={cn(
          "overflow-hidden group hover:shadow-xl transition-all duration-300 border-0 shadow-md cursor-pointer",
          viewMode === 'list' && "flex flex-row"
        )}
        onClick={handleCardClick}
      >
        {/* Photo Gallery */}
        <div className={cn(
          "relative bg-muted overflow-hidden",
          viewMode === 'list' ? "w-1/3 min-w-[200px] aspect-auto h-auto" : "aspect-[4/3]"
        )}>
          <img
            src={getPhotoSrc(currentPhoto)}
            alt={provider.company_name}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={() => setImageError(true)}
          />

          {/* Photo Navigation */}
          {displayPhotos.length > 1 && (
            <>
              <button
                onClick={prevPhoto}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={nextPhoto}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </>
          )}

          {/* Rating Badge - bottom left on image */}
          {provider.rating_avg && provider.rating_avg > 0 && (
            <div className="absolute bottom-2 left-2 bg-black/60 text-white px-2 py-1 rounded-md flex items-center gap-1 text-xs">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              <span className="font-medium">{provider.rating_avg.toFixed(1)}</span>
              <span className="text-white/80">({provider.rating_count})</span>
            </div>
          )}

          {/* Favorite Button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFavorite?.();
            }}
            className="absolute top-2 right-2 p-2 rounded-full bg-white/90 hover:bg-white shadow-md transition-all"
          >
            <Heart 
              className={cn(
                "h-5 w-5 transition-colors",
                isFavorited ? "fill-red-500 text-red-500" : "text-gray-600"
              )} 
            />
          </button>

          {/* Category Badge */}
          {provider.category && (
            <Badge 
              className="absolute bottom-2 right-2 bg-primary text-primary-foreground"
            >
              {provider.category.name}
            </Badge>
          )}
        </div>

        {/* Content */}
        <div className={cn(
          "p-4 flex flex-col",
          viewMode === 'list' && "flex-1"
        )}>
          {/* Company Name */}
          <h3 className="font-semibold text-lg line-clamp-1 h-7 flex items-center">
            {provider.company_name}
          </h3>

          {/* Location */}
          <div className="flex items-center gap-1 text-sm text-muted-foreground h-5 mt-1">
            <MapPin className="h-3.5 w-3.5" />
            {provider.company_city}
          </div>

          {/* Divider */}
          <div className="border-t my-2" />

          {/* Services List */}
          <div className="min-h-[40px]">
            {displayedServices.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {displayedServices.map((service, idx) => (
                  <Badge key={service.id} variant="outline" className="text-xs">
                    {service.name}
                  </Badge>
                ))}
                {remainingServicesCount > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    +{remainingServicesCount}
                  </Badge>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Brak usług</p>
            )}
          </div>

          {/* Divider */}
          <div className="border-t my-2" />

          {/* Rating with stars */}
          <div className="flex items-center gap-1 h-5">
            {[1, 2, 3, 4, 5].map(star => (
              <Star 
                key={star}
                className={cn(
                  "h-4 w-4",
                  star <= Math.round(provider.rating_avg || 0)
                    ? "fill-yellow-400 text-yellow-400"
                    : "text-muted-foreground/30"
                )}
              />
            ))}
            <span className="text-sm text-muted-foreground ml-1">
              ({provider.rating_count} opinii)
            </span>
          </div>

          {/* Spacer */}
          <div className="flex-grow min-h-2" />

          {/* Price & Action */}
          <div className="flex items-center justify-between mt-2 pt-2">
            <div>
              {minPrice ? (
                <>
                  <span className="text-muted-foreground text-sm">od </span>
                  <span className="font-bold text-xl text-primary">
                    {minPrice} zł
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground text-sm">Zapytaj o cenę</span>
              )}
            </div>
            
            <Button size="sm" onClick={(e) => { e.stopPropagation(); handleCardClick(); }}>
              Szczegóły
            </Button>
          </div>

          {/* Expandable Contact Section */}
          <button
            onClick={handleShowContact}
            className="w-full mt-3 pt-3 border-t text-sm text-muted-foreground hover:text-foreground transition-colors text-left flex items-center gap-2"
          >
            {!isLoggedIn && <Lock className="h-3.5 w-3.5" />}
            {showContact ? "Ukryj kontakt ▲" : "Pokaż kontakt ▼"}
          </button>
          
          {showContact && isLoggedIn && (
            <div className="mt-2 space-y-1.5 text-sm">
              {provider.company_phone && (
                <a 
                  href={`tel:${provider.company_phone}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-2 text-xs text-primary hover:underline"
                >
                  <Phone className="h-3.5 w-3.5" />
                  <span>{provider.company_phone}</span>
                </a>
              )}
              {provider.company_email && (
                <a 
                  href={`mailto:${provider.company_email}`}
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-2 text-xs text-primary hover:underline"
                >
                  <Mail className="h-3.5 w-3.5" />
                  <span>{provider.company_email}</span>
                </a>
              )}
            </div>
          )}
        </div>
      </Card>

      {/* Auth Modal for login */}
      <AuthModal
        open={showLoginDialog}
        onOpenChange={setShowLoginDialog}
        initialMode="login"
        customDescription="Zaloguj się, aby zobaczyć dane kontaktowe usługodawcy."
        onSuccess={() => {
          setShowLoginDialog(false);
          setShowContact(true);
        }}
      />
    </>
  );
}

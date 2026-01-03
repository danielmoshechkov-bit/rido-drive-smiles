import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Star, Fuel, Calendar, MapPin, ChevronLeft, ChevronRight, Phone, Mail, Car, User } from "lucide-react";
import { cn } from "@/lib/utils";

interface VehicleListing {
  id: string;
  vehicle_id: string;
  fleet_id: string | null;
  weekly_price: number;
  contact_phone?: string | null;
  contact_email?: string | null;
  contact_name?: string | null;
  description?: string | null;
  vehicle: {
    id: string;
    brand: string;
    model: string;
    year: number | null;
    plate: string;
    photos: string[] | null;
    fuel_type: string | null;
  };
  fleet: {
    id: string;
    name: string;
    contact_phone_for_drivers: string | null;
    email: string | null;
  } | null;
  avgRating: number | null;
  cityName?: string | null;
  driver?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    email: string | null;
  } | null;
}

interface MarketplaceVehicleCardProps {
  listing: VehicleListing;
  onReserve: (listing: VehicleListing) => void;
  isLoggedIn: boolean;
}

const FUEL_TYPE_LABELS: Record<string, string> = {
  benzyna: "Benzyna",
  diesel: "Diesel",
  hybryda: "Hybryda",
  hybryda_gaz: "Hybryda + Gaz",
  lpg: "LPG",
  elektryczny: "Elektryczny",
};

export function MarketplaceVehicleCard({ listing, onReserve, isLoggedIn }: MarketplaceVehicleCardProps) {
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [showDetails, setShowDetails] = useState(false);
  
  const photos = listing.vehicle.photos || [];
  const hasPhotos = photos.length > 0;
  
  const nextPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentPhotoIndex((prev) => (prev + 1) % photos.length);
  };
  
  const prevPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentPhotoIndex((prev) => (prev - 1 + photos.length) % photos.length);
  };

  // Contact info - prioritize listing-specific contacts, fallback to fleet/driver
  const contactPhone = listing.contact_phone || listing.fleet?.contact_phone_for_drivers || listing.driver?.phone;
  const contactEmail = listing.contact_email || listing.fleet?.email || listing.driver?.email;
  // Get contact first name: from contact_name, driver, or fleet name
  const getContactFirstName = () => {
    if (listing.contact_name) {
      return listing.contact_name.split(' ')[0];
    }
    if (listing.driver?.first_name) {
      return listing.driver.first_name;
    }
    if (listing.fleet?.name) {
      return listing.fleet.name.split(' ')[0];
    }
    return 'Właściciel';
  };
  const ownerFirstName = getContactFirstName();

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow group">
      {/* Photo Gallery */}
      <div className="relative aspect-[4/3] bg-muted">
        {hasPhotos ? (
          <>
            <img
              src={photos[currentPhotoIndex]}
              alt={`${listing.vehicle.brand} ${listing.vehicle.model}`}
              className="w-full h-full object-cover"
            />
            
            {/* Rating Badge - Top Left - default 5.0 for new listings */}
            {(() => {
              const displayRating = listing.avgRating ?? 5.0;
              const isDefaultRating = listing.avgRating === null;
              return (
                <div className="absolute top-2 left-2 bg-black/60 text-white px-2 py-1 rounded flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                  <span className="text-xs font-medium">
                    {displayRating.toFixed(1)}
                  </span>
                </div>
              );
            })()}
            
            {/* Photo Navigation */}
            {photos.length > 1 && (
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
                
                {/* Photo Indicators */}
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                  {photos.map((_, index) => (
                    <button
                      key={index}
                      onClick={(e) => {
                        e.stopPropagation();
                        setCurrentPhotoIndex(index);
                      }}
                      className={cn(
                        "w-1.5 h-1.5 rounded-full transition-colors",
                        index === currentPhotoIndex ? "bg-white" : "bg-white/50"
                      )}
                    />
                  ))}
                </div>
              </>
            )}
            
            {/* Photo Count Badge */}
            <Badge variant="secondary" className="absolute top-2 right-2 bg-black/50 text-white border-0">
              {currentPhotoIndex + 1}/{photos.length}
            </Badge>
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Car className="h-16 w-16 text-muted-foreground/30" />
          </div>
        )}
      </div>

      <CardContent className="p-4">
        {/* Brand & Model */}
        <h3 className="font-bold text-lg leading-tight mb-2">
          {listing.vehicle.brand} {listing.vehicle.model}
        </h3>

        {/* Details Row - Year, Location, Fuel on same line */}
        <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground mb-4">
          {listing.vehicle.year && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {listing.vehicle.year}
            </span>
          )}
          {listing.cityName && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              <span className="truncate max-w-[120px]">{listing.cityName}</span>
            </span>
          )}
          {listing.vehicle.fuel_type && (
            <span className="flex items-center gap-1">
              <Fuel className="h-3.5 w-3.5" />
              {FUEL_TYPE_LABELS[listing.vehicle.fuel_type] || listing.vehicle.fuel_type}
            </span>
          )}
        </div>

        {/* Price & Actions */}
        <div className="flex items-center justify-between pt-3 border-t">
          <div>
            <span className="text-2xl font-bold">{listing.weekly_price}</span>
            <span className="text-muted-foreground text-sm"> zł/tydz</span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDetails(!showDetails)}
            >
              {showDetails ? "Ukryj" : "Szczegóły"}
            </Button>
            <Button size="sm" onClick={() => onReserve(listing)} disabled={!isLoggedIn}>
              {isLoggedIn ? "Zarezerwuj" : "Zaloguj się"}
            </Button>
          </div>
        </div>

        {/* Expandable Details */}
        {showDetails && (
          <div className="mt-4 pt-4 border-t space-y-2">
            {listing.description && (
              <p className="text-sm text-muted-foreground mb-3">{listing.description}</p>
            )}
            
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Właściciel:</span>
              <span className="font-medium">{ownerFirstName}</span>
            </div>
            
            {contactPhone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Tel:</span>
                <a href={`tel:${contactPhone}`} className="font-medium text-primary hover:underline">
                  {contactPhone}
                </a>
              </div>
            )}
            
            {contactEmail && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Email:</span>
                <a href={`mailto:${contactEmail}`} className="font-medium text-primary hover:underline">
                  {contactEmail}
                </a>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Maximize, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface SimilarListingsProps {
  currentListingId: string;
  propertyType?: string;
  location?: string;
}

interface SimilarListing {
  id: string;
  title: string;
  price: number;
  priceType: string;
  photos: string[];
  location: string;
  district: string;
  areaM2: number;
  rooms: number | null;
  propertyType: string;
  transactionType: string;
  transactionColor: string;
}

const PRICE_TYPE_LABELS: Record<string, string> = {
  sale: "",
  rent_monthly: "/mies.",
  rent_daily: "/dzień",
};

const TRANS_MAP: Record<string, { label: string; color: string }> = {
  sprzedaz: { label: "Na sprzedaż", color: "#10b981" },
  wynajem: { label: "Wynajem", color: "#3b82f6" },
};

function mapDbToSimilar(db: any): SimilarListing {
  const trans = TRANS_MAP[db.transaction_type || ""] || { label: db.transaction_type, color: "#6b7280" };
  const priceTypeMap: Record<string, string> = {
    sprzedaz: "sale",
    wynajem: "rent_monthly",
  };

  return {
    id: db.id,
    title: db.title || "Ogłoszenie",
    price: db.price || 0,
    priceType: priceTypeMap[db.transaction_type] || "sale",
    photos: db.photos || ["/placeholder.svg"],
    location: db.city || db.location || "",
    district: db.district || "",
    areaM2: Number(db.area) || 0,
    rooms: db.rooms,
    propertyType: db.property_type || "",
    transactionType: trans.label,
    transactionColor: trans.color,
  };
}

function SimilarListingCard({ listing, onClick }: { listing: SimilarListing; onClick: () => void }) {
  const [currentPhoto, setCurrentPhoto] = useState(0);
  const photos = listing.photos.length > 0 ? listing.photos : ["/placeholder.svg"];

  const nextPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentPhoto((prev) => (prev + 1) % photos.length);
  };

  const prevPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentPhoto((prev) => (prev - 1 + photos.length) % photos.length);
  };

  return (
    <Card
      className="shrink-0 w-[280px] snap-start overflow-hidden cursor-pointer group hover:shadow-lg transition-all"
      onClick={onClick}
    >
      <div className="relative aspect-[4/3] overflow-hidden">
        <img
          src={photos[currentPhoto]}
          alt={listing.title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        
        {photos.length > 1 && (
          <>
            <button
              onClick={prevPhoto}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={nextPhoto}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 z-10">
              {photos.slice(0, 5).map((_, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "w-1.5 h-1.5 rounded-full transition-all",
                    idx === currentPhoto ? "bg-white w-3" : "bg-white/50"
                  )}
                />
              ))}
            </div>
          </>
        )}
        
        {listing.transactionType && (
          <Badge 
            style={{ backgroundColor: listing.transactionColor }}
            className="absolute bottom-2 right-2 text-white"
          >
            {listing.transactionType}
          </Badge>
        )}
      </div>

      <div className="p-4">
        <h3 className="font-medium line-clamp-1 mb-2">{listing.title}</h3>
        
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mb-2">
          {listing.areaM2 > 0 && (
            <span className="flex items-center gap-1">
              <Maximize className="h-3.5 w-3.5" />
              {listing.areaM2} m²
            </span>
          )}
          {listing.rooms && (
            <span>• {listing.rooms} pok.</span>
          )}
        </div>

        <div className="flex items-center gap-1 text-sm text-muted-foreground mb-3">
          <MapPin className="h-3.5 w-3.5" />
          <span className="line-clamp-1">
            {listing.district ? `${listing.district}, ` : ""}{listing.location}
          </span>
        </div>

        <div className="flex items-baseline gap-1">
          <span className="text-lg font-bold text-primary">
            {listing.price.toLocaleString("pl-PL")} zł
          </span>
          <span className="text-sm text-muted-foreground">
            {PRICE_TYPE_LABELS[listing.priceType || "sale"]}
          </span>
        </div>
      </div>
    </Card>
  );
}

export function SimilarListings({ currentListingId, propertyType, location }: SimilarListingsProps) {
  const navigate = useNavigate();
  const [scrollPosition, setScrollPosition] = useState(0);
  const [similarListings, setSimilarListings] = useState<SimilarListing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSimilar() {
      setLoading(true);
      try {
        let query = supabase
          .from("real_estate_listings")
          .select("*")
          .eq("is_active", true as any)
          .neq("id", currentListingId)
          .limit(8);

        // Prefer same property type
        if (propertyType) {
          query = query.eq("property_type", propertyType);
        }

        const { data, error } = await query;

        if (error) {
          console.error("Error fetching similar listings:", error);
          setSimilarListings([]);
          return;
        }

        let results = (data || []).map(mapDbToSimilar);

        // If too few results with same type, fetch more without filter
        if (results.length < 3) {
          const { data: moreData } = await supabase
            .from("real_estate_listings")
            .select("*")
            .eq("is_active", true)
            .neq("id", currentListingId)
            .limit(8);

          if (moreData) {
            const existingIds = new Set(results.map(r => r.id));
            const additional = moreData
              .filter(d => !existingIds.has(d.id))
              .map(mapDbToSimilar);
            results = [...results, ...additional].slice(0, 6);
          }
        }

        // Sort: same location first
        results.sort((a, b) => {
          let scoreA = 0, scoreB = 0;
          if (a.location === location) scoreA += 1;
          if (b.location === location) scoreB += 1;
          return scoreB - scoreA;
        });

        setSimilarListings(results.slice(0, 6));
      } catch (err) {
        console.error("Error:", err);
        setSimilarListings([]);
      } finally {
        setLoading(false);
      }
    }

    fetchSimilar();
  }, [currentListingId, propertyType, location]);

  const scroll = (direction: "left" | "right") => {
    const container = document.getElementById("similar-listings-container");
    if (container) {
      const scrollAmount = 300;
      const newPosition = direction === "left" 
        ? Math.max(0, scrollPosition - scrollAmount)
        : scrollPosition + scrollAmount;
      
      container.scrollTo({ left: newPosition, behavior: "smooth" });
      setScrollPosition(newPosition);
    }
  };

  if (!loading && similarListings.length === 0) {
    return null;
  }

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          🏠 Podobne ogłoszenia
        </h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => scroll("left")}
            className="h-8 w-8"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => scroll("right")}
            className="h-8 w-8"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-muted-foreground py-8">Ładowanie podobnych ogłoszeń...</div>
      ) : (
        <div 
          id="similar-listings-container"
          className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x snap-mandatory touch-pan-x"
          style={{ scrollbarWidth: "none", msOverflowStyle: "none", WebkitOverflowScrolling: "touch" }}
        >
          {similarListings.map((listing) => (
            <SimilarListingCard
              key={listing.id}
              listing={listing}
              onClick={() => navigate(`/nieruchomosci/ogloszenie/${listing.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

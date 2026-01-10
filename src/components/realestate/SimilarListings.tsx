import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Home, Maximize, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

// Import images for mock data
import heroImage from "@/assets/realestate-hero.jpg";
import tileRealestate from "@/assets/tile-realestate.jpg";
import tileFleet from "@/assets/tile-fleet.jpg";
import tileCars from "@/assets/tile-cars.jpg";

interface SimilarListingsProps {
  currentListingId: string;
  propertyType?: string;
  location?: string;
}

// Mock similar listings
const ALL_MOCK_LISTINGS = [
  {
    id: "2",
    title: "Nowoczesne studio w centrum",
    price: 2800,
    priceType: "rent_monthly",
    photo: heroImage,
    location: "Warszawa",
    district: "Śródmieście",
    areaM2: 35,
    rooms: 1,
    propertyType: "kawalerka",
    transactionType: "Wynajem",
    transactionColor: "#3b82f6",
  },
  {
    id: "3",
    title: "Dom jednorodzinny z ogrodem",
    price: 890000,
    priceType: "sale",
    photo: tileFleet,
    location: "Gdańsk",
    district: "Osowa",
    areaM2: 180,
    rooms: 5,
    propertyType: "dom",
    transactionType: "Na sprzedaż",
    transactionColor: "#10b981",
  },
  {
    id: "4",
    title: "Działka budowlana 1200m²",
    price: 320000,
    priceType: "sale",
    photo: tileRealestate,
    location: "Wrocław",
    district: "Krzyki",
    areaM2: 1200,
    propertyType: "dzialka",
    transactionType: "Na sprzedaż",
    transactionColor: "#10b981",
  },
  {
    id: "5",
    title: "Przytulne 2-pokojowe na Starym Mieście",
    price: 380000,
    priceType: "sale",
    photo: tileCars,
    location: "Kraków",
    district: "Stare Miasto",
    areaM2: 48,
    rooms: 2,
    propertyType: "mieszkanie",
    transactionType: "Na sprzedaż",
    transactionColor: "#10b981",
  },
  {
    id: "1",
    title: "Przestronne mieszkanie 3-pokojowe",
    price: 450000,
    priceType: "sale",
    photo: heroImage,
    location: "Kraków",
    district: "Kazimierz",
    areaM2: 65,
    rooms: 3,
    propertyType: "mieszkanie",
    transactionType: "Na sprzedaż",
    transactionColor: "#10b981",
  },
];

const PRICE_TYPE_LABELS: Record<string, string> = {
  sale: "",
  rent_monthly: "/mies.",
};

export function SimilarListings({ currentListingId, propertyType, location }: SimilarListingsProps) {
  const navigate = useNavigate();
  const [scrollPosition, setScrollPosition] = useState(0);
  const [similarListings, setSimilarListings] = useState<typeof ALL_MOCK_LISTINGS>([]);

  useEffect(() => {
    // Filter out current listing and get similar ones
    const filtered = ALL_MOCK_LISTINGS.filter(l => l.id !== currentListingId);
    
    // Prioritize by property type and location
    const sorted = filtered.sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;
      
      if (a.propertyType === propertyType) scoreA += 2;
      if (b.propertyType === propertyType) scoreB += 2;
      if (a.location === location) scoreA += 1;
      if (b.location === location) scoreB += 1;
      
      return scoreB - scoreA;
    });

    setSimilarListings(sorted.slice(0, 6));
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

  if (similarListings.length === 0) {
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

      <div 
        id="similar-listings-container"
        className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide snap-x snap-mandatory"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {similarListings.map((listing) => (
          <Card
            key={listing.id}
            className="shrink-0 w-[280px] snap-start overflow-hidden cursor-pointer group hover:shadow-lg transition-all"
            onClick={() => navigate(`/nieruchomosci/ogloszenie/${listing.id}`)}
          >
            {/* Photo */}
            <div className="relative aspect-[4/3] overflow-hidden">
              <img
                src={listing.photo}
                alt={listing.title}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              {listing.transactionType && (
                <Badge 
                  style={{ backgroundColor: listing.transactionColor }}
                  className="absolute bottom-2 right-2 text-white"
                >
                  {listing.transactionType}
                </Badge>
              )}
            </div>

            {/* Content */}
            <div className="p-4">
              <h3 className="font-medium line-clamp-1 mb-2">{listing.title}</h3>
              
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground mb-2">
                {listing.areaM2 && (
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
        ))}
      </div>
    </div>
  );
}

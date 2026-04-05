import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SimilarVehiclesProps {
  currentListingId: string;
  brand?: string;
  priceRange?: { min: number; max: number };
}

// Mock data - w produkcji pobierane z API
const MOCK_SIMILAR_VEHICLES = [
  {
    id: "sim-1",
    title: "BMW 320d xDrive",
    price: 119000,
    priceType: "sale",
    photos: ["https://images.unsplash.com/photo-1555215695-3004980ad54e?w=400"],
    year: 2020,
    fuelType: "diesel",
    odometer: 75000,
    location: "Warszawa",
    transactionType: "Na sprzedaż",
    transactionColor: "#10b981",
  },
  {
    id: "sim-2",
    title: "Audi A4 2.0 TDI",
    price: 95000,
    priceType: "sale",
    photos: ["https://images.unsplash.com/photo-1606664515524-ed2f786a0bd6?w=400"],
    year: 2019,
    fuelType: "diesel",
    odometer: 110000,
    location: "Kraków",
    transactionType: "Na sprzedaż",
    transactionColor: "#10b981",
  },
  {
    id: "sim-3",
    title: "Mercedes C220d",
    price: 135000,
    priceType: "sale",
    photos: ["https://images.unsplash.com/photo-1618843479313-40f8afb4b4d8?w=400"],
    year: 2021,
    fuelType: "diesel",
    odometer: 45000,
    location: "Gdańsk",
    transactionType: "Na sprzedaż",
    transactionColor: "#10b981",
  },
  {
    id: "sim-4",
    title: "Volkswagen Passat",
    price: 2400,
    priceType: "monthly",
    photos: ["https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=400"],
    year: 2022,
    fuelType: "benzyna",
    odometer: 25000,
    location: "Poznań",
    transactionType: "Wynajem",
    transactionColor: "#3b82f6",
  },
  {
    id: "sim-5",
    title: "Toyota Corolla Hybrid",
    price: 350,
    priceType: "daily",
    photos: ["https://images.unsplash.com/photo-1621007947382-bb3c3994e3fb?w=400"],
    year: 2023,
    fuelType: "hybryda",
    odometer: 15000,
    location: "Wrocław",
    transactionType: "Krótkoterminowy",
    transactionColor: "#8b5cf6",
  },
];

const PRICE_TYPE_LABELS: Record<string, string> = {
  sale: "",
  weekly: "/ tydz.",
  monthly: "/ mies.",
  daily: "/ dzień",
};

function SimilarVehicleCard({ 
  vehicle, 
  onClick 
}: { 
  vehicle: typeof MOCK_SIMILAR_VEHICLES[0]; 
  onClick: () => void;
}) {
  const [currentPhoto, setCurrentPhoto] = useState(0);
  const photos = vehicle.photos.length > 0 ? vehicle.photos : ["/placeholder.svg"];

  const prevPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentPhoto((prev) => (prev - 1 + photos.length) % photos.length);
  };
  const nextPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentPhoto((prev) => (prev + 1) % photos.length);
  };

  return (
    <div 
      className="flex-shrink-0 w-64 bg-card rounded-xl shadow-md overflow-hidden cursor-pointer group hover:shadow-lg transition-shadow"
      onClick={onClick}
    >
      {/* Photo */}
      <div className="relative aspect-[4/3]">
        <img 
          src={photos[currentPhoto]} 
          alt={vehicle.title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
        />
        {photos.length > 1 && (
          <>
            <button
              onClick={prevPhoto}
              className="absolute left-1.5 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={nextPhoto}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-1 z-10">
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
        {/* Transaction Badge */}
        <div 
          className="absolute bottom-2 right-2 px-2 py-0.5 rounded text-xs text-white font-medium"
          style={{ backgroundColor: vehicle.transactionColor }}
        >
          {vehicle.transactionType}
        </div>
      </div>

      {/* Content */}
      <div className="p-3">
        <h4 className="font-semibold text-sm line-clamp-1">{vehicle.title}</h4>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
          <span>{vehicle.year}</span>
          <span>•</span>
          <span>{(vehicle.odometer / 1000).toFixed(0)} tys. km</span>
          <span>•</span>
          <span>{vehicle.location}</span>
        </div>
        <div className="mt-2">
          <span className="font-bold text-primary">
            {vehicle.price.toLocaleString('pl-PL')} zł
          </span>
          <span className="text-xs text-muted-foreground ml-1">
            {PRICE_TYPE_LABELS[vehicle.priceType]}
          </span>
        </div>
      </div>
    </div>
  );
}

export function SimilarVehicles({ currentListingId, brand, priceRange }: SimilarVehiclesProps) {
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Filter out current listing
  const similarVehicles = MOCK_SIMILAR_VEHICLES.filter(v => v.id !== currentListingId);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 280;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  if (similarVehicles.length === 0) return null;

  return (
    <section className="mt-12">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">Podobne pojazdy</h2>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="icon" 
            className="h-8 w-8"
            onClick={() => scroll('left')}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button 
            variant="outline" 
            size="icon" 
            className="h-8 w-8"
            onClick={() => scroll('right')}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div 
        ref={scrollRef}
        className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide -mx-4 px-4"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {similarVehicles.map(vehicle => (
          <SimilarVehicleCard 
            key={vehicle.id}
            vehicle={vehicle}
            onClick={() => navigate(`/gielda/ogloszenie/${vehicle.id}`)}
          />
        ))}
      </div>
    </section>
  );
}

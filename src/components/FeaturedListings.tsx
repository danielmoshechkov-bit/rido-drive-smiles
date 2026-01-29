import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TabsPill } from "@/components/ui/TabsPill";
import { TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { 
  Car,
  Home, 
  Wrench, 
  ArrowRight,
  Grid3X3,
  LayoutList,
  List,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { FeaturedListingCard } from "@/components/FeaturedListingCard";

// Import tile images for category modal
import tileCars from "@/assets/tile-cars.jpg";
import tileRealEstate from "@/assets/tile-realestate.jpg";
import tileHandyman from "@/assets/tile-handyman.jpg";

// Import service category cover images for fallback
import warsztatCover from "@/assets/services/warsztat-cover.jpg";
import detailingCover from "@/assets/services/detailing-cover.jpg";
import sprzatanieCover from "@/assets/services/sprzatanie-cover.jpg";
import zlotaRaczkaCover from "@/assets/services/zlota-raczka-cover.jpg";
import hydraulikCover from "@/assets/services/hydraulik-cover.jpg";
import elektrykCover from "@/assets/services/elektryk-cover.jpg";
import ogrodnikCover from "@/assets/services/ogrodnik-cover.jpg";
import przeprowadzkiCover from "@/assets/services/przeprowadzki-cover.jpg";
import ppfCover from "@/assets/services/ppf-cover.jpg";
import projektanciCover from "@/assets/services/projektanci-cover.jpg";
import remontyCover from "@/assets/services/remonty-cover.jpg";
import budowlankaCover from "@/assets/services/budowlanka-cover.jpg";

// Service category image mapping
const serviceCategoryImages: Record<string, string> = {
  '290bfdce-dac0-48d4-a950-1998e43fea5b': warsztatCover,      // Warsztaty
  'a77413e6-020a-4857-b419-d858c4e0c97d': detailingCover,     // Detailing
  'f0c9cb8b-2417-428a-a8e4-155723dda76d': sprzatanieCover,    // Sprzątanie
  '5ee501b0-0c91-4d35-8a10-5e91bbabaaae': zlotaRaczkaCover,   // Złota rączka
  '2a8804aa-f8db-4210-a840-0ef9799c1aed': hydraulikCover,     // Hydraulik
  'c31149db-3160-4680-9d15-0471065ff3c6': elektrykCover,      // Elektryk
  'f6a90d92-aff7-4b38-9159-8554f05d4e67': ogrodnikCover,      // Ogrodnik
  'd8aeaf01-993b-43e2-9caf-267b81298fbf': przeprowadzkiCover, // Przeprowadzki
  'ad442d6d-0908-4a1c-a6e9-1cf4cb7cf0da': ppfCover,           // PPF
  '166b19d9-0364-4807-8da3-1b95868f1cba': projektanciCover,   // Projektanci
  '7a4cf1f1-2a42-451d-ae29-3da8de5cfa67': remontyCover,       // Remonty
  '5991f591-30d0-44e1-84b2-c4a31cf55b8b': budowlankaCover,    // Budowlanka
};

type ListingCategory = 'all' | 'vehicles' | 'properties' | 'services';

interface Listing {
  id: string;
  title: string;
  price: number;
  photos: string[];
  city?: string;
  category: 'vehicle' | 'property' | 'service';
  transaction_type?: string;
  // Vehicle-specific fields
  year?: number;
  fuel_type?: string;
  power?: number;
  odometer?: number;
  // Property-specific fields
  area?: number;
  rooms?: number;
  // Service-specific fields
  rating_avg?: number;
  rating_count?: number;
  price_from?: number;
}

interface FeaturedListingsProps {
  className?: string;
}

export function FeaturedListings({ className }: FeaturedListingsProps) {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState<ListingCategory>('all');
  const [allListings, setAllListings] = useState<Listing[]>([]);
  const [vehicleListings, setVehicleListings] = useState<Listing[]>([]);
  const [propertyListings, setPropertyListings] = useState<Listing[]>([]);
  const [serviceListings, setServiceListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'compact' | 'list'>('grid');
  const [showCategoryModal, setShowCategoryModal] = useState(false);

  // TODO: Future - user location for proximity sorting
  // const [userCity, setUserCity] = useState<string | null>(null);
  
  // Items for mixed view (4 per category = 12 total)
  const ITEMS_PER_CATEGORY_MIXED = 4;
  // Items for single category view
  const ITEMS_PER_CATEGORY_SINGLE = 12;

  useEffect(() => {
    fetchListings();
  }, []);

  const fetchListings = async () => {
    setLoading(true);
    
    try {
      // TODO: Future paid listings logic:
      // 1. First fetch paid/promoted listings (is_promoted = true)
      // 2. Sort by user's location proximity (using city or coordinates)
      // 3. Fill remaining slots with random free listings
      
      // Fetch 12 vehicle listings for category view with specs
      const { data: vehicles } = await (supabase as any)
        .from('vehicle_listings')
        .select('id, title, price, photos, city, transaction_type, year, fuel_type, power, odometer')
        .eq('status', 'active')
        .limit(ITEMS_PER_CATEGORY_SINGLE);

      // Fetch 12 property listings for category view with specs
      const { data: properties } = await (supabase as any)
        .from('real_estate_listings')
        .select('id, title, price, photos, city, transaction_type, area, rooms')
        .eq('status', 'active')
        .limit(ITEMS_PER_CATEGORY_SINGLE);

      // Fetch 12 service providers for category view with category_id for image fallback
      const { data: services } = await (supabase as any)
        .from('service_providers')
        .select('id, company_name, logo_url, cover_image_url, company_city, category_id, status, rating_avg, rating_count, services(price_from)')
        .eq('status', 'active')
        .limit(ITEMS_PER_CATEGORY_SINGLE);

      // Process vehicles with specs
      const vehiclesData: Listing[] = [];
      if (vehicles) {
        vehicles.forEach((v: any) => {
          vehiclesData.push({
            id: v.id,
            title: v.title || 'Pojazd',
            price: v.price || 0,
            photos: v.photos || [],
            city: v.city,
            category: 'vehicle',
            transaction_type: v.transaction_type,
            year: v.year,
            fuel_type: v.fuel_type,
            power: v.power,
            odometer: v.odometer
          });
        });
      }

      // Process properties with specs
      const propertiesData: Listing[] = [];
      if (properties) {
        properties.forEach((p: any) => {
          propertiesData.push({
            id: p.id,
            title: p.title || 'Nieruchomość',
            price: p.price || 0,
            photos: p.photos || [],
            city: p.city,
            category: 'property',
            transaction_type: p.transaction_type,
            area: p.area,
            rooms: p.rooms
          });
        });
      }

      // Process services - use category cover image as fallback
      const servicesData: Listing[] = [];
      if (services) {
        services.forEach((s: any) => {
          // Get lowest price from services
          const minPrice = s.services?.reduce((min: number, svc: any) => {
            return svc.price_from && svc.price_from < min ? svc.price_from : min;
          }, Infinity) || 0;
          
          // Use cover_image, logo, or category fallback image
          const categoryImage = s.category_id ? serviceCategoryImages[s.category_id] : null;
          const servicePhoto = s.cover_image_url || s.logo_url || categoryImage || tileHandyman;
          
          servicesData.push({
            id: s.id,
            title: s.company_name || 'Usługa',
            price: 0,
            photos: [servicePhoto],
            city: s.company_city,
            category: 'service',
            rating_avg: s.rating_avg || 0,
            rating_count: s.rating_count || 0,
            price_from: minPrice === Infinity ? 0 : minPrice
          });
        });
      }

      // Set category-specific listings (12 each)
      setVehicleListings(vehiclesData.sort(() => Math.random() - 0.5));
      setPropertyListings(propertiesData.sort(() => Math.random() - 0.5));
      setServiceListings(servicesData.sort(() => Math.random() - 0.5));

      // Create mixed listings for "Wszystko" (4 from each category = 12 total)
      const mixedListings: Listing[] = [
        ...vehiclesData.slice(0, ITEMS_PER_CATEGORY_MIXED),
        ...propertiesData.slice(0, ITEMS_PER_CATEGORY_MIXED),
        ...servicesData.slice(0, ITEMS_PER_CATEGORY_MIXED)
      ].sort(() => Math.random() - 0.5);
      
      setAllListings(mixedListings);
    } catch (error) {
      console.error('Error fetching listings:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get listings based on active category
  const getDisplayListings = (): Listing[] => {
    switch (activeCategory) {
      case 'vehicles': return vehicleListings;
      case 'properties': return propertyListings;
      case 'services': return serviceListings;
      default: return allListings;
    }
  };

  const displayListings = getDisplayListings();

  const handleListingClick = (listing: Listing) => {
    if (listing.category === 'vehicle') {
      navigate(`/gielda/ogloszenie/${listing.id}`);
    } else if (listing.category === 'property') {
      navigate(`/nieruchomosci/ogloszenie/${listing.id}`);
    } else if (listing.category === 'service') {
      navigate(`/uslugi/wykonawca/${listing.id}`);
    }
  };

  const handleSeeMore = () => {
    if (activeCategory === 'vehicles') {
      navigate('/gielda');
    } else if (activeCategory === 'properties') {
      navigate('/nieruchomosci');
    } else if (activeCategory === 'services') {
      navigate('/uslugi');
    } else {
      // Show category selection modal when "Wszystko" is active
      setShowCategoryModal(true);
    }
  };

  const handleCategorySelect = (category: 'vehicles' | 'properties' | 'services') => {
    setShowCategoryModal(false);
    if (category === 'vehicles') {
      navigate('/gielda');
    } else if (category === 'properties') {
      navigate('/nieruchomosci');
    } else if (category === 'services') {
      navigate('/uslugi');
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'vehicle': return <Car className="h-3 w-3" />;
      case 'property': return <Home className="h-3 w-3" />;
      case 'service': return <Wrench className="h-3 w-3" />;
      default: return null;
    }
  };


  if (loading) {
    return (
      <section className={cn("container mx-auto px-4 py-6", className)}>
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </section>
    );
  }

  if (displayListings.length === 0) {
    return null;
  }

  return (
    <section className={cn("container mx-auto px-4 py-6", className)}>
      {/* Category Tabs */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
        <TabsPill value={activeCategory} onValueChange={(v) => setActiveCategory(v as ListingCategory)}>
          <TabsTrigger value="all" className="gap-2">
            Wszystko
          </TabsTrigger>
          <TabsTrigger value="vehicles" className="gap-2">
            <Car className="h-4 w-4" />
            Pojazdy
          </TabsTrigger>
          <TabsTrigger value="properties" className="gap-2">
            <Home className="h-4 w-4" />
            Nieruchomości
          </TabsTrigger>
          <TabsTrigger value="services" className="gap-2">
            <Wrench className="h-4 w-4" />
            Usługi
          </TabsTrigger>
        </TabsPill>

        {/* View mode toggle */}
        <div className="hidden md:flex items-center gap-1 bg-muted rounded-lg p-1">
          <Button
            variant={viewMode === 'grid' ? 'default' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={() => setViewMode('grid')}
          >
            <Grid3X3 className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'compact' ? 'default' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={() => setViewMode('compact')}
          >
            <LayoutList className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={() => setViewMode('list')}
          >
            <List className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Section Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg md:text-xl font-bold">
            Proponowane oferty
          </h2>
        </div>
        <Button 
          variant="link" 
          className="text-primary gap-1 p-0"
          onClick={handleSeeMore}
        >
          Zobacz więcej
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Listings Grid */}
      <div className={cn(
        "grid gap-4",
        viewMode === 'grid' && "grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
        viewMode === 'compact' && "grid-cols-1 md:grid-cols-2",
        viewMode === 'list' && "grid-cols-1"
      )}>
        {displayListings.slice(0, 12).map((listing) => (
          <FeaturedListingCard
            key={`${listing.category}-${listing.id}`}
            listing={listing}
            viewMode={viewMode}
            onClick={() => handleListingClick(listing)}
          />
        ))}
      </div>

      {/* See more button on mobile */}
      <div className="mt-6 text-center md:hidden">
        <Button onClick={handleSeeMore} className="w-full max-w-xs">
          Zobacz wszystkie ogłoszenia
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>

      {/* Category Selection Modal - styled like AddListingModal */}
      <Dialog open={showCategoryModal} onOpenChange={setShowCategoryModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl">
              Wybierz kategorię
            </DialogTitle>
            <DialogDescription>
              Przejdź do wybranego portalu ogłoszeń
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            {/* Motoryzacja */}
            <Card 
              className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-xl hover:scale-[1.02] border-0 shadow-md"
              onClick={() => handleCategorySelect('vehicles')}
            >
              <div 
                className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
                style={{ backgroundImage: `url(${tileCars})` }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20" />
              </div>
              <CardContent className="relative z-10 p-4 h-32 flex flex-col justify-end">
                <div className="mb-2 p-2 rounded-lg w-fit bg-white/20 backdrop-blur-sm">
                  <Car className="h-5 w-5 text-white" />
                </div>
                <h3 className="font-bold text-base text-white leading-tight">Giełda Aut</h3>
                <p className="text-xs text-white/80 mt-1">Samochody, motocykle, pojazdy</p>
                <div className="absolute top-2 right-2 p-1.5 rounded-full bg-white/20 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
                  <ArrowRight className="h-3 w-3 text-white" />
                </div>
              </CardContent>
            </Card>

            {/* Nieruchomości */}
            <Card 
              className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-xl hover:scale-[1.02] border-0 shadow-md"
              onClick={() => handleCategorySelect('properties')}
            >
              <div 
                className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
                style={{ backgroundImage: `url(${tileRealEstate})` }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20" />
              </div>
              <CardContent className="relative z-10 p-4 h-32 flex flex-col justify-end">
                <div className="mb-2 p-2 rounded-lg w-fit bg-white/20 backdrop-blur-sm">
                  <Home className="h-5 w-5 text-white" />
                </div>
                <h3 className="font-bold text-base text-white leading-tight">Nieruchomości</h3>
                <p className="text-xs text-white/80 mt-1">Mieszkania, domy, działki</p>
                <div className="absolute top-2 right-2 p-1.5 rounded-full bg-white/20 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
                  <ArrowRight className="h-3 w-3 text-white" />
                </div>
              </CardContent>
            </Card>

            {/* Usługi */}
            <Card 
              className="group relative overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-xl hover:scale-[1.02] border-0 shadow-md sm:col-span-2"
              onClick={() => handleCategorySelect('services')}
            >
              <div 
                className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
                style={{ backgroundImage: `url(${tileHandyman})` }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20" />
              </div>
              <CardContent className="relative z-10 p-4 h-32 flex flex-col justify-end">
                <div className="mb-2 p-2 rounded-lg w-fit bg-white/20 backdrop-blur-sm">
                  <Wrench className="h-5 w-5 text-white" />
                </div>
                <h3 className="font-bold text-base text-white leading-tight">Usługi</h3>
                <p className="text-xs text-white/80 mt-1">Fachowcy, remonty, serwis</p>
                <div className="absolute top-2 right-2 p-1.5 rounded-full bg-white/20 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
                  <ArrowRight className="h-3 w-3 text-white" />
                </div>
              </CardContent>
            </Card>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
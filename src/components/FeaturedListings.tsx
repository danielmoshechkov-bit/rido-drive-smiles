import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TabsPill } from "@/components/ui/TabsPill";
import { TabsTrigger } from "@/components/ui/tabs";
import { 
  Car, 
  Home, 
  Wrench, 
  Heart, 
  ChevronLeft, 
  ChevronRight,
  ArrowRight,
  Grid3X3,
  LayoutList,
  List
} from "lucide-react";
import { cn } from "@/lib/utils";

type ListingCategory = 'all' | 'vehicles' | 'properties' | 'services';

interface Listing {
  id: string;
  title: string;
  price: number;
  photos: string[];
  city?: string;
  category: 'vehicle' | 'property' | 'service';
  transaction_type?: string;
}

interface FeaturedListingsProps {
  className?: string;
}

export function FeaturedListings({ className }: FeaturedListingsProps) {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState<ListingCategory>('all');
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'compact' | 'list'>('grid');
  
  // Count per category
  const [vehicleCount, setVehicleCount] = useState(0);
  const [propertyCount, setPropertyCount] = useState(0);
  const [serviceCount, setServiceCount] = useState(0);

  useEffect(() => {
    fetchListings();
  }, []);

  const fetchListings = async () => {
    setLoading(true);
    
    try {
      // Fetch random vehicle listings
      const { data: vehicles } = await (supabase as any)
        .from('vehicle_listings')
        .select('id, title, price, photos, city')
        .eq('status', 'aktywne')
        .limit(10);

      // Fetch random property listings
      const { data: properties } = await (supabase as any)
        .from('real_estate_listings')
        .select('id, title, price, photos, city, transaction_type')
        .eq('status', 'aktywne')
        .limit(10);

      // Fetch random service providers
      const { data: services } = await (supabase as any)
        .from('service_providers')
        .select('id, business_name, hourly_rate, photos, city')
        .eq('is_verified', true)
        .limit(10);

      const allListings: Listing[] = [];

      if (vehicles) {
        setVehicleCount(vehicles.length);
        vehicles.forEach((v: any) => {
          allListings.push({
            id: v.id,
            title: v.title || 'Pojazd',
            price: v.price || 0,
            photos: v.photos || [],
            city: v.city,
            category: 'vehicle'
          });
        });
      }

      if (properties) {
        setPropertyCount(properties.length);
        properties.forEach((p: any) => {
          allListings.push({
            id: p.id,
            title: p.title || 'Nieruchomość',
            price: p.price || 0,
            photos: p.photos || [],
            city: p.city,
            category: 'property',
            transaction_type: p.transaction_type
          });
        });
      }

      if (services) {
        setServiceCount(services.length);
        services.forEach((s: any) => {
          allListings.push({
            id: s.id,
            title: s.business_name || 'Usługa',
            price: s.hourly_rate || 0,
            photos: s.photos || [],
            city: s.city,
            category: 'service'
          });
        });
      }

      // Shuffle the listings randomly
      const shuffled = allListings.sort(() => Math.random() - 0.5);
      setListings(shuffled);
    } catch (error) {
      console.error('Error fetching listings:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredListings = listings.filter(listing => {
    if (activeCategory === 'all') return true;
    if (activeCategory === 'vehicles') return listing.category === 'vehicle';
    if (activeCategory === 'properties') return listing.category === 'property';
    if (activeCategory === 'services') return listing.category === 'service';
    return true;
  });

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
      navigate('/wyniki');
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

  const getCategoryLabel = () => {
    switch (activeCategory) {
      case 'vehicles': return 'Pojazdy';
      case 'properties': return 'Nieruchomości';
      case 'services': return 'Usługi';
      default: return 'Wszystkie ogłoszenia';
    }
  };

  const totalCount = vehicleCount + propertyCount + serviceCount;

  if (loading) {
    return (
      <section className={cn("container mx-auto px-4 py-6", className)}>
        <div className="flex justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </section>
    );
  }

  if (listings.length === 0) {
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
            {vehicleCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {vehicleCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="properties" className="gap-2">
            <Home className="h-4 w-4" />
            Nieruchomości
            {propertyCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                {propertyCount}
              </Badge>
            )}
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
          {activeCategory === 'vehicles' && <Car className="h-5 w-5 text-primary" />}
          {activeCategory === 'properties' && <Home className="h-5 w-5 text-primary" />}
          {activeCategory === 'services' && <Wrench className="h-5 w-5 text-primary" />}
          <h2 className="text-lg md:text-xl font-bold">
            {getCategoryLabel()} ({filteredListings.length})
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

      {/* Subtitle */}
      <p className="text-sm text-muted-foreground mb-4">
        Przeglądaj najnowsze ogłoszenia z naszego portalu
      </p>

      {/* Listings Grid */}
      <div className={cn(
        "grid gap-4",
        viewMode === 'grid' && "grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
        viewMode === 'compact' && "grid-cols-1 md:grid-cols-2",
        viewMode === 'list' && "grid-cols-1"
      )}>
        {filteredListings.slice(0, viewMode === 'grid' ? 8 : 6).map((listing) => (
          <Card 
            key={`${listing.category}-${listing.id}`}
            className="group cursor-pointer overflow-hidden hover:shadow-lg transition-all duration-300 border-0 shadow-sm"
            onClick={() => handleListingClick(listing)}
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
                {listing.photos?.[0] ? (
                  <img 
                    src={listing.photos[0]} 
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
                    listing.category === 'vehicle' && "bg-blue-500/90",
                    listing.category === 'property' && "bg-emerald-500/90",
                    listing.category === 'service' && "bg-purple-500/90"
                  )}
                >
                  {getCategoryIcon(listing.category)}
                  {listing.category === 'vehicle' && 'Auto'}
                  {listing.category === 'property' && 'Nieruchomość'}
                  {listing.category === 'service' && 'Usługa'}
                </Badge>

                {/* Navigation arrows for gallery */}
                <button 
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button 
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* Content */}
              <CardContent className={cn(
                "p-3",
                viewMode === 'list' && "flex-1 flex flex-col justify-center"
              )}>
                <h3 className="font-semibold text-sm line-clamp-2 mb-1 group-hover:text-primary transition-colors">
                  {listing.title}
                </h3>
                {listing.city && (
                  <p className="text-xs text-muted-foreground mb-2">
                    {listing.city}
                  </p>
                )}
                <p className="font-bold text-primary">
                  {listing.price > 0 ? (
                    <>
                      {listing.price.toLocaleString('pl-PL')} 
                      <span className="text-xs font-normal text-muted-foreground ml-1">
                        {listing.category === 'service' ? 'PLN/h' : 'PLN'}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground text-sm">Zapytaj o cenę</span>
                  )}
                </p>
              </CardContent>
            </div>
          </Card>
        ))}
      </div>

      {/* See more button on mobile */}
      <div className="mt-6 text-center md:hidden">
        <Button onClick={handleSeeMore} className="w-full max-w-xs">
          Zobacz wszystkie ogłoszenia
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </section>
  );
}
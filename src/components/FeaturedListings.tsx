import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Heart, 
  ChevronLeft, 
  ChevronRight,
  ArrowRight,
  Grid3X3,
  LayoutList,
  List,
  Star
} from "lucide-react";
import { cn } from "@/lib/utils";

// Import tile images for category modal
import tileCars from "@/assets/tile-cars.jpg";
import tileRealEstate from "@/assets/tile-realestate.jpg";
import tileHandyman from "@/assets/tile-handyman.jpg";

type ListingCategory = 'all' | 'vehicles' | 'properties' | 'services';

interface Listing {
  id: string;
  title: string;
  price: number;
  photos: string[];
  city?: string;
  category: 'vehicle' | 'property' | 'service';
  transaction_type?: string;
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
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'grid' | 'compact' | 'list'>('grid');
  const [showCategoryModal, setShowCategoryModal] = useState(false);

  // TODO: Future - user location for proximity sorting
  // const [userCity, setUserCity] = useState<string | null>(null);
  
  // Max items per category (3 rows x 4 cols = 12 total, so ~4 per category)
  const ITEMS_PER_CATEGORY = 4;

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
      
      // Fetch random vehicle listings (limit per category for 3 rows mixed view)
      const { data: vehicles } = await (supabase as any)
        .from('vehicle_listings')
        .select('id, title, price, photos, city')
        .eq('status', 'active')
        .limit(ITEMS_PER_CATEGORY);

      // Fetch random property listings
      const { data: properties } = await (supabase as any)
        .from('real_estate_listings')
        .select('id, title, price, photos, city, transaction_type')
        .eq('status', 'active')
        .limit(ITEMS_PER_CATEGORY);

      // Fetch random service providers with ratings
      const { data: services } = await (supabase as any)
        .from('service_providers')
        .select('id, company_name, logo_url, company_city, status, rating_avg, rating_count, services(price_from)')
        .eq('status', 'active')
        .limit(ITEMS_PER_CATEGORY);

      const allListings: Listing[] = [];

      if (vehicles) {
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
        services.forEach((s: any) => {
          // Get lowest price from services
          const minPrice = s.services?.reduce((min: number, svc: any) => {
            return svc.price_from && svc.price_from < min ? svc.price_from : min;
          }, Infinity) || 0;
          
          allListings.push({
            id: s.id,
            title: s.company_name || 'Usługa',
            price: 0,
            photos: s.logo_url ? [s.logo_url] : [],
            city: s.company_city,
            category: 'service',
            rating_avg: s.rating_avg || 0,
            rating_count: s.rating_count || 0,
            price_from: minPrice === Infinity ? 0 : minPrice
          });
        });
      }

      // Shuffle the listings randomly for varied display each visit
      // TODO: Future - sort by: 1) paid/promoted first, 2) proximity to user, 3) random
      const shuffled = [...allListings].sort(() => Math.random() - 0.5);
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
        {filteredListings.slice(0, 12).map((listing) => (
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
                  <p className="text-xs text-muted-foreground mb-1">
                    {listing.city}
                  </p>
                )}
                
                {/* Service-specific: Rating and reviews */}
                {listing.category === 'service' && listing.rating_count !== undefined && listing.rating_count > 0 && (
                  <div className="flex items-center gap-1 mb-1">
                    <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                    <span className="text-xs font-medium">{(listing.rating_avg || 0).toFixed(1)}</span>
                    <span className="text-xs text-muted-foreground">({listing.rating_count} opinii)</span>
                  </div>
                )}
                
                {/* Price display */}
                <p className="font-bold text-primary">
                  {listing.category === 'service' ? (
                    listing.price_from && listing.price_from > 0 ? (
                      <>
                        od {listing.price_from.toLocaleString('pl-PL')} 
                        <span className="text-xs font-normal text-muted-foreground ml-1">PLN</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground text-sm">Zapytaj o cenę</span>
                    )
                  ) : listing.price > 0 ? (
                    <>
                      {listing.price.toLocaleString('pl-PL')} 
                      <span className="text-xs font-normal text-muted-foreground ml-1">PLN</span>
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
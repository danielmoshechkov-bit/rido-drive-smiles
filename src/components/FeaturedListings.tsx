import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from 'react-i18next';
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

// Import service category gallery helper
import { getServiceGalleryByCategoryId } from "@/components/services/serviceCategoryImages";

type ListingCategory = 'all' | 'vehicles' | 'properties' | 'services';
type TransactionType = 'sprzedaz' | 'wynajem' | null;

// Service category slugs mapped to contexts
const MOTORYZACJA_SERVICES = ['warsztat', 'detailing', 'ppf'];
const NIERUCHOMOSCI_SERVICES = ['remonty', 'budowlanka', 'projektanci', 'elektryk', 'hydraulik', 'sprzatanie', 'zlota-raczka', 'przeprowadzki', 'ogrodnik'];

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
  featured_services?: ServiceInfo[];
  category_slug?: string; // For service filtering by context
  description?: string; // Service description
}

interface FeaturedListingsProps {
  className?: string;
  /** If provided, shows simplified tabs for this category context (vehicles+services or properties+services) */
  categoryContext?: 'motoryzacja' | 'nieruchomosci';
  /** If true, hides the "Zobacz więcej" button */
  hideViewMore?: boolean;
}

export function FeaturedListings({ className, categoryContext, hideViewMore }: FeaturedListingsProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  
  // Determine initial category based on context
  const getInitialCategory = (): ListingCategory => {
    if (categoryContext === 'motoryzacja') return 'vehicles';
    if (categoryContext === 'nieruchomosci') return 'properties';
    return 'all';
  };
  
  const [activeCategory, setActiveCategory] = useState<ListingCategory>(getInitialCategory());
  const [transactionType, setTransactionType] = useState<TransactionType>('sprzedaz');
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
      
      // Fetch vehicles - get all active listings for rotation (limit 24 to fill 3 rows)
      const [vehiclesSaleRes, vehiclesRentRes] = await Promise.all([
        (supabase as any)
          .from('vehicle_listings')
          .select('id, title, price, photos, city, transaction_type, year, fuel_type, power, odometer')
          .eq('status', 'active')
          .eq('transaction_type', 'sprzedaz')
          .limit(24),
        (supabase as any)
          .from('vehicle_listings')
          .select('id, title, price, photos, city, transaction_type, year, fuel_type, power, odometer')
          .eq('status', 'active')
          .in('transaction_type', ['wynajem', 'wynajem-krotkoterminowy'])
          .limit(24)
      ]);
      
      const vehicles = [
        ...(vehiclesSaleRes.data || []),
        ...(vehiclesRentRes.data || [])
      ];

      // Fetch properties - get all active listings for rotation (limit 24 to fill 3 rows)
      const [propertiesSaleRes, propertiesRentRes] = await Promise.all([
        (supabase as any)
          .from('real_estate_listings')
          .select('id, title, price, photos, city, transaction_type, area, rooms')
          .eq('status', 'active')
          .eq('transaction_type', 'sprzedaz')
          .limit(24),
        (supabase as any)
          .from('real_estate_listings')
          .select('id, title, price, photos, city, transaction_type, area, rooms')
          .eq('status', 'active')
          .eq('transaction_type', 'wynajem')
          .limit(24)
      ]);
      
      const properties = [
        ...(propertiesSaleRes.data || []),
        ...(propertiesRentRes.data || [])
      ];

      // Fetch service providers with both services tables
      const { data: services } = await (supabase as any)
        .from('service_providers')
        .select('id, company_name, logo_url, cover_image_url, company_city, category_id, status, rating_avg, rating_count, description, category:service_categories(id, name, slug), services(id, name, price, is_featured), provider_services(id, name, price_from, price_to, status)')
        .eq('status', 'active')
        .limit(ITEMS_PER_CATEGORY_SINGLE);

      // Process vehicles with specs
      const vehiclesData: Listing[] = [];
      if (vehicles) {
        vehicles.forEach((v: any) => {
          vehiclesData.push({
            id: v.id,
            title: v.title || t('listing.vehicle'),
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
            title: p.title || t('listing.property'),
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
          // Combine legacy services and provider_services
          const legacyServices = s.services || [];
          const provServices = (s.provider_services || [])
            .filter((ps: any) => ps.status === 'active')
            .map((ps: any) => ({ name: ps.name, price: ps.price_from, is_featured: false }));
          const servicesList = [...legacyServices, ...provServices];
          
          // Get featured services first, then regular ones by lowest price
          const featuredServices = servicesList
            .filter((svc: any) => svc.is_featured)
            .slice(0, 3)
            .map((svc: any) => ({ name: svc.name, price: svc.price || 0 }));
          
          // If no featured, get top 3 by lowest price
          const displayServices = featuredServices.length > 0 
            ? featuredServices 
            : servicesList
                .filter((svc: any) => svc.price && svc.price > 0)
                .sort((a: any, b: any) => (a.price || 0) - (b.price || 0))
                .slice(0, 3)
                .map((svc: any) => ({ name: svc.name, price: svc.price }));
          
          // Get lowest price from services
          const minPrice = servicesList.reduce((min: number, svc: any) => {
            return svc.price && svc.price < min ? svc.price : min;
          }, Infinity);
          
          // Use cover_image, logo, or category gallery fallback (3 images)
          const categoryGallery = s.category_id ? getServiceGalleryByCategoryId(s.category_id) : [tileHandyman];
          
          // Build photos array: provider's images first, then fill with category gallery
          let servicePhotos: string[] = [];
          if (s.cover_image_url) servicePhotos.push(s.cover_image_url);
          if (s.logo_url && !servicePhotos.includes(s.logo_url)) servicePhotos.push(s.logo_url);
          
          // Fill remaining slots with category gallery images
          if (servicePhotos.length < 3) {
            for (const img of categoryGallery) {
              if (!servicePhotos.includes(img) && servicePhotos.length < 3) {
                servicePhotos.push(img);
              }
            }
          }
          
          // Fallback if still empty
          if (servicePhotos.length === 0) servicePhotos = categoryGallery;
          
          servicesData.push({
            id: s.id,
            title: s.company_name || 'Usługa',
            price: 0,
            photos: servicePhotos,
            city: s.company_city,
            category: 'service',
            rating_avg: s.rating_avg || 0,
            rating_count: s.rating_count || 0,
            price_from: minPrice === Infinity ? 0 : minPrice,
            featured_services: displayServices,
            category_slug: s.category?.slug || '',
            description: s.description || ''
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

  // Get listings based on active category and transaction type filter
  const getDisplayListings = (): Listing[] => {
    let listings: Listing[];
    
    switch (activeCategory) {
      case 'vehicles': listings = vehicleListings; break;
      case 'properties': listings = propertyListings; break;
      case 'services': 
        // Filter services based on category context
        if (categoryContext === 'motoryzacja') {
          return serviceListings.filter(s => MOTORYZACJA_SERVICES.includes(s.category_slug || ''));
        } else if (categoryContext === 'nieruchomosci') {
          return serviceListings.filter(s => NIERUCHOMOSCI_SERVICES.includes(s.category_slug || ''));
        }
        return serviceListings; // No filter for general view
      default: return allListings; // No transaction filter for "all"
    }
    
    // Apply transaction type filter for vehicles and properties
    if (transactionType) {
      return listings.filter(l => {
        if (transactionType === 'sprzedaz') {
          return l.transaction_type === 'sprzedaz' || l.transaction_type === 'sale';
        } else {
          return l.transaction_type?.includes('wynajem') || l.transaction_type === 'rent';
        }
      });
    }
    
    return listings;
  };

  const displayListings = getDisplayListings();
  
  // Check if transaction type chips should be visible
  const showTransactionFilter = activeCategory === 'vehicles' || activeCategory === 'properties';

  const handleListingClick = (listing: Listing) => {
    if (listing.category === 'vehicle') {
      navigate(`/gielda/ogloszenie/${listing.id}`);
    } else if (listing.category === 'property') {
      navigate(`/nieruchomosci/ogloszenie/${listing.id}`);
    } else if (listing.category === 'service') {
      navigate(`/uslugi/uslugodawca/${listing.id}`);
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
      {/* Category Tabs - different based on context */}
      {!categoryContext && (
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <TabsPill value={activeCategory} onValueChange={(v) => setActiveCategory(v as ListingCategory)}>
            <TabsTrigger value="all" className="gap-2">
              {t('featured.all')}
            </TabsTrigger>
            <TabsTrigger value="vehicles" className="gap-2">
              <Car className="h-4 w-4" />
              {t('featured.vehicles')}
            </TabsTrigger>
            <TabsTrigger value="properties" className="gap-2">
              <Home className="h-4 w-4" />
              {t('featured.properties')}
            </TabsTrigger>
            <TabsTrigger value="services" className="gap-2">
              <Wrench className="h-4 w-4" />
              {t('featured.services')}
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
      )}

      {/* Simplified tabs for category context (Motoryzacja or Nieruchomości) */}
      {categoryContext && (
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <TabsPill 
            value={activeCategory} 
            onValueChange={(v) => setActiveCategory(v as ListingCategory)}
          >
            {categoryContext === 'motoryzacja' && (
              <>
                <TabsTrigger value="vehicles" className="gap-2">
                  <Car className="h-4 w-4" />
                  {t('featured.vehicles')}
                </TabsTrigger>
                <TabsTrigger value="services" className="gap-2">
                  <Wrench className="h-4 w-4" />
                  {t('featured.services')}
                </TabsTrigger>
              </>
            )}
            {categoryContext === 'nieruchomosci' && (
              <>
                <TabsTrigger value="properties" className="gap-2">
                  <Home className="h-4 w-4" />
                  {t('featured.properties')}
                </TabsTrigger>
                <TabsTrigger value="services" className="gap-2">
                  <Wrench className="h-4 w-4" />
                  {t('featured.services')}
                </TabsTrigger>
              </>
            )}
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
      )}
      
      {/* Transaction Type Filter - only for vehicles and properties */}
      {showTransactionFilter && (
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTransactionType('sprzedaz')}
            className={cn(
              "px-4 py-1.5 rounded-full border-2 transition-all text-sm font-medium",
              transactionType === 'sprzedaz'
                ? "bg-emerald-500 border-emerald-500 text-white shadow-md"
                : "bg-background border-emerald-500 hover:opacity-80"
            )}
          >
            {t('featured.forSale')}
          </button>
          <button
            onClick={() => setTransactionType('wynajem')}
            className={cn(
              "px-4 py-1.5 rounded-full border-2 transition-all text-sm font-medium",
              transactionType === 'wynajem'
                ? "bg-blue-500 border-blue-500 text-white shadow-md"
                : "bg-background border-blue-500 hover:opacity-80"
            )}
          >
            {t('featured.forRent')}
          </button>
        </div>
      )}

      {/* Section Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg md:text-xl font-bold">
            {t('featured.title')}
          </h2>
        </div>
        {!hideViewMore && (
          <Button 
            variant="link" 
            className="text-primary gap-1 p-0"
            onClick={handleSeeMore}
          >
            {t('featured.seeMore')}
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
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
            showTransactionBadge={activeCategory === 'all'}
          />
        ))}
      </div>

      {/* See more button on mobile */}
      {!hideViewMore && (
        <div className="mt-6 text-center md:hidden">
          <Button onClick={handleSeeMore} className="w-full max-w-xs">
            {t('featured.seeAll')}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      )}

      {/* Category Selection Modal - styled like AddListingModal */}
      <Dialog open={showCategoryModal} onOpenChange={setShowCategoryModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-xl">
              {t('featured.chooseCategory')}
            </DialogTitle>
            <DialogDescription>
              {t('featured.chooseCategoryDesc')}
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
                <h3 className="font-bold text-base text-white leading-tight">{t('featured.carsTitle')}</h3>
                <p className="text-xs text-white/80 mt-1">{t('featured.carsDesc')}</p>
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
                <h3 className="font-bold text-base text-white leading-tight">{t('featured.propsTitle')}</h3>
                <p className="text-xs text-white/80 mt-1">{t('featured.propsDesc')}</p>
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
                <h3 className="font-bold text-base text-white leading-tight">{t('featured.servicesTitle')}</h3>
                <p className="text-xs text-white/80 mt-1">{t('featured.servicesDesc')}</p>
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
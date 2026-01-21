import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Building, Search, Plus, Sparkles, ArrowRight, Home, LayoutGrid, Rows3, List
} from "lucide-react";
import { cn } from "@/lib/utils";
import Footer from "@/components/Footer";
import { PropertyListingCard } from "@/components/realestate/PropertyListingCard";
import { RealEstateSearch, RealEstateFilters } from "@/components/realestate/RealEstateSearch";
import { RealEstateAISearch } from "@/components/realestate/RealEstateAISearch";
import { PropertyTypeSelector } from "@/components/realestate/PropertyTypeSelector";
import { TransactionTypeChips } from "@/components/realestate/TransactionTypeChips";
import { CompareBar } from "@/components/marketplace/CompareBar";
import { useCompare, PropertyCompareItem } from "@/contexts/CompareContext";
import { ResultsMapModal } from "@/components/realestate/ResultsMapModal";
import { toast } from "sonner";
import { UniversalHomeButton } from "@/components/UniversalHomeButton";
import { MyGetRidoButton } from "@/components/MyGetRidoButton";

// Import images
import heroImage from "@/assets/realestate-hero.jpg";
import tileCars from "@/assets/tile-cars.jpg";
import tileDriver from "@/assets/tile-driver.jpg";
import tileFleet from "@/assets/tile-fleet.jpg";
import tileRealestate from "@/assets/tile-realestate.jpg";

// Point-in-polygon algorithm (Ray casting)
function isPointInPolygon(
  lat: number, 
  lng: number, 
  polygon: Array<{ lat: number; lng: number }>
): boolean {
  let inside = false;
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng;
    const xj = polygon[j].lat, yj = polygon[j].lng;
    
    if (
      ((yi > lng) !== (yj > lng)) &&
      (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi)
    ) {
      inside = !inside;
    }
  }
  
  return inside;
}

// Check if point is within circle (Haversine)
function isPointInCircle(
  lat: number, 
  lng: number, 
  centerLat: number, 
  centerLng: number, 
  radiusMeters: number
): boolean {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat - centerLat) * Math.PI / 180;
  const dLng = (lng - centerLng) * Math.PI / 180;
  const a = Math.sin(dLat/2) ** 2 + 
            Math.cos(centerLat * Math.PI / 180) * 
            Math.cos(lat * Math.PI / 180) * 
            Math.sin(dLng/2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  
  return distance <= radiusMeters;
}

// Calculate distance from point to nearest polygon edge (for buffer check)
function getDistanceToPolygon(
  lat: number,
  lng: number,
  polygon: Array<{ lat: number; lng: number }>
): number {
  const R = 6371000; // Earth radius in meters
  let minDistance = Infinity;

  for (let i = 0; i < polygon.length; i++) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    
    // Calculate distance to this edge segment
    const distance = pointToSegmentDistance(lat, lng, p1.lat, p1.lng, p2.lat, p2.lng, R);
    if (distance < minDistance) {
      minDistance = distance;
    }
  }

  return minDistance;
}

// Helper: distance from point to line segment
function pointToSegmentDistance(
  pLat: number, pLng: number,
  aLat: number, aLng: number,
  bLat: number, bLng: number,
  R: number
): number {
  // Convert to radians
  const pLatR = pLat * Math.PI / 180;
  const pLngR = pLng * Math.PI / 180;
  const aLatR = aLat * Math.PI / 180;
  const aLngR = aLng * Math.PI / 180;
  const bLatR = bLat * Math.PI / 180;
  const bLngR = bLng * Math.PI / 180;

  // Project point onto line
  const dx = bLngR - aLngR;
  const dy = bLatR - aLatR;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    // Segment is a point
    const dLat = pLatR - aLatR;
    const dLng = pLngR - aLngR;
    const a = Math.sin(dLat/2) ** 2 + Math.cos(aLatR) * Math.cos(pLatR) * Math.sin(dLng/2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  let t = ((pLngR - aLngR) * dx + (pLatR - aLatR) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t)); // Clamp to segment

  const closestLng = aLngR + t * dx;
  const closestLat = aLatR + t * dy;

  // Haversine distance to closest point
  const dLat = pLatR - closestLat;
  const dLng = pLngR - closestLng;
  const a = Math.sin(dLat/2) ** 2 + Math.cos(closestLat) * Math.cos(pLatR) * Math.sin(dLng/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Check if point is inside polygon OR within buffer distance of polygon edge
function isPointInPolygonWithBuffer(
  lat: number,
  lng: number,
  polygon: Array<{ lat: number; lng: number }>,
  bufferMeters: number
): boolean {
  // First check if inside polygon
  if (isPointInPolygon(lat, lng, polygon)) {
    return true;
  }
  
  // If buffer is 0, just return inside check result
  if (bufferMeters <= 0) {
    return false;
  }
  
  // Check if within buffer distance of any edge
  const distance = getDistanceToPolygon(lat, lng, polygon);
  return distance <= bufferMeters;
}

// Mock listings for demo with coordinates
const MOCK_LISTINGS = [
  {
    id: "1",
    title: "Przestronne mieszkanie 3-pokojowe, Kazimierz",
    price: 450000,
    priceType: "sale",
    photos: [heroImage, tileRealestate, tileFleet],
    location: "Kraków",
    district: "Kazimierz",
    buildYear: 2019,
    areaM2: 65,
    rooms: 3,
    floor: 4,
    floorsTotal: 10,
    propertyType: "mieszkanie",
    transactionType: "Na sprzedaż",
    transactionColor: "#10b981",
    hasBalcony: true,
    hasElevator: true,
    marketType: "wtorny",
    agencyName: "Nieruchomości Premium",
    contactName: "Jan Kowalski",
    contactPhone: "+48 123 456 789",
    lat: 50.0514,
    lng: 19.9450,
  },
  {
    id: "2",
    title: "Nowoczesne studio w centrum",
    price: 2800,
    priceType: "rent_monthly",
    photos: [heroImage, tileCars, tileDriver],
    location: "Warszawa",
    district: "Śródmieście",
    buildYear: 2022,
    areaM2: 35,
    rooms: 1,
    floor: 8,
    floorsTotal: 15,
    propertyType: "kawalerka",
    transactionType: "Wynajem",
    transactionColor: "#3b82f6",
    hasElevator: true,
    hasParking: true,
    marketType: "pierwotny",
    agencyName: "City Apartments",
    contactName: "Anna Nowak",
    contactPhone: "+48 987 654 321",
    lat: 52.2297,
    lng: 21.0122,
  },
  {
    id: "3",
    title: "Dom jednorodzinny z ogrodem",
    price: 890000,
    priceType: "sale",
    photos: [heroImage, tileFleet, tileRealestate, tileCars],
    location: "Gdańsk",
    district: "Osowa",
    buildYear: 2015,
    areaM2: 180,
    rooms: 5,
    propertyType: "dom",
    transactionType: "Na sprzedaż",
    transactionColor: "#10b981",
    hasGarden: true,
    hasParking: true,
    agencyName: "Trójmiasto Nieruchomości",
    contactName: "Piotr Wiśniewski",
    lat: 54.4220,
    lng: 18.4866,
  },
  {
    id: "4",
    title: "Działka budowlana 1200m²",
    price: 320000,
    priceType: "sale",
    photos: [heroImage, tileRealestate, tileDriver],
    location: "Wrocław",
    district: "Krzyki",
    areaM2: 1200,
    propertyType: "dzialka",
    transactionType: "Na sprzedaż",
    transactionColor: "#10b981",
    agencyName: "Grunty Plus",
    lat: 51.0879,
    lng: 17.0185,
  },
];

// Helper to map DB listing to local format
interface DbListing {
  id: string;
  title: string;
  description?: string;
  price: number;
  price_type?: string;
  photos?: string[];
  location?: string;
  city?: string;
  district?: string;
  address?: string;
  area?: number;
  rooms?: number;
  floor?: number;
  total_floors?: number;
  build_year?: number;
  property_type?: string;
  transaction_type?: string;
  has_balcony?: boolean;
  has_elevator?: boolean;
  has_parking?: boolean;
  has_garden?: boolean;
  latitude?: number;
  longitude?: number;
  contact_person?: string;
  contact_phone?: string;
  real_estate_agents?: { company_name?: string } | null;
}

function mapDbToListing(db: DbListing) {
  const transTypeMap: Record<string, { label: string; color: string }> = {
    sprzedaz: { label: "Na sprzedaż", color: "#10b981" },
    wynajem: { label: "Wynajem", color: "#3b82f6" },
  };
  const trans = transTypeMap[db.transaction_type || ''] || { label: db.transaction_type, color: "#6b7280" };
  
  return {
    id: db.id,
    title: db.title,
    price: db.price,
    priceType: db.price_type || 'sale',
    photos: db.photos || [],
    location: db.city || db.location || '',
    district: db.district,
    buildYear: db.build_year,
    areaM2: db.area || 0,
    rooms: db.rooms,
    floor: db.floor,
    floorsTotal: db.total_floors,
    propertyType: db.property_type,
    transactionType: trans.label,
    transactionColor: trans.color,
    hasBalcony: db.has_balcony,
    hasElevator: db.has_elevator,
    hasParking: db.has_parking,
    hasGarden: db.has_garden,
    agencyName: db.real_estate_agents?.company_name,
    contactName: db.contact_person,
    contactPhone: db.contact_phone,
    lat: db.latitude ? Number(db.latitude) : undefined,
    lng: db.longitude ? Number(db.longitude) : undefined,
  };
}

export default function RealEstateMarketplace() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [selectedPropertyType, setSelectedPropertyType] = useState<string | null>(null);
  const [selectedTransactionType, setSelectedTransactionType] = useState<string | null>(null);
  const [allListings, setAllListings] = useState<any[]>([]);
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSearchingAI, setIsSearchingAI] = useState(false);
  const [aiExplanation, setAiExplanation] = useState("");
  const [viewMode, setViewMode] = useState<'grid' | 'compact' | 'list'>('grid');
  const [showResultsMap, setShowResultsMap] = useState(false);
  const [initialQuery, setInitialQuery] = useState<string>("");
  const aiSearchTriggered = useRef(false);

  // Compare context
  const { addProperty, removeProperty, isPropertySelected } = useCompare();

  // Fetch listings from database
  useEffect(() => {
    const fetchListings = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('real_estate_listings')
          .select(`
            id, title, description, price, price_type, photos,
            location, city, district, address, area, rooms, floor, total_floors, build_year,
            property_type, transaction_type,
            has_balcony, has_elevator, has_parking, has_garden,
            latitude, longitude, contact_person, contact_phone,
            real_estate_agents!agent_id(company_name)
          `)
          .eq('status', 'active')
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching listings:', error);
          // Fallback to mock if DB fails
          setAllListings(MOCK_LISTINGS);
          setListings(MOCK_LISTINGS);
        } else if (data && data.length > 0) {
          const mapped = data.map(d => mapDbToListing(d as unknown as DbListing));
          setAllListings(mapped);
          setListings(mapped);
        } else {
          // No data in DB, use mock
          setAllListings(MOCK_LISTINGS);
          setListings(MOCK_LISTINGS);
        }
      } catch (err) {
        console.error('Exception fetching listings:', err);
        setAllListings(MOCK_LISTINGS);
        setListings(MOCK_LISTINGS);
      } finally {
        setLoading(false);
      }
    };

    fetchListings();
  }, []);

  // Auto-filter when property type or transaction type changes
  useEffect(() => {
    if (allListings.length === 0) return;
    
    handleSearch({
      propertyType: selectedPropertyType || undefined,
      transactionType: selectedTransactionType || undefined,
    });
  }, [selectedPropertyType, selectedTransactionType, allListings]);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    checkUser();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });
    
    return () => subscription.unsubscribe();
  }, []);

  // Handle URL query parameter for AI search from EasyHub
  useEffect(() => {
    const queryFromUrl = searchParams.get('query');
    if (queryFromUrl && !aiSearchTriggered.current && allListings.length > 0) {
      aiSearchTriggered.current = true;
      setInitialQuery(queryFromUrl);
      
      // Trigger AI search
      const triggerAISearch = async () => {
        setIsSearchingAI(true);
        setLoading(true);
        
        try {
          const { data: userData } = await supabase.auth.getUser();
          
          const { data, error } = await supabase.functions.invoke('ai-search', {
            body: { 
              query: queryFromUrl,
              userId: userData.user?.id,
              searchType: 'real_estate'
            }
          });

          if (error) {
            console.error('AI Search error:', error);
            toast.error('Błąd wyszukiwania AI. Spróbuj ponownie.');
            setListings(allListings);
          } else if (data?.results) {
            handleAISearchResults(data.results, data.filters, data.explanation);
          } else {
            setListings([]);
            setAiExplanation(data?.explanation || 'Nie znaleziono wyników');
          }
        } catch (err) {
          console.error('AI Search exception:', err);
          toast.error('Błąd wyszukiwania. Spróbuj ponownie.');
          setListings(allListings);
        } finally {
          setIsSearchingAI(false);
          setLoading(false);
        }
      };
      
      triggerAISearch();
    }
  }, [searchParams, allListings]);

  const handleSearch = (filters: RealEstateFilters) => {
    console.log("Searching with filters:", filters);
    setLoading(true);
    
    let filteredListings = [...allListings];
    
    // Filter by area (circle or polygon) - NEW
    if (filters.area) {
      if (filters.area.type === "circle" && filters.area.circle) {
        const { centerLat, centerLng, radiusMeters } = filters.area.circle;
        filteredListings = filteredListings.filter(listing => 
          listing.lat && listing.lng && 
          isPointInCircle(listing.lat, listing.lng, centerLat, centerLng, radiusMeters)
        );
        console.log(`Filtered by circle (${radiusMeters}m): ${filteredListings.length} results`);
      } else if (filters.area.type === "polygon" && filters.area.polygon) {
        const { points, bufferMeters = 0 } = filters.area.polygon;
        filteredListings = filteredListings.filter(listing => 
          listing.lat && listing.lng && 
          isPointInPolygonWithBuffer(listing.lat, listing.lng, points, bufferMeters)
        );
        console.log(`Filtered by polygon (${points.length} pts, buffer: ${bufferMeters}m): ${filteredListings.length} results`);
      }
    }
    
    // Filter by location (text search)
    if (filters.location) {
      const locationLower = filters.location.toLowerCase();
      filteredListings = filteredListings.filter(listing => 
        listing.location.toLowerCase().includes(locationLower) ||
        listing.district?.toLowerCase().includes(locationLower) ||
        listing.title.toLowerCase().includes(locationLower)
      );
    }
    
    // Filter by property type
    if (filters.propertyType) {
      filteredListings = filteredListings.filter(listing => 
        listing.propertyType === filters.propertyType
      );
    }
    
    // Filter by transaction type
    if (filters.transactionType) {
      const transactionMap: Record<string, string> = {
        'sprzedaz': 'Na sprzedaż',
        'wynajem': 'Wynajem',
        'wynajem-krotkoterminowy': 'Krótkoterminowy',
      };
      const mappedType = transactionMap[filters.transactionType];
      console.log("Filter transactionType:", filters.transactionType, "-> mapped:", mappedType);
      filteredListings = filteredListings.filter(listing => 
        listing.transactionType === mappedType
      );
    }
    
    // Filter by price range
    if (filters.priceFrom) {
      filteredListings = filteredListings.filter(listing => listing.price >= filters.priceFrom!);
    }
    if (filters.priceTo) {
      filteredListings = filteredListings.filter(listing => listing.price <= filters.priceTo!);
    }
    
    // Filter by area range
    if (filters.areaFrom) {
      filteredListings = filteredListings.filter(listing => listing.areaM2 >= filters.areaFrom!);
    }
    if (filters.areaTo) {
      filteredListings = filteredListings.filter(listing => listing.areaM2 <= filters.areaTo!);
    }
    
    setListings(filteredListings);
    setLoading(false);
  };

  const handleAISearchResults = (results: any[], filters: any, explanation: string) => {
    console.log("AI Search results:", results.length, "filters:", filters);
    setAiExplanation(explanation);
    
    if (results.length > 0) {
      // Map DB results to local format
      const mapped = results.map(mapDbToListing);
      setListings(mapped);
    } else {
      setListings([]);
    }
  };

  const handleToggleCompare = (listing: typeof MOCK_LISTINGS[0]) => {
    const compareItem: PropertyCompareItem = {
      id: listing.id,
      title: listing.title,
      price: listing.price,
      priceType: listing.priceType,
      photos: listing.photos || [],
      transactionType: listing.transactionType,
      transactionColor: listing.transactionColor,
      propertyType: listing.propertyType,
      areaM2: listing.areaM2,
      rooms: listing.rooms,
      floor: listing.floor,
      buildYear: listing.buildYear,
      location: listing.location,
      district: listing.district,
      hasBalcony: listing.hasBalcony,
      hasElevator: listing.hasElevator,
      hasParking: listing.hasParking,
      hasGarden: listing.hasGarden,
      agencyName: listing.agencyName,
      contactPhone: listing.contactPhone,
    };

    if (isPropertySelected(listing.id)) {
      removeProperty(listing.id);
    } else {
      addProperty(compareItem);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Universal home button - same size as other elements */}
            <UniversalHomeButton />
            
            {/* Portal name only - no duplicate logo */}
            <span className="font-bold text-lg md:text-xl text-primary">
              Nieruchomości
            </span>
          </div>
          <div className="flex gap-2">
            <MyGetRidoButton user={user} />
            <Button 
              size="sm"
              onClick={() => {
                if (user) {
                  navigate('/nieruchomosci/agent/panel?tab=add');
                } else {
                  navigate('/auth?redirect=/nieruchomosci/agent/panel?tab=add');
                }
              }}
              className="rounded-full"
            >
              <Plus className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Dodaj ogłoszenie</span>
              <span className="sm:hidden">Dodaj</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section with Background */}
      <section className="relative overflow-hidden">
        {/* Background Image with Overlay */}
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${heroImage})` }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-background/90 via-background/80 to-background" />
        </div>

        <div className="relative container mx-auto px-4 py-8 md:py-12">
          {/* AI Search Bar */}
          <div className="max-w-3xl mx-auto mb-6">
            <RealEstateAISearch 
              onSearchResults={handleAISearchResults}
              onLoading={setIsSearchingAI}
            />
            {aiExplanation && (
              <p className="text-center text-sm text-primary mt-2 font-medium">
                🔍 {aiExplanation}
              </p>
            )}
          </div>

          {/* Title */}
          <div className="text-center mb-6">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2">
              Znajdź wymarzoną <span className="text-primary">nieruchomość</span>
            </h1>
            <p className="text-muted-foreground">
              Mieszkania, domy, działki i lokale od zweryfikowanych agencji
            </p>
          </div>
        </div>
      </section>

      {/* Property Type Selector */}
      <section className="container mx-auto px-4 py-4">
        <PropertyTypeSelector
          selectedType={selectedPropertyType}
          onTypeChange={setSelectedPropertyType}
          className="justify-center"
        />
      </section>

      {/* Transaction Type Chips */}
      <section className="container mx-auto px-4 py-2">
        <TransactionTypeChips
          selectedType={selectedTransactionType}
          onTypeChange={setSelectedTransactionType}
          className="justify-center"
        />
      </section>

      {/* Search Filters */}
      <section className="container mx-auto px-4 py-4">
        <RealEstateSearch
          onSearch={handleSearch}
          onShowMapResults={() => setShowResultsMap(true)}
          className="max-w-5xl mx-auto"
        />
      </section>

      {/* Results Count & View Toggle */}
      <section className="container mx-auto px-4 py-2">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <p className="text-sm text-muted-foreground">
            Znaleziono: <span className="font-medium text-foreground">{listings.length}</span> ogłoszeń
          </p>
          <div className="flex items-center gap-3">
            {/* View Mode Toggle */}
            <div className="flex gap-0.5 bg-muted rounded-lg p-0.5">
              <Button 
                variant={viewMode === 'grid' ? 'default' : 'ghost'} 
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setViewMode('grid')}
                title="Siatka"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button 
                variant={viewMode === 'compact' ? 'default' : 'ghost'} 
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setViewMode('compact')}
                title="Kompaktowy"
              >
                <Rows3 className="h-4 w-4" />
              </Button>
              <Button 
                variant={viewMode === 'list' ? 'default' : 'ghost'} 
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => setViewMode('list')}
                title="Lista"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Listings Grid */}
      <section className="container mx-auto px-4 py-6">
        <div className={cn(
          "grid gap-4 md:gap-6 max-w-7xl mx-auto",
          viewMode === 'list' 
            ? "grid-cols-1" 
            : viewMode === 'compact' 
              ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" 
              : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        )}>
          {listings.map((listing) => (
            <PropertyListingCard
              key={listing.id}
              listing={listing}
              onView={() => navigate(`/nieruchomosci/ogloszenie/${listing.id}`)}
              onFavorite={() => console.log("Favorite:", listing.id)}
              onToggleCompare={() => handleToggleCompare(listing)}
              isLoggedIn={!!user}
              isSelectedForCompare={isPropertySelected(listing.id)}
              compact={viewMode === 'compact'}
              variant={viewMode}
            />
          ))}
        </div>

        {listings.length === 0 && !loading && (
          <div className="text-center py-12">
            <Building className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium mb-2">Brak wyników</h3>
            <p className="text-muted-foreground mb-4">
              Spróbuj zmienić kryteria wyszukiwania
            </p>
          </div>
        )}
      </section>

      {/* CTA for Agencies */}
      <section className="container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl p-8 text-center border border-primary/20">
          <Building className="h-12 w-12 mx-auto text-primary mb-4" />
          <h2 className="text-2xl font-bold mb-2">Jesteś agentem nieruchomości?</h2>
          <p className="text-muted-foreground mb-6">
            Dołącz do GetRido i docieraj do tysięcy potencjalnych klientów. 
            Dodawaj ogłoszenia, zarządzaj zespołem agentów.
          </p>
          <Button 
            size="lg" 
            onClick={() => navigate('/nieruchomosci/agent/rejestracja')}
            className="rounded-full"
          >
            Zarejestruj agencję
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </section>

      {/* Footer with back link */}
      <footer className="border-t py-12 bg-card">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div 
              className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => navigate('/easy')}
            >
              <img 
                src="/lovable-uploads/253e522c-702e-4ce9-9429-10ddbde63878.png" 
                alt="RIDO" 
                className="h-8 w-8"
              />
              <span className="font-semibold">RIDO Nieruchomości</span>
            </div>
            <div className="flex items-center gap-4">
              <a 
                href="/easy" 
                className="text-sm text-primary hover:underline"
              >
                ← Wróć do GetRido Easy
              </a>
            </div>
            <p className="text-muted-foreground text-sm">
              © 2025 get RIDO. Wszystkie prawa zastrzeżone.
            </p>
          </div>
        </div>
      </footer>

      {/* Compare Bar */}
      <CompareBar type="property" className="pb-safe" />

      {/* Results Map Modal */}
      <ResultsMapModal
        open={showResultsMap}
        onOpenChange={setShowResultsMap}
        listings={listings.map(l => ({
          ...l,
          lat: l.lat ?? undefined,
          lng: l.lng ?? undefined,
        }))}
        onViewListing={(id) => {
          setShowResultsMap(false);
          navigate(`/nieruchomosci/ogloszenie/${id}`);
        }}
      />
    </div>
  );
}
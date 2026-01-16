import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Car, Plus, Home, Sparkles, ArrowRight, Building } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

import { VehicleTypeSelector } from "@/components/marketplace/VehicleTypeSelector";
import { TransactionTypeChips } from "@/components/marketplace/TransactionTypeChips";
import { MarketplaceSearch, SearchFilters } from "@/components/marketplace/MarketplaceSearch";
import { ListingCard } from "@/components/marketplace/ListingCard";
import { AdBanner } from "@/components/marketplace/AdBanner";
import { CompareBar } from "@/components/marketplace/CompareBar";
import { useCompare } from "@/contexts/CompareContext";

// Import hero image (same style as real estate)
import heroImage from "@/assets/tile-cars.jpg";

interface VehicleListing {
  id: string;
  vehicle_id: string | null;
  fleet_id: string | null;
  weekly_price: number;
  contact_phone: string | null;
  contact_email: string | null;
  contact_name: string | null;
  description: string | null;
  listing_number: string | null;
  // New marketplace fields
  title: string | null;
  transaction_type: string | null;
  price: number | null;
  price_type: string | null;
  location: string | null;
  city: string | null;
  photos: string[] | null;
  brand: string | null;
  model: string | null;
  year: number | null;
  fuel_type: string | null;
  odometer: number | null;
  engine_capacity: number | null;
  power: number | null;
  body_type: string | null;
  color: string | null;
  // Legacy vehicle relation (optional)
  vehicle?: {
    id: string;
    brand: string;
    model: string;
    year: number | null;
    plate: string;
    photos: string[] | null;
    fuel_type: string | null;
    odometer: number | null;
    engine_capacity: number | null;
    power: number | null;
    body_type: string | null;
  } | null;
  fleet: {
    id: string;
    name: string;
    contact_phone_for_drivers: string | null;
    email: string | null;
    city: string | null;
  } | null;
  avgRating: number | null;
  cityName: string | null;
  driver?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    phone: string | null;
    email: string | null;
  } | null;
}

export default function VehicleMarketplace() {
  const navigate = useNavigate();
  const [listings, setListings] = useState<VehicleListing[]>([]);
  const [filteredListings, setFilteredListings] = useState<VehicleListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [driverId, setDriverId] = useState<string | null>(null);
  
  // Filter states
  const [selectedVehicleType, setSelectedVehicleType] = useState<string | null>(null);
  const [selectedVehicleSlug, setSelectedVehicleSlug] = useState<string | null>(null);
  const [selectedTransactionTypes, setSelectedTransactionTypes] = useState<string[]>([]);

  // AI Search
  const [aiQuery, setAiQuery] = useState("");
  const [isSearchingAI, setIsSearchingAI] = useState(false);

  // Compare context
  const { addVehicle, removeVehicle, isVehicleSelected } = useCompare();

  useEffect(() => {
    loadListings();
    checkUser();
  }, []);

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
    if (user) {
      const { data } = await supabase
        .from("driver_app_users")
        .select("driver_id")
        .eq("user_id", user.id)
        .single();
      setDriverId(data?.driver_id || null);
    }
  };

  const loadListings = async () => {
    try {
      // Fetch all vehicle listings with new marketplace fields
      const { data, error } = await supabase
        .from("vehicle_listings")
        .select(`
          id,
          vehicle_id,
          fleet_id,
          weekly_price,
          contact_phone,
          contact_email,
          contact_name,
          description,
          listing_number,
          title,
          transaction_type,
          price,
          price_type,
          location,
          city,
          photos,
          brand,
          model,
          year,
          fuel_type,
          odometer,
          engine_capacity,
          power,
          body_type,
          color,
          fleet:fleets!fleet_id (
            id, name, contact_phone_for_drivers, email, city
          )
        `)
        .eq("is_available", true)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Map to listings format
      const listingsWithData = (data || []).map(l => ({
        ...l,
        avgRating: null,
        driver: null,
        cityName: l.city || l.fleet?.city || null,
      })) as VehicleListing[];

      setListings(listingsWithData);
      setFilteredListings(listingsWithData);
    } catch (error) {
      console.error("Error loading listings:", error);
      toast.error("Błąd ładowania ogłoszeń");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (filters: SearchFilters) => {
    let result = [...listings];

    // Multi-brand filter - check both new format and legacy vehicle relation
    if (filters.brands.length > 0) {
      result = result.filter(l => {
        const brand = l.brand || l.vehicle?.brand;
        return brand && filters.brands.some(b => b.toLowerCase() === brand.toLowerCase());
      });
    }

    if (filters.model) {
      result = result.filter(l => {
        const model = l.model || l.vehicle?.model;
        return model && model.toLowerCase() === filters.model.toLowerCase();
      });
    }

    if (filters.yearFrom && filters.yearFrom !== "all") {
      const yearFrom = parseInt(filters.yearFrom);
      result = result.filter(l => {
        const year = l.year || l.vehicle?.year;
        return year && year >= yearFrom;
      });
    }

    if (filters.yearTo && filters.yearTo !== "all") {
      const yearTo = parseInt(filters.yearTo);
      result = result.filter(l => {
        const year = l.year || l.vehicle?.year;
        return year && year <= yearTo;
      });
    }

    if (filters.priceMin) {
      const priceMin = parseInt(filters.priceMin);
      result = result.filter(l => (l.price || l.weekly_price) >= priceMin);
    }

    if (filters.priceMax) {
      const priceMax = parseInt(filters.priceMax);
      result = result.filter(l => (l.price || l.weekly_price) <= priceMax);
    }

    // Multi-fuel type filter
    if (filters.fuelTypes.length > 0) {
      result = result.filter(l => {
        const fuelType = l.fuel_type || l.vehicle?.fuel_type;
        return fuelType && filters.fuelTypes.includes(fuelType.toLowerCase());
      });
    }

    setFilteredListings(result);
  };

  const handleVehicleTypeSelect = (typeId: string | null, slug: string | null) => {
    setSelectedVehicleType(typeId);
    setSelectedVehicleSlug(slug);
  };

  const handleTransactionTypeToggle = (typeId: string) => {
    setSelectedTransactionTypes(prev => 
      prev.includes(typeId) 
        ? prev.filter(t => t !== typeId)
        : [...prev, typeId]
    );
  };

  const handleAISearch = async () => {
    if (!aiQuery.trim()) return;
    setIsSearchingAI(true);
    // TODO: Integrate with AI search edge function
    setTimeout(() => {
      setIsSearchingAI(false);
    }, 1000);
  };

  const handleReserve = async (listing: VehicleListing) => {
    if (!user) {
      toast.error("Zaloguj się aby zarezerwować");
      navigate("/gielda/logowanie");
      return;
    }

    // Navigate to detail page with reservation intent
    navigate(`/gielda/ogloszenie/${listing.id}?action=reserve`);
  };

  const handleToggleCompare = (listing: VehicleListing) => {
    const photos = listing.photos || listing.vehicle?.photos || [];
    const compareItem = {
      id: listing.id,
      title: listing.title || `${listing.brand || listing.vehicle?.brand || ''} ${listing.model || listing.vehicle?.model || ''}`,
      price: listing.price || listing.weekly_price,
      priceType: listing.price_type || "weekly",
      photos,
      transactionType: getTransactionDisplay(listing.transaction_type).label,
      transactionColor: getTransactionDisplay(listing.transaction_type).color,
      year: listing.year || listing.vehicle?.year || undefined,
      fuelType: listing.fuel_type || listing.vehicle?.fuel_type || undefined,
      mileage: listing.odometer || listing.vehicle?.odometer || undefined,
      engineCapacity: listing.engine_capacity || listing.vehicle?.engine_capacity || undefined,
      power: listing.power || listing.vehicle?.power || undefined,
      bodyType: listing.body_type || listing.vehicle?.body_type || undefined,
      location: listing.city || listing.cityName || undefined,
      rating: listing.avgRating || undefined,
      contactPhone: listing.contact_phone || listing.fleet?.contact_phone_for_drivers || listing.driver?.phone || undefined,
      contactEmail: listing.contact_email || listing.fleet?.email || listing.driver?.email || undefined,
    };

    if (isVehicleSelected(listing.id)) {
      removeVehicle(listing.id);
    } else {
      addVehicle(compareItem);
    }
  };

  // Map listing to ListingCard format - supports both new and legacy formats
  const getTransactionDisplay = (type: string | null) => {
    const map: Record<string, { label: string; color: string }> = {
      sprzedaz: { label: "Na sprzedaż", color: "#10b981" },
      wynajem: { label: "Wynajem", color: "#3b82f6" },
      "wynajem-krotkoterminowy": { label: "Krótkoterminowy", color: "#8b5cf6" },
    };
    return map[type || ""] || { label: "Wynajem", color: "#3b82f6" };
  };

  const mapToListingCard = (listing: VehicleListing) => {
    const trans = getTransactionDisplay(listing.transaction_type);
    const hasNewData = listing.title || listing.brand;
    
    return {
      id: listing.id,
      title: listing.title || (listing.vehicle ? `${listing.vehicle.brand} ${listing.vehicle.model}` : `${listing.brand || ''} ${listing.model || ''}`),
      price: listing.price || listing.weekly_price,
      priceType: (listing.price_type || "weekly") as "sale" | "weekly" | "monthly" | "daily",
      photos: listing.photos || listing.vehicle?.photos || [],
      location: listing.cityName || listing.city || undefined,
      year: listing.year || listing.vehicle?.year || undefined,
      fuelType: listing.fuel_type || listing.vehicle?.fuel_type || undefined,
      mileage: listing.odometer || listing.vehicle?.odometer || undefined,
      engineCapacity: listing.engine_capacity || listing.vehicle?.engine_capacity || undefined,
      power: listing.power || listing.vehicle?.power || undefined,
      bodyType: listing.body_type || listing.vehicle?.body_type || undefined,
      rating: listing.avgRating || undefined,
      transactionType: trans.label,
      transactionColor: trans.color,
      contactName: listing.contact_name || listing.driver?.first_name || undefined,
      contactPhone: listing.contact_phone || listing.fleet?.contact_phone_for_drivers || listing.driver?.phone || undefined,
      contactEmail: listing.contact_email || listing.fleet?.email || listing.driver?.email || undefined,
      description: listing.description || undefined,
      listingNumber: listing.listing_number || undefined,
    };
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* GetRido Easy link */}
            <a 
              href="/easy" 
              className="hidden md:flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              <Home className="h-4 w-4" />
              GetRido Easy
            </a>
            <div 
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => navigate("/easy")}
            >
              <img 
                src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" 
                alt="RIDO" 
                className="h-8 w-8"
              />
              <span className="font-bold text-lg md:text-xl">
                <span className="text-primary">RIDO</span> Giełda
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            {user ? (
              <>
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/gielda/panel')}
                  className="hidden sm:inline-flex"
                >
                  Mój panel
                </Button>
                <Button 
                  size="sm"
                  onClick={() => navigate('/gielda/panel?tab=add')}
                  className="rounded-full"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Dodaj ogłoszenie
                </Button>
              </>
            ) : (
              <>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => navigate('/gielda/rejestracja')}
                  className="hidden sm:inline-flex"
                >
                  Zarejestruj się
                </Button>
                <Button 
                  size="sm"
                  onClick={() => navigate('/gielda/logowanie')}
                  className="rounded-full"
                >
                  Zaloguj
                </Button>
              </>
            )}
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
            <div className="relative">
              <Sparkles className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-primary" />
              <Input
                type="text"
                placeholder="Zapytaj AI: 'SUV diesel do 800 zł/tydz w Warszawie'"
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAISearch()}
                className="pl-12 pr-28 h-14 text-base md:text-lg rounded-full border-2 border-primary/30 focus:border-primary shadow-xl bg-background/95 backdrop-blur"
              />
              <Button
                onClick={handleAISearch}
                disabled={isSearchingAI || !aiQuery.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full h-10 px-6"
              >
                {isSearchingAI ? "..." : "Szukaj AI"}
              </Button>
            </div>
            <p className="text-center text-xs text-muted-foreground mt-2">
              Powered by <span className="text-primary font-medium">Rido AI</span> • 
              Szukaj naturalnym językiem
            </p>
          </div>

          {/* Title */}
          <div className="text-center mb-6">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2">
              Znajdź idealne <span className="text-primary">auto</span> dla siebie
            </h1>
            <p className="text-muted-foreground">
              Tysiące sprawdzonych ofert od flot i prywatnych właścicieli
            </p>
          </div>
        </div>
      </section>

      {/* Vehicle Type Selector */}
      <section className="container mx-auto px-4 py-4">
        <VehicleTypeSelector 
          selectedType={selectedVehicleType}
          onSelect={handleVehicleTypeSelect}
        />
      </section>

      {/* Transaction Type Chips */}
      {selectedVehicleType && (
        <section className="container mx-auto px-4 py-2">
          <p className="text-sm font-medium text-muted-foreground mb-2 text-center">Typ transakcji:</p>
          <TransactionTypeChips 
            selectedTypes={selectedTransactionTypes}
            onToggle={handleTransactionTypeToggle}
            vehicleTypeSlug={selectedVehicleSlug}
          />
        </section>
      )}

      {/* Search Filters */}
      <section className="container mx-auto px-4 py-4">
        <MarketplaceSearch 
          onSearch={handleSearch}
          resultCount={filteredListings.length}
        />
      </section>

      {/* Ad Banner - below search */}
      <section className="container mx-auto px-4">
        <AdBanner slotKey="search_below" className="mb-6" />
      </section>

      {/* Results Count */}
      <section className="container mx-auto px-4 py-2">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <p className="text-sm text-muted-foreground">
            Znaleziono: <span className="font-medium text-foreground">{filteredListings.length.toLocaleString()}</span> ogłoszeń
          </p>
          <Badge variant="outline" className="gap-1">
            <Car className="h-3 w-3" />
            Tylko zweryfikowane floty
          </Badge>
        </div>
      </section>

      {/* Listings Grid */}
      <section className="container mx-auto px-4 py-6">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 max-w-7xl mx-auto">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="bg-card rounded-xl overflow-hidden animate-pulse">
                <div className="aspect-[4/3] bg-muted" />
                <div className="p-4 space-y-3">
                  <div className="h-5 bg-muted rounded w-3/4" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                  <div className="h-8 bg-muted rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredListings.length === 0 ? (
          <div className="text-center py-12">
            <Car className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium mb-2">Brak wyników</h3>
            <p className="text-muted-foreground mb-4">
              Spróbuj zmienić kryteria wyszukiwania
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 max-w-7xl mx-auto">
            {filteredListings.map(listing => (
              <ListingCard
                key={listing.id}
                listing={mapToListingCard(listing)}
                onView={() => navigate(`/gielda/ogloszenie/${listing.id}`)}
                onReserve={() => handleReserve(listing)}
                onToggleCompare={() => handleToggleCompare(listing)}
                isLoggedIn={!!user}
                isSelectedForCompare={isVehicleSelected(listing.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* CTA for Fleets */}
      <section className="container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl p-8 text-center border border-primary/20">
          <Car className="h-12 w-12 mx-auto text-primary mb-4" />
          <h2 className="text-2xl font-bold mb-2">Masz flotę pojazdów?</h2>
          <p className="text-muted-foreground mb-6">
            Dołącz do GetRido i docieraj do tysięcy kierowców. 
            Dodawaj ogłoszenia, zarządzaj wynajmem i rozliczeniami.
          </p>
          <Button 
            size="lg" 
            onClick={() => navigate('/fleet')}
            className="rounded-full"
          >
            Zarejestruj flotę
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12 bg-card">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div 
              className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => navigate('/easy')}
            >
              <img 
                src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" 
                alt="RIDO" 
                className="h-8 w-8"
              />
              <span className="font-semibold">RIDO Giełda</span>
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
      <CompareBar type="vehicle" className="pb-safe" />
    </div>
  );
}

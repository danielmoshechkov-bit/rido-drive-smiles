import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Car } from "lucide-react";
import { toast } from "sonner";

import { MarketplaceHeader } from "@/components/marketplace/MarketplaceHeader";
import { VehicleTypeSelector } from "@/components/marketplace/VehicleTypeSelector";
import { TransactionTypeChips } from "@/components/marketplace/TransactionTypeChips";
import { MarketplaceSearch, SearchFilters } from "@/components/marketplace/MarketplaceSearch";
import { ListingCard } from "@/components/marketplace/ListingCard";
import { AdBanner } from "@/components/marketplace/AdBanner";
import { RidoSearchBar } from "@/components/ai/RidoSearchBar";

interface VehicleListing {
  id: string;
  vehicle_id: string;
  fleet_id: string | null;
  weekly_price: number;
  contact_phone: string | null;
  contact_email: string | null;
  contact_name: string | null;
  description: string | null;
  listing_number: string | null;
  vehicle: {
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
  };
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
  
  // New filter states
  const [selectedVehicleType, setSelectedVehicleType] = useState<string | null>(null);
  const [selectedVehicleSlug, setSelectedVehicleSlug] = useState<string | null>(null);
  const [selectedTransactionTypes, setSelectedTransactionTypes] = useState<string[]>([]);

  // AI Search results
  const handleAISearchResults = (results: any[], filters: any, explanation: string) => {
    console.log('AI Search results:', results, filters, explanation);
    // For now, we can use these results to show listings from AI search
    // In future: map AI results back to listing IDs and filter
  };

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
      // Load cities for mapping
      const { data: citiesData } = await supabase.from("cities").select("id, name");
      const citiesMap: Record<string, string> = {};
      citiesData?.forEach(c => { citiesMap[c.id] = c.name; });

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
          vehicle:vehicles!vehicle_id (
            id, brand, model, year, plate, photos, fuel_type, odometer, engine_capacity, power, body_type
          ),
          fleet:fleets!fleet_id (
            id, name, contact_phone_for_drivers, email, city
          )
        `)
        .eq("is_available", true)
        .order("listed_at", { ascending: false });

      if (error) throw error;

      // Get ratings for each fleet
      const fleetIds = [...new Set((data || []).map(l => l.fleet?.id).filter(Boolean))];
      const ratingsMap: Record<string, number> = {};

      if (fleetIds.length > 0) {
        const { data: reviews } = await supabase
          .from("rental_reviews")
          .select("reviewee_id, car_condition_rating, service_quality_rating, problem_help_rating")
          .eq("reviewer_type", "driver")
          .eq("status", "approved")
          .in("reviewee_id", fleetIds);

        if (reviews) {
          const fleetReviews: Record<string, number[]> = {};
          reviews.forEach(r => {
            const avg = ((r.car_condition_rating || 0) + (r.service_quality_rating || 0) + (r.problem_help_rating || 0)) / 3;
            if (!fleetReviews[r.reviewee_id]) fleetReviews[r.reviewee_id] = [];
            fleetReviews[r.reviewee_id].push(avg);
          });
          Object.entries(fleetReviews).forEach(([id, ratings]) => {
            ratingsMap[id] = ratings.reduce((a, b) => a + b, 0) / ratings.length;
          });
        }
      }

      // Get driver info for private listings (no fleet)
      const privateListingVehicleIds = (data || [])
        .filter(l => !l.fleet_id)
        .map(l => l.vehicle_id);

      const driverInfoMap: Record<string, any> = {};
      const driverCityMap: Record<string, string> = {};
      
      if (privateListingVehicleIds.length > 0) {
        const { data: assignments } = await supabase
          .from("driver_vehicle_assignments")
          .select(`
            vehicle_id,
            driver:drivers!driver_id (
              id, first_name, last_name, phone, email, city_id
            )
          `)
          .in("vehicle_id", privateListingVehicleIds)
          .eq("status", "active");

        if (assignments) {
          assignments.forEach(a => {
            if (a.driver) {
              driverInfoMap[a.vehicle_id] = a.driver;
              if (a.driver.city_id && citiesMap[a.driver.city_id]) {
                driverCityMap[a.vehicle_id] = citiesMap[a.driver.city_id];
              }
            }
          });
        }
      }

      // Filter out listings where vehicle is null (deleted vehicles)
      const validListings = (data || []).filter(l => l.vehicle !== null);
      
      const listingsWithData = validListings.map(l => ({
        ...l,
        avgRating: l.fleet?.id ? ratingsMap[l.fleet.id] || null : null,
        driver: !l.fleet_id ? driverInfoMap[l.vehicle_id] || null : null,
        cityName: l.fleet?.city || driverCityMap[l.vehicle_id] || null,
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

    // Multi-brand filter
    if (filters.brands.length > 0) {
      result = result.filter(l => 
        filters.brands.some(brand => 
          l.vehicle.brand.toLowerCase() === brand.toLowerCase()
        )
      );
    }

    if (filters.model) {
      result = result.filter(l => 
        l.vehicle.model.toLowerCase() === filters.model.toLowerCase()
      );
    }

    if (filters.yearFrom && filters.yearFrom !== "all") {
      const yearFrom = parseInt(filters.yearFrom);
      result = result.filter(l => 
        l.vehicle.year && l.vehicle.year >= yearFrom
      );
    }

    if (filters.yearTo && filters.yearTo !== "all") {
      const yearTo = parseInt(filters.yearTo);
      result = result.filter(l => 
        l.vehicle.year && l.vehicle.year <= yearTo
      );
    }

    if (filters.priceMin) {
      const priceMin = parseInt(filters.priceMin);
      result = result.filter(l => l.weekly_price >= priceMin);
    }

    if (filters.priceMax) {
      const priceMax = parseInt(filters.priceMax);
      result = result.filter(l => l.weekly_price <= priceMax);
    }

    // Multi-fuel type filter
    if (filters.fuelTypes.length > 0) {
      result = result.filter(l => 
        l.vehicle.fuel_type && filters.fuelTypes.includes(l.vehicle.fuel_type.toLowerCase())
      );
    }

    setFilteredListings(result);
  };

  const handleVehicleTypeSelect = (typeId: string | null, slug: string | null) => {
    setSelectedVehicleType(typeId);
    setSelectedVehicleSlug(slug);
    // In future: filter listings by vehicle type
  };

  const handleTransactionTypeToggle = (typeId: string) => {
    setSelectedTransactionTypes(prev => 
      prev.includes(typeId) 
        ? prev.filter(t => t !== typeId)
        : [...prev, typeId]
    );
    // In future: filter listings by transaction type
  };

  const handleReserve = async (listing: VehicleListing) => {
    if (!user) {
      toast.error("Zaloguj się jako kierowca aby zarezerwować");
      navigate("/");
      return;
    }

    if (!driverId) {
      toast.error("Musisz być zarejestrowany jako kierowca");
      return;
    }

    try {
      const { error } = await supabase
        .from("vehicle_rentals")
        .insert({
          listing_id: listing.id,
          vehicle_id: listing.vehicle.id,
          driver_id: driverId,
          fleet_id: listing.fleet?.id || null,
          weekly_price: listing.weekly_price,
          status: "pending"
        });

      if (error) throw error;

      toast.success("Rezerwacja wysłana! Czekaj na akceptację.");
    } catch (error: any) {
      console.error("Error reserving:", error);
      toast.error(error.message || "Błąd rezerwacji");
    }
  };

  // Map old listing format to new ListingCard format
  const mapToListingCard = (listing: VehicleListing) => ({
    id: listing.id,
    title: `${listing.vehicle.brand} ${listing.vehicle.model}`,
    price: listing.weekly_price,
    priceType: "weekly" as const,
    photos: listing.vehicle.photos || [],
    location: listing.cityName || undefined,
    year: listing.vehicle.year || undefined,
    fuelType: listing.vehicle.fuel_type || undefined,
    mileage: listing.vehicle.odometer || undefined,
    engineCapacity: listing.vehicle.engine_capacity || undefined,
    power: listing.vehicle.power || undefined,
    bodyType: listing.vehicle.body_type || undefined,
    rating: listing.avgRating || undefined,
    transactionType: "Wynajem", // Default for now
    transactionColor: "#3b82f6",
    contactName: listing.contact_name || listing.driver?.first_name || undefined,
    contactPhone: listing.contact_phone || listing.fleet?.contact_phone_for_drivers || listing.driver?.phone || undefined,
    contactEmail: listing.contact_email || listing.fleet?.email || listing.driver?.email || undefined,
    description: listing.description || undefined,
    listingNumber: listing.listing_number || undefined,
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <MarketplaceHeader user={user} />

      {/* AI Search Bar - Always at top */}
      <div className="container mx-auto px-4 py-6">
        <RidoSearchBar onSearchResults={handleAISearchResults} />
      </div>

      {/* Hero Section */}
      <div className="bg-gradient-to-r from-primary/5 via-transparent to-transparent">
        <div className="container mx-auto px-4 py-8 md:py-12">
          <div className="max-w-3xl">
            <h1 className="text-3xl md:text-4xl font-bold mb-3">
              Znajdź idealne auto
              <span className="text-primary"> dla siebie</span>
            </h1>
            <p className="text-muted-foreground">
              Tysiące sprawdzonych ofert od flot i prywatnych właścicieli. 
              Wynajem, leasing, sprzedaż – wszystko w jednym miejscu.
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 -mt-6">
        {/* Vehicle Type Selector (tabs) */}
        <div className="mb-6">
          <VehicleTypeSelector 
            selectedType={selectedVehicleType}
            onSelect={handleVehicleTypeSelect}
          />
        </div>

        {/* Transaction Type Chips - only show when category is selected */}
        {selectedVehicleType && (
          <div className="mb-6">
            <p className="text-sm font-medium text-muted-foreground mb-2">Typ transakcji:</p>
            <TransactionTypeChips 
              selectedTypes={selectedTransactionTypes}
              onToggle={handleTransactionTypeToggle}
              vehicleTypeSlug={selectedVehicleSlug}
            />
          </div>
        )}

        {/* Search Filters */}
        <div className="mb-4">
          <MarketplaceSearch 
            onSearch={handleSearch}
            resultCount={filteredListings.length}
          />
        </div>

        {/* Ad Banner - below search */}
        <AdBanner slotKey="search_below" className="mb-8" />

        {/* Results Count & Sort */}
        <div className="flex items-center justify-between mb-6">
          <p className="text-muted-foreground">
            Znaleziono: <strong className="text-foreground">{filteredListings.length.toLocaleString()}</strong> ogłoszeń
          </p>
          {/* Sort dropdown could go here */}
        </div>

        {/* Listings Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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
          <div className="text-center py-16">
            <Car className="h-20 w-20 text-muted-foreground/20 mx-auto mb-6" />
            <h3 className="text-2xl font-semibold mb-3">Brak wyników</h3>
            <p className="text-muted-foreground max-w-md mx-auto">
              Nie znaleziono ogłoszeń spełniających kryteria. 
              Spróbuj zmienić filtry lub wróć później.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredListings.map(listing => (
              <ListingCard
                key={listing.id}
                listing={mapToListingCard(listing)}
                onReserve={() => handleReserve(listing)}
                isLoggedIn={!!user && !!driverId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t mt-16 py-12 bg-card">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img 
                src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" 
                alt="RIDO" 
                className="h-8 w-8"
              />
              <span className="font-semibold">RIDO Marketplace</span>
            </div>
            <p className="text-muted-foreground text-sm">
              © 2025 get RIDO. Wszystkie prawa zastrzeżone.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

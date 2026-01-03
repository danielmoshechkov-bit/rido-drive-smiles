import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Car, LogIn } from "lucide-react";
import { toast } from "sonner";
import { MarketplaceFilters, FilterValues } from "@/components/MarketplaceFilters";
import { MarketplaceVehicleCard } from "@/components/MarketplaceVehicleCard";

interface VehicleListing {
  id: string;
  vehicle_id: string;
  fleet_id: string | null;
  weekly_price: number;
  contact_phone: string | null;
  contact_email: string | null;
  vehicle: {
    id: string;
    brand: string;
    model: string;
    year: number | null;
    plate: string;
    photos: string[] | null;
    fuel_type: string | null;
  };
  fleet: {
    id: string;
    name: string;
    contact_phone_for_drivers: string | null;
    email: string | null;
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
  const [reserving, setReserving] = useState(false);

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
          vehicle:vehicles!vehicle_id (
            id, brand, model, year, plate, photos, fuel_type
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

      const listingsWithData = (data || []).map(l => ({
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

  const handleFilterChange = (filters: FilterValues) => {
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

    // City filter - would need to match by city_id
    // For now we skip city filtering as it requires more complex logic

    setFilteredListings(result);
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

    setReserving(true);
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
    } finally {
      setReserving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-xl">
              <Car className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Giełda Aut</h1>
              <p className="text-xs text-muted-foreground">get RIDO</p>
            </div>
          </div>
          
          {user ? (
            <Button variant="outline" onClick={() => navigate("/driver")}>
              Panel Kierowcy
            </Button>
          ) : (
            <Button onClick={() => navigate("/")}>
              <LogIn className="h-4 w-4 mr-2" />
              Zaloguj się
            </Button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        {/* Hero Section */}
        <div className="text-center mb-8">
          <h2 className="text-3xl md:text-4xl font-bold mb-3">
            Znajdź idealne auto do wynajmu
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Przeglądaj oferty aut od sprawdzonych flot i prywatnych właścicieli. 
            Bezpieczne rezerwacje, transparentne warunki.
          </p>
        </div>

        {/* Filters */}
        <div className="mb-8">
          <MarketplaceFilters onFilterChange={handleFilterChange} />
        </div>

        {/* Results Count */}
        <div className="flex items-center justify-between mb-6">
          <p className="text-muted-foreground">
            Znaleziono: <strong className="text-foreground">{filteredListings.length}</strong> ogłoszeń
          </p>
        </div>

        {/* Listings Grid */}
        {loading ? (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Ładowanie ogłoszeń...</p>
          </div>
        ) : filteredListings.length === 0 ? (
          <div className="text-center py-16">
            <Car className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Brak wyników</h3>
            <p className="text-muted-foreground">
              Zmień kryteria wyszukiwania lub spróbuj później
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredListings.map(listing => (
              <MarketplaceVehicleCard
                key={listing.id}
                listing={listing}
                onReserve={handleReserve}
                isLoggedIn={!!user && !!driverId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="border-t mt-12 py-8">
        <div className="container mx-auto px-4 text-center text-muted-foreground text-sm">
          <p>© 2025 get RIDO. Wszystkie prawa zastrzeżone.</p>
        </div>
      </footer>
    </div>
  );
}

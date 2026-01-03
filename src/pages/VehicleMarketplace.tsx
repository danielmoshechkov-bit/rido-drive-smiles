import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Car, Star, Phone, Mail, ChevronDown, Search, Fuel, Calendar, LogIn } from "lucide-react";
import { toast } from "sonner";

interface VehicleListing {
  id: string;
  weekly_price: number;
  vehicle: {
    id: string;
    brand: string;
    model: string;
    year: number;
    plate: string;
    photos: string[];
    fuel_type: string | null;
  };
  fleet?: {
    id: string;
    name: string;
    contact_name: string;
    contact_phone_for_drivers: string;
    phone: string;
    email: string;
  } | null;
  average_rating?: number;
}

export default function VehicleMarketplace() {
  const navigate = useNavigate();
  const [listings, setListings] = useState<VehicleListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
      const { data, error } = await supabase
        .from("vehicle_listings")
        .select(`
          id,
          weekly_price,
          vehicle:vehicles!vehicle_id (
            id, brand, model, year, plate, photos, fuel_type
          ),
          fleet:fleets!fleet_id (
            id, name, contact_name, contact_phone_for_drivers, phone, email
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

      const listingsWithRatings = (data || []).map(l => ({
        ...l,
        average_rating: l.fleet?.id ? ratingsMap[l.fleet.id] : undefined
      })) as VehicleListing[];

      setListings(listingsWithRatings);
    } catch (error) {
      console.error("Error loading listings:", error);
      toast.error("Błąd ładowania ogłoszeń");
    } finally {
      setLoading(false);
    }
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

      toast.success("Rezerwacja wysłana! Czekaj na akceptację floty.");
    } catch (error: any) {
      console.error("Error reserving:", error);
      toast.error(error.message || "Błąd rezerwacji");
    } finally {
      setReserving(false);
    }
  };

  const filteredListings = listings.filter(l => {
    const searchLower = search.toLowerCase();
    return (
      l.vehicle.brand.toLowerCase().includes(searchLower) ||
      l.vehicle.model.toLowerCase().includes(searchLower) ||
      (l.fleet?.name?.toLowerCase().includes(searchLower) ?? false)
    );
  });

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map(star => (
          <Star
            key={star}
            className={`h-4 w-4 ${star <= Math.round(rating) ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground"}`}
          />
        ))}
        <span className="text-sm text-muted-foreground ml-1">({rating.toFixed(1)})</span>
      </div>
    );
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

      {/* Search */}
      <div className="container mx-auto px-4 py-6">
        <div className="relative max-w-md mx-auto mb-8">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Szukaj marki, modelu lub floty..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Listings Grid */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Ładowanie...</div>
        ) : filteredListings.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            Brak dostępnych aut na giełdzie
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredListings.map(listing => (
              <Collapsible
                key={listing.id}
                open={expandedId === listing.id}
                onOpenChange={(open) => setExpandedId(open ? listing.id : null)}
              >
                <Card className="overflow-hidden hover:shadow-lg transition-shadow">
                  {/* Photo Gallery */}
                  <div className="aspect-[4/3] bg-muted relative overflow-hidden">
                    {listing.vehicle.photos?.length > 0 ? (
                      <>
                        <img
                          src={listing.vehicle.photos[0]}
                          alt={`${listing.vehicle.brand} ${listing.vehicle.model}`}
                          className="w-full h-full object-cover"
                        />
                        {listing.vehicle.photos.length > 1 && (
                          <div className="absolute bottom-2 left-2 flex gap-1">
                            {listing.vehicle.photos.slice(0, 4).map((_, idx) => (
                              <div 
                                key={idx}
                                className={`w-2 h-2 rounded-full ${idx === 0 ? 'bg-primary' : 'bg-white/60'}`}
                              />
                            ))}
                            {listing.vehicle.photos.length > 4 && (
                              <span className="text-xs text-white bg-black/50 px-1.5 rounded">
                                +{listing.vehicle.photos.length - 4}
                              </span>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Car className="h-16 w-16 text-muted-foreground/50" />
                      </div>
                    )}
                    <Badge className="absolute top-2 right-2 bg-primary text-primary-foreground">
                      {listing.weekly_price} zł/tydz
                    </Badge>
                  </div>

                  <CardContent className="p-4">
                    <div className="space-y-2">
                      <h3 className="font-semibold text-lg">
                        {listing.vehicle.brand} {listing.vehicle.model}
                      </h3>
                      
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {listing.vehicle.year || "—"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Fuel className="h-3 w-3" />
                          {listing.vehicle.fuel_type || "—"}
                        </span>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{listing.fleet?.name || "Prywatny"}</span>
                        {listing.average_rating && renderStars(listing.average_rating)}
                      </div>

                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" className="w-full mt-2">
                          <ChevronDown className={`h-4 w-4 transition-transform ${expandedId === listing.id ? "rotate-180" : ""}`} />
                          Szczegóły
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                  </CardContent>

                  <CollapsibleContent>
                    <div className="px-4 pb-4 space-y-3 border-t pt-3">
                      {listing.fleet ? (
                        <div className="text-sm space-y-2">
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <a href={`tel:${listing.fleet.contact_phone_for_drivers || listing.fleet.phone}`} className="text-primary hover:underline">
                              {listing.fleet.contact_phone_for_drivers || listing.fleet.phone || "Brak telefonu"}
                            </a>
                          </div>
                          {listing.fleet.email && (
                            <div className="flex items-center gap-2">
                              <Mail className="h-4 w-4 text-muted-foreground" />
                              <a href={`mailto:${listing.fleet.email}`} className="text-primary hover:underline">
                                {listing.fleet.email}
                              </a>
                            </div>
                          )}
                          {listing.fleet.contact_name && (
                            <p className="text-muted-foreground">
                              Kontakt: {listing.fleet.contact_name}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          Auto prywatne
                        </div>
                      )}

                      <Button 
                        className="w-full" 
                        onClick={() => handleReserve(listing)}
                        disabled={reserving}
                      >
                        {reserving ? "Rezerwowanie..." : "Zarezerwuj"}
                      </Button>
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

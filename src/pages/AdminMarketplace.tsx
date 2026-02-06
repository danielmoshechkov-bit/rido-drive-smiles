import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TabsContent, TabsTrigger } from "@/components/ui/tabs";
import { TabsPill } from "@/components/ui/TabsPill";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UniversalHomeButton } from "@/components/UniversalHomeButton";
import { MyGetRidoButton } from "@/components/MyGetRidoButton";
import { AdminPortalSwitcher } from "@/components/admin/AdminPortalSwitcher";
import { ArrowLeft, Image, Save, Settings, List, Trash2, Search, Grid, Loader2, Star } from "lucide-react";
import { toast } from "sonner";

interface AdSlot {
  id: string;
  slot_key: string;
  name: string;
  description: string | null;
  image_url: string | null;
  link_url: string | null;
  is_active: boolean;
}

interface VehicleListing {
  id: string;
  listing_number: string | null;
  weekly_price: number;
  is_available: boolean;
  created_at: string;
  vehicle: {
    brand: string;
    model: string;
    year: number | null;
  } | null;
}

interface TransactionType {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

interface FeatureToggle {
  id: string;
  feature_key: string;
  feature_name: string;
  description: string | null;
  is_enabled: boolean;
}

export default function AdminMarketplace() {
  const navigate = useNavigate();
  const [adSlots, setAdSlots] = useState<AdSlot[]>([]);
  const [listings, setListings] = useState<VehicleListing[]>([]);
  const [transactionTypes, setTransactionTypes] = useState<TransactionType[]>([]);
  const [premiumFeatures, setPremiumFeatures] = useState<FeatureToggle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState<any>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Settings state
  const [defaultDuration, setDefaultDuration] = useState(30);
  const [autoDeleteDays, setAutoDeleteDays] = useState(40);
  const [autoDeleteEnabled, setAutoDeleteEnabled] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    fetchUser();
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    
    // Load ad slots
    const { data: slots } = await supabase
      .from("marketplace_ad_slots")
      .select("*")
      .order("slot_key");

    if (slots) {
      setAdSlots(slots);
    }

    // Load vehicle listings with vehicle data
    const { data: listingsData } = await supabase
      .from("vehicle_listings")
      .select(`
        id,
        listing_number,
        weekly_price,
        is_available,
        created_at,
        vehicle:vehicles (
          brand,
          model,
          year
        )
      `)
      .order("created_at", { ascending: false })
      .limit(100);

    if (listingsData) {
      setListings(listingsData as VehicleListing[]);
    }

    // Load transaction types for categories management
    const { data: typesData } = await supabase
      .from("marketplace_transaction_types")
      .select("id, slug, name, description, is_active")
      .not("slug", "in", "(wynajem-nieruchomosci,sprzedaz-nieruchomosci)")
      .order("sort_order");

    if (typesData) {
      setTransactionTypes(typesData);
    }

    // Load premium feature toggles
    const { data: featuresData } = await supabase
      .from("feature_toggles")
      .select("id, feature_key, feature_name, description, is_enabled")
      .eq("category", "marketplace");

    if (featuresData) {
      setPremiumFeatures(featuresData as FeatureToggle[]);
    }

    setLoading(false);
  };

  const handleAdSlotUpdate = async (slot: AdSlot, field: keyof AdSlot, value: string | boolean) => {
    const updatedSlots = adSlots.map((s) =>
      s.id === slot.id ? { ...s, [field]: value } : s
    );
    setAdSlots(updatedSlots);
  };

  const saveAdSlots = async () => {
    setSaving(true);
    
    for (const slot of adSlots) {
      const { error } = await supabase
        .from("marketplace_ad_slots")
        .update({
          image_url: slot.image_url,
          link_url: slot.link_url,
          is_active: slot.is_active,
        })
        .eq("id", slot.id);

      if (error) {
        toast.error(`Błąd zapisu: ${slot.name}`);
        setSaving(false);
        return;
      }
    }

    toast.success("Ustawienia reklam zapisane");
    setSaving(false);
  };

  const toggleTransactionType = async (typeId: string, isActive: boolean) => {
    const { error } = await supabase
      .from("marketplace_transaction_types")
      .update({ is_active: isActive })
      .eq("id", typeId);

    if (error) {
      toast.error("Błąd zmiany statusu kategorii");
      return;
    }

    setTransactionTypes(prev => 
      prev.map(t => t.id === typeId ? { ...t, is_active: isActive } : t)
    );
    toast.success(isActive ? "Kategoria aktywowana" : "Kategoria dezaktywowana");
  };

  const togglePremiumFeature = async (featureId: string, isEnabled: boolean) => {
    const { error } = await supabase
      .from("feature_toggles")
      .update({ is_enabled: isEnabled, updated_at: new Date().toISOString() })
      .eq("id", featureId);

    if (error) {
      toast.error("Błąd zmiany ustawienia");
      return;
    }

    setPremiumFeatures(prev => 
      prev.map(f => f.id === featureId ? { ...f, is_enabled: isEnabled } : f)
    );
    toast.success(isEnabled ? "Funkcja włączona" : "Funkcja wyłączona");
  };

  const toggleListingStatus = async (listing: VehicleListing) => {
    const newStatus = !listing.is_available;
    
    const { error } = await supabase
      .from("vehicle_listings")
      .update({ is_available: newStatus })
      .eq("id", listing.id);

    if (error) {
      toast.error("Błąd zmiany statusu");
      return;
    }

    setListings(listings.map((l) =>
      l.id === listing.id ? { ...l, is_available: newStatus } : l
    ));
    toast.success(newStatus ? "Ogłoszenie aktywowane" : "Ogłoszenie dezaktywowane");
  };

  const deleteListing = async (listing: VehicleListing) => {
    if (!confirm("Czy na pewno chcesz usunąć to ogłoszenie?")) return;

    const { error } = await supabase
      .from("vehicle_listings")
      .delete()
      .eq("id", listing.id);

    if (error) {
      toast.error("Błąd usuwania ogłoszenia");
      return;
    }

    setListings(listings.filter((l) => l.id !== listing.id));
    toast.success("Ogłoszenie usunięte");
  };

  // Filter listings
  const filteredListings = listings.filter((l) => {
    const title = l.vehicle ? `${l.vehicle.brand} ${l.vehicle.model}` : "";
    const searchLower = searchQuery.toLowerCase();
    
    const matchesSearch = 
      title.toLowerCase().includes(searchLower) ||
      (l.listing_number?.toLowerCase().includes(searchLower) ?? false);
    
    const matchesStatus = 
      filterStatus === "all" ||
      (filterStatus === "active" && l.is_available) ||
      (filterStatus === "inactive" && !l.is_available);
    
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6">
      {/* Header */}
        <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b mb-6">
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-4">
              <UniversalHomeButton />
              <AdminPortalSwitcher />
            </div>
            <MyGetRidoButton user={user} />
          </div>
        </header>

        <div className="mb-6">
          <h1 className="text-2xl font-bold">Marketplace Admin</h1>
          <p className="text-muted-foreground">Zarządzaj giełdą pojazdów</p>
        </div>

        <TabsPill defaultValue="listings" className="space-y-6">
          <TabsTrigger value="listings" className="flex items-center gap-2">
            <List className="h-4 w-4" />
            Ogłoszenia
          </TabsTrigger>
          <TabsTrigger value="ads" className="flex items-center gap-2">
            <Image className="h-4 w-4" />
            Reklamy
          </TabsTrigger>
          <TabsTrigger value="categories" className="flex items-center gap-2">
            <Grid className="h-4 w-4" />
            Kategorie
          </TabsTrigger>
          <TabsTrigger value="premium" className="flex items-center gap-2">
            <Star className="h-4 w-4" />
            Premium
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Ustawienia
          </TabsTrigger>
          {/* Listings Tab */}
          <TabsContent value="listings">
            <Card>
              <CardHeader>
                <CardTitle>Ogłoszenia ({filteredListings.length})</CardTitle>
                <CardDescription>Moderuj i zarządzaj ogłoszeniami</CardDescription>
              </CardHeader>
              <CardContent>
                {/* Filters */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="md:col-span-2 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Szukaj po nazwie lub numerze oferty..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger>
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Wszystkie</SelectItem>
                      <SelectItem value="active">Aktywne</SelectItem>
                      <SelectItem value="inactive">Nieaktywne</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {filteredListings.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    Brak ogłoszeń do wyświetlenia
                  </p>
                ) : (
                  <div className="space-y-3">
                    {filteredListings.map((listing) => (
                      <div
                        key={listing.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium">
                              {listing.vehicle 
                                ? `${listing.vehicle.brand} ${listing.vehicle.model}` 
                                : "Brak danych pojazdu"}
                            </p>
                            {listing.listing_number && (
                              <span className="text-xs bg-muted px-2 py-0.5 rounded font-mono">
                                {listing.listing_number}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {listing.weekly_price} zł/tydzień • {new Date(listing.created_at).toLocaleDateString("pl-PL")}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Switch
                            checked={listing.is_available}
                            onCheckedChange={() => toggleListingStatus(listing)}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteListing(listing)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Ads Tab */}
          <TabsContent value="ads">
            <Card>
              <CardHeader>
                <CardTitle>Miejsca reklamowe</CardTitle>
                <CardDescription>Skonfiguruj banery reklamowe na stronie giełdy</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {adSlots.map((slot) => (
                  <div key={slot.id} className="border rounded-lg p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-medium">{slot.name}</h3>
                        <p className="text-sm text-muted-foreground">{slot.description}</p>
                      </div>
                      <Switch
                        checked={slot.is_active}
                        onCheckedChange={(checked) => handleAdSlotUpdate(slot, "is_active", checked)}
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label>URL obrazka</Label>
                        <Input
                          placeholder="https://example.com/banner.jpg"
                          value={slot.image_url || ""}
                          onChange={(e) => handleAdSlotUpdate(slot, "image_url", e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Link (opcjonalny)</Label>
                        <Input
                          placeholder="https://example.com"
                          value={slot.link_url || ""}
                          onChange={(e) => handleAdSlotUpdate(slot, "link_url", e.target.value)}
                        />
                      </div>
                    </div>

                    {slot.image_url && (
                      <div className="mt-2">
                        <Label className="text-xs text-muted-foreground">Podgląd:</Label>
                        <img
                          src={slot.image_url}
                          alt={slot.name}
                          className="mt-1 max-h-24 rounded border object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                      </div>
                    )}
                  </div>
                ))}

                <Button onClick={saveAdSlots} disabled={saving} className="w-full">
                  <Save className="h-4 w-4 mr-2" />
                  {saving ? "Zapisywanie..." : "Zapisz ustawienia reklam"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Categories Tab */}
          <TabsContent value="categories">
            <Card>
              <CardHeader>
                <CardTitle>Kategorie transakcji</CardTitle>
                <CardDescription>Włącz lub wyłącz kategorie dostępne w formularzu dodawania ogłoszenia</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {transactionTypes.map((type) => (
                  <div
                    key={type.id}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div>
                      <p className="font-medium">{type.name}</p>
                      <p className="text-sm text-muted-foreground">{type.description || type.slug}</p>
                    </div>
                    <Switch
                      checked={type.is_active}
                      onCheckedChange={(checked) => toggleTransactionType(type.id, checked)}
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Premium Features Tab */}
          <TabsContent value="premium">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-primary" />
                  Funkcje Premium
                </CardTitle>
                <CardDescription>
                  Zarządzaj płatnymi opcjami dla ogłoszeń premium
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {premiumFeatures.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    Brak skonfigurowanych funkcji premium
                  </p>
                ) : (
                  premiumFeatures.map((feature) => (
                    <div
                      key={feature.id}
                      className="flex items-center justify-between p-4 border rounded-lg bg-gradient-to-r from-primary/5 to-transparent"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Star className="h-4 w-4 text-primary" />
                          <p className="font-medium">{feature.feature_name}</p>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {feature.description}
                        </p>
                        <p className="text-xs text-muted-foreground mt-2 font-mono">
                          Klucz: {feature.feature_key}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-xs font-medium px-2 py-1 rounded ${
                          feature.is_enabled 
                            ? 'bg-primary/10 text-primary' 
                            : 'bg-muted text-muted-foreground'
                        }`}>
                          {feature.is_enabled ? 'Aktywna' : 'Wyłączona'}
                        </span>
                        <Switch
                          checked={feature.is_enabled}
                          onCheckedChange={(checked) => togglePremiumFeature(feature.id, checked)}
                        />
                      </div>
                    </div>
                  ))
                )}

                <div className="pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    <strong>Wyróżnione na stronie głównej:</strong> Gdy włączone, ogłoszenia z wykupioną opcją premium 
                    będą priorytetowo wyświetlane w sekcji "Proponowane oferty" na stronie głównej, 
                    posortowane według lokalizacji użytkownika.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>Ustawienia globalne</CardTitle>
                <CardDescription>Konfiguracja ogólna marketplace</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label>Domyślny czas trwania ogłoszenia (dni)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    value={defaultDuration}
                    onChange={(e) => setDefaultDuration(Number(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Liczba dni, po których ogłoszenie automatycznie wygasa
                  </p>
                </div>

                <div className="flex items-center justify-between border rounded-lg p-4">
                  <div>
                    <p className="font-medium">Auto-usuwanie wygasłych ogłoszeń</p>
                    <p className="text-sm text-muted-foreground">
                      Automatycznie usuń ogłoszenia po {autoDeleteDays} dniach od wygaśnięcia
                    </p>
                  </div>
                  <Switch
                    checked={autoDeleteEnabled}
                    onCheckedChange={setAutoDeleteEnabled}
                  />
                </div>

                {autoDeleteEnabled && (
                  <div className="space-y-2">
                    <Label>Dni do auto-usunięcia po wygaśnięciu</Label>
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      value={autoDeleteDays}
                      onChange={(e) => setAutoDeleteDays(Number(e.target.value))}
                    />
                  </div>
                )}

                <Button className="w-full" onClick={() => toast.success("Ustawienia zapisane")}>
                  <Save className="h-4 w-4 mr-2" />
                  Zapisz ustawienia
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </TabsPill>
      </div>
    </div>
  );
}

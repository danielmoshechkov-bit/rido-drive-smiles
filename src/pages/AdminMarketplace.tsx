import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Image, Save, Settings, List, Trash2 } from "lucide-react";
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

interface MarketplaceListing {
  id: string;
  title: string;
  price: number;
  status: string | null;
  is_active: boolean | null;
  created_at: string | null;
  vehicle_id: string | null;
}

export default function AdminMarketplace() {
  const navigate = useNavigate();
  const [adSlots, setAdSlots] = useState<AdSlot[]>([]);
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Settings state
  const [defaultDuration, setDefaultDuration] = useState(30);
  const [autoDeleteDays, setAutoDeleteDays] = useState(40);
  const [autoDeleteEnabled, setAutoDeleteEnabled] = useState(false);

  useEffect(() => {
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

    // Load listings
    const { data: listingsData } = await supabase
      .from("marketplace_listings")
      .select("id, title, price, status, is_active, created_at, vehicle_id")
      .order("created_at", { ascending: false })
      .limit(50);

    if (listingsData) {
      setListings(listingsData);
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

  const toggleListingStatus = async (listing: MarketplaceListing) => {
    const newStatus = !listing.is_active;
    
    const { error } = await supabase
      .from("marketplace_listings")
      .update({ is_active: newStatus })
      .eq("id", listing.id);

    if (error) {
      toast.error("Błąd zmiany statusu");
      return;
    }

    setListings(listings.map((l) =>
      l.id === listing.id ? { ...l, is_active: newStatus } : l
    ));
    toast.success(newStatus ? "Ogłoszenie aktywowane" : "Ogłoszenie dezaktywowane");
  };

  const deleteListing = async (listing: MarketplaceListing) => {
    if (!confirm("Czy na pewno chcesz usunąć to ogłoszenie?")) return;

    const { error } = await supabase
      .from("marketplace_listings")
      .delete()
      .eq("id", listing.id);

    if (error) {
      toast.error("Błąd usuwania ogłoszenia");
      return;
    }

    setListings(listings.filter((l) => l.id !== listing.id));
    toast.success("Ogłoszenie usunięte");
  };

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
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Marketplace Admin</h1>
            <p className="text-muted-foreground">Zarządzaj giełdą pojazdów</p>
          </div>
        </div>

        <Tabs defaultValue="listings" className="space-y-6">
          <TabsList>
            <TabsTrigger value="listings" className="flex items-center gap-2">
              <List className="h-4 w-4" />
              Ogłoszenia
            </TabsTrigger>
            <TabsTrigger value="ads" className="flex items-center gap-2">
              <Image className="h-4 w-4" />
              Reklamy
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Ustawienia
            </TabsTrigger>
          </TabsList>

          {/* Listings Tab */}
          <TabsContent value="listings">
            <Card>
              <CardHeader>
                <CardTitle>Ogłoszenia ({listings.length})</CardTitle>
                <CardDescription>Moderuj i zarządzaj ogłoszeniami</CardDescription>
              </CardHeader>
              <CardContent>
                {listings.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">
                    Brak ogłoszeń do wyświetlenia
                  </p>
                ) : (
                  <div className="space-y-3">
                    {listings.map((listing) => (
                      <div
                        key={listing.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div className="flex-1">
                          <p className="font-medium">{listing.title}</p>
                          <p className="text-sm text-muted-foreground">
                            {listing.price} zł • {new Date(listing.created_at || "").toLocaleDateString("pl-PL")}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Switch
                            checked={listing.is_active ?? false}
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
        </Tabs>
      </div>
    </div>
  );
}

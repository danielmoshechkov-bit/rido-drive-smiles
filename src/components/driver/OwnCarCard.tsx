import React, { useState, useEffect, useCallback } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronUp, Trash2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ExpiryBadges } from "@/components/ExpiryBadges";
import { VehicleDocuments } from "@/components/VehicleDocuments";
import { VehicleServiceTab } from "@/components/VehicleServiceTab";
import { VehicleInfoTab } from "@/components/VehicleInfoTab";
import { VehicleRentalHistory } from "./VehicleRentalHistory";
import { VehiclePhotosTab } from "./VehiclePhotosTab";
import { VehicleListingModal } from "@/components/fleet/VehicleListingModal";
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
interface OwnVehicle {
  id: string;
  brand: string;
  model: string;
  plate: string;
  year?: number;
  color?: string;
  vin?: string;
  odometer?: number;
  fuel_type?: string;
  photos?: string[];
  assigned_at: string;
  vehicle_inspections?: Array<{ valid_to: string; id?: string; date?: string; result?: string; notes?: string }>;
  vehicle_policies?: Array<{ valid_to: string; type: string; id?: string; policy_no?: string; provider?: string; valid_from?: string }>;
}

export const OwnCarCard = ({ vehicle: initialVehicle, onDeleted }: { vehicle: OwnVehicle; onDeleted?: () => void }) => {
  const { isMarketplaceEnabled } = useFeatureToggles();
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("info");
  const [isListed, setIsListed] = useState(false);
  const [listingModalOpen, setListingModalOpen] = useState(false);
  const [loadingListing, setLoadingListing] = useState(true);
  const [vehicle, setVehicle] = useState(initialVehicle);
  const [deleting, setDeleting] = useState(false);
  const [listingData, setListingData] = useState<{
    contact_phone?: string;
    contact_email?: string;
    weekly_price?: number;
  }>({});
  const [editPrice, setEditPrice] = useState("");
  const [savingPrice, setSavingPrice] = useState(false);

  const handleDeleteVehicle = async () => {
    setDeleting(true);
    try {
      // 1. Delete vehicle_listings
      await supabase
        .from("vehicle_listings")
        .delete()
        .eq("vehicle_id", vehicle.id);

      // 2. Delete driver_vehicle_assignments
      await supabase
        .from("driver_vehicle_assignments")
        .delete()
        .eq("vehicle_id", vehicle.id);

      // 3. Delete the vehicle itself
      const { error } = await supabase
        .from("vehicles")
        .delete()
        .eq("id", vehicle.id);

      if (error) throw error;

      toast.success("Auto zostało usunięte");
      onDeleted?.();
    } catch (error: any) {
      console.error("Error deleting vehicle:", error);
      toast.error("Błąd usuwania: " + (error.message || "Nieznany błąd"));
    } finally {
      setDeleting(false);
    }
  };

  // Check if vehicle is listed on marketplace and fetch listing data
  useEffect(() => {
    const checkListing = async () => {
      const { data } = await supabase
        .from("vehicle_listings")
        .select("id, is_available, contact_phone, contact_email, weekly_price")
        .eq("vehicle_id", vehicle.id)
        .maybeSingle();

      setIsListed(data?.is_available ?? false);
      if (data) {
        setListingData({
          contact_phone: data.contact_phone || undefined,
          contact_email: data.contact_email || undefined,
          weekly_price: data.weekly_price || undefined
        });
        setEditPrice(data.weekly_price?.toString() || "");
      }
      setLoadingListing(false);
    };

    checkListing();
  }, [vehicle.id]);

  // Refresh vehicle data from database
  const refreshVehicleData = useCallback(async () => {
    const { data, error } = await supabase
      .from("vehicles")
      .select("*")
      .eq("id", vehicle.id)
      .single();

    if (data && !error) {
      setVehicle(prev => ({
        ...prev,
        ...data
      }));
    }
  }, [vehicle.id]);

  const handleListingToggle = async (checked: boolean) => {
    if (checked) {
      // Open modal to set price and photos
      setListingModalOpen(true);
    } else {
      // Remove from marketplace
      const { error } = await supabase
        .from("vehicle_listings")
        .update({ is_available: false })
        .eq("vehicle_id", vehicle.id);

      if (error) {
        toast.error("Błąd usuwania z giełdy");
        console.error(error);
      } else {
        setIsListed(false);
        toast.success("Auto usunięte z giełdy");
      }
    }
  };

  const handleListingSuccess = () => {
    setIsListed(true);
  };

  const handleVehicleSave = async (vehicleId: string, updates: any) => {
    const { error } = await supabase
      .from("vehicles")
      .update(updates)
      .eq("id", vehicleId);

    if (error) {
      toast.error("Błąd zapisu");
    } else {
      toast.success("Zapisano");
      // Refresh vehicle data after successful save
      await refreshVehicleData();
    }
  };

  const handleListingSave = async (updates: { contact_phone?: string; contact_email?: string }) => {
    // Check if listing exists first
    const { data: existing } = await supabase
      .from("vehicle_listings")
      .select("id")
      .eq("vehicle_id", vehicle.id)
      .maybeSingle();

    let error;
    if (existing) {
      // Update existing listing
      const result = await supabase
        .from("vehicle_listings")
        .update(updates)
        .eq("vehicle_id", vehicle.id);
      error = result.error;
    } else {
      // Insert new listing with required fields
      const result = await supabase
        .from("vehicle_listings")
        .insert({
          vehicle_id: vehicle.id,
          created_by: (await supabase.auth.getUser()).data.user?.id || "",
          weekly_price: listingData.weekly_price || 0,
          is_available: false,
          ...updates
        });
      error = result.error;
    }

    if (error) {
      toast.error("Błąd zapisu danych kontaktowych");
      console.error(error);
    } else {
      setListingData(prev => ({ ...prev, ...updates }));
      toast.success("Zapisano dane kontaktowe");
    }
  };

  const handlePriceSave = async () => {
    const priceValue = Number(editPrice);
    if (!priceValue || priceValue <= 0) {
      toast.error("Podaj prawidłową cenę");
      return;
    }

    setSavingPrice(true);
    try {
      const oldPrice = listingData.weekly_price || 0;
      
      // Update price in listing
      const { error } = await supabase
        .from("vehicle_listings")
        .update({ weekly_price: priceValue })
        .eq("vehicle_id", vehicle.id);

      if (error) throw error;

      // Check if there are active rentals for this vehicle
      const { data: activeRentals } = await supabase
        .from("vehicle_rentals")
        .select("id, driver_id")
        .eq("vehicle_id", vehicle.id)
        .in("status", ["active", "pending"]);

      // If price changed and there are active rentals, create notifications
      if (oldPrice > 0 && oldPrice !== priceValue && activeRentals && activeRentals.length > 0) {
        const { data: { user } } = await supabase.auth.getUser();
        
        for (const rental of activeRentals) {
          // Create notification
          const { data: notification, error: notifError } = await supabase
            .from("price_change_notifications")
            .insert({
              vehicle_id: vehicle.id,
              driver_id: rental.driver_id,
              old_price: oldPrice,
              new_price: priceValue,
              changed_by: user?.id
            })
            .select()
            .single();

          if (!notifError && notification) {
            // Send email notification
            try {
              await supabase.functions.invoke("send-price-change-email", {
                body: {
                  driver_id: rental.driver_id,
                  vehicle_id: vehicle.id,
                  old_price: oldPrice,
                  new_price: priceValue,
                  notification_id: notification.id
                }
              });
            } catch (emailError) {
              console.error("Error sending price change email:", emailError);
            }
          }
        }
        toast.success("Cena zmieniona. Kierowcy zostali powiadomieni.");
      } else {
        toast.success("Cena zapisana");
      }

      setListingData(prev => ({ ...prev, weekly_price: priceValue }));
    } catch (error: any) {
      console.error("Error saving price:", error);
      toast.error("Błąd zapisu ceny");
    } finally {
      setSavingPrice(false);
    }
  };

  return (
    <>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="border rounded-xl bg-card shadow-sm">
          {/* Header row */}
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="grid grid-cols-3 gap-4 flex-1 items-center">
                {/* Column 1: Vehicle */}
                <div>
                  <span className="text-xs text-muted-foreground">Pojazd:</span>
                  <p className="font-medium">
                    {vehicle.brand} {vehicle.model}
                    {vehicle.year && <span className="text-muted-foreground ml-1">({vehicle.year})</span>}
                  </p>
                </div>

                {/* Column 2: Plate */}
                <div>
                  <span className="text-xs text-muted-foreground">Nr rej.:</span>
                  <p className="font-medium">{vehicle.plate}</p>
                </div>

                {/* Column 3: Documents */}
                <div onClick={(e) => e.stopPropagation()}>
                  <span className="text-xs text-muted-foreground">Dokumenty:</span>
                  <div className="mt-1">
                    <ExpiryBadges vehicleId={vehicle.id} />
                  </div>
                </div>
              </div>

              {/* Rental toggle (only if marketplace enabled), delete button and expand button */}
              <div className="flex items-center gap-3 ml-4" onClick={(e) => e.stopPropagation()}>
                {isMarketplaceEnabled && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Do wynajęcia</span>
                    <Switch
                      checked={isListed}
                      onCheckedChange={handleListingToggle}
                      disabled={loadingListing}
                    />
                  </div>
                )}
                
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      disabled={deleting}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Usunąć auto?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Ta akcja jest nieodwracalna. Auto {vehicle.brand} {vehicle.model} ({vehicle.plate}) zostanie trwale usunięte z systemu wraz z ogłoszeniem na giełdzie.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Anuluj</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDeleteVehicle}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {deleting ? "Usuwanie..." : "Usuń"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                
                <div className="text-muted-foreground" onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}>
                  {isOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                </div>
              </div>
            </div>
          </CollapsibleTrigger>

          {/* Expanded content */}
          <CollapsibleContent>
            <div className="border-t px-4 py-4">
              {/* Rental price section - only show if listed or has listing data */}
              {isMarketplaceEnabled && (isListed || listingData.weekly_price) && (
                <div className="mb-4 p-3 bg-muted/50 rounded-lg">
                  <Label className="text-sm font-medium">Stawka za wynajem (giełda)</Label>
                  <div className="flex items-center gap-2 mt-2">
                    <Input
                      type="number"
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                      placeholder="np. 500"
                      className="w-32"
                      min="1"
                    />
                    <span className="text-sm text-muted-foreground">zł/tydzień</span>
                    <Button
                      size="sm"
                      onClick={handlePriceSave}
                      disabled={savingPrice || !editPrice || Number(editPrice) === listingData.weekly_price}
                    >
                      {savingPrice ? (
                        "Zapisywanie..."
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-1" />
                          Zapisz
                        </>
                      )}
                    </Button>
                  </div>
                  {listingData.weekly_price && Number(editPrice) !== listingData.weekly_price && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Aktualna cena: {listingData.weekly_price} zł/tydzień
                    </p>
                  )}
                </div>
              )}

              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-5 mb-4">
                  <TabsTrigger value="info" className="text-xs">Info</TabsTrigger>
                  <TabsTrigger value="docs" className="text-xs">Dokumenty</TabsTrigger>
                  <TabsTrigger value="service" className="text-xs">Serwis</TabsTrigger>
                  <TabsTrigger value="history" className="text-xs">Historia</TabsTrigger>
                  <TabsTrigger value="photos" className="text-xs">Zdjęcia</TabsTrigger>
                </TabsList>

                <TabsContent value="info">
                  <VehicleInfoTab
                    vehicle={{
                      id: vehicle.id,
                      plate: vehicle.plate,
                      vin: vehicle.vin || "",
                      brand: vehicle.brand,
                      model: vehicle.model,
                      year: vehicle.year || 0,
                      color: vehicle.color || "",
                      fuel_type: vehicle.fuel_type || ""
                    }}
                    onSave={handleVehicleSave}
                  />
                </TabsContent>

                <TabsContent value="docs">
                  <VehicleDocuments vehicleId={vehicle.id} />
                </TabsContent>

                <TabsContent value="service">
                  <VehicleServiceTab vehicleId={vehicle.id} />
                </TabsContent>

                <TabsContent value="history">
                  <VehicleRentalHistory vehicleId={vehicle.id} />
                </TabsContent>

                <TabsContent value="photos">
                  <VehiclePhotosTab 
                    vehicleId={vehicle.id} 
                    photos={vehicle.photos}
                    onPhotosChange={(newPhotos) => setVehicle(prev => ({ ...prev, photos: newPhotos }))}
                  />
                </TabsContent>
              </Tabs>
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

      {/* Listing modal - pass null for fleetId since it's driver's own car */}
      <VehicleListingModal
        open={listingModalOpen}
        onOpenChange={setListingModalOpen}
        vehicle={{
          id: vehicle.id,
          brand: vehicle.brand,
          model: vehicle.model,
          plate: vehicle.plate,
          photos: vehicle.photos
        }}
        fleetId=""
        onSuccess={handleListingSuccess}
      />
    </>
  );
};

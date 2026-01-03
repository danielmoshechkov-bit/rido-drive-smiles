import React, { useState, useEffect } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ExpiryBadges } from "@/components/ExpiryBadges";
import { VehicleDocuments } from "@/components/VehicleDocuments";
import { VehicleServiceTab } from "@/components/VehicleServiceTab";
import { VehicleInfoTab } from "@/components/VehicleInfoTab";
import { VehicleRentalHistory } from "./VehicleRentalHistory";
import { VehicleListingModal } from "@/components/fleet/VehicleListingModal";

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

export const OwnCarCard = ({ vehicle }: { vehicle: OwnVehicle }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("info");
  const [isListed, setIsListed] = useState(false);
  const [listingModalOpen, setListingModalOpen] = useState(false);
  const [loadingListing, setLoadingListing] = useState(true);

  // Check if vehicle is listed on marketplace
  useEffect(() => {
    const checkListing = async () => {
      const { data } = await supabase
        .from("vehicle_listings")
        .select("id, is_available")
        .eq("vehicle_id", vehicle.id)
        .maybeSingle();

      setIsListed(data?.is_available ?? false);
      setLoadingListing(false);
    };

    checkListing();
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
                {/* Column 1: Plate */}
                <div>
                  <span className="text-xs text-muted-foreground">Nr rej.:</span>
                  <p className="font-mono font-medium">{vehicle.plate}</p>
                </div>

                {/* Column 2: Vehicle */}
                <div>
                  <span className="text-xs text-muted-foreground">Pojazd:</span>
                  <p className="font-medium">{vehicle.brand} {vehicle.model}</p>
                </div>

                {/* Column 3: Documents */}
                <div onClick={(e) => e.stopPropagation()}>
                  <span className="text-xs text-muted-foreground">Dokumenty:</span>
                  <div className="mt-1">
                    <ExpiryBadges vehicleId={vehicle.id} />
                  </div>
                </div>
              </div>

              {/* Rental toggle and expand button */}
              <div className="flex items-center gap-4 ml-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Do wynajęcia</span>
                  <Switch
                    checked={isListed}
                    onCheckedChange={handleListingToggle}
                    disabled={loadingListing}
                  />
                </div>
                <div className="text-muted-foreground" onClick={(e) => { e.stopPropagation(); setIsOpen(!isOpen); }}>
                  {isOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                </div>
              </div>
            </div>
          </CollapsibleTrigger>

          {/* Expanded content */}
          <CollapsibleContent>
            <div className="border-t px-4 py-4">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-4 mb-4">
                  <TabsTrigger value="info" className="text-xs">Info</TabsTrigger>
                  <TabsTrigger value="docs" className="text-xs">Dokumenty</TabsTrigger>
                  <TabsTrigger value="service" className="text-xs">Serwis</TabsTrigger>
                  <TabsTrigger value="history" className="text-xs">Historia wynajmu</TabsTrigger>
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
                      color: vehicle.color || ""
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

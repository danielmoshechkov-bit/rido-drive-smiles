import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UniversalSelector } from "./UniversalSelector";
import { AddPartnerFleetModal } from "./fleet/AddPartnerFleetModal";

export function DriverFleetBadgeSelector({ driverId, fleetId, onFleetChange, allowAdd = true, managingFleetId }:{
  driverId: string; 
  fleetId?: string|null;
  onFleetChange?: () => void;
  allowAdd?: boolean;
  managingFleetId?: string | null;
}) {
  const [fleets, setFleets] = useState<{id:string;name:string}[]>([]);
  const [partnerFleetId, setPartnerFleetId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const load = async () => {
    if (managingFleetId) {
      const { data: partnerships } = await supabase
        .from("driver_fleet_partnerships")
        .select("partner_fleet:fleets!driver_fleet_partnerships_partner_fleet_id_fkey(id, name)")
        .eq("managing_fleet_id", managingFleetId)
        .eq("is_active", true);

      const result: {id:string;name:string}[] = [];
      if (partnerships) {
        for (const p of partnerships) {
          const pf = p.partner_fleet as any;
          if (pf?.id && !result.find(r => r.id === pf.id)) {
            result.push({ id: pf.id, name: pf.name });
          }
        }
      }
      setFleets(result);

      const { data: driverPartnership } = await supabase
        .from("driver_fleet_partnerships")
        .select("partner_fleet_id")
        .eq("driver_id", driverId)
        .eq("managing_fleet_id", managingFleetId)
        .eq("is_active", true)
        .maybeSingle();

      setPartnerFleetId(driverPartnership?.partner_fleet_id || null);
    } else {
      const { data, error } = await supabase.from("fleets").select("id,name").order("name");
      if (!error && data) setFleets(data);
      setPartnerFleetId(fleetId || null);
    }
  };
  
  useEffect(() => { load(); }, [managingFleetId, driverId, fleetId]);

  const handleSelect = async (item: {id: string; name: string} | null) => {
    if (managingFleetId) {
      await supabase
        .from("driver_fleet_partnerships")
        .update({ is_active: false })
        .eq("driver_id", driverId)
        .eq("managing_fleet_id", managingFleetId)
        .eq("is_active", true);

      if (!item) {
        toast.success("Usunięto przypisanie do floty partnerskiej");
        setPartnerFleetId(null);
        onFleetChange?.();
        return;
      }

      const { error } = await supabase.from("driver_fleet_partnerships").insert({
        driver_id: driverId,
        partner_fleet_id: item.id,
        managing_fleet_id: managingFleetId,
        settled_by: 'managing',
        is_b2b: false,
        invoice_frequency: 'weekly',
      });

      if (error) return toast.error(error.message);
      toast.success(`Przypisano do floty: ${item.name}`);
      setPartnerFleetId(item.id);
      onFleetChange?.();
    } else {
      if (!item) {
        const { error } = await supabase.from("drivers").update({ fleet_id: null }).eq("id", driverId);
        if (error) return toast.error(error.message);
        toast.success("Usunięto flotę kierowcy");
        onFleetChange?.();
        return;
      }

      const { error } = await supabase.from("drivers").update({ fleet_id: item.id }).eq("id", driverId);
      if (error) return toast.error(error.message);
      toast.success("Zmieniono flotę kierowcy");
      onFleetChange?.();
    }
  };

  const currentValue = managingFleetId ? partnerFleetId : fleetId;
  const currentFleetName = fleets.find(f => f.id === currentValue)?.name || "Flota partnerska: brak";

  return (
    <>
      <UniversalSelector
        id={`driver-fleet-${driverId}`}
        items={fleets}
        currentValue={currentValue}
        placeholder={currentFleetName}
        searchPlaceholder="Szukaj floty..."
        addPlaceholder="Dodaj nową flotę"
        addButtonText="Dodaj"
        noResultsText="Brak flot"
        showSearch={true}
        showAdd={false}
        showAddNew={allowAdd && !!managingFleetId}
        allowClear={!!managingFleetId}
        onSelect={handleSelect}
        onAddNew={allowAdd && managingFleetId ? () => setShowAddModal(true) : undefined}
      />
      {allowAdd && managingFleetId && (
        <AddPartnerFleetModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          driverId={driverId}
          managingFleetId={managingFleetId}
          onAdded={() => { load(); onFleetChange?.(); }}
        />
      )}
    </>
  );
}

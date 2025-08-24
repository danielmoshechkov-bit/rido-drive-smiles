import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { UniversalSelector } from "./UniversalSelector";

const statusLabels = {
  kierowca: "Kierowca",
  partner: "Partner Flotowy", 
  pracownik: "Pracownik",
  admin: "Administrator"
};

export function DriverStatusBadge({ driverId, currentRole }:{
  driverId: string; 
  currentRole: "kierowca" | "partner" | "pracownik" | "admin";
}) {
  const changeRole = async (item: {id: string; name: string} | null) => {
    if (!item) return;
    
    const newRole = item.id as typeof currentRole;
    const { error } = await supabase
      .from("drivers")
      .update({ user_role: newRole })
      .eq("id", driverId);
    
    if (error) {
      toast.error(error.message);
      return;
    }
    
    toast.success(`Zmieniono status na: ${statusLabels[newRole]}`);
  };

  const statusItems = Object.entries(statusLabels).map(([key, label]) => ({
    id: key,
    name: label
  }));

  return (
    <UniversalSelector
      id={`driver-status-${driverId}`}
      items={statusItems}
      currentValue={currentRole}
      placeholder={statusLabels[currentRole]}
      noResultsText="Brak ról"
      showSearch={false}
      showAdd={false}
      allowClear={false}
      onSelect={changeRole}
    />
  );
}
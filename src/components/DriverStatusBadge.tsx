import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const statusLabels = {
  kierowca: "Kierowca",
  partner: "Partner Flotowy",
  pracownik: "Pracownik",
  admin: "Administrator"
};

const statusColors = {
  kierowca: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-100",
  partner: "bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-100",
  pracownik: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-100",
  admin: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-100"
};

export function DriverStatusBadge({ driverId, currentRole }:{
  driverId: string; 
  currentRole: "kierowca" | "partner" | "pracownik" | "admin";
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState(currentRole);

  const changeRole = async (newRole: typeof currentRole) => {
    const { error } = await supabase
      .from("drivers")
      .update({ user_role: newRole })
      .eq("id", driverId);
    
    if (error) {
      toast.error(error.message);
      return;
    }
    
    setRole(newRole);
    setOpen(false);
    toast.success(`Zmieniono status na: ${statusLabels[newRole]}`);
  };

  return (
    <div className="relative">
      <Badge 
        className={`cursor-pointer rounded-full ${statusColors[role]}`}
        onClick={() => setOpen(!open)}
      >
        {statusLabels[role]}
      </Badge>
      
      {open && (
        <div className="absolute z-10 mt-2 right-0 w-48 bg-background border rounded-xl shadow-lg p-2">
          {Object.entries(statusLabels).map(([key, label]) => (
            <div
              key={key}
              className={`px-3 py-2 rounded hover:bg-muted cursor-pointer transition-colors ${
                key === role ? 'bg-muted' : ''
              }`}
              onClick={() => changeRole(key as typeof currentRole)}
            >
              {label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
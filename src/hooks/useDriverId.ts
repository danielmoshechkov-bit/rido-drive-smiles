import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

// Helper do pobrania driverId (opcjonalnie do użycia w DriverDashboard)
export function useDriverId() {
  const [driverId, setDriverId] = useState<string>("");
  
  useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth?.user;
      if (!user) return;
      
      const { data } = await supabase
        .from("driver_app_users")
        .select("driver_id")
        .eq("user_id", user.id)
        .single();
        
      setDriverId(data?.driver_id || "");
    })();
  }, []);
  
  return driverId;
}
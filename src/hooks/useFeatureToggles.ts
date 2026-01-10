import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface FeatureToggles {
  marketplace_enabled: boolean;
  fleet_registration_enabled: boolean;
  marketplace_vehicles_enabled: boolean;
  marketplace_realestate_enabled: boolean;
  marketplace_services_enabled: boolean;
  driver_registration_enabled: boolean;
  account_switching_enabled: boolean;
  marketplace_email_confirmation_required: boolean;
  [key: string]: boolean;
}

export function useFeatureToggles() {
  const [features, setFeatures] = useState<FeatureToggles>({
    marketplace_enabled: false,
    fleet_registration_enabled: false,
    marketplace_vehicles_enabled: false,
    marketplace_realestate_enabled: false,
    marketplace_services_enabled: false,
    driver_registration_enabled: true,
    account_switching_enabled: false,
    marketplace_email_confirmation_required: false,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadFeatures = async () => {
      const { data, error } = await supabase
        .from("feature_toggles")
        .select("feature_key, is_enabled");

      if (error) {
        console.error("Error loading feature toggles:", error);
        setLoading(false);
        return;
      }

      const toggles: FeatureToggles = {
        marketplace_enabled: false,
        fleet_registration_enabled: false,
        marketplace_vehicles_enabled: false,
        marketplace_realestate_enabled: false,
        marketplace_services_enabled: false,
        driver_registration_enabled: true,
        account_switching_enabled: false,
        marketplace_email_confirmation_required: false,
      };

      data?.forEach((toggle) => {
        toggles[toggle.feature_key] = toggle.is_enabled;
      });

      setFeatures(toggles);
      setLoading(false);
    };

    loadFeatures();

    // Subscribe to realtime changes
    const channel = supabase
      .channel("feature_toggles_changes")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "feature_toggles" },
        (payload) => {
          const { feature_key, is_enabled } = payload.new as { feature_key: string; is_enabled: boolean };
          setFeatures((prev) => ({ ...prev, [feature_key]: is_enabled }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { features, loading, isMarketplaceEnabled: features.marketplace_enabled };
}

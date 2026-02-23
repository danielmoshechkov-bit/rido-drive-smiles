import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface AIFeatureFlags {
  [key: string]: boolean;
}

export function useAIFeatureFlags() {
  const [flags, setFlags] = useState<AIFeatureFlags>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("ai_feature_flags")
        .select("flag_key, is_enabled");

      if (data) {
        const map: AIFeatureFlags = {};
        data.forEach((f: any) => { map[f.flag_key] = f.is_enabled; });
        setFlags(map);
      }
      setLoading(false);
    };
    load();

    const channel = supabase
      .channel("ai_feature_flags_changes")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "ai_feature_flags" }, (payload) => {
        const { flag_key, is_enabled } = payload.new as { flag_key: string; is_enabled: boolean };
        setFlags(prev => ({ ...prev, [flag_key]: is_enabled }));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const isEnabled = (key: string) => flags[key] ?? false;

  return { flags, loading, isEnabled };
}

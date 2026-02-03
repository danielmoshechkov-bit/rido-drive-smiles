import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useAIAgentAccess() {
  return useQuery({
    queryKey: ["ai-agent-access"],
    queryFn: async () => {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!user) return { hasAccess: false, isGloballyEnabled: false };

      // Check global flag
      const { data: globalFlag } = await supabase
        .from("feature_toggles")
        .select("is_enabled")
        .eq("feature_key", "ai_call_enabled_global")
        .maybeSingle();

      const isGloballyEnabled = globalFlag?.is_enabled ?? false;

      // If globally disabled, no one has access (except maybe test mode)
      if (!isGloballyEnabled) {
        // Check test mode flag
        const { data: testModeFlag } = await supabase
          .from("feature_toggles")
          .select("is_enabled")
          .eq("feature_key", "ai_call_test_mode")
          .maybeSingle();

        if (!testModeFlag?.is_enabled) {
          return { hasAccess: false, isGloballyEnabled: false };
        }
      }

      // Check user whitelist
      const { data: userWhitelist } = await supabase
        .from("ai_call_user_whitelist")
        .select("id, status")
        .eq("email", user.email?.toLowerCase() ?? '')
        .eq("status", "active")
        .maybeSingle();

      if (userWhitelist) {
        return { hasAccess: true, isGloballyEnabled };
      }

      // Check if user is sales_admin (they always have access to admin panel)
      const { data: userRoles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      const isSalesAdmin = userRoles?.some(r => r.role === 'sales_admin');
      if (isSalesAdmin) {
        return { hasAccess: true, isGloballyEnabled, isAdmin: true };
      }

      // Check company whitelist via user's entities (NIP)
      const { data: entities } = await supabase
        .from("entities")
        .select("nip")
        .eq("owner_user_id", user.id);

      if (entities && entities.length > 0) {
        const nips = entities.map(e => e.nip?.replace(/\D/g, '')).filter(Boolean);
        
        if (nips.length > 0) {
          const { data: companyWhitelist } = await supabase
            .from("ai_call_company_whitelist")
            .select("id")
            .in("nip", nips as string[])
            .eq("status", "active")
            .limit(1);

          if (companyWhitelist && companyWhitelist.length > 0) {
            return { hasAccess: true, isGloballyEnabled };
          }
        }
      }

      return { hasAccess: false, isGloballyEnabled };
    },
  });
}

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useAIAgentAccess() {
  return useQuery({
    queryKey: ["ai-agent-access"],
    queryFn: async () => {
      const { data: authData } = await supabase.auth.getUser();
      const user = authData?.user;
      if (!user) return { hasAccess: false, isGloballyEnabled: false };

      // Hardcoded whitelist - types will update after migration sync
      const whitelistedEmails = [
        'anastasiia.shapovalova1991@gmail.com',
        'majewskitest@test.pl'
      ];

      const onWhitelist = whitelistedEmails.includes(user.email?.toLowerCase() || '');

      return { 
        hasAccess: onWhitelist, 
        isGloballyEnabled: false,
      };
    },
  });
}

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from './useUserRole';

interface ModuleVisibility {
  id: string;
  module_key: string;
  module_name: string;
  is_active: boolean;
  visible_to_roles: string[];
}

interface UseModuleVisibilityReturn {
  isVisible: boolean;
  isActive: boolean;
  loading: boolean;
  config: ModuleVisibility | null;
}

export const useModuleVisibility = (moduleKey: string): UseModuleVisibilityReturn => {
  const { role, roles, loading: roleLoading } = useUserRole();
  const [config, setConfig] = useState<ModuleVisibility | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchModuleVisibility = async () => {
      try {
        const { data, error } = await supabase
          .from('module_visibility')
          .select('*')
          .eq('module_key', moduleKey)
          .single();

        if (error) {
          console.error('Error fetching module visibility:', error);
          setConfig(null);
        } else {
          setConfig(data as ModuleVisibility);
        }
      } catch (err) {
        console.error('Error in useModuleVisibility:', err);
        setConfig(null);
      } finally {
        setLoading(false);
      }
    };

    fetchModuleVisibility();

    // Subscribe to changes
    const channel = supabase
      .channel('module_visibility_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'module_visibility',
          filter: `module_key=eq.${moduleKey}`,
        },
        (payload) => {
          if (payload.new) {
            setConfig(payload.new as ModuleVisibility);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [moduleKey]);

  // Determine visibility
  const isActive = config?.is_active ?? false;
  
  // Check if any of user's roles is in the visible_to_roles array
  const hasVisibleRole = roles.some((userRole) => 
    config?.visible_to_roles?.includes(userRole as string) ?? false
  );

  // User can see the module if:
  // 1. Module is active AND
  // 2. User has a role that's in the visible_to_roles list
  // Note: Admins always have access via AdminPortalSwitcher regardless of this
  const isVisible = !roleLoading && isActive && hasVisibleRole;

  return {
    isVisible,
    isActive,
    loading: loading || roleLoading,
    config,
  };
};

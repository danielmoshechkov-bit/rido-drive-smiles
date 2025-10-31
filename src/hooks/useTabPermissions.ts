import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole, UserRole } from './useUserRole';

interface TabPermissions {
  [tabId: string]: boolean;
}

export const useTabPermissions = () => {
  const { roles, isAdmin } = useUserRole();
  const [permissions, setPermissions] = useState<TabPermissions>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPermissions = async () => {
      // Admin has access to everything
      if (isAdmin) {
        setPermissions({
          'weekly-report': true,
          'settlements': true,
          'drivers-list': true,
          'fleet': true,
          'fleet.vehicles': true,
          'fleet.fleets': true,
          'documents': true,
          'documents.list': true,
          'fleet-accounts': true,
          'user-roles': true,
          'plans': true,
          'tab-visibility': true,
          'data-import': true,
          'settings': true,
          'reports': true,
        });
        setLoading(false);
        return;
      }

      // Fetch permissions for user's roles
      if (roles.length === 0) {
        setPermissions({});
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('tab_permissions')
          .select('tab_id, is_visible')
          .in('role', roles.filter(r => r) as ('admin' | 'driver' | 'fleet_rental' | 'fleet_settlement')[])
          .eq('is_visible', true);

        if (error) throw error;

        // Merge permissions from all roles (if user has multiple roles)
        const mergedPermissions: TabPermissions = {};
        data?.forEach(perm => {
          mergedPermissions[perm.tab_id] = perm.is_visible;
        });

        setPermissions(mergedPermissions);
      } catch (error) {
        console.error('Error fetching tab permissions:', error);
        setPermissions({});
      } finally {
        setLoading(false);
      }
    };

    fetchPermissions();
  }, [roles, isAdmin]);

  const canViewTab = (tabId: string): boolean => {
    return permissions[tabId] ?? false;
  };

  return {
    canViewTab,
    permissions,
    loading,
  };
};

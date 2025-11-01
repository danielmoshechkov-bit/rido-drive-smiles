import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DelegatedRolePermissions {
  tabs: {
    [tabId: string]: {
      enabled: boolean;
      subtabs?: { [subtabId: string]: boolean };
      canAdd?: boolean;
      canEdit?: boolean;
      canDelete?: boolean;
      canAssignDriver?: boolean;
      canAddVehicle?: boolean;
      canEditVehicle?: boolean;
      canDeleteVehicle?: boolean;
    };
  };
}

export interface DelegatedRole {
  id: string;
  fleet_id: string;
  role_name: string;
  permissions: DelegatedRolePermissions;
  assigned_to_driver_id: string;
  created_at: string;
}

export const useDelegatedRole = () => {
  const [delegatedRole, setDelegatedRole] = useState<DelegatedRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDelegatedRole();
  }, []);

  const fetchDelegatedRole = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('fleet_delegated_roles')
        .select('*')
        .eq('assigned_to_user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setDelegatedRole({
          ...data,
          permissions: data.permissions as unknown as DelegatedRolePermissions,
        });
      }
    } catch (error) {
      console.error('Error fetching delegated role:', error);
    } finally {
      setLoading(false);
    }
  };

  return {
    delegatedRole,
    loading,
    refetch: fetchDelegatedRole,
    isDelegatedFleetManager: !!delegatedRole,
  };
};

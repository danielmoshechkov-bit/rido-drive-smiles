import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DelegatedRolePermissions } from './useDelegatedRole';

export type UserRole = 'admin' | 'fleet_settlement' | 'fleet_rental' | 'driver' | null;

interface UseUserRoleReturn {
  role: UserRole;
  roles: UserRole[];
  fleetId: string | null;
  loading: boolean;
  isAdmin: boolean;
  isFleetSettlement: boolean;
  isFleetRental: boolean;
  isDriver: boolean;
  refetch: () => Promise<void>;
  delegatedRole?: {
    fleet_id: string;
    role_name: string;
    permissions: DelegatedRolePermissions;
  } | null;
  isDelegatedFleetManager: boolean;
}

export const useUserRole = (): UseUserRoleReturn => {
  const [role, setRole] = useState<UserRole>(null);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [fleetId, setFleetId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [delegatedRole, setDelegatedRole] = useState<{
    fleet_id: string;
    role_name: string;
    permissions: DelegatedRolePermissions;
  } | null>(null);

  const fetchUserRole = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('user_roles')
        .select('role, fleet_id')
        .eq('user_id', user.id);

      if (error || !data || data.length === 0) {
        setLoading(false);
        return;
      }

      const userRoles = data.map(r => r.role as UserRole);
      setRoles(userRoles);

      // Priority: admin > fleet_settlement > fleet_rental > driver
      if (userRoles.includes('admin')) {
        setRole('admin');
        setFleetId(null);
      } else if (userRoles.includes('fleet_settlement')) {
        setRole('fleet_settlement');
        const fleetRole = data.find(r => r.role === 'fleet_settlement');
        setFleetId(fleetRole?.fleet_id || null);
      } else if (userRoles.includes('fleet_rental')) {
        setRole('fleet_rental');
        const fleetRole = data.find(r => r.role === 'fleet_rental');
        setFleetId(fleetRole?.fleet_id || null);
      } else {
        setRole('driver');
        setFleetId(null);
      }

      // Check for delegated fleet role
      const { data: delegatedData } = await supabase
        .from('fleet_delegated_roles')
        .select('fleet_id, role_name, permissions')
        .eq('assigned_to_user_id', user.id)
        .maybeSingle();

      if (delegatedData) {
        setDelegatedRole({
          fleet_id: delegatedData.fleet_id,
          role_name: delegatedData.role_name,
          permissions: delegatedData.permissions as unknown as DelegatedRolePermissions,
        });
      }
    } catch (error) {
      console.error('Error fetching user role:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserRole();
  }, []);

  return {
    role,
    roles,
    fleetId,
    loading,
    isAdmin: role === 'admin',
    isFleetSettlement: roles.includes('fleet_settlement'),
    isFleetRental: roles.includes('fleet_rental'),
    isDriver: role === 'driver',
    refetch: fetchUserRole,
    delegatedRole,
    isDelegatedFleetManager: !!delegatedRole,
  };
};

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { DelegatedRolePermissions } from './useDelegatedRole';

export type UserRole = 'admin' | 'platform_admin' | 'fleet_settlement' | 'fleet_rental' | 'driver' | 'real_estate_agent' | 'real_estate_admin' | 'marketplace_user' | 'accounting_admin' | 'accountant' | 'sales_admin' | 'sales_rep' | 'service_provider' | null;

interface UseUserRoleReturn {
  role: UserRole;
  roles: UserRole[];
  /**
   * Rola właściciela platformy — bramkuje sekcję billingową. Celowo osobna od
   * `isAdmin`: administrator obsługuje klientów, `platform_admin` ustala cennik
   * i konfigurację operatorów płatności. Tabele billing_* i tak sprawdzają ją
   * po stronie bazy (RLS), tutaj decydujemy tylko o widoczności zakładek.
   */
  isPlatformAdmin: boolean;
  fleetId: string | null;
  loading: boolean;
  isAdmin: boolean;
  isFleetSettlement: boolean;
  isFleetRental: boolean;
  isDriver: boolean;
  isRealEstateAgent: boolean;
  isRealEstateAdmin: boolean;
  isAccountant: boolean;
  isAccountingAdmin: boolean;
  isSalesAdmin: boolean;
  isSalesRep: boolean;
  refetch: () => Promise<void>;
  delegatedRole?: {
    fleet_id: string;
    role_name: string;
    permissions: DelegatedRolePermissions;
  } | null;
  isDelegatedFleetManager: boolean;
}

/**
 * Wspolna pamiec rol.
 *
 * Ten hook montuje sie w kilkunastu miejscach naraz (naglowek, kafelki, gating
 * modulow), a kazde montowanie robilo wlasne zapytanie o `user_roles` — przy
 * wejsciu w panel widac to bylo jako te same zapytania powtorzone kilka razy.
 * Trzymamy wiec jedna odpowiedz przez chwile i sklejamy rownolegle wywolania;
 * zmiana sesji czysci pamiec (patrz nasluch nizej).
 */
const ROLE_TTL_MS = 15_000;
type RoleRow = { role: string; fleet_id: string | null };
let roleCache: { userId: string; dane: RoleRow[]; czas: number } | null = null;
let roleWLocie: { userId: string; promise: Promise<RoleRow[]> } | null = null;

const pobierzRole = async (userId: string): Promise<RoleRow[]> => {
  if (roleCache && roleCache.userId === userId && Date.now() - roleCache.czas < ROLE_TTL_MS) {
    return roleCache.dane;
  }
  if (roleWLocie && roleWLocie.userId === userId) return roleWLocie.promise;

  const promise = (supabase as any)
    .from('user_roles')
    .select('role, fleet_id')
    .eq('user_id', userId)
    .then(({ data, error }: any) => {
      roleWLocie = null;
      if (error) throw error;
      const dane = (data || []) as RoleRow[];
      roleCache = { userId, dane, czas: Date.now() };
      return dane;
    })
    .catch((e: any) => { roleWLocie = null; throw e; });

  roleWLocie = { userId, promise };
  return promise;
};

supabase.auth.onAuthStateChange(() => { roleCache = null; roleWLocie = null; });

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

  const fetchUserRole = async (userId?: string) => {
    try {
      let currentUserId = userId;
      
      if (!currentUserId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setRole(null);
          setRoles([]);
          setFleetId(null);
          setDelegatedRole(null);
          setLoading(false);
          return;
        }
        currentUserId = user.id;
      }

      let data: RoleRow[] | null = null;
      let error: unknown = null;
      try {
        data = await pobierzRole(currentUserId);
      } catch (e) {
        error = e;
      }

      if (error || !data || data.length === 0) {
        setRole(null);
        setRoles([]);
        setFleetId(null);
        setLoading(false);
        return;
      }

      const userRoles = data.map(r => r.role as UserRole);
      setRoles(userRoles);

      // Priority: admin > real_estate_admin > real_estate_agent > fleet_settlement > fleet_rental > marketplace_user > driver
      if (userRoles.includes('admin')) {
        setRole('admin');
        setFleetId(null);
      } else if (userRoles.includes('real_estate_admin' as UserRole)) {
        setRole('real_estate_admin');
        setFleetId(null);
      } else if (userRoles.includes('real_estate_agent' as UserRole)) {
        setRole('real_estate_agent');
        setFleetId(null);
      } else if (userRoles.includes('fleet_settlement')) {
        setRole('fleet_settlement');
        const fleetRole = data.find(r => r.role === 'fleet_settlement');
        setFleetId(fleetRole?.fleet_id || null);
      } else if (userRoles.includes('fleet_rental')) {
        setRole('fleet_rental');
        const fleetRole = data.find(r => r.role === 'fleet_rental');
        setFleetId(fleetRole?.fleet_id || null);
      } else if (userRoles.includes('marketplace_user' as UserRole)) {
        setRole('marketplace_user');
        setFleetId(null);
      } else if (userRoles.includes('driver')) {
        setRole('driver');
        setFleetId(null);
      } else {
        // Fallback - set the first role found
        setRole(userRoles[0] || null);
        setFleetId(null);
      }

      // Check for delegated fleet role
      const { data: delegatedData } = await supabase
        .from('fleet_delegated_roles')
        .select('fleet_id, role_name, permissions')
        .eq('assigned_to_user_id', currentUserId)
        .maybeSingle();

      if (delegatedData) {
        setDelegatedRole({
          fleet_id: delegatedData.fleet_id,
          role_name: delegatedData.role_name,
          permissions: delegatedData.permissions as unknown as DelegatedRolePermissions,
        });
      } else {
        setDelegatedRole(null);
      }
    } catch (error) {
      console.error('Error fetching user role:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT') {
          setRole(null);
          setRoles([]);
          setFleetId(null);
          setDelegatedRole(null);
          setLoading(false);
        } else if (session?.user) {
          // Use setTimeout to avoid Supabase deadlock
          setTimeout(() => {
            fetchUserRole(session.user.id);
          }, 0);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        fetchUserRole(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return {
    role,
    roles,
    fleetId,
    loading,
    isAdmin: role === 'admin',
    // Świadomie po `roles`, nie po `role`: konto właściciela ma zwykle też rolę
    // `admin`, która wygrywa w priorytecie wyboru pojedynczej roli wyżej.
    isPlatformAdmin: roles.includes('platform_admin' as UserRole),
    isFleetSettlement: roles.includes('fleet_settlement'),
    isFleetRental: roles.includes('fleet_rental'),
    isDriver: role === 'driver' || roles.includes('driver'),
  isRealEstateAgent: role === 'real_estate_agent' || roles.includes('real_estate_agent' as UserRole),
  isRealEstateAdmin: role === 'admin' || roles.includes('real_estate_admin' as UserRole),
  isAccountant: role === 'accountant' || roles.includes('accountant' as UserRole),
  isAccountingAdmin: role === 'accounting_admin' || roles.includes('accounting_admin' as UserRole),
  isSalesAdmin: role === 'sales_admin' || roles.includes('sales_admin' as UserRole),
  isSalesRep: role === 'sales_rep' || roles.includes('sales_rep' as UserRole),
  refetch: fetchUserRole,
  delegatedRole,
  isDelegatedFleetManager: !!delegatedRole,
};
};

import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { UnifiedDashboard } from '@/components/UnifiedDashboard';
import { useState } from 'react';

export default function FleetDashboard() {
  const navigate = useNavigate();
  const { role, roles, fleetId, loading: roleLoading, delegatedRole } = useUserRole();
  const [fleetName, setFleetName] = useState('');
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');

  // Check permissions based on roles
  const canAccessFleet = roles.includes('admin') || roles.includes('fleet_rental') || roles.includes('fleet_settlement') || !!delegatedRole;

  useEffect(() => {
    if (!roleLoading && !canAccessFleet) {
      navigate('/auth');
    }
  }, [role, roleLoading, navigate, canAccessFleet]);

  useEffect(() => {
    // Reset state when user/fleet changes to avoid stale data
    setUserName('');
    setFleetName('');
    setUserEmail('');
    
    if (fleetId || delegatedRole?.fleet_id) {
      fetchFleetName();
      fetchUserName();
    }
  }, [fleetId, delegatedRole]);

  const fetchFleetName = async () => {
    const targetFleetId = fleetId || delegatedRole?.fleet_id;
    if (!targetFleetId) return;

    const { data, error } = await supabase
      .from('fleets')
      .select('name')
      .eq('id', targetFleetId)
      .single();

    if (!error && data) {
      setFleetName(data.name);
    }
  };

  const fetchUserName = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Try to get name from driver_app_users -> drivers first
    const { data: driverAppUser } = await supabase
      .from('driver_app_users')
      .select('driver_id, drivers(first_name, last_name)')
      .eq('user_id', user.id)
      .maybeSingle();

    if (driverAppUser?.drivers) {
      const driver = driverAppUser.drivers as { first_name: string | null; last_name: string | null };
      const name = `${driver.first_name || ''} ${driver.last_name || ''}`.trim();
      setUserName(delegatedRole ? `${name} - ${delegatedRole.role_name}` : name);
    } else {
      // Fallback to user metadata
      const firstName = user.user_metadata?.first_name || '';
      const lastName = user.user_metadata?.last_name || '';
      const name = `${firstName} ${lastName}`.trim();
      setUserName(delegatedRole ? `${name} - ${delegatedRole.role_name}` : name);
    }
    
    setUserEmail(user.email || '');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  if (roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Ładowanie...</p>
        </div>
      </div>
    );
  }

  if (!fleetId && !delegatedRole?.fleet_id) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Nie znaleziono przypisanej floty.</p>
        </div>
      </div>
    );
  }

  return (
    <UnifiedDashboard
      userType="fleet"
      fleetId={fleetId || delegatedRole?.fleet_id || null}
      fleetName={fleetName}
      userName={userName}
      userEmail={userEmail}
      onLogout={handleLogout}
    />
  );
}

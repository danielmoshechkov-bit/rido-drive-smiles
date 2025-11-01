import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { UnifiedDashboard } from '@/components/UnifiedDashboard';
import { useState } from 'react';

export default function FleetDashboard() {
  const navigate = useNavigate();
  const { role, roles, fleetId, loading: roleLoading } = useUserRole();
  const [fleetName, setFleetName] = useState('');
  const [userName, setUserName] = useState('');

  // Check permissions based on roles
  const canAccessFleet = roles.includes('admin') || roles.includes('fleet_rental') || roles.includes('fleet_settlement');

  useEffect(() => {
    if (!roleLoading && !canAccessFleet) {
      navigate('/auth');
    }
  }, [role, roleLoading, navigate, canAccessFleet]);

  useEffect(() => {
    if (fleetId) {
      fetchFleetName();
      fetchUserName();
    }
  }, [fleetId]);

  const fetchFleetName = async () => {
    const { data, error } = await supabase
      .from('fleets')
      .select('name')
      .eq('id', fleetId)
      .single();

    if (!error && data) {
      setFleetName(data.name);
    }
  };

  const fetchUserName = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const firstName = user.user_metadata?.first_name || '';
      const lastName = user.user_metadata?.last_name || '';
      setUserName(`${firstName} ${lastName}`.trim());
    }
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

  if (!fleetId || !fleetName) {
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
      fleetId={fleetId}
      fleetName={fleetName}
      userName={userName}
      onLogout={handleLogout}
    />
  );
}

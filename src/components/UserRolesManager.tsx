import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type AppRole = 'admin' | 'fleet_settlement' | 'fleet_rental' | 'driver' | 'marketplace_user';

interface UserRole {
  user_id: string;
  role: AppRole;
  fleet_id: string | null;
}

interface Fleet {
  id: string;
  name: string;
}

interface AuthUser {
  id: string;
  email: string;
  roles: UserRole[];
}

export function UserRolesManager() {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingUser, setSavingUser] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch all auth users
      const { data: authData, error: authError } = await supabase.auth.admin.listUsers();
      
      if (authError) throw authError;

      // Fetch all user roles
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('*');

      if (rolesError) throw rolesError;

      // Fetch all fleets
      const { data: fleetsData, error: fleetsError } = await supabase
        .from('fleets')
        .select('id, name');

      if (fleetsError) throw fleetsError;

      setFleets(fleetsData || []);

      // Combine users with their roles
      const usersWithRoles = authData.users.map(user => ({
        id: user.id,
        email: user.email || '',
        roles: rolesData?.filter(r => r.user_id === user.id) || []
      }));

      setUsers(usersWithRoles);
    } catch (error: any) {
      console.error('Error fetching data:', error);
      toast.error('Błąd ładowania danych: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const hasRole = (userId: string, role: AppRole): boolean => {
    const user = users.find(u => u.id === userId);
    return user?.roles.some(r => r.role === role) || false;
  };

  const getFleetIdForRole = (userId: string, role: AppRole): string | null => {
    const user = users.find(u => u.id === userId);
    const userRole = user?.roles.find(r => r.role === role);
    return userRole?.fleet_id || null;
  };

  const toggleRole = async (userId: string, role: AppRole, fleetId: string | null = null) => {
    setSavingUser(userId);
    try {
      if (hasRole(userId, role)) {
        // Remove role
        const { error } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', userId)
          .eq('role', role);

        if (error) throw error;
        toast.success(`Usunięto rolę ${role}`);
      } else {
        // Add role
        const { error } = await supabase
          .from('user_roles')
          .insert({
            user_id: userId,
            role: role,
            fleet_id: fleetId
          });

        if (error) throw error;
        toast.success(`Dodano rolę ${role}`);
      }

      await fetchData();
    } catch (error: any) {
      console.error('Error toggling role:', error);
      toast.error('Błąd zmiany roli: ' + error.message);
    } finally {
      setSavingUser(null);
    }
  };

  const updateFleetForRole = async (userId: string, role: AppRole, fleetId: string) => {
    setSavingUser(userId);
    try {
      const { error } = await supabase
        .from('user_roles')
        .update({ fleet_id: fleetId })
        .eq('user_id', userId)
        .eq('role', role);

      if (error) throw error;
      toast.success('Zaktualizowano flotę');
      await fetchData();
    } catch (error: any) {
      console.error('Error updating fleet:', error);
      toast.error('Błąd aktualizacji floty: ' + error.message);
    } finally {
      setSavingUser(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Zarządzanie rolami użytkowników
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Zaznacz checkboxy aby przypisać role użytkownikom. Role określają dostęp do funkcji systemu.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {users.map(user => (
          <div key={user.id} className="border rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{user.email}</p>
                <p className="text-xs text-muted-foreground">ID: {user.id}</p>
              </div>
              {savingUser === user.id && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Admin Role */}
              <div className="flex items-start space-x-2">
                <Checkbox
                  id={`${user.id}-admin`}
                  checked={hasRole(user.id, 'admin')}
                  onCheckedChange={() => toggleRole(user.id, 'admin')}
                  disabled={savingUser === user.id}
                />
                <div className="space-y-1">
                  <Label htmlFor={`${user.id}-admin`} className="cursor-pointer">
                    <Badge variant="destructive" className="ml-1">Administrator</Badge>
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Pełny dostęp do wszystkich funkcji systemu
                  </p>
                </div>
              </div>

              {/* Fleet Settlement Role */}
              <div className="space-y-2">
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id={`${user.id}-fleet_settlement`}
                    checked={hasRole(user.id, 'fleet_settlement')}
                    onCheckedChange={() => toggleRole(user.id, 'fleet_settlement', fleets[0]?.id || null)}
                    disabled={savingUser === user.id}
                  />
                  <div className="space-y-1 flex-1">
                    <Label htmlFor={`${user.id}-fleet_settlement`} className="cursor-pointer">
                      <Badge variant="default" className="ml-1">Rozliczenia flotowe</Badge>
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Dostęp do rozliczeń kierowców swojej floty
                    </p>
                  </div>
                </div>
                {hasRole(user.id, 'fleet_settlement') && (
                  <Select
                    value={getFleetIdForRole(user.id, 'fleet_settlement') || ''}
                    onValueChange={(value) => updateFleetForRole(user.id, 'fleet_settlement', value)}
                  >
                    <SelectTrigger className="ml-6">
                      <SelectValue placeholder="Wybierz flotę" />
                    </SelectTrigger>
                    <SelectContent>
                      {fleets.map(fleet => (
                        <SelectItem key={fleet.id} value={fleet.id}>
                          {fleet.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Fleet Rental Role */}
              <div className="space-y-2">
                <div className="flex items-start space-x-2">
                  <Checkbox
                    id={`${user.id}-fleet_rental`}
                    checked={hasRole(user.id, 'fleet_rental')}
                    onCheckedChange={() => toggleRole(user.id, 'fleet_rental', fleets[0]?.id || null)}
                    disabled={savingUser === user.id}
                  />
                  <div className="space-y-1 flex-1">
                    <Label htmlFor={`${user.id}-fleet_rental`} className="cursor-pointer">
                      <Badge variant="secondary" className="ml-1">Wynajem flotowy</Badge>
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Zarządzanie pojazdami i przypisywanie kierowców
                    </p>
                  </div>
                </div>
                {hasRole(user.id, 'fleet_rental') && (
                  <Select
                    value={getFleetIdForRole(user.id, 'fleet_rental') || ''}
                    onValueChange={(value) => updateFleetForRole(user.id, 'fleet_rental', value)}
                  >
                    <SelectTrigger className="ml-6">
                      <SelectValue placeholder="Wybierz flotę" />
                    </SelectTrigger>
                    <SelectContent>
                      {fleets.map(fleet => (
                        <SelectItem key={fleet.id} value={fleet.id}>
                          {fleet.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Driver Role */}
              <div className="flex items-start space-x-2">
                <Checkbox
                  id={`${user.id}-driver`}
                  checked={hasRole(user.id, 'driver')}
                  onCheckedChange={() => toggleRole(user.id, 'driver')}
                  disabled={savingUser === user.id}
                />
                <div className="space-y-1">
                  <Label htmlFor={`${user.id}-driver`} className="cursor-pointer">
                    <Badge variant="outline" className="ml-1">Kierowca</Badge>
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Dostęp do panelu kierowcy
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}

        {users.length === 0 && (
          <p className="text-center text-muted-foreground py-8">
            Brak użytkowników w systemie
          </p>
        )}
      </CardContent>
    </Card>
  );
}

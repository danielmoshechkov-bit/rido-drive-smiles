import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Users, Plus, UserPlus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

type AppRole = 'admin' | 'fleet_settlement' | 'fleet_rental' | 'driver' | 'marketplace_user' | 'real_estate_admin' | 'real_estate_agent' | 'accounting_admin' | 'accountant';

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

const AVAILABLE_ROLES: { value: AppRole; label: string; description: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }[] = [
  { value: 'admin', label: 'Administrator', description: 'Pełny dostęp do systemu', variant: 'destructive' },
  { value: 'fleet_settlement', label: 'Rozliczenia flotowe', description: 'Dostęp do rozliczeń kierowców', variant: 'default' },
  { value: 'fleet_rental', label: 'Wynajem flotowy', description: 'Zarządzanie pojazdami', variant: 'secondary' },
  { value: 'driver', label: 'Kierowca', description: 'Panel kierowcy', variant: 'outline' },
  { value: 'accounting_admin', label: 'Admin Księgowy', description: 'Panel księgowy i faktury', variant: 'default' },
  { value: 'accountant', label: 'Księgowy', description: 'Pracownik biura księgowego', variant: 'secondary' },
];

export function UserRolesManager() {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingUser, setSavingUser] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRoles, setNewUserRoles] = useState<AppRole[]>([]);
  const [newUserFleetId, setNewUserFleetId] = useState<string>('');
  const [creatingUser, setCreatingUser] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data: result, error: usersError } = await supabase.functions.invoke('admin-list-users', {
        body: {},
      });
      if (usersError) throw usersError;
      
      if (!result.success) {
        throw new Error(result.error || 'Błąd pobierania użytkowników');
      }

      setUsers(result.users || []);

      // Fetch all fleets
      const { data: fleetsData, error: fleetsError } = await supabase
        .from('fleets')
        .select('id, name');

      if (fleetsError) throw fleetsError;
      setFleets(fleetsData || []);

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
    if (role === 'admin') {
      toast.error('Zmiana roli administratora wymaga osobnego procesu z reautoryzacją');
      return;
    }
    setSavingUser(userId);
    try {
      const enabled = !hasRole(userId, role);
      const { error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'set-role', user_id: userId, role, enabled, fleet_id: fleetId },
      });
      if (error) throw error;
      toast.success(`${enabled ? 'Dodano' : 'Usunięto'} rolę ${role}`);

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
      const { error } = await supabase.functions.invoke('admin-users', {
        body: { action: 'set-role', user_id: userId, role, enabled: true, fleet_id: fleetId },
      });

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

  const handleCreateUser = async () => {
    if (!newUserEmail || !newUserPassword) {
      toast.error('Email i hasło są wymagane');
      return;
    }

    const strongPassword = newUserPassword.length >= 12 && newUserPassword.length <= 128 &&
      /[a-z]/.test(newUserPassword) && /[A-Z]/.test(newUserPassword) &&
      /\d/.test(newUserPassword) && /[^A-Za-z0-9]/.test(newUserPassword);
    if (!strongPassword) {
      toast.error('Hasło musi mieć 12–128 znaków, małą i wielką literę, cyfrę oraz znak specjalny');
      return;
    }

    setCreatingUser(true);
    try {
      const { data: result, error: createError } = await supabase.functions.invoke('admin-create-user', {
        body: {
          email: newUserEmail,
          password: newUserPassword,
          roles: newUserRoles,
          fleet_id: newUserFleetId || null,
        },
      });
      if (createError) throw createError;

      if (!result.success) {
        throw new Error(result.error || 'Błąd tworzenia użytkownika');
      }

      toast.success(`Utworzono użytkownika ${newUserEmail}`);
      setCreateDialogOpen(false);
      setNewUserEmail('');
      setNewUserPassword('');
      setNewUserRoles([]);
      setNewUserFleetId('');
      await fetchData();
    } catch (error: any) {
      console.error('Error creating user:', error);
      toast.error('Błąd: ' + error.message);
    } finally {
      setCreatingUser(false);
    }
  };

  const toggleNewUserRole = (role: AppRole) => {
    if (role === 'admin') {
      toast.error('Nadanie roli administratora wymaga osobnego procesu z reautoryzacją');
      return;
    }
    setNewUserRoles(prev => 
      prev.includes(role) 
        ? prev.filter(r => r !== role)
        : [...prev, role]
    );
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
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Zarządzanie rolami użytkowników
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Zaznacz checkboxy aby przypisać role użytkownikom. Role określają dostęp do funkcji systemu.
            </p>
          </div>
          
          <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <UserPlus className="h-4 w-4" />
                Dodaj użytkownika
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Utwórz nowego użytkownika</DialogTitle>
                <DialogDescription>
                  Podaj email, hasło i wybierz role dla nowego użytkownika.
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="uzytkownik@example.com"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="password">Hasło</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Minimum 12 znaków, litery, cyfra i znak specjalny"
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Role (opcjonalnie)</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {AVAILABLE_ROLES.map(role => (
                      <div key={role.value} className="flex items-center space-x-2">
                        <Checkbox
                          id={`new-${role.value}`}
                          checked={newUserRoles.includes(role.value)}
                          onCheckedChange={() => toggleNewUserRole(role.value)}
                          disabled={role.value === 'admin'}
                        />
                        <Label htmlFor={`new-${role.value}`} className="text-sm cursor-pointer">
                          {role.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
                
                {(newUserRoles.includes('fleet_settlement') || newUserRoles.includes('fleet_rental') || newUserRoles.includes('driver')) && (
                  <div className="space-y-2">
                    <Label>Flota</Label>
                    <Select value={newUserFleetId} onValueChange={setNewUserFleetId}>
                      <SelectTrigger>
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
                  </div>
                )}
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                  Anuluj
                </Button>
                <Button onClick={handleCreateUser} disabled={creatingUser}>
                  {creatingUser ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Tworzę...
                    </>
                  ) : (
                    'Utwórz użytkownika'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
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
                  disabled
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
                  disabled
                />
                <div className="space-y-1">
                  <Label htmlFor={`${user.id}-driver`} className="cursor-pointer">
                    <Badge variant="outline" className="ml-1">Kierowca</Badge>
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Dostęp do panelu kierowcy (zmiana wyłącznie przez zweryfikowany invite/unlink)
                  </p>
                </div>
              </div>

              {/* Accounting Admin Role */}
              <div className="flex items-start space-x-2">
                <Checkbox
                  id={`${user.id}-accounting_admin`}
                  checked={hasRole(user.id, 'accounting_admin')}
                  onCheckedChange={() => toggleRole(user.id, 'accounting_admin')}
                  disabled={savingUser === user.id}
                />
                <div className="space-y-1">
                  <Label htmlFor={`${user.id}-accounting_admin`} className="cursor-pointer">
                    <Badge className="ml-1 bg-emerald-600">Admin Księgowy</Badge>
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Pełny dostęp do panelu księgowego
                  </p>
                </div>
              </div>

              {/* Accountant Role */}
              <div className="flex items-start space-x-2">
                <Checkbox
                  id={`${user.id}-accountant`}
                  checked={hasRole(user.id, 'accountant')}
                  onCheckedChange={() => toggleRole(user.id, 'accountant')}
                  disabled={savingUser === user.id}
                />
                <div className="space-y-1">
                  <Label htmlFor={`${user.id}-accountant`} className="cursor-pointer">
                    <Badge variant="secondary" className="ml-1">Księgowy</Badge>
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Pracownik biura księgowego
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}

        {users.length === 0 && (
          <div className="text-center py-8">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              Brak użytkowników w systemie
            </p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => setCreateDialogOpen(true)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Dodaj pierwszego użytkownika
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useTabPermissions } from '@/hooks/useTabPermissions';

interface Driver {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

interface FleetRoleDelegationModalProps {
  open: boolean;
  onClose: () => void;
  fleetId: string;
  onSuccess?: () => void;
  editRole?: {
    id: string;
    driver_id: string;
    role_name: string;
    permissions: any;
  } | null;
}

export const FleetRoleDelegationModal = ({ 
  open, 
  onClose, 
  fleetId,
  onSuccess,
  editRole 
}: FleetRoleDelegationModalProps) => {
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [roleName, setRoleName] = useState('');
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingDrivers, setLoadingDrivers] = useState(true);
  const { canViewTab } = useTabPermissions();

  // Permissions state
  const [permissions, setPermissions] = useState({
    settlements: {
      enabled: false,
      subtabs: {
        'settle-week': false,
        'company-revenue': false,
        'driver-settlements': false,
        'vehicle-revenues': false,
        'fuel': false,
      },
    },
    driversList: {
      enabled: false,
      canAdd: false,
      canEdit: false,
      canDelete: false,
    },
    fleet: {
      enabled: false,
      subtabs: {
        vehicles: false,
        fleets: false,
      },
      canAddVehicle: false,
      canEditVehicle: false,
      canDeleteVehicle: false,
      canAssignDriver: false,
    },
  });

  useEffect(() => {
    if (open) {
      fetchAvailableDrivers();
      if (editRole) {
        setSelectedDriverId(editRole.driver_id);
        setRoleName(editRole.role_name);
        if (editRole.permissions?.tabs) {
          setPermissions({
            settlements: editRole.permissions.tabs.settlements || permissions.settlements,
            driversList: editRole.permissions.tabs['drivers-list'] || permissions.driversList,
            fleet: editRole.permissions.tabs.fleet || permissions.fleet,
          });
        }
      } else {
        resetForm();
      }
    }
  }, [open, editRole]);

  const resetForm = () => {
    setSelectedDriverId('');
    setRoleName('');
    setPermissions({
      settlements: {
        enabled: false,
        subtabs: {
          'settle-week': false,
          'company-revenue': false,
          'driver-settlements': false,
          'vehicle-revenues': false,
          'fuel': false,
        },
      },
      driversList: {
        enabled: false,
        canAdd: false,
        canEdit: false,
        canDelete: false,
      },
      fleet: {
        enabled: false,
        subtabs: {
          vehicles: false,
          fleets: false,
        },
        canAddVehicle: false,
        canEditVehicle: false,
        canDeleteVehicle: false,
        canAssignDriver: false,
      },
    });
  };

  const fetchAvailableDrivers = async () => {
    try {
      setLoadingDrivers(true);
      
      // Pobierz kierowców przypisanych do floty (wszystkich, nie tylko active)
      const { data: assignments, error: assignmentsError } = await supabase
        .from('driver_vehicle_assignments')
        .select('driver_id, drivers(id, first_name, last_name, email)')
        .eq('fleet_id', fleetId);

      if (assignmentsError) throw assignmentsError;

      // Pobierz już delegowane role
      const { data: delegatedRoles, error: rolesError } = await supabase
        .from('fleet_delegated_roles')
        .select('assigned_to_driver_id')
        .eq('fleet_id', fleetId);

      if (rolesError) throw rolesError;

      const delegatedDriverIds = new Set(delegatedRoles?.map(r => r.assigned_to_driver_id) || []);

      // Filtruj kierowców
      const availableDrivers = assignments
        ?.map(a => a.drivers)
        .filter((d): d is Driver => 
          d !== null && 
          (!delegatedDriverIds.has(d.id) || d.id === editRole?.driver_id)
        ) || [];

      setDrivers(availableDrivers);
    } catch (error) {
      console.error('Error fetching drivers:', error);
      toast({
        title: 'Błąd',
        description: 'Nie udało się pobrać listy kierowców',
        variant: 'destructive',
      });
    } finally {
      setLoadingDrivers(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedDriverId || !roleName.trim()) {
      toast({
        title: 'Błąd walidacji',
        description: 'Wybierz kierowcę i wpisz nazwę stanowiska',
        variant: 'destructive',
      });
      return;
    }

    if (roleName.length < 3 || roleName.length > 50) {
      toast({
        title: 'Błąd walidacji',
        description: 'Nazwa stanowiska musi mieć od 3 do 50 znaków',
        variant: 'destructive',
      });
      return;
    }

    const hasAnyPermission = permissions.settlements.enabled || 
                            permissions.driversList.enabled || 
                            permissions.fleet.enabled;

    if (!hasAnyPermission) {
      toast({
        title: 'Błąd walidacji',
        description: 'Musisz zaznaczyć przynajmniej jedną zakładkę',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Nie znaleziono użytkownika');

      // Pobierz user_id kierowcy
      const { data: driverAppUser } = await supabase
        .from('driver_app_users')
        .select('user_id')
        .eq('driver_id', selectedDriverId)
        .maybeSingle();

      const permissionsData = {
        tabs: {
          settlements: permissions.settlements,
          'drivers-list': permissions.driversList,
          fleet: permissions.fleet,
        },
      };

      if (editRole) {
        // Update existing role
        const { error } = await supabase
          .from('fleet_delegated_roles')
          .update({
            role_name: roleName,
            permissions: permissionsData,
            assigned_to_user_id: driverAppUser?.user_id || null,
          })
          .eq('id', editRole.id);

        if (error) throw error;

        toast({
          title: 'Sukces',
          description: 'Rola została zaktualizowana',
        });
      } else {
        // Create new role
        const { error } = await supabase
          .from('fleet_delegated_roles')
          .insert({
            fleet_id: fleetId,
            created_by: user.id,
            assigned_to_driver_id: selectedDriverId,
            assigned_to_user_id: driverAppUser?.user_id || null,
            role_name: roleName,
            permissions: permissionsData,
          });

        if (error) throw error;

        toast({
          title: 'Sukces',
          description: 'Rola została przyznana',
        });
      }

      onSuccess?.();
      onClose();
    } catch (error: any) {
      console.error('Error saving delegated role:', error);
      toast({
        title: 'Błąd',
        description: error.message || 'Nie udało się zapisać roli',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editRole ? 'Edytuj rolę flotową' : 'Przyznaj rolę flotową'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Driver Selection */}
          <div className="space-y-2">
            <Label>Kierowca</Label>
            {loadingDrivers ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Ładowanie kierowców...
              </div>
            ) : (
              <Select value={selectedDriverId} onValueChange={setSelectedDriverId} disabled={!!editRole}>
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz kierowcę" />
                </SelectTrigger>
                <SelectContent>
                  {drivers.map((driver) => (
                    <SelectItem key={driver.id} value={driver.id}>
                      {driver.first_name} {driver.last_name} ({driver.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Role Name */}
          <div className="space-y-2">
            <Label>Nazwa stanowiska</Label>
            <Input
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              placeholder="np. Zastępca menedżera, Koordynator"
              maxLength={50}
            />
            <p className="text-xs text-muted-foreground">
              {roleName.length}/50 znaków
            </p>
          </div>

          {/* Permissions */}
          <div className="space-y-4">
            <Label className="text-base">Uprawnienia</Label>

            {/* Settlements Tab */}
            {canViewTab('settlements') && (
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="settlements"
                    checked={permissions.settlements.enabled}
                    onCheckedChange={(checked) =>
                      setPermissions({
                        ...permissions,
                        settlements: {
                          ...permissions.settlements,
                          enabled: checked as boolean,
                        },
                      })
                    }
                  />
                  <Label htmlFor="settlements" className="font-semibold">
                    Rozliczenia
                  </Label>
                </div>
                {permissions.settlements.enabled && (
                  <div className="ml-6 space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="settle-week"
                        checked={permissions.settlements.subtabs['settle-week']}
                        onCheckedChange={(checked) =>
                          setPermissions({
                            ...permissions,
                            settlements: {
                              ...permissions.settlements,
                              subtabs: {
                                ...permissions.settlements.subtabs,
                                'settle-week': checked as boolean,
                              },
                            },
                          })
                        }
                      />
                      <Label htmlFor="settle-week">Rozlicz tydzień</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="driver-settlements"
                        checked={permissions.settlements.subtabs['driver-settlements']}
                        onCheckedChange={(checked) =>
                          setPermissions({
                            ...permissions,
                            settlements: {
                              ...permissions.settlements,
                              subtabs: {
                                ...permissions.settlements.subtabs,
                                'driver-settlements': checked as boolean,
                              },
                            },
                          })
                        }
                      />
                      <Label htmlFor="driver-settlements">Rozliczenia kierowców</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="vehicle-revenues"
                        checked={permissions.settlements.subtabs['vehicle-revenues']}
                        onCheckedChange={(checked) =>
                          setPermissions({
                            ...permissions,
                            settlements: {
                              ...permissions.settlements,
                              subtabs: {
                                ...permissions.settlements.subtabs,
                                'vehicle-revenues': checked as boolean,
                              },
                            },
                          })
                        }
                      />
                      <Label htmlFor="vehicle-revenues">Przychody aut</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="fuel"
                        checked={permissions.settlements.subtabs['fuel']}
                        onCheckedChange={(checked) =>
                          setPermissions({
                            ...permissions,
                            settlements: {
                              ...permissions.settlements,
                              subtabs: {
                                ...permissions.settlements.subtabs,
                                fuel: checked as boolean,
                              },
                            },
                          })
                        }
                      />
                      <Label htmlFor="fuel">Paliwo</Label>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Drivers List Tab */}
            {canViewTab('drivers-list') && (
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="drivers-list"
                    checked={permissions.driversList.enabled}
                    onCheckedChange={(checked) =>
                      setPermissions({
                        ...permissions,
                        driversList: {
                          ...permissions.driversList,
                          enabled: checked as boolean,
                        },
                      })
                    }
                  />
                  <Label htmlFor="drivers-list" className="font-semibold">
                    Lista kierowców
                  </Label>
                </div>
                {permissions.driversList.enabled && (
                  <div className="ml-6 space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="can-add-driver"
                        checked={permissions.driversList.canAdd}
                        onCheckedChange={(checked) =>
                          setPermissions({
                            ...permissions,
                            driversList: {
                              ...permissions.driversList,
                              canAdd: checked as boolean,
                            },
                          })
                        }
                      />
                      <Label htmlFor="can-add-driver">Może dodawać kierowców</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="can-edit-driver"
                        checked={permissions.driversList.canEdit}
                        onCheckedChange={(checked) =>
                          setPermissions({
                            ...permissions,
                            driversList: {
                              ...permissions.driversList,
                              canEdit: checked as boolean,
                            },
                          })
                        }
                      />
                      <Label htmlFor="can-edit-driver">Może edytować kierowców</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="can-delete-driver"
                        checked={permissions.driversList.canDelete}
                        onCheckedChange={(checked) =>
                          setPermissions({
                            ...permissions,
                            driversList: {
                              ...permissions.driversList,
                              canDelete: checked as boolean,
                            },
                          })
                        }
                      />
                      <Label htmlFor="can-delete-driver">Może usuwać kierowców</Label>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Fleet Tab */}
            {canViewTab('fleet') && (
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="fleet"
                    checked={permissions.fleet.enabled}
                    onCheckedChange={(checked) =>
                      setPermissions({
                        ...permissions,
                        fleet: {
                          ...permissions.fleet,
                          enabled: checked as boolean,
                        },
                      })
                    }
                  />
                  <Label htmlFor="fleet" className="font-semibold">
                    Flota
                  </Label>
                </div>
                {permissions.fleet.enabled && (
                  <div className="ml-6 space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="vehicles-subtab"
                        checked={permissions.fleet.subtabs.vehicles}
                        onCheckedChange={(checked) =>
                          setPermissions({
                            ...permissions,
                            fleet: {
                              ...permissions.fleet,
                              subtabs: {
                                ...permissions.fleet.subtabs,
                                vehicles: checked as boolean,
                              },
                            },
                          })
                        }
                      />
                      <Label htmlFor="vehicles-subtab">Pojazdy</Label>
                    </div>
                    {permissions.fleet.subtabs.vehicles && (
                      <div className="ml-6 space-y-2">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="can-add-vehicle"
                            checked={permissions.fleet.canAddVehicle}
                            onCheckedChange={(checked) =>
                              setPermissions({
                                ...permissions,
                                fleet: {
                                  ...permissions.fleet,
                                  canAddVehicle: checked as boolean,
                                },
                              })
                            }
                          />
                          <Label htmlFor="can-add-vehicle">Może dodawać pojazdy</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="can-edit-vehicle"
                            checked={permissions.fleet.canEditVehicle}
                            onCheckedChange={(checked) =>
                              setPermissions({
                                ...permissions,
                                fleet: {
                                  ...permissions.fleet,
                                  canEditVehicle: checked as boolean,
                                },
                              })
                            }
                          />
                          <Label htmlFor="can-edit-vehicle">Może edytować pojazdy</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="can-assign-driver"
                            checked={permissions.fleet.canAssignDriver}
                            onCheckedChange={(checked) =>
                              setPermissions({
                                ...permissions,
                                fleet: {
                                  ...permissions.fleet,
                                  canAssignDriver: checked as boolean,
                                },
                              })
                            }
                          />
                          <Label htmlFor="can-assign-driver">Może przypisywać kierowców</Label>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Anuluj
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {editRole ? 'Zapisz zmiany' : 'Przyznaj rolę'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

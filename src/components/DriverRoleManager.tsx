import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Shield, Loader2, Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface DriverRoleManagerProps {
  driverId: string;
  userAuthId: string;
  onUpdate: () => void;
}

interface Fleet {
  id: string;
  name: string;
}

interface RoleState {
  admin: boolean;
  driver: boolean;
  fleet_settlement: boolean;
  fleet_rental: boolean;
}

export function DriverRoleManager({ driverId, userAuthId, onUpdate }: DriverRoleManagerProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [roles, setRoles] = useState<RoleState>({
    admin: false,
    driver: false,
    fleet_settlement: false,
    fleet_rental: false,
  });
  const [fleetForSettlement, setFleetForSettlement] = useState<string | null>(null);
  const [fleetForRental, setFleetForRental] = useState<string | null>(null);
  const [fleets, setFleets] = useState<Fleet[]>([]);

  useEffect(() => {
    fetchData();
  }, [userAuthId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch fleets
      const { data: fleetsData } = await supabase
        .from('fleets')
        .select('id, name')
        .order('name');
      
      setFleets(fleetsData || []);

      // Fetch current roles
      const { data: rolesData } = await supabase
        .from('user_roles')
        .select('role, fleet_id')
        .eq('user_id', userAuthId);

      if (rolesData) {
        const newRoles: RoleState = {
          admin: false,
          driver: false,
          fleet_settlement: false,
          fleet_rental: false,
        };

        rolesData.forEach((r) => {
          if (r.role === 'admin') newRoles.admin = true;
          if (r.role === 'driver') newRoles.driver = true;
          if (r.role === 'fleet_settlement') {
            newRoles.fleet_settlement = true;
            setFleetForSettlement(r.fleet_id);
          }
          if (r.role === 'fleet_rental') {
            newRoles.fleet_rental = true;
            setFleetForRental(r.fleet_id);
          }
        });

        setRoles(newRoles);
      }
    } catch (error) {
      console.error('Error fetching roles:', error);
      toast.error('Błąd podczas ładowania ról');
    } finally {
      setLoading(false);
    }
  };

  const saveChanges = async () => {
    setSaving(true);
    try {
      // Delete all existing roles for this user
      await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userAuthId);

      // Insert selected roles
      const rolesToInsert = [];

      if (roles.admin) {
        rolesToInsert.push({ user_id: userAuthId, role: 'admin', fleet_id: null });
      }
      if (roles.driver) {
        rolesToInsert.push({ user_id: userAuthId, role: 'driver', fleet_id: null });
      }
      if (roles.fleet_settlement && fleetForSettlement) {
        rolesToInsert.push({ 
          user_id: userAuthId, 
          role: 'fleet_settlement', 
          fleet_id: fleetForSettlement 
        });
      }
      if (roles.fleet_rental && fleetForRental) {
        rolesToInsert.push({ 
          user_id: userAuthId, 
          role: 'fleet_rental', 
          fleet_id: fleetForRental 
        });
      }

      if (rolesToInsert.length > 0) {
        const { error } = await supabase
          .from('user_roles')
          .insert(rolesToInsert);

        if (error) throw error;
      }

      toast.success('Role zaktualizowane pomyślnie');
      onUpdate();
    } catch (error) {
      console.error('Error saving roles:', error);
      toast.error('Błąd podczas zapisywania ról');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card className="p-4 bg-background border-primary/20">
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="h-4 w-4 text-primary" />
          <h4 className="font-medium text-sm">Role i dostępy</h4>
        </div>

        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="role-admin"
              checked={roles.admin}
              onCheckedChange={(checked) =>
                setRoles({ ...roles, admin: checked as boolean })
              }
            />
            <Label htmlFor="role-admin" className="text-sm cursor-pointer">
              Administrator (pełny dostęp do systemu)
            </Label>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="role-driver"
              checked={roles.driver}
              onCheckedChange={(checked) =>
                setRoles({ ...roles, driver: checked as boolean })
              }
            />
            <Label htmlFor="role-driver" className="text-sm cursor-pointer">
              Kierowca (panel kierowcy)
            </Label>
          </div>

          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="role-fleet-settlement"
                checked={roles.fleet_settlement}
                onCheckedChange={(checked) => {
                  setRoles({ ...roles, fleet_settlement: checked as boolean });
                  if (!checked) setFleetForSettlement(null);
                }}
              />
              <Label htmlFor="role-fleet-settlement" className="text-sm cursor-pointer">
                Flotowy - Rozliczenia
              </Label>
            </div>
            {roles.fleet_settlement && (
              <div className="ml-6">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between"
                    >
                      {fleetForSettlement
                        ? fleets.find((f) => f.id === fleetForSettlement)?.name
                        : "Wybierz flotę..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Szukaj floty..." />
                      <CommandList>
                        <CommandEmpty>Nie znaleziono floty.</CommandEmpty>
                        <CommandGroup>
                          {fleets.map((fleet) => (
                            <CommandItem
                              key={fleet.id}
                              value={fleet.name}
                              onSelect={() => setFleetForSettlement(fleet.id)}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  fleetForSettlement === fleet.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {fleet.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="role-fleet-rental"
                checked={roles.fleet_rental}
                onCheckedChange={(checked) => {
                  setRoles({ ...roles, fleet_rental: checked as boolean });
                  if (!checked) setFleetForRental(null);
                }}
              />
              <Label htmlFor="role-fleet-rental" className="text-sm cursor-pointer">
                Flotowy - Wynajem
              </Label>
            </div>
            {roles.fleet_rental && (
              <div className="ml-6">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between"
                    >
                      {fleetForRental
                        ? fleets.find((f) => f.id === fleetForRental)?.name
                        : "Wybierz flotę..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Szukaj floty..." />
                      <CommandList>
                        <CommandEmpty>Nie znaleziono floty.</CommandEmpty>
                        <CommandGroup>
                          {fleets.map((fleet) => (
                            <CommandItem
                              key={fleet.id}
                              value={fleet.name}
                              onSelect={() => setFleetForRental(fleet.id)}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  fleetForRental === fleet.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {fleet.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>
        </div>

        <Button
          onClick={saveChanges}
          disabled={saving}
          className="w-full mt-4"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Zapisywanie...
            </>
          ) : (
            'Zapisz zmiany'
          )}
        </Button>
      </div>
    </Card>
  );
}
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, Copy, Check, Phone, Mail, Users, ChevronDown, ChevronUp, Trash2, Edit, UserCircle, Building, X, Shield, CreditCard, Banknote, RotateCcw } from 'lucide-react';
import { AddDriverModal } from './AddDriverModal';
import { EditDriverModal } from './EditDriverModal';
import { DriverStatusBadge } from './DriverStatusBadge';
import { NewDriverBadge } from './NewDriverBadge';
import { DriverExpandedPanel } from './DriverExpandedPanel';
import { FleetInvitationModal } from './fleet/FleetInvitationModal';
import { FleetRoleDelegationModal } from './FleetRoleDelegationModal';
import { useDrivers, Driver } from '@/hooks/useDrivers';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { InlineEdit } from './InlineEdit';
import { DriverFleetBadgeSelector } from './DriverFleetBadgeSelector';
import { DriverRentalBadge } from './DriverRentalBadge';
import { DriverFilters } from './DriverFilters';
import { DriverVehicleSelector } from "./DriverVehicleSelector";
import { EditPlatformIdsModal } from './EditPlatformIdsModal';
import { DriverAdditionalFees } from './DriverAdditionalFees';
import { DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

interface DriversManagementProps {
  cityId?: string | null;
  cityName: string;
  onDriverUpdate: () => void;
  fleetId?: string | null;
  mode?: 'admin' | 'fleet';
}

export const DriversManagement = ({ cityId, cityName, onDriverUpdate, fleetId, mode = 'admin' }: DriversManagementProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showFleetInviteModal, setShowFleetInviteModal] = useState(false);
  const [showDelegateRoleModal, setShowDelegateRoleModal] = useState(false);
  const [delegatedRoles, setDelegatedRoles] = useState<Record<string, { role_name: string; id: string }>>({});
  const [availableVehicles, setAvailableVehicles] = useState<Array<{ id: string; plate: string; brand: string; model: string }>>([]);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [expandedDrivers, setExpandedDrivers] = useState<Set<string>>(new Set());
  const [editingPlatformIdsDriver, setEditingPlatformIdsDriver] = useState<Driver | null>(null);
  const [feesModalDriver, setFeesModalDriver] = useState<Driver | null>(null);
  const [accountStatuses, setAccountStatuses] = useState<Record<string, 'active' | 'partial' | 'none'>>({});
  
  const { drivers, loading, error, refetch } = useDrivers({ 
    cityId: cityId || undefined, 
    fleetId: fleetId || undefined 
  });

  // Debug logging
  console.log('DriversManagement - Drivers loaded:', {
    count: drivers.length,
    loading,
    error,
    selectedCity: cityId,
    selectedFleet: fleetId,
    drivers: drivers.map(d => ({ 
      id: d.id, 
      name: `${d.first_name} ${d.last_name}`,
      email: d.email 
    }))
  });

  // Load available vehicles for fleet modal
  useEffect(() => {
    if (mode === 'fleet' && fleetId) {
      loadAvailableVehicles();
      loadDelegatedRoles();
    }
  }, [mode, fleetId]);

  const loadDelegatedRoles = async () => {
    if (!fleetId) return;

    try {
      const { data, error } = await supabase
        .from('fleet_delegated_roles')
        .select('id, assigned_to_driver_id, role_name')
        .eq('fleet_id', fleetId);

      if (error) throw error;

      const rolesMap: Record<string, { role_name: string; id: string }> = {};
      data?.forEach(role => {
        rolesMap[role.assigned_to_driver_id] = {
          role_name: role.role_name,
          id: role.id,
        };
      });
      setDelegatedRoles(rolesMap);
    } catch (error) {
      console.error('Error loading delegated roles:', error);
    }
  };

  const loadAvailableVehicles = async () => {
    if (!fleetId) return;
    
    try {
      const { data, error } = await supabase
        .from('vehicles')
        .select('id, plate, brand, model')
        .eq('fleet_id', fleetId)
        .eq('status', 'aktywne')
        .order('plate');

      if (error) throw error;
      setAvailableVehicles(data || []);
    } catch (error) {
      console.error('Error loading available vehicles:', error);
    }
  };

  const displayDrivers = drivers;

  // Check account status for all drivers
  useEffect(() => {
    checkAccountStatuses();
  }, [displayDrivers]);

  const checkAccountStatuses = async () => {
    const statuses: Record<string, 'active' | 'partial' | 'none'> = {};
    
    for (const driver of displayDrivers) {
      if (!driver.email) {
        statuses[driver.id] = 'none';
        continue;
      }

      try {
        const { data: driverAppUser } = await supabase
          .from('driver_app_users')
          .select('user_id')
          .eq('driver_id', driver.id)
          .maybeSingle();

        if (driverAppUser?.user_id) {
          statuses[driver.id] = 'active';
        } else {
          statuses[driver.id] = 'none';
        }
      } catch (error) {
        statuses[driver.id] = 'none';
      }
    }
    
    setAccountStatuses(statuses);
  };

  const getAccountStatusBadge = (driverId: string) => {
    const status = accountStatuses[driverId] || 'none';
    
    switch (status) {
      case 'active':
        return (
          <Badge className="bg-green-500/10 text-green-700 border-green-500/20" variant="outline">
            <UserCircle className="h-3 w-3 mr-1" />
            Konto aktywne
          </Badge>
        );
      case 'partial':
        return (
          <Badge className="bg-yellow-500/10 text-yellow-700 border-yellow-500/20" variant="outline">
            <UserCircle className="h-3 w-3 mr-1" />
            Konto częściowe
          </Badge>
        );
      case 'none':
        return (
          <Badge className="bg-gray-500/10 text-gray-700 border-gray-500/20" variant="outline">
            <UserCircle className="h-3 w-3 mr-1" />
            Brak konta
          </Badge>
        );
    }
  };

  const filteredDrivers = displayDrivers.filter(driver => 
    `${driver.first_name} ${driver.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    driver.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    driver.phone?.includes(searchTerm)
  );

  const toggleDriverExpansion = (driverId: string) => {
    const newExpanded = new Set(expandedDrivers);
    if (newExpanded.has(driverId)) {
      newExpanded.delete(driverId);
    } else {
      newExpanded.add(driverId);
    }
    setExpandedDrivers(newExpanded);
  };

  const getServiceColor = (service: string) => {
    switch (service.toLowerCase()) {
      case 'uber': return 'bg-black text-white hover:bg-gray-800';
      case 'bolt': return 'bg-green-500 text-white hover:bg-green-600';
      case 'freenow': return 'bg-red-500 text-white hover:bg-red-600';
      default: return 'bg-gray-500 text-white hover:bg-gray-600';
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`Skopiowano ${label}: ${text}`);
  };

  const handleAddDriver = () => {
    onDriverUpdate();
    setShowAddModal(false);
  };

  const handleEditDriver = () => {
    onDriverUpdate();
    setEditingDriver(null);
  };

  const updateDriverField = async (driverId: string, field: string, value: string) => {
    const { error } = await supabase
      .from('drivers')
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq('id', driverId);

    if (error) throw error;
    onDriverUpdate();
  };

  const deleteDriver = async (driverId: string, driverName: string) => {
    if (!confirm(`Czy na pewno chcesz usunąć kierowcę ${driverName}?`)) return;

    try {
      // Usuń powiązane dane
      await supabase.from('driver_platform_ids').delete().eq('driver_id', driverId);
      await supabase.from('driver_document_statuses').delete().eq('driver_id', driverId);
      await supabase.from('driver_vehicle_assignments').delete().eq('driver_id', driverId);
      
      // Usuń główny rekord kierowcy
      const { error } = await supabase.from('drivers').delete().eq('id', driverId);
      if (error) throw error;
      
      toast.success(`Usunięto kierowcę ${driverName}`);
      onDriverUpdate();
    } catch (error) {
      toast.error('Błąd podczas usuwania kierowcy');
    }
  };

  const removeFromFleet = async (driverId: string, driverName: string) => {
    if (!confirm(`Czy na pewno chcesz usunąć kierowcę ${driverName} z floty? Kierowca pozostanie w systemie, ale nie będzie już przypisany do tej floty.`)) return;

    try {
      const { error } = await supabase
        .from('drivers')
        .update({ fleet_id: null })
        .eq('id', driverId);

      if (error) throw error;

      toast.success(`Kierowca ${driverName} został usunięty z floty`);
      refetch();
      onDriverUpdate();
    } catch (error) {
      toast.error('Błąd podczas usuwania kierowcy z floty');
    }
  };

  const resetDriverRegistration = async (driverId: string, email: string, driverName: string) => {
    if (!confirm(`Czy na pewno chcesz zresetować rejestrację kierowcy ${driverName}?\n\nKierowca będzie musiał się ponownie zarejestrować używając tego samego emaila (${email}), ale zachowa swoje dane (rozliczenia, dokumenty).`)) return;

    try {
      // 1. Znajdź user_id powiązane z tym kierowcą
      const { data: dauData } = await supabase
        .from('driver_app_users')
        .select('user_id')
        .eq('driver_id', driverId)
        .maybeSingle();

      if (dauData?.user_id) {
        // 2. Wywołaj edge function która usunie konto auth po user_id
        const { error: deleteError } = await supabase.functions.invoke('reset-driver-password', {
          body: { user_id: dauData.user_id, action: 'delete' }
        });

        if (deleteError) {
          console.error('Error deleting auth user by user_id:', deleteError);
        }

        // 3. Usuń role użytkownika
        await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', dauData.user_id);
      } else if (email) {
        // Fallback: jeśli nie ma powiązania w driver_app_users, spróbuj usunąć po emailu
        console.log('No driver_app_users link found, trying to delete by email:', email);
        const { error: deleteError } = await supabase.functions.invoke('reset-driver-password', {
          body: { email: email, action: 'delete' }
        });

        if (deleteError) {
          console.error('Error deleting auth user by email:', deleteError);
        }
      }

      // 4. Usuń powiązanie driver_app_users (jeśli istnieje)
      await supabase
        .from('driver_app_users')
        .delete()
        .eq('driver_id', driverId);

      toast.success(`Rejestracja kierowcy ${driverName} została zresetowana. Może się teraz ponownie zarejestrować używając emaila: ${email}`);
      checkAccountStatuses();
      refetch();
    } catch (error) {
      console.error('Error resetting driver registration:', error);
      toast.error('Błąd podczas resetowania rejestracji');
    }
  };

  const updateAssignedDate = async (driverId: string, newDate: string) => {
    try {
      const { error } = await supabase
        .from('driver_vehicle_assignments')
        .update({ assigned_at: new Date(newDate).toISOString() })
        .eq('driver_id', driverId)
        .eq('status', 'active');
      
      if (error) throw error;
      toast.success('Data wynajmu została zaktualizowana');
      refetch();
    } catch (error) {
      toast.error('Błąd podczas aktualizacji daty wynajmu');
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">Ładowanie kierowców...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-destructive">Błąd: {error}</p>
        </CardContent>
      </Card>
    );
  }

  if (drivers.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">
            {mode === 'fleet' 
              ? "Brak kierowców w tej flocie. Zaproś kierowcę do floty lub dodaj go ręcznie."
              : "Brak kierowców dla wybranego miasta/floty. Zaimportuj dane CSV lub dodaj kierowcę ręcznie."
            }
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Lista kierowców - {cityName}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Znaleziono {filteredDrivers.length} z {drivers.length} kierowców
              </p>
            </div>
            <div className="flex items-center gap-2">
              {mode === 'admin' && (
                <Button onClick={async () => {
                  if (!cityId) {
                    toast.error("Wybierz miasto przed synchronizacją");
                    return;
                  }
                  try {
                    const { data, error } = await supabase.functions.invoke('sync-driver-ids', { body: { city_id: cityId } });
                    if (error) throw error;
                    if (data?.success) {
                      toast.success(`Zaktualizowano kierowców: ${data.stats.updatedDrivers}, ID platform: ${data.stats.upsertedPlatformIds}`);
                      refetch();
                      onDriverUpdate();
                    } else {
                      throw new Error(data?.error || 'Błąd synchronizacji');
                    }
                  } catch (e) {
                    toast.error(`Błąd synchronizacji: ${e instanceof Error ? e.message : 'Nieznany błąd'}`);
                  }
                }} variant="outline" className="gap-2">
                  Odśwież IDs
                </Button>
              )}
              {mode === 'fleet' && (
                <>
                  <Button 
                    onClick={() => setShowDelegateRoleModal(true)}
                    variant="outline"
                    className="gap-2"
                  >
                    <Shield className="h-4 w-4" />
                    Przyznaj rolę
                  </Button>
                  <Button 
                    onClick={() => {
                      toast.info('Funkcja aktualizacji kierowców - w przygotowaniu');
                    }}
                    variant="outline"
                    className="gap-2"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Aktualizuj kierowców
                  </Button>
                </>
              )}
              <Button 
                onClick={() => mode === 'fleet' ? setShowFleetInviteModal(true) : setShowAddModal(true)} 
                className="gap-2"
                disabled={!cityId && mode !== 'fleet'}
              >
                <Plus className="h-4 w-4" />
                Dodaj kierowcę
              </Button>
            </div>
          </div>
          
          <div className="flex items-center justify-between mt-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Szukaj kierowców..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 rounded-lg"
              />
            </div>
            <DriverFilters onFilterChange={() => {}} />
          </div>
        </CardHeader>
        
        <CardContent>
          {filteredDrivers.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                {drivers.length === 0 
                  ? (mode === 'fleet' 
                      ? "Brak kierowców w tej flocie. Zaproś kierowcę do floty lub dodaj go ręcznie."
                      : "Brak kierowców w tym mieście. Zaimportuj dane CSV lub dodaj kierowcę ręcznie."
                    )
                  : "Nie znaleziono kierowców pasujących do wyszukiwania."
                }
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredDrivers.map((driver) => (
                <div 
                  key={driver.id} 
                  className="border rounded-lg p-6 hover:bg-muted/50 transition-colors cursor-pointer"
                  onClick={() => toggleDriverExpansion(driver.id)}
                >
                  <div className="flex items-start justify-between">
                     <div className="flex-1">
                       <div className="flex items-center gap-2 mb-2">
                         <h3 className="font-medium">
                           {driver.first_name} {driver.last_name}
                         </h3>
                         <div className="flex items-center gap-2 flex-wrap">
                           {getAccountStatusBadge(driver.id)}
                            {driver.registration_date && (
                              <NewDriverBadge registrationDate={driver.registration_date} />
                            )}
                               <div className="flex items-center gap-2">
                                <DriverVehicleSelector
                                  driverId={driver.id}
                                  currentVehicleId={driver.vehicle_assignment?.status === 'active' && !driver.vehicle_assignment?.unassigned_at ? driver.vehicle_assignment?.vehicle_id : null}
                                  fleetId={(driver as any).fleet_id}
                                  onVehicleUpdate={refetch}
                                  hideFleetName={mode === 'fleet'}
                                />
                               {driver.vehicle_assignment?.assigned_at && (
                                 <div className="text-xs text-muted-foreground flex items-center gap-1">
                                   <span>od:</span>
                                   {mode === 'admin' ? (
                                     <input
                                       type="date"
                                       value={format(new Date(driver.vehicle_assignment.assigned_at), 'yyyy-MM-dd')}
                                       onChange={(e) => {
                                         e.stopPropagation();
                                         updateAssignedDate(driver.id, e.target.value);
                                       }}
                                       onClick={(e) => e.stopPropagation()}
                                       className="border rounded px-1 py-0.5 text-xs cursor-pointer hover:border-primary transition-colors"
                                     />
                                   ) : (
                                     <span>{format(new Date(driver.vehicle_assignment.assigned_at), 'dd.MM.yyyy', { locale: pl })}</span>
                                   )}
                                   {driver.vehicle_assignment?.unassigned_at && (
                                     <>
                                       <span>do:</span>
                                       <span>{format(new Date(driver.vehicle_assignment.unassigned_at), 'dd.MM.yyyy', { locale: pl })}</span>
                                     </>
                                   )}
                                 </div>
                               )}
                               {/* Własne auto badge - dla kierowców z autem bez floty */}
                               {driver.vehicle_assignment?.vehicle && driver.vehicle_assignment.vehicle.fleet_id === null && (
                                 <Badge variant="outline" className="text-xs bg-blue-50 border-blue-200 text-blue-700">
                                   🚗 Własne: {driver.vehicle_assignment.vehicle.plate} • {driver.vehicle_assignment.vehicle.brand} {driver.vehicle_assignment.vehicle.model}
                                 </Badge>
                               )}
                              </div>
                             {/* Fleet badge - tylko w trybie admin */}
                             {mode === 'admin' && (
                               <DriverFleetBadgeSelector 
                                 driverId={driver.id}
                                 fleetId={(driver as any).fleet_id}
                                 onFleetChange={refetch}
                                 allowAdd={false}
                               />
                             )}
                         </div>
                       </div>

                       <div className="flex items-center gap-2 mb-2">
                        {/* Delegated Role Badge */}
                        {mode === 'fleet' && delegatedRoles[driver.id] && (
                          <Badge 
                            variant="secondary" 
                            className="cursor-pointer hover:bg-secondary/80"
                            onClick={(e) => {
                              e.stopPropagation();
                              toast.info(`Zarządca: ${delegatedRoles[driver.id].role_name}`);
                            }}
                          >
                            <Shield className="h-3 w-3 mr-1" />
                            {delegatedRoles[driver.id].role_name}
                          </Badge>
                        )}
                        
                        {/* GetRido ID Badge - fioletowy */}
                        {driver.getrido_id && (
                          <Badge className="bg-primary text-white hover:bg-primary/90">
                            GetRido: {driver.getrido_id}
                          </Badge>
                        )}
                        
                        {/* Platform badges - uber (czarny), bolt (zielony), freenow (czerwony) */}
                        {driver.platform_ids && driver.platform_ids.length > 0 && (
                          <>
                            {driver.platform_ids
                              .filter(p => p.platform === 'uber')
                              .map((p, idx) => (
                                <Badge key={`uber-${idx}`} className="bg-black text-white">
                                  UBER
                                </Badge>
                              ))}
                            {driver.platform_ids
                              .filter(p => p.platform === 'bolt')
                              .map((p, idx) => (
                                <Badge key={`bolt-${idx}`} className="bg-green-500 text-white">
                                  BOLT
                                </Badge>
                              ))}
                            {driver.platform_ids
                              .filter(p => p.platform === 'freenow')
                              .map((p, idx) => (
                                <Badge key={`freenow-${idx}`} className="bg-red-500 text-white">
                                  FREE NOW
                                </Badge>
                              ))}
                          </>
                        )}
                        
                        {/* Payment Method Badge - clickable to toggle */}
                        <Badge 
                          variant={driver.payment_method === 'cash' ? 'secondary' : 'outline'}
                          className="gap-1 cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={async (e) => {
                            e.stopPropagation();
                            const newMethod = driver.payment_method === 'cash' ? 'transfer' : 'cash';
                            try {
                              await supabase
                                .from('drivers')
                                .update({ payment_method: newMethod })
                                .eq('id', driver.id);
                              toast.success(`Zmieniono metodę płatności na: ${newMethod === 'cash' ? 'Gotówka' : 'Przelew'}`);
                              refetch();
                            } catch (error) {
                              toast.error('Błąd zmiany metody płatności');
                            }
                          }}
                        >
                          {driver.payment_method === 'cash' ? (
                            <><Banknote className="h-3 w-3" /> Gotówka</>
                          ) : (
                            <><CreditCard className="h-3 w-3" /> Przelew</>
                          )}
                        </Badge>
                      </div>

                       <div className="flex items-center gap-4 text-sm flex-wrap">
                           <div className="flex items-center gap-2">
                            <Phone size={14} />
                            <ChevronDown className="h-3 w-3 text-primary" />
                            {driver.phone ? (
                              mode === 'admin' ? (
                                <InlineEdit
                                  value={driver.phone}
                                  onSave={(value) => updateDriverField(driver.id, 'phone', value)}
                                />
                              ) : (
                                <span>{driver.phone}</span>
                              )
                            ) : (
                              <span className="text-red-500 text-xs">Brak telefonu</span>
                            )}
                          </div>
                          
                           <div className="flex items-center gap-2">
                            <Mail size={14} />
                            <ChevronDown className="h-3 w-3 text-primary" />
                            {driver.email ? (
                              mode === 'admin' ? (
                                <InlineEdit
                                  value={driver.email}
                                  onSave={(value) => updateDriverField(driver.id, 'email', value)}
                                />
                              ) : (
                                <span>{driver.email}</span>
                              )
                            ) : (
                              <span className="text-red-500 text-xs">Brak e-maila</span>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Karta:</span>
                            {mode === 'admin' || mode === 'fleet' ? (
                              <InlineEdit
                                value={driver.fuel_card_number || ''}
                                onSave={(value) => updateDriverField(driver.id, 'fuel_card_number', value)}
                                placeholder="Nr karty"
                              />
                            ) : (
                              <span>{driver.fuel_card_number || '-'}</span>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">PIN:</span>
                            {mode === 'admin' || mode === 'fleet' ? (
                              <InlineEdit
                                value={(driver as any).fuel_card_pin || ''}
                                onSave={(value) => updateDriverField(driver.id, 'fuel_card_pin', value)}
                                placeholder="PIN"
                              />
                            ) : (
                              <span>{(driver as any).fuel_card_pin || '-'}</span>
                            )}
                          </div>
                        </div>
                    </div>
                    
                     <div className="flex items-center gap-2">
                      {mode === 'fleet' && driver.fleet_id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFromFleet(driver.id, `${driver.first_name} ${driver.last_name}`);
                          }}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                          title="Usuń z floty"
                        >
                          <X size={14} />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFeesModalDriver(driver);
                        }}
                        className="text-green-600 hover:text-green-700 hover:bg-green-50"
                        title="Dodatkowe opłaty"
                      >
                        <DollarSign size={14} />
                      </Button>
                      {mode === 'admin' && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingPlatformIdsDriver(driver);
                            }}
                            className="text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                            title="Edytuj IDs platform"
                          >
                            ID
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingDriver(driver);
                            }}
                            className="text-primary hover:text-primary/80 hover:bg-primary/10"
                          >
                            <Edit size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteDriver(driver.id, `${driver.first_name} ${driver.last_name}`);
                            }}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            title="Usuń kierowcę"
                          >
                            <Trash2 size={14} />
                          </Button>
                          {driver.email && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                resetDriverRegistration(driver.id, driver.email!, `${driver.first_name} ${driver.last_name}`);
                              }}
                              className="text-orange-500 hover:text-orange-700 hover:bg-orange-50"
                              title="Zresetuj rejestrację - usuwa konto auth i pozwala kierowcy zarejestrować się ponownie"
                            >
                              <RotateCcw size={14} />
                            </Button>
                          )}
                        </>
                      )}
                      {expandedDrivers.has(driver.id) ? (
                        <ChevronUp size={16} className="text-muted-foreground" />
                      ) : (
                        <ChevronDown size={16} className="text-muted-foreground" />
                      )}
                    </div>
                  </div>

              {expandedDrivers.has(driver.id) && (
                <>
                  <DriverExpandedPanel
                    driver={driver}
                    onUpdate={refetch}
                    mode={mode}
                  />
                  
                  {driver.vehicle_assignment?.status === 'active' && driver.vehicle_assignment.assigned_at && (
                    <Card className="mt-2 p-3 bg-blue-50 border-blue-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-sm text-muted-foreground">Wynajem pojazdu od: </span>
                          <span className="font-semibold">
                            {format(new Date(driver.vehicle_assignment.assigned_at), 'dd MMMM yyyy', { locale: pl })}
                          </span>
                        </div>
                        
                        {mode === 'admin' && (
                          <input
                            type="date"
                            value={format(new Date(driver.vehicle_assignment.assigned_at), 'yyyy-MM-dd')}
                            onChange={async (e) => {
                              try {
                                const { error } = await supabase
                                  .from('driver_vehicle_assignments')
                                  .update({ assigned_at: e.target.value })
                                  .eq('driver_id', driver.id)
                                  .eq('status', 'active');
                                  
                                if (error) throw error;
                                toast.success('Data wynajmu zaktualizowana');
                                refetch();
                              } catch (error) {
                                toast.error('Błąd aktualizacji daty');
                              }
                            }}
                            className="border rounded px-2 py-1 text-sm"
                            onClick={(e) => e.stopPropagation()}
                          />
                        )}
                      </div>
                    </Card>
                  )}
                </>
              )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AddDriverModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        cityId={cityId}
        onSuccess={handleAddDriver}
      />

      <FleetInvitationModal
        isOpen={showFleetInviteModal}
        onClose={() => setShowFleetInviteModal(false)}
        onSuccess={() => {
          refetch();
          onDriverUpdate();
        }}
        fleetId={fleetId || ''}
        availableVehicles={availableVehicles}
      />

      {editingDriver && (
        <EditDriverModal
          isOpen={true}
          onClose={() => setEditingDriver(null)}
          driverId={editingDriver.id}
          onSuccess={handleEditDriver}
        />
      )}

      {editingPlatformIdsDriver && (
        <EditPlatformIdsModal
          isOpen={true}
          onClose={() => setEditingPlatformIdsDriver(null)}
          driverId={editingPlatformIdsDriver.id}
          currentPlatformIds={editingPlatformIdsDriver.platform_ids}
          onSuccess={refetch}
        />
      )}

      {feesModalDriver && (
        <DriverAdditionalFees
          isOpen={true}
          onClose={() => setFeesModalDriver(null)}
          driverId={feesModalDriver.id}
          driverName={`${feesModalDriver.first_name} ${feesModalDriver.last_name}`}
        />
      )}

      {mode === 'fleet' && fleetId && (
        <FleetRoleDelegationModal
          open={showDelegateRoleModal}
          onClose={() => setShowDelegateRoleModal(false)}
          fleetId={fleetId}
          onSuccess={() => {
            loadDelegatedRoles();
            refetch();
          }}
        />
      )}
    </>
  );
};
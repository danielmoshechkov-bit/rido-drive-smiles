import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, Copy, Check, Phone, Mail, Users, ChevronDown, ChevronUp, Trash2, Edit, UserCircle } from 'lucide-react';
import { AddDriverModal } from './AddDriverModal';
import { EditDriverModal } from './EditDriverModal';
import { DriverStatusBadge } from './DriverStatusBadge';
import { NewDriverBadge } from './NewDriverBadge';
import { DriverExpandedPanel } from './DriverExpandedPanel';
import { FleetInvitationModal } from './fleet/FleetInvitationModal';
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
  const [availableVehicles, setAvailableVehicles] = useState<Array<{ id: string; plate: string; brand: string; model: string }>>([]);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [expandedDrivers, setExpandedDrivers] = useState<Set<string>>(new Set());
  const [editingPlatformIdsDriver, setEditingPlatformIdsDriver] = useState<Driver | null>(null);
  const [feesModalDriver, setFeesModalDriver] = useState<Driver | null>(null);
  const [accountStatuses, setAccountStatuses] = useState<Record<string, 'active' | 'partial' | 'none'>>({});
  
  const { drivers, loading, refetch } = useDrivers(cityId || undefined);
  
  // Filter drivers by fleet if fleetId is provided
  const [filteredByFleet, setFilteredByFleet] = useState<Driver[]>([]);

  // Filter drivers assigned to vehicles in this fleet
  useEffect(() => {
    const filterByFleet = async () => {
      if (!fleetId) {
        setFilteredByFleet(drivers);
        return;
      }

      // First get vehicle IDs for this fleet
      const { data: vehicles } = await supabase
        .from('vehicles')
        .select('id')
        .eq('fleet_id', fleetId);

      if (!vehicles || vehicles.length === 0) {
        setFilteredByFleet([]);
        return;
      }

      const vehicleIds = vehicles.map(v => v.id);

      // Get all drivers assigned to these vehicles
      const { data: assignments } = await supabase
        .from('driver_vehicle_assignments')
        .select('driver_id')
        .eq('status', 'active')
        .in('vehicle_id', vehicleIds);

      if (assignments) {
        const driverIds = new Set(assignments.map(a => a.driver_id));
        setFilteredByFleet(drivers.filter(d => driverIds.has(d.id)));
      } else {
        setFilteredByFleet([]);
      }
    };

    filterByFleet();
  }, [fleetId, drivers]);

  // Load available vehicles for fleet modal
  useEffect(() => {
    if (mode === 'fleet' && fleetId) {
      loadAvailableVehicles();
    }
  }, [mode, fleetId]);

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

  const displayDrivers = fleetId ? filteredByFleet : drivers;

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

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">Ładowanie kierowców...</p>
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
                  ? "Brak kierowców w tym mieście. Zaimportuj dane CSV lub dodaj kierowcę ręcznie."
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
                           <DriverVehicleSelector
                             driverId={driver.id}
                             fleetId={(driver as any).fleet_id}
                             onVehicleUpdate={refetch}
                           />
                           <DriverFleetBadgeSelector 
                             driverId={driver.id}
                             fleetId={(driver as any).fleet_id}
                             onFleetChange={refetch}
                             allowAdd={false}
                           />
                         </div>
                       </div>

                      <div className="flex items-center gap-2 mb-2">
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
                      </div>

                       <div className="flex items-center gap-4 text-sm flex-wrap">
                          <div className="flex items-center gap-2">
                            <Phone size={14} />
                            <ChevronDown className="h-3 w-3 text-primary" />
                            {driver.phone ? (
                              <InlineEdit
                                value={driver.phone}
                                onSave={(value) => updateDriverField(driver.id, 'phone', value)}
                              />
                            ) : (
                              <span className="text-red-500 text-xs">Brak telefonu</span>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <Mail size={14} />
                            <ChevronDown className="h-3 w-3 text-primary" />
                            {driver.email ? (
                              <InlineEdit
                                value={driver.email}
                                onSave={(value) => updateDriverField(driver.id, 'email', value)}
                              />
                            ) : (
                              <span className="text-red-500 text-xs">Brak e-maila</span>
                            )}
                          </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
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
                      >
                        <Trash2 size={14} />
                      </Button>
                      {expandedDrivers.has(driver.id) ? (
                        <ChevronUp size={16} className="text-muted-foreground" />
                      ) : (
                        <ChevronDown size={16} className="text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {expandedDrivers.has(driver.id) && (
                    <DriverExpandedPanel 
                      driver={driver} 
                      onUpdate={refetch}
                    />
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
    </>
  );
};
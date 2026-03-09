import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, Copy, Check, Phone, Mail, Users, ChevronDown, ChevronUp, Trash2, Edit, UserCircle, Building, X, Shield, CreditCard, Banknote, RotateCcw, FileText, MapPin, Car, Loader2, ToggleRight } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AddDriverModal } from './AddDriverModal';
import { EditDriverModal } from './EditDriverModal';
import { DriverStatusBadge } from './DriverStatusBadge';
import { NewDriverBadge } from './NewDriverBadge';
import { DriverExpandedPanel } from './DriverExpandedPanel';
import { FleetInvitationModal } from './fleet/FleetInvitationModal';
import { FleetRoleDelegationModal } from './FleetRoleDelegationModal';
import { useDrivers, Driver } from '@/hooks/useDrivers';
import { useCities } from '@/hooks/useCities';
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
  const [selectedCityFilter, setSelectedCityFilter] = useState<string>('all');
  const [filters, setFilters] = useState<{ fleets: string[]; statuses: string[]; paymentMethods: string[]; fleetCompanyId?: string }>({
    fleets: [],
    statuses: [],
    paymentMethods: [],
    fleetCompanyId: undefined
  });
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
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [driverToDelete, setDriverToDelete] = useState<{ id: string; name: string } | null>(null);
  const [selectedDrivers, setSelectedDrivers] = useState<Set<string>>(new Set());
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);
  
  const { cities } = useCities();
  
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

  const filteredDrivers = displayDrivers.filter(driver => {
    // City filter (for fleet mode - allows filtering by city)
    if (mode === 'fleet' && selectedCityFilter !== 'all') {
      if (driver.city_id !== selectedCityFilter) {
        return false;
      }
    }

    // Fleet company filter
    if (filters.fleetCompanyId) {
      if (driver.fleet_id !== filters.fleetCompanyId) {
        return false;
      }
    }
    
    // Search filter (name, email, phone)
    const matchesSearch = 
      `${driver.first_name} ${driver.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      driver.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      driver.phone?.includes(searchTerm);
    
    if (!matchesSearch) return false;
    
    // Payment method filter
    if (filters.paymentMethods.length > 0) {
      const driverPaymentMethod = driver.payment_method || 'transfer';
      if (!filters.paymentMethods.includes(driverPaymentMethod)) {
        return false;
      }
    }
    
    return true;
  });

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
    if (!confirm(`Czy na pewno chcesz usunąć kierowcę ${driverName}? Ta operacja jest nieodwracalna.`)) return;

    try {
      console.log(`🗑️ Deleting driver ${driverId} (${driverName})...`);
      
      // FK constraints are now set to CASCADE, so we just delete the driver record
      // and all related records will be automatically deleted
      const { error } = await supabase.from('drivers').delete().eq('id', driverId);
      
      if (error) {
        console.error('❌ Error deleting driver:', error);
        
        // If still getting FK error, show detailed message
        if (error.message?.includes('foreign key') || error.code === '23503') {
          toast.error(`Nie można usunąć: powiązane dane blokują usunięcie. Skontaktuj się z administratorem.`);
        } else {
          toast.error(`Błąd: ${error.message || 'Nieznany błąd'}`);
        }
        return;
      }
      
      console.log(`✅ Driver ${driverName} deleted successfully`);
      toast.success(`Usunięto kierowcę ${driverName}`);
      refetch();
      onDriverUpdate();
    } catch (error: any) {
      console.error('❌ Exception deleting driver:', error);
      toast.error(`Błąd: ${error?.message || 'Nieznany błąd podczas usuwania'}`);
    }
  };

  const openDeleteDialog = (driverId: string, driverName: string) => {
    setDriverToDelete({ id: driverId, name: driverName });
    setDeleteDialogOpen(true);
  };

  const removeFromFleet = async () => {
    if (!driverToDelete) return;
    
    const { id: driverId, name: driverName } = driverToDelete;

    try {
      console.log(`🗑️ Removing driver ${driverId} (${driverName}) from fleet...`);
      
      // Delete the driver record - CASCADE will handle related records
      // Use .select() to get affected rows count
      const { data: deletedData, error } = await supabase
        .from('drivers')
        .delete()
        .eq('id', driverId)
        .select('id');

      if (error) {
        console.error('❌ Error deleting driver:', error);
        
        // If FK error or permission error
        if (error.message?.includes('foreign key') || error.code === '23503') {
          toast.error(`Nie można usunąć: powiązane dane blokują usunięcie.`);
        } else if (error.code === '42501' || error.message?.includes('permission')) {
          toast.error(`Brak uprawnień do usunięcia kierowcy.`);
        } else {
          toast.error(`Błąd: ${error.message || 'Nieznany błąd'}`);
        }
        return;
      }

      // Check if row was actually deleted (RLS might block silently)
      if (!deletedData || deletedData.length === 0) {
        console.error('❌ No rows deleted - RLS might be blocking');
        toast.error(`Nie udało się usunąć kierowcy. Brak uprawnień lub kierowca już nie istnieje.`);
        return;
      }

      console.log(`✅ Driver ${driverName} removed successfully, deleted rows:`, deletedData.length);
      toast.success(`Kierowca ${driverName} został usunięty z floty`);
      
      // Immediately refetch to update the list
      await refetch();
      onDriverUpdate();
    } catch (error: any) {
      console.error('❌ Exception removing driver:', error);
      toast.error(`Błąd: ${error?.message || 'Nieznany błąd podczas usuwania'}`);
    } finally {
      setDeleteDialogOpen(false);
      setDriverToDelete(null);
    }
  };

  const toggleDriverSelection = (driverId: string) => {
    setSelectedDrivers(prev => {
      const next = new Set(prev);
      if (next.has(driverId)) next.delete(driverId);
      else next.add(driverId);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedDrivers.size === filteredDrivers.length) {
      setSelectedDrivers(new Set());
    } else {
      setSelectedDrivers(new Set(filteredDrivers.map(d => d.id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedDrivers.size === 0) return;
    setIsBulkDeleting(true);
    try {
      const ids = Array.from(selectedDrivers);
      for (const id of ids) {
        const { error } = await supabase.from('drivers').delete().eq('id', id).select('id');
        if (error) {
          console.error(`Error deleting driver ${id}:`, error);
        }
      }
      toast.success(`Usunięto ${ids.length} kierowców`);
      setSelectedDrivers(new Set());
      await refetch();
      onDriverUpdate();
    } catch (error: any) {
      toast.error(`Błąd: ${error?.message || 'Nieznany błąd'}`);
    } finally {
      setIsBulkDeleting(false);
      setBulkDeleteDialogOpen(false);
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
      <>
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <Users className="h-12 w-12 mx-auto text-muted-foreground/50" />
            <p className="text-muted-foreground">
              {mode === 'fleet' 
                ? "Brak kierowców w tej flocie. Zaproś kierowcę do floty lub dodaj go ręcznie."
                : "Brak kierowców dla wybranego miasta/floty. Zaimportuj dane CSV lub dodaj kierowcę ręcznie."
              }
            </p>
            {mode === 'fleet' && (
              <div className="flex justify-center gap-3 pt-2">
                <Button onClick={() => setShowFleetInviteModal(true)} variant="outline" className="gap-2">
                  <Mail className="h-4 w-4" />
                  Zaproś kierowcę
                </Button>
                <Button onClick={() => setShowAddModal(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Dodaj kierowcę
                </Button>
              </div>
            )}
            {mode === 'admin' && cityId && (
              <div className="flex justify-center gap-3 pt-2">
                <Button onClick={() => setShowAddModal(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Dodaj kierowcę
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Modal components still need to be rendered */}
        <AddDriverModal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSuccess={handleAddDriver}
          cityId={cityId || undefined}
        />
        
        {fleetId && (
          <FleetInvitationModal
            isOpen={showFleetInviteModal}
            onClose={() => setShowFleetInviteModal(false)}
            onSuccess={() => {
              refetch();
              onDriverUpdate();
            }}
            fleetId={fleetId}
            availableVehicles={availableVehicles}
          />
        )}
      </>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="space-y-4">
          {/* Mobile layout - stacked */}
          <div className="flex flex-col gap-4 md:hidden">
            <div>
              <CardTitle className="text-lg">Lista kierowców</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Znaleziono {filteredDrivers.length} z {drivers.length} kierowców
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {mode === 'fleet' && (
                <Button 
                  onClick={() => setShowDelegateRoleModal(true)}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-9"
                >
                  <Shield className="h-4 w-4" />
                  Przyznaj rolę
                </Button>
              )}
              <Button 
                onClick={() => mode === 'fleet' ? setShowFleetInviteModal(true) : setShowAddModal(true)} 
                size="sm"
                className="gap-1.5 h-9"
                disabled={!cityId && mode !== 'fleet'}
              >
                <Plus className="h-4 w-4" />
                Dodaj kierowcę
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Szukaj kierowców..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 rounded-lg h-9"
              />
            </div>
            {mode === 'fleet' && cities.length > 0 && (
              <Select value={selectedCityFilter} onValueChange={setSelectedCityFilter}>
                <SelectTrigger className="h-9">
                  <MapPin className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Wszystkie miasta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie miasta</SelectItem>
                  {cities.map(city => (
                    <SelectItem key={city.id} value={city.id}>{city.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <DriverFilters onFilterChange={setFilters} />
          </div>
          
          {/* Desktop layout - inline */}
          <div className="hidden md:block">
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
                  <Button 
                    onClick={() => setShowDelegateRoleModal(true)}
                    variant="outline"
                    className="gap-2"
                  >
                    <Shield className="h-4 w-4" />
                    Przyznaj rolę
                  </Button>
                )}
                <Button 
                  onClick={() => mode === 'fleet' ? setShowFleetInviteModal(true) : setShowAddModal(true)} 
                  className="gap-2"
                  disabled={!cityId && mode !== 'fleet'}
                >
                  <Plus className="h-4 w-4" />
                  Dodaj kierowcę
                </Button>
                {selectedDrivers.size > 0 && (
                  <Button 
                    variant="destructive"
                    size="sm"
                    onClick={() => setBulkDeleteDialogOpen(true)}
                    className="gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Usuń ({selectedDrivers.size})
                  </Button>
                )}
              </div>
            </div>
            
            <div className="flex flex-wrap items-center justify-between gap-4 mt-4">
              <div className="flex items-center gap-2 flex-1">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder="Szukaj kierowców..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 rounded-lg"
                  />
                </div>
                
                {mode === 'fleet' && cities.length > 0 && (
                  <Select value={selectedCityFilter} onValueChange={setSelectedCityFilter}>
                    <SelectTrigger className="w-48">
                      <MapPin className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Wszystkie miasta" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Wszystkie miasta</SelectItem>
                      {cities.map(city => (
                        <SelectItem key={city.id} value={city.id}>{city.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <DriverFilters onFilterChange={setFilters} />
            </div>
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
                  className={`border rounded-lg p-6 hover:bg-muted/50 transition-colors cursor-pointer ${selectedDrivers.has(driver.id) ? 'border-primary bg-primary/5' : ''}`}
                  onClick={() => toggleDriverExpansion(driver.id)}
                >
                  <div className="flex items-start justify-between">
                     <div className="flex-1">
                       <div className="flex items-center gap-2 mb-2">
                         <Checkbox
                           checked={selectedDrivers.has(driver.id)}
                           onCheckedChange={() => toggleDriverSelection(driver.id)}
                           onClick={(e) => e.stopPropagation()}
                           className="mr-1"
                         />
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
                              </div>
                             {/* Fleet badge - admin i fleet */}
                             {(mode === 'admin' || mode === 'fleet') && (
                                <DriverFleetBadgeSelector 
                                 driverId={driver.id}
                                 fleetId={(driver as any).fleet_id}
                                 onFleetChange={refetch}
                                 allowAdd={true}
                                 managingFleetId={mode === 'fleet' ? fleetId : undefined}
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
                        
                         {/* Payment Method Badge - Popover with options */}
                         <Popover>
                           <PopoverTrigger onClick={(e) => e.stopPropagation()}>
                             <Badge 
                               variant={driver.payment_method === 'cash' ? 'secondary' : driver.payment_method === 'b2b' ? 'default' : 'outline'}
                               className="gap-1 cursor-pointer hover:opacity-80 transition-opacity"
                             >
                               {driver.payment_method === 'cash' ? (
                                 <><Banknote className="h-3 w-3" /> Gotówka</>
                               ) : driver.payment_method === 'b2b' ? (
                                 <><FileText className="h-3 w-3" /> B2B</>
                               ) : (
                                 <><CreditCard className="h-3 w-3" /> Przelew</>
                               )}
                             </Badge>
                           </PopoverTrigger>
                           <PopoverContent 
                             className="w-44 p-2 bg-popover border shadow-lg z-50" 
                             onClick={(e) => e.stopPropagation()}
                           >
                              <div className="space-y-1">
                                <button
                                  className={`w-full flex items-center gap-2 p-2 rounded hover:bg-muted text-left text-sm ${driver.payment_method === 'cash' ? 'bg-muted font-medium' : ''}`}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const { error } = await supabase.from('drivers').update({ payment_method: 'cash' }).eq('id', driver.id);
                                    if (error) {
                                      toast.error('Nie udało się zmienić metody płatności');
                                      console.error('Update error:', error);
                                      return;
                                    }
                                    toast.success('Zmieniono na: Gotówka');
                                    refetch();
                                  }}
                                >
                                  <Banknote className="h-4 w-4" /> Gotówka
                                </button>
                                <button
                                  className={`w-full flex items-center gap-2 p-2 rounded hover:bg-muted text-left text-sm ${driver.payment_method === 'transfer' ? 'bg-muted font-medium' : ''}`}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const { error } = await supabase.from('drivers').update({ payment_method: 'transfer' }).eq('id', driver.id);
                                    if (error) {
                                      toast.error('Nie udało się zmienić metody płatności');
                                      console.error('Update error:', error);
                                      return;
                                    }
                                    toast.success('Zmieniono na: Przelew');
                                    refetch();
                                  }}
                                >
                                  <CreditCard className="h-4 w-4" /> Przelew
                                </button>
                                <button
                                  className={`w-full flex items-center gap-2 p-2 rounded hover:bg-muted text-left text-sm ${driver.payment_method === 'b2b' ? 'bg-muted font-medium' : ''}`}
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    const { error } = await supabase.from('drivers').update({ payment_method: 'b2b' }).eq('id', driver.id);
                                    if (error) {
                                      toast.error('Nie udało się zmienić metody płatności');
                                      console.error('Update error:', error);
                                      return;
                                    }
                                    toast.success('Zmieniono na: B2B (faktury)');
                                    refetch();
                                  }}
                                >
                                  <FileText className="h-4 w-4" /> B2B (faktury)
                                </button>
                              </div>
                           </PopoverContent>
                         </Popover>
                       </div>

                       <div className="flex items-center gap-4 text-sm flex-wrap">
                           <div className="flex items-center gap-2">
                            <Phone size={14} />
                            <ChevronDown className="h-3 w-3 text-primary" />
                            {driver.phone ? (
                              (mode === 'admin' || mode === 'fleet') ? (
                                <InlineEdit
                                  value={driver.phone}
                                  onSave={(value) => updateDriverField(driver.id, 'phone', value)}
                                />
                              ) : (
                                <span>{driver.phone}</span>
                              )
                            ) : (
                              (mode === 'admin' || mode === 'fleet') ? (
                                <InlineEdit
                                  value=""
                                  onSave={(value) => updateDriverField(driver.id, 'phone', value)}
                                  placeholder="Dodaj telefon"
                                />
                              ) : (
                                <span className="text-red-500 text-xs">Brak telefonu</span>
                              )
                            )}
                          </div>
                          
                           <div className="flex items-center gap-2">
                            <Mail size={14} />
                            <ChevronDown className="h-3 w-3 text-primary" />
                            {driver.email ? (
                              (mode === 'admin' || mode === 'fleet') ? (
                                <InlineEdit
                                  value={driver.email}
                                  onSave={(value) => updateDriverField(driver.id, 'email', value)}
                                />
                              ) : (
                                <span>{driver.email}</span>
                              )
                            ) : (
                              (mode === 'admin' || mode === 'fleet') ? (
                                <InlineEdit
                                  value=""
                                  onSave={(value) => updateDriverField(driver.id, 'email', value)}
                                  placeholder="Dodaj email"
                                />
                              ) : (
                                <span className="text-red-500 text-xs">Brak e-maila</span>
                              )
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
                          
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Opłata tyg.:</span>
                            {mode === 'admin' || mode === 'fleet' ? (
                              <InlineEdit
                                value={(driver as any).custom_weekly_fee?.toString() || ''}
                                onSave={async (value) => {
                                  const numVal = value.trim() === '' ? null : parseFloat(value.replace(',', '.'));
                                  const { error } = await supabase
                                    .from('drivers')
                                    .update({ custom_weekly_fee: numVal } as any)
                                    .eq('id', driver.id);
                                  if (error) toast.error('Błąd zapisu');
                                  else {
                                    toast.success('Opłata tygodniowa zapisana');
                                    refetch();
                                  }
                                }}
                                placeholder="domyślna"
                              />
                            ) : (
                              <span>{(driver as any).custom_weekly_fee || '-'}</span>
                            )}
                            <span className="text-xs text-muted-foreground">zł</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <Banknote size={14} />
                            <span className="text-xs text-muted-foreground">Nr konta:</span>
                            {mode === 'admin' || mode === 'fleet' ? (
                              <InlineEdit
                                value={(driver as any).bank_account || ''}
                                onSave={async (value) => {
                                  const cleanValue = value.trim() || null;
                                  const { error } = await supabase
                                    .from('drivers')
                                    .update({ bank_account: cleanValue, iban: cleanValue } as any)
                                    .eq('id', driver.id);
                                  if (error) toast.error('Błąd zapisu');
                                  else {
                                    toast.success('Nr konta zapisany');
                                    refetch();
                                  }
                                }}
                                placeholder="00 0000 0000 0000 0000 0000 0000"
                              />
                            ) : (
                              <span className="font-mono text-xs">{(driver as any).bank_account || '-'}</span>
                            )}
                          </div>

                          {/* B2B Toggle */}
                          {(mode === 'admin' || mode === 'fleet') && (
                            <div className="border-t pt-2 mt-2 space-y-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <Building size={14} />
                                  <span className="text-xs font-medium">B2B (firma)</span>
                                </div>
                                <Switch
                                  checked={!!(driver as any).b2b_enabled}
                                  onCheckedChange={async (checked) => {
                                    const updates: any = { b2b_enabled: checked };
                                    if (checked) {
                                      updates.billing_method = 'b2b';
                                    } else {
                                      updates.billing_method = 'standard';
                                    }
                                    const { error } = await supabase
                                      .from('drivers')
                                      .update(updates)
                                      .eq('id', driver.id);
                                    if (error) toast.error('Błąd zapisu');
                                    else {
                                      toast.success(checked ? 'B2B włączone' : 'B2B wyłączone');
                                      refetch();
                                    }
                                  }}
                                />
                              </div>

                              {(driver as any).b2b_enabled && (
                                <div className="space-y-1.5 pl-5 text-xs">
                                  <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground w-[70px]">Firma:</span>
                                    <InlineEdit
                                      value={(driver as any).b2b_company_name || ''}
                                      onSave={async (value) => {
                                        const { error } = await supabase.from('drivers').update({ b2b_company_name: value.trim() || null } as any).eq('id', driver.id);
                                        if (error) toast.error('Błąd'); else { toast.success('Zapisano'); refetch(); }
                                      }}
                                      placeholder="Nazwa firmy"
                                    />
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground w-[70px]">NIP:</span>
                                    <InlineEdit
                                      value={(driver as any).b2b_nip || ''}
                                      onSave={async (value) => {
                                        const { error } = await supabase.from('drivers').update({ b2b_nip: value.trim() || null } as any).eq('id', driver.id);
                                        if (error) toast.error('Błąd'); else { toast.success('Zapisano'); refetch(); }
                                      }}
                                      placeholder="NIP firmy"
                                    />
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-muted-foreground w-[70px]">Adres:</span>
                                    <InlineEdit
                                      value={(driver as any).b2b_address || ''}
                                      onSave={async (value) => {
                                        const { error } = await supabase.from('drivers').update({ b2b_address: value.trim() || null } as any).eq('id', driver.id);
                                        if (error) toast.error('Błąd'); else { toast.success('Zapisano'); refetch(); }
                                      }}
                                      placeholder="Adres firmy"
                                    />
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Płatnik VAT:</span>
                                    <Switch
                                      checked={!!(driver as any).b2b_vat_payer}
                                      onCheckedChange={async (checked) => {
                                        const { error } = await supabase.from('drivers').update({ b2b_vat_payer: checked } as any).eq('id', driver.id);
                                        if (error) toast.error('Błąd');
                                        else {
                                          toast.success(checked ? 'VAT: płatnik (wypłata z VAT)' : 'VAT: nievatowiec (potrącenie 8%)');
                                          refetch();
                                        }
                                      }}
                                    />
                                  </div>
                                  <p className="text-[10px] text-muted-foreground italic">
                                    {(driver as any).b2b_vat_payer
                                      ? 'Płatnik VAT — wypłata brutto z VAT, kierowca sam odlicza'
                                      : 'Nie jest płatnikiem VAT — system potrąci 8% VAT'}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                    </div>
                    
                     <div className="flex items-center gap-2">
                      {mode === 'fleet' && driver.fleet_id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDeleteDialog(driver.id, `${driver.first_name} ${driver.last_name}`);
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

      {/* Delete Driver Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usunięcie kierowcy z floty</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="py-4 space-y-4">
            <p>
              <strong>Uwaga:</strong> Kierowca <strong>{driverToDelete?.name}</strong> zostanie trwale usunięty z Twojej listy floty.
            </p>
            <p className="text-muted-foreground">
              Kierowca zniknie z Twojej listy kierowców. Tej operacji nie można cofnąć.
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDriverToDelete(null)}>
              Anuluj
            </AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={removeFromFleet}
            >
              Potwierdź
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Delete Confirmation Dialog */}
      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usuwanie wielu kierowców</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="py-4 space-y-4">
            <p>
              <strong>Uwaga:</strong> Zaznaczono <strong>{selectedDrivers.size}</strong> kierowców do usunięcia.
            </p>
            <p className="text-muted-foreground">
              Wszyscy zaznaczeni kierowcy zostaną trwale usunięci. Tej operacji nie można cofnąć.
            </p>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isBulkDeleting}>Anuluj</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={handleBulkDelete}
              disabled={isBulkDeleting}
            >
              {isBulkDeleting ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Usuwanie...</>
              ) : (
                <>Usuń {selectedDrivers.size} kierowców</>
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
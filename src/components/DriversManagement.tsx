import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, Copy, Check, Phone, Mail, Users, ChevronDown, ChevronUp, Trash2, Edit } from 'lucide-react';
import { AddDriverModal } from './AddDriverModal';
import { EditDriverModal } from './EditDriverModal';
import { DriverStatusBadge } from './DriverStatusBadge';
import { NewDriverBadge } from './NewDriverBadge';
import { DriverExpandedPanel } from './DriverExpandedPanel';
import { useDrivers, Driver } from '@/hooks/useDrivers';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { InlineEdit } from './InlineEdit';
import { DriverFleetBadgeSelector } from './DriverFleetBadgeSelector';
import { DriverRentalBadge } from './DriverRentalBadge';
import { DriverFilters } from './DriverFilters';
import { DriverVehicleSelector } from "./DriverVehicleSelector";

interface DriversManagementProps {
  cityId: string;
  cityName: string;
  onDriverUpdate: () => void;
}

export const DriversManagement = ({ cityId, cityName, onDriverUpdate }: DriversManagementProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [expandedDrivers, setExpandedDrivers] = useState<Set<string>>(new Set());
  
  const { drivers, loading, refetch } = useDrivers(cityId);

  const filteredDrivers = drivers.filter(driver => 
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
            <Button onClick={() => setShowAddModal(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Dodaj kierowcę
            </Button>
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
                         <div className="flex items-center gap-2">
                           {driver.registration_date && (
                             <NewDriverBadge registrationDate={driver.registration_date} />
                           )}
                           <DriverStatusBadge 
                             driverId={driver.id}
                             currentRole={(driver as any).user_role || 'kierowca'}
                           />
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
                        {driver.platform_ids && driver.platform_ids.map((platform) => (
                          <Badge
                            key={platform.platform}
                            className={getServiceColor(platform.platform)}
                            variant="outline"
                          >
                            {platform.platform.toUpperCase()}
                          </Badge>
                        ))}
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

      {editingDriver && (
        <EditDriverModal
          isOpen={true}
          onClose={() => setEditingDriver(null)}
          driverId={editingDriver.id}
          onSuccess={handleEditDriver}
        />
      )}
    </>
  );
};
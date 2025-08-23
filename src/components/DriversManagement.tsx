import { useState } from 'react';
import { Search, Plus, Edit2, Copy, Phone, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useDrivers } from '@/hooks/useDrivers';
import { AddDriverModal } from './AddDriverModal';
import { EditDriverModal } from './EditDriverModal';
import { InlineEdit } from './InlineEdit';
import { DriverStatusBadge } from './DriverStatusBadge';
import { supabase } from '@/integrations/supabase/client';

interface DriversManagementProps {
  cityId: string;
  cityName: string;
  onDriverUpdate: () => void;
}

export const DriversManagement = ({ cityId, cityName, onDriverUpdate }: DriversManagementProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingDriver, setEditingDriver] = useState<string | null>(null);
  
  const { drivers, loading } = useDrivers(cityId);

  const filteredDrivers = drivers.filter(driver => 
    `${driver.first_name} ${driver.last_name}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    driver.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    driver.phone?.includes(searchTerm)
  );

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

  const updatePlatformId = async (oldPlatformId: string, newValue: string) => {
    // Find the platform record to update
    const { data: platformRecord, error: findError } = await supabase
      .from('driver_platform_ids')
      .select('id')
      .eq('platform_id', oldPlatformId)
      .single();

    if (findError || !platformRecord) throw new Error('Platform not found');

    const { error } = await supabase
      .from('driver_platform_ids')
      .update({ platform_id: newValue })
      .eq('id', platformRecord.id);

    if (error) throw error;
    onDriverUpdate();
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
          
          <div className="flex items-center space-x-2 mt-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Szukaj kierowców..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
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
                <div key={driver.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-3">
                      {/* Driver name and edit button */}
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold">
                          {driver.first_name} {driver.last_name}
                        </h3>
                        <DriverStatusBadge 
                          driverId={driver.id} 
                          currentRole={(driver as any).user_role || 'kierowca'} 
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingDriver(driver.id)}
                          className="h-8 w-8 p-0"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      </div>

                      {/* Platform badges - only names */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {driver.platform_ids && driver.platform_ids.length > 0 ? (
                          driver.platform_ids.map((platform) => (
                            <Badge 
                              key={platform.platform} 
                              className={`${getServiceColor(platform.platform)} rounded-full px-4 py-2 text-sm font-medium`}
                            >
                              {platform.platform.toUpperCase()}
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="outline" className="rounded-full px-4 py-2">
                            Brak platform
                          </Badge>
                        )}
                      </div>

                      {/* Contact information and platform IDs in one line */}
                      <div className="flex items-center gap-6 flex-wrap text-sm">
                        {/* Phone */}
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          {driver.phone ? (
                            <InlineEdit
                              value={driver.phone}
                              onSave={(value) => updateDriverField(driver.id, 'phone', value)}
                              placeholder="Brak telefonu"
                            />
                          ) : (
                            <InlineEdit
                              value=""
                              onSave={(value) => updateDriverField(driver.id, 'phone', value)}
                              placeholder="Dodaj telefon"
                              className="text-muted-foreground"
                            />
                          )}
                        </div>

                        {/* Email */}
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          {driver.email ? (
                            <InlineEdit
                              value={driver.email}
                              onSave={(value) => updateDriverField(driver.id, 'email', value)}
                              placeholder="Brak email"
                            />
                          ) : (
                            <InlineEdit
                              value=""
                              onSave={(value) => updateDriverField(driver.id, 'email', value)}
                              placeholder="Dodaj email"
                              className="text-muted-foreground"
                            />
                          )}
                        </div>

                        {/* Platform IDs */}
                        {driver.platform_ids && driver.platform_ids.map((platform) => (
                          <div key={platform.platform} className="flex items-center gap-2">
                            <Badge 
                              variant="outline" 
                              className={`text-xs px-2 py-1 ${getServiceColor(platform.platform).replace('bg-', 'border-').replace('text-white', 'text-primary')}`}
                            >
                              {platform.platform.toUpperCase()}
                            </Badge>
                            <InlineEdit
                              value={platform.platform_id}
                              onSave={(value) => updatePlatformId(platform.platform_id, value)}
                              truncateLength={8}
                              className="font-mono"
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(platform.platform_id, platform.platform.toUpperCase())}
                              className="h-6 w-6 p-0"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>

                      {/* Missing data indicators */}
                      <div className="flex gap-2 text-xs">
                        {!driver.phone && (
                          <Badge variant="outline" className="text-orange-600 border-orange-200">
                            Brak telefonu
                          </Badge>
                        )}
                        {!driver.email && (
                          <Badge variant="outline" className="text-orange-600 border-orange-200">
                            Brak email
                          </Badge>
                        )}
                        {(!driver.platform_ids || driver.platform_ids.length === 0) && (
                          <Badge variant="outline" className="text-red-600 border-red-200">
                            Brak platform
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
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
          driverId={editingDriver}
          onSuccess={handleEditDriver}
        />
      )}
    </>
  );
};
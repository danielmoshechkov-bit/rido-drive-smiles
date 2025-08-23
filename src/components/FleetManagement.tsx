import { useState } from 'react';
import { Search, Plus, Edit2, Car, Calendar, AlertTriangle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

interface FleetManagementProps {
  cityId: string;
  cityName: string;
}

interface Vehicle {
  id: string;
  plate: string;
  vin: string | null;
  brand: string;
  model: string;
  year: number;
  color: string | null;
  odometer: number | null;
  status: string;
  gps_external_link: string | null;
  created_at: string;
  policies: any[];
  inspections: any[];
}

const useVehicles = (cityId: string) => {
  return useQuery({
    queryKey: ['vehicles', cityId],
    queryFn: async () => {
      // Placeholder for now - will work after migration
      return [] as Vehicle[];
    },
  });
};

export const FleetManagement = ({ cityId, cityName }: FleetManagementProps) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  
  const { data: vehicles = [], isLoading, refetch } = useVehicles(cityId);

  const filteredVehicles = vehicles.filter(vehicle => {
    const matchesSearch = 
      vehicle.plate.toLowerCase().includes(searchTerm.toLowerCase()) ||
      vehicle.vin?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      `${vehicle.brand} ${vehicle.model}`.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || vehicle.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'aktywne': return 'bg-green-100 text-green-800 border-green-200';
      case 'serwis': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'sprzedane': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getExpiryStatus = (date: string) => {
    const expiryDate = new Date(date);
    const today = new Date();
    const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilExpiry < 0) return { color: 'text-red-600', icon: AlertTriangle, text: 'Przeterminowany' };
    if (daysUntilExpiry <= 7) return { color: 'text-red-600', icon: AlertTriangle, text: `${daysUntilExpiry} dni` };
    if (daysUntilExpiry <= 30) return { color: 'text-yellow-600', icon: AlertTriangle, text: `${daysUntilExpiry} dni` };
    return { color: 'text-green-600', icon: CheckCircle, text: `${daysUntilExpiry} dni` };
  };

  const getLatestPolicy = (policies: any[]) => {
    if (!policies || policies.length === 0) return null;
    return policies.reduce((latest, policy) => 
      new Date(policy.valid_to) > new Date(latest.valid_to) ? policy : latest
    );
  };

  const getLatestInspection = (inspections: any[]) => {
    if (!inspections || inspections.length === 0) return null;
    return inspections.reduce((latest, inspection) => 
      new Date(inspection.valid_to) > new Date(latest.valid_to) ? inspection : latest
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">Ładowanie floty...</p>
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
              <CardTitle className="flex items-center gap-2">
                <Car className="h-5 w-5" />
                Flota - {cityName}
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Znaleziono {filteredVehicles.length} z {vehicles.length} pojazdów
              </p>
            </div>
            <Button onClick={() => setShowAddModal(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Dodaj pojazd
            </Button>
          </div>
          
          <div className="flex items-center space-x-4 mt-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Szukaj po rejestracji, VIN, marce..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Status pojazdu" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie statusy</SelectItem>
                <SelectItem value="aktywne">Aktywne</SelectItem>
                <SelectItem value="serwis">Serwis</SelectItem>
                <SelectItem value="sprzedane">Sprzedane</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        
        <CardContent>
          {filteredVehicles.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                {vehicles.length === 0 
                  ? "Brak pojazdów w tym mieście. Dodaj pierwszy pojazd."
                  : "Nie znaleziono pojazdów pasujących do filtrów."
                }
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredVehicles.map((vehicle) => {
                const latestPolicy = getLatestPolicy(vehicle.policies);
                const latestInspection = getLatestInspection(vehicle.inspections);
                
                return (
                  <div key={vehicle.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 space-y-3">
                        {/* Vehicle header */}
                        <div className="flex items-center gap-3">
                          <h3 className="text-lg font-semibold">
                            {vehicle.plate}
                          </h3>
                          <Badge className={getStatusColor(vehicle.status)}>
                            {vehicle.status}
                          </Badge>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        </div>

                        {/* Vehicle details */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Marka/Model</p>
                            <p className="font-medium">{vehicle.brand} {vehicle.model}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Rok</p>
                            <p className="font-medium">{vehicle.year}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Kolor</p>
                            <p className="font-medium">{vehicle.color || 'Nie podano'}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Przebieg</p>
                            <p className="font-medium">
                              {vehicle.odometer ? `${vehicle.odometer.toLocaleString('pl-PL')} km` : 'Nie podano'}
                            </p>
                          </div>
                        </div>

                        {/* Expiry dates */}
                        <div className="flex items-center gap-6 flex-wrap text-sm">
                          {/* Insurance policy */}
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Polisa:</span>
                            {latestPolicy ? (
                              (() => {
                                const status = getExpiryStatus(latestPolicy.valid_to);
                                const Icon = status.icon;
                                return (
                                  <div className={`flex items-center gap-1 ${status.color}`}>
                                    <Icon className="h-3 w-3" />
                                    <span>{format(new Date(latestPolicy.valid_to), 'dd.MM.yyyy', { locale: pl })}</span>
                                    <span className="text-xs">({status.text})</span>
                                  </div>
                                );
                              })()
                            ) : (
                              <span className="text-red-600">Brak polisy</span>
                            )}
                          </div>

                          {/* Vehicle inspection */}
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span className="text-muted-foreground">Przegląd:</span>
                            {latestInspection ? (
                              (() => {
                                const status = getExpiryStatus(latestInspection.valid_to);
                                const Icon = status.icon;
                                return (
                                  <div className={`flex items-center gap-1 ${status.color}`}>
                                    <Icon className="h-3 w-3" />
                                    <span>{format(new Date(latestInspection.valid_to), 'dd.MM.yyyy', { locale: pl })}</span>
                                    <span className="text-xs">({status.text})</span>
                                  </div>
                                );
                              })()
                            ) : (
                              <span className="text-red-600">Brak przeglądu</span>
                            )}
                          </div>
                        </div>

                        {/* VIN */}
                        {vehicle.vin && (
                          <div className="text-xs text-muted-foreground">
                            VIN: {vehicle.vin}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
};
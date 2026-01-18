// GetRido Maps Admin - Parking Zones Management
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  Plus, 
  Pencil, 
  Trash2, 
  ParkingCircle, 
  MapPin, 
  Loader2,
  Clock,
  Car
} from 'lucide-react';
import { toast } from 'sonner';
import { 
  getAllParkingZones, 
  createParkingZone, 
  updateParkingZone, 
  deleteParkingZone,
  getActiveParkingSessions,
  ParkingZone,
  ParkingRules,
  ParkingSession
} from '@/components/maps/parkingService';

const ParkingZonesPanel = () => {
  const queryClient = useQueryClient();
  const [editingZone, setEditingZone] = useState<ParkingZone | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  
  // Form state
  const [formCity, setFormCity] = useState('');
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<'spp' | 'private'>('spp');
  const [formPolygon, setFormPolygon] = useState('');
  const [formRatePerHour, setFormRatePerHour] = useState('5');
  const [formMinTime, setFormMinTime] = useState('15');
  const [formMaxTime, setFormMaxTime] = useState('480');
  const [formHoursStart, setFormHoursStart] = useState('08:00');
  const [formHoursEnd, setFormHoursEnd] = useState('20:00');
  const [formActive, setFormActive] = useState(true);

  // Fetch zones
  const { data: zones = [], isLoading } = useQuery({
    queryKey: ['admin-parking-zones'],
    queryFn: getAllParkingZones,
  });

  // Fetch active sessions
  const { data: sessions = [] } = useQuery({
    queryKey: ['admin-parking-sessions'],
    queryFn: getActiveParkingSessions,
    enabled: showSessions,
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: createParkingZone,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-parking-zones'] });
      toast.success('Strefa dodana');
      resetForm();
    },
    onError: () => toast.error('Błąd podczas dodawania strefy'),
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<ParkingZone> }) => 
      updateParkingZone(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-parking-zones'] });
      toast.success('Strefa zaktualizowana');
      resetForm();
    },
    onError: () => toast.error('Błąd podczas aktualizacji strefy'),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: deleteParkingZone,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-parking-zones'] });
      toast.success('Strefa usunięta');
    },
    onError: () => toast.error('Błąd podczas usuwania strefy'),
  });

  const resetForm = () => {
    setEditingZone(null);
    setIsCreating(false);
    setFormCity('');
    setFormName('');
    setFormType('spp');
    setFormPolygon('');
    setFormRatePerHour('5');
    setFormMinTime('15');
    setFormMaxTime('480');
    setFormHoursStart('08:00');
    setFormHoursEnd('20:00');
    setFormActive(true);
  };

  const openEditDialog = (zone: ParkingZone) => {
    setEditingZone(zone);
    setFormCity(zone.city);
    setFormName(zone.name);
    setFormType(zone.type);
    setFormPolygon(JSON.stringify(zone.polygon, null, 2));
    setFormRatePerHour(String(zone.rules.ratePerHour || 5));
    setFormMinTime(String(zone.rules.minTime || 15));
    setFormMaxTime(String(zone.rules.maxTime || 480));
    setFormHoursStart(zone.rules.hours?.start || '08:00');
    setFormHoursEnd(zone.rules.hours?.end || '20:00');
    setFormActive(zone.is_active);
  };

  const handleSave = () => {
    let polygon: GeoJSON.Polygon;
    try {
      polygon = JSON.parse(formPolygon);
    } catch {
      toast.error('Nieprawidłowy format GeoJSON polygonu');
      return;
    }

    const rules: ParkingRules = {
      ratePerHour: parseFloat(formRatePerHour),
      minTime: parseInt(formMinTime),
      maxTime: parseInt(formMaxTime),
      hours: { start: formHoursStart, end: formHoursEnd },
      days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
    };

    const zoneData = {
      city: formCity,
      name: formName,
      type: formType,
      polygon,
      rules,
      is_active: formActive,
    };

    if (editingZone) {
      updateMutation.mutate({ id: editingZone.id, updates: zoneData });
    } else {
      createMutation.mutate(zoneData);
    }
  };

  const dialogOpen = isCreating || !!editingZone;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ParkingCircle className="h-6 w-6 text-amber-600" />
            Strefy Płatnego Parkowania
          </h2>
          <p className="text-muted-foreground">Zarządzaj strefami SPP i prywatnymi parkingami</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowSessions(!showSessions)}>
            <Car className="h-4 w-4 mr-2" />
            Aktywne sesje ({sessions.length})
          </Button>
          <Button onClick={() => setIsCreating(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Dodaj strefę
          </Button>
        </div>
      </div>

      {/* Active Sessions Panel */}
      {showSessions && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Aktywne sesje parkingowe</CardTitle>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">Brak aktywnych sesji</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rejestracja</TableHead>
                    <TableHead>Strefa</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>Koniec</TableHead>
                    <TableHead>Kwota</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sessions.map(session => (
                    <TableRow key={session.id}>
                      <TableCell className="font-mono font-bold">{session.vehicle_plate}</TableCell>
                      <TableCell>{session.zone?.name || '-'}</TableCell>
                      <TableCell>{new Date(session.start_at).toLocaleTimeString('pl-PL')}</TableCell>
                      <TableCell>{new Date(session.end_at).toLocaleTimeString('pl-PL')}</TableCell>
                      <TableCell>{session.amount.toFixed(2)} {session.currency}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Zones List */}
      <Card>
        <CardHeader>
          <CardTitle>Strefy parkingowe</CardTitle>
          <CardDescription>Lista wszystkich skonfigurowanych stref</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : zones.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              Brak stref. Dodaj pierwszą strefę parkingową.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Miasto</TableHead>
                  <TableHead>Nazwa</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Stawka</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {zones.map(zone => (
                  <TableRow key={zone.id}>
                    <TableCell>{zone.city}</TableCell>
                    <TableCell className="font-medium">{zone.name}</TableCell>
                    <TableCell>
                      <Badge variant={zone.type === 'spp' ? 'default' : 'secondary'}>
                        {zone.type === 'spp' ? 'SPP' : 'Prywatny'}
                      </Badge>
                    </TableCell>
                    <TableCell>{zone.rules.ratePerHour || 5} PLN/h</TableCell>
                    <TableCell>
                      <Badge variant={zone.is_active ? 'default' : 'outline'}>
                        {zone.is_active ? 'Aktywna' : 'Nieaktywna'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => openEditDialog(zone)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => {
                          if (confirm('Czy na pewno usunąć tę strefę?')) {
                            deleteMutation.mutate(zone.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => !o && resetForm()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingZone ? 'Edytuj strefę' : 'Dodaj nową strefę'}
            </DialogTitle>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Miasto</Label>
                <Input 
                  value={formCity} 
                  onChange={(e) => setFormCity(e.target.value)}
                  placeholder="np. Warszawa"
                />
              </div>
              <div className="space-y-2">
                <Label>Nazwa strefy</Label>
                <Input 
                  value={formName} 
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="np. SPP Śródmieście"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Typ</Label>
                <Select value={formType} onValueChange={(v) => setFormType(v as 'spp' | 'private')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="spp">Strefa SPP (miejska)</SelectItem>
                    <SelectItem value="private">Parking prywatny</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Stawka (PLN/h)</Label>
                <Input 
                  type="number"
                  value={formRatePerHour} 
                  onChange={(e) => setFormRatePerHour(e.target.value)}
                />
              </div>
            </div>
            
            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Min. czas (min)</Label>
                <Input 
                  type="number"
                  value={formMinTime} 
                  onChange={(e) => setFormMinTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Max. czas (min)</Label>
                <Input 
                  type="number"
                  value={formMaxTime} 
                  onChange={(e) => setFormMaxTime(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Godziny od</Label>
                <Input 
                  type="time"
                  value={formHoursStart} 
                  onChange={(e) => setFormHoursStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Godziny do</Label>
                <Input 
                  type="time"
                  value={formHoursEnd} 
                  onChange={(e) => setFormHoursEnd(e.target.value)}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Polygon (GeoJSON)</Label>
              <Textarea 
                value={formPolygon} 
                onChange={(e) => setFormPolygon(e.target.value)}
                placeholder='{"type": "Polygon", "coordinates": [[[lng, lat], ...]]}'
                rows={6}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Wprowadź GeoJSON Polygon definiujący granice strefy. 
                Koordynaty w formacie [longitude, latitude].
              </p>
            </div>
            
            <div className="flex items-center gap-2">
              <Switch checked={formActive} onCheckedChange={setFormActive} />
              <Label>Strefa aktywna</Label>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={resetForm}>Anuluj</Button>
            <Button 
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              {editingZone ? 'Zapisz zmiany' : 'Dodaj strefę'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ParkingZonesPanel;

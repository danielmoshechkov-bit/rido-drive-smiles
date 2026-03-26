import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { Car, Plus, Calendar, Shield, FileText, Camera, Wrench, ChevronDown, ChevronRight, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { format } from "date-fns";
import { pl } from "date-fns/locale";

interface ClientVehicle {
  id: string;
  plate_number: string | null;
  vin: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  engine_capacity: string | null;
  fuel_type: string | null;
  color: string | null;
  mot_expiry: string | null;
  oc_expiry: string | null;
  photos: string[];
  is_verified: boolean;
  is_sold: boolean;
  created_at: string;
}

interface ServiceRecord {
  id: string;
  service_date: string;
  mileage: number | null;
  description: string | null;
  cost: number | null;
  workshop_name: string | null;
  signed_estimate_url: string | null;
  created_at: string;
}

interface OwnershipRequest {
  id: string;
  plate_number: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  engine_capacity: string | null;
  status: string;
  created_at: string;
}

interface Props {
  userId: string;
  userPhone?: string;
}

export function ClientMyVehicles({ userId, userPhone }: Props) {
  const [vehicles, setVehicles] = useState<ClientVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [expandedVehicle, setExpandedVehicle] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<Record<string, string>>({});
  const [serviceHistory, setServiceHistory] = useState<Record<string, ServiceRecord[]>>({});
  const [ownershipRequests, setOwnershipRequests] = useState<OwnershipRequest[]>([]);
  const [verifyForm, setVerifyForm] = useState({ plate: '', vin: '', make: '', model: '', year: '', engine: '' });
  const [verifyingRequestId, setVerifyingRequestId] = useState<string | null>(null);

  // Add vehicle form
  const [newVehicle, setNewVehicle] = useState({
    plate_number: '', vin: '', make: '', model: '', year: '',
    engine_capacity: '', fuel_type: '', color: '',
    mot_expiry: '', oc_expiry: ''
  });

  useEffect(() => {
    fetchVehicles();
    fetchOwnershipRequests();
  }, [userId]);

  const fetchVehicles = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('client_vehicles')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (!error && data) setVehicles(data as any);
    setLoading(false);
  };

  const fetchOwnershipRequests = async () => {
    if (!userPhone) return;
    const { data } = await supabase
      .from('client_vehicle_ownership_requests')
      .select('*')
      .eq('phone', userPhone)
      .eq('status', 'pending');
    if (data) setOwnershipRequests(data as any);
  };

  const fetchServiceHistory = async (vehicleId: string) => {
    if (serviceHistory[vehicleId]) return;
    const { data } = await supabase
      .from('client_vehicle_service_history')
      .select('*')
      .eq('client_vehicle_id', vehicleId)
      .order('service_date', { ascending: false });
    if (data) setServiceHistory(prev => ({ ...prev, [vehicleId]: data as any }));
  };

  const handleAddVehicle = async () => {
    // Check max 1 free vehicle
    const activeVehicles = vehicles.filter(v => !v.is_sold);
    if (activeVehicles.length >= 1) {
      toast.error('Możesz dodać maksymalnie 1 auto za darmo. Kolejne będą płatne.');
      return;
    }

    if (!newVehicle.plate_number || !newVehicle.make || !newVehicle.model) {
      toast.error('Wypełnij co najmniej: nr rejestracyjny, markę i model');
      return;
    }

    const { error } = await supabase.from('client_vehicles').insert({
      user_id: userId,
      plate_number: newVehicle.plate_number,
      vin: newVehicle.vin || null,
      make: newVehicle.make,
      model: newVehicle.model,
      year: newVehicle.year ? parseInt(newVehicle.year) : null,
      engine_capacity: newVehicle.engine_capacity || null,
      fuel_type: newVehicle.fuel_type || null,
      color: newVehicle.color || null,
      mot_expiry: newVehicle.mot_expiry || null,
      oc_expiry: newVehicle.oc_expiry || null,
    });

    if (error) {
      toast.error('Błąd dodawania pojazdu');
      console.error(error);
    } else {
      toast.success('Pojazd dodany!');
      setShowAddVehicle(false);
      setNewVehicle({ plate_number: '', vin: '', make: '', model: '', year: '', engine_capacity: '', fuel_type: '', color: '', mot_expiry: '', oc_expiry: '' });
      fetchVehicles();
    }
  };

  const handleVerifyOwnership = async (requestId: string) => {
    const request = ownershipRequests.find(r => r.id === requestId);
    if (!request) return;

    // Compare fields
    const matches = [
      verifyForm.plate.toLowerCase() === (request.plate_number || '').toLowerCase(),
      verifyForm.vin.toLowerCase() === (request.vin || '').toLowerCase(),
      verifyForm.make.toLowerCase() === (request.make || '').toLowerCase(),
      verifyForm.model.toLowerCase() === (request.model || '').toLowerCase(),
    ].filter(Boolean).length;

    if (matches < 3) {
      toast.error('Dane nie pasują do pojazdu. Sprawdź i spróbuj ponownie.');
      return;
    }

    // Verify and add vehicle
    const { error: vehicleError } = await supabase.from('client_vehicles').insert({
      user_id: userId,
      plate_number: request.plate_number,
      vin: request.vin,
      make: request.make,
      model: request.model,
      year: request.year,
      engine_capacity: request.engine_capacity,
      workshop_vehicle_id: (request as any).workshop_vehicle_id,
      is_verified: true,
      verified_at: new Date().toISOString(),
    });

    if (!vehicleError) {
      await supabase.from('client_vehicle_ownership_requests')
        .update({ status: 'verified', verified_by_user_id: userId, verified_at: new Date().toISOString() })
        .eq('id', requestId);

      toast.success('Pojazd zweryfikowany i dodany do Twojego konta!');
      setVerifyingRequestId(null);
      fetchVehicles();
      fetchOwnershipRequests();
    } else {
      toast.error('Błąd weryfikacji');
    }
  };

  const getSubTab = (vehicleId: string) => activeSubTab[vehicleId] || 'info';
  const setSubTab = (vehicleId: string, tab: string) => {
    setActiveSubTab(prev => ({ ...prev, [vehicleId]: tab }));
    if (tab === 'serwis') fetchServiceHistory(vehicleId);
  };

  const isDateExpiringSoon = (dateStr: string | null) => {
    if (!dateStr) return false;
    const diff = new Date(dateStr).getTime() - Date.now();
    return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000; // 30 days
  };

  const isDateExpired = (dateStr: string | null) => {
    if (!dateStr) return false;
    return new Date(dateStr).getTime() < Date.now();
  };

  const subTabs = [
    { id: 'info', label: 'Info', icon: Info },
    { id: 'dokumenty', label: 'Dokumenty', icon: FileText },
    { id: 'serwis', label: 'Serwis', icon: Wrench },
    { id: 'zdjecia', label: 'Zdjęcia', icon: Camera },
  ];

  return (
    <div className="space-y-4">
      {/* Ownership Requests */}
      {ownershipRequests.length > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-amber-800">
              <AlertTriangle className="h-5 w-5" />
              Potwierdzenie własności pojazdu
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {ownershipRequests.map(req => (
              <div key={req.id} className="p-3 bg-white rounded-lg border">
                <p className="text-sm mb-2">
                  Wykryto naprawę pojazdu <strong>{req.make} {req.model}</strong> ({req.plate_number}) powiązaną z Twoim numerem telefonu.
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  Aby potwierdzić własność, wprowadź dane z dowodu rejestracyjnego.
                </p>
                {verifyingRequestId === req.id ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div><Label className="text-xs">Nr rejestracyjny</Label><Input value={verifyForm.plate} onChange={e => setVerifyForm({...verifyForm, plate: e.target.value})} placeholder="XX 12345" /></div>
                      <div><Label className="text-xs">VIN</Label><Input value={verifyForm.vin} onChange={e => setVerifyForm({...verifyForm, vin: e.target.value})} /></div>
                      <div><Label className="text-xs">Marka</Label><Input value={verifyForm.make} onChange={e => setVerifyForm({...verifyForm, make: e.target.value})} /></div>
                      <div><Label className="text-xs">Model</Label><Input value={verifyForm.model} onChange={e => setVerifyForm({...verifyForm, model: e.target.value})} /></div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => handleVerifyOwnership(req.id)}>Potwierdź</Button>
                      <Button size="sm" variant="outline" onClick={() => setVerifyingRequestId(null)}>Anuluj</Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setVerifyingRequestId(req.id)}>
                    Weryfikuj własność
                  </Button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Car className="h-5 w-5 text-primary" />
          Moje auta
        </h2>
        <Button size="sm" onClick={() => setShowAddVehicle(true)} disabled={vehicles.filter(v => !v.is_sold).length >= 1}>
          <Plus className="h-4 w-4 mr-1" /> Dodaj auto
        </Button>
      </div>

      {vehicles.filter(v => !v.is_sold).length >= 1 && (
        <p className="text-xs text-muted-foreground">
          1 auto za darmo. Kolejne będą płatne — kwota zostanie ogłoszona wkrótce.
        </p>
      )}

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Ładowanie...</div>
      ) : vehicles.length === 0 ? (
        <Card className="text-center py-8">
          <CardContent>
            <Car className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-muted-foreground">Nie masz jeszcze żadnego pojazdu</p>
            <Button size="sm" className="mt-3" onClick={() => setShowAddVehicle(true)}>
              <Plus className="h-4 w-4 mr-1" /> Dodaj swoje auto
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {vehicles.map(vehicle => (
            <Card key={vehicle.id} className="overflow-hidden">
              <Collapsible open={expandedVehicle === vehicle.id} onOpenChange={(open) => setExpandedVehicle(open ? vehicle.id : null)}>
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10">
                        <Car className="h-5 w-5 text-primary" />
                      </div>
                      <div className="text-left">
                        <p className="font-semibold">{vehicle.make} {vehicle.model} {vehicle.year && `(${vehicle.year})`}</p>
                        <p className="text-sm text-muted-foreground">{vehicle.plate_number}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {vehicle.is_verified && <Badge variant="outline" className="text-emerald-600 border-emerald-300"><CheckCircle className="h-3 w-3 mr-1" />Zweryfikowany</Badge>}
                      {vehicle.is_sold && <Badge variant="secondary">Sprzedany</Badge>}
                      {isDateExpired(vehicle.mot_expiry) && <Badge variant="destructive" className="text-xs">Przegląd!</Badge>}
                      {isDateExpired(vehicle.oc_expiry) && <Badge variant="destructive" className="text-xs">OC!</Badge>}
                      {isDateExpiringSoon(vehicle.mot_expiry) && !isDateExpired(vehicle.mot_expiry) && <Badge className="bg-amber-500 text-xs">Przegląd wkrótce</Badge>}
                      {isDateExpiringSoon(vehicle.oc_expiry) && !isDateExpired(vehicle.oc_expiry) && <Badge className="bg-amber-500 text-xs">OC wkrótce</Badge>}
                      {expandedVehicle === vehicle.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  {/* Sub-tabs */}
                  <div className="px-4 border-t">
                    <div className="flex gap-1 py-2">
                      {subTabs.map(tab => {
                        const Icon = tab.icon;
                        const isActive = getSubTab(vehicle.id) === tab.id;
                        return (
                          <button key={tab.id} onClick={() => setSubTab(vehicle.id, tab.id)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition-colors ${
                              isActive ? 'text-white' : 'text-muted-foreground hover:text-foreground'
                            }`}
                            style={isActive ? { backgroundColor: 'var(--nav-bar-color, hsl(var(--primary)))' } : {}}
                            onMouseEnter={e => { if (!isActive) { (e.target as HTMLElement).style.backgroundColor = '#F5C842'; (e.target as HTMLElement).style.color = '#1a1a1a'; }}}
                            onMouseLeave={e => { if (!isActive) { (e.target as HTMLElement).style.backgroundColor = ''; (e.target as HTMLElement).style.color = ''; }}}
                          >
                            <Icon className="h-3.5 w-3.5" /> {tab.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="p-4 pt-2 border-t">
                    {/* Info tab */}
                    {getSubTab(vehicle.id) === 'info' && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                        <div><span className="text-muted-foreground">Marka:</span><p className="font-medium">{vehicle.make || '—'}</p></div>
                        <div><span className="text-muted-foreground">Model:</span><p className="font-medium">{vehicle.model || '—'}</p></div>
                        <div><span className="text-muted-foreground">Rok:</span><p className="font-medium">{vehicle.year || '—'}</p></div>
                        <div><span className="text-muted-foreground">Nr rej.:</span><p className="font-medium">{vehicle.plate_number || '—'}</p></div>
                        <div><span className="text-muted-foreground">VIN:</span><p className="font-medium text-xs">{vehicle.vin || '—'}</p></div>
                        <div><span className="text-muted-foreground">Silnik:</span><p className="font-medium">{vehicle.engine_capacity || '—'}</p></div>
                        <div><span className="text-muted-foreground">Paliwo:</span><p className="font-medium">{vehicle.fuel_type || '—'}</p></div>
                        <div><span className="text-muted-foreground">Kolor:</span><p className="font-medium">{vehicle.color || '—'}</p></div>
                        <div>
                          <span className="text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" />Przegląd do:</span>
                          <p className={`font-medium ${isDateExpired(vehicle.mot_expiry) ? 'text-destructive' : isDateExpiringSoon(vehicle.mot_expiry) ? 'text-amber-600' : ''}`}>
                            {vehicle.mot_expiry ? format(new Date(vehicle.mot_expiry), 'dd.MM.yyyy') : '—'}
                          </p>
                        </div>
                        <div>
                          <span className="text-muted-foreground flex items-center gap-1"><Shield className="h-3 w-3" />OC do:</span>
                          <p className={`font-medium ${isDateExpired(vehicle.oc_expiry) ? 'text-destructive' : isDateExpiringSoon(vehicle.oc_expiry) ? 'text-amber-600' : ''}`}>
                            {vehicle.oc_expiry ? format(new Date(vehicle.oc_expiry), 'dd.MM.yyyy') : '—'}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Dokumenty tab */}
                    {getSubTab(vehicle.id) === 'dokumenty' && (
                      <div className="text-center py-6 text-muted-foreground text-sm">
                        <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        Dokumenty pojazdu będą dostępne wkrótce
                      </div>
                    )}

                    {/* Serwis tab */}
                    {getSubTab(vehicle.id) === 'serwis' && (
                      <div>
                        {(serviceHistory[vehicle.id] || []).length === 0 ? (
                          <div className="text-center py-6 text-muted-foreground text-sm">
                            <Wrench className="h-8 w-8 mx-auto mb-2 opacity-40" />
                            Brak historii serwisowej
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {serviceHistory[vehicle.id].map(record => (
                              <div key={record.id} className="p-3 border rounded-lg text-sm">
                                <div className="flex justify-between items-start">
                                  <div>
                                    <p className="font-medium">{record.description || 'Serwis'}</p>
                                    <p className="text-xs text-muted-foreground">{record.workshop_name}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="font-medium">{record.cost ? `${record.cost} PLN` : ''}</p>
                                    <p className="text-xs text-muted-foreground">{format(new Date(record.service_date), 'dd.MM.yyyy')}</p>
                                  </div>
                                </div>
                                {record.mileage && <p className="text-xs mt-1 text-muted-foreground">Przebieg: {record.mileage.toLocaleString()} km</p>}
                                {record.signed_estimate_url && (
                                  <Button variant="link" size="sm" className="p-0 h-auto text-xs mt-1">
                                    <FileText className="h-3 w-3 mr-1" /> Pobierz kosztorys
                                  </Button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Zdjęcia tab */}
                    {getSubTab(vehicle.id) === 'zdjecia' && (
                      <div className="text-center py-6 text-muted-foreground text-sm">
                        <Camera className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        Zdjęcia pojazdu będą dostępne wkrótce
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))}
        </div>
      )}

      {/* Add Vehicle Dialog */}
      <Dialog open={showAddVehicle} onOpenChange={setShowAddVehicle}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Car className="h-5 w-5 text-primary" /> Dodaj swoje auto</DialogTitle>
            <DialogDescription>Wprowadź dane pojazdu z dowodu rejestracyjnego</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nr rejestracyjny *</Label>
                <Input value={newVehicle.plate_number} onChange={e => setNewVehicle({...newVehicle, plate_number: e.target.value.toUpperCase()})} placeholder="XX 12345" />
              </div>
              <div className="space-y-1.5">
                <Label>VIN</Label>
                <Input value={newVehicle.vin} onChange={e => setNewVehicle({...newVehicle, vin: e.target.value.toUpperCase()})} placeholder="17 znaków" maxLength={17} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Marka *</Label>
                <Input value={newVehicle.make} onChange={e => setNewVehicle({...newVehicle, make: e.target.value})} placeholder="np. Toyota" />
              </div>
              <div className="space-y-1.5">
                <Label>Model *</Label>
                <Input value={newVehicle.model} onChange={e => setNewVehicle({...newVehicle, model: e.target.value})} placeholder="np. Corolla" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label>Rok</Label>
                <Input type="number" value={newVehicle.year} onChange={e => setNewVehicle({...newVehicle, year: e.target.value})} placeholder="2020" />
              </div>
              <div className="space-y-1.5">
                <Label>Pojemność</Label>
                <Input value={newVehicle.engine_capacity} onChange={e => setNewVehicle({...newVehicle, engine_capacity: e.target.value})} placeholder="2.0" />
              </div>
              <div className="space-y-1.5">
                <Label>Paliwo</Label>
                <Input value={newVehicle.fuel_type} onChange={e => setNewVehicle({...newVehicle, fuel_type: e.target.value})} placeholder="Benzyna" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Kolor</Label>
              <Input value={newVehicle.color} onChange={e => setNewVehicle({...newVehicle, color: e.target.value})} placeholder="np. Srebrny" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Przegląd ważny do</Label>
                <Input type="date" value={newVehicle.mot_expiry} onChange={e => setNewVehicle({...newVehicle, mot_expiry: e.target.value})} />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1"><Shield className="h-3 w-3" /> OC ważne do</Label>
                <Input type="date" value={newVehicle.oc_expiry} onChange={e => setNewVehicle({...newVehicle, oc_expiry: e.target.value})} />
              </div>
            </div>
            <Button className="w-full" onClick={handleAddVehicle}>Dodaj pojazd</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

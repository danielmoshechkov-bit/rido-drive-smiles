import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Car, FileText, Wrench, Info, Plus, Calendar } from "lucide-react";
import { format, differenceInDays, parseISO } from "date-fns";
import { pl } from "date-fns/locale";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

interface OwnVehicle {
  id: string;
  brand: string;
  model: string;
  plate: string;
  year?: number;
  color?: string;
  vin?: string;
  odometer?: number;
  assigned_at: string;
  vehicle_inspections?: Array<{ valid_to: string; id?: string; date?: string; result?: string; notes?: string }>;
  vehicle_policies?: Array<{ valid_to: string; type: string; id?: string; policy_no?: string; provider?: string; valid_from?: string }>;
}

interface VehicleService {
  id: string;
  date: string;
  type: string;
  description: string;
  cost: number;
  odometer?: number;
  notes?: string;
  provider?: string;
}

export const OwnCarCard = ({ vehicle }: { vehicle: OwnVehicle }) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("info");
  const [services, setServices] = useState<VehicleService[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddServiceModal, setShowAddServiceModal] = useState(false);
  
  // Add service form state
  const [newService, setNewService] = useState({
    type: "",
    description: "",
    cost: 0,
    odometer: vehicle.odometer || 0,
    notes: "",
    date: new Date().toISOString().slice(0, 10)
  });

  useEffect(() => {
    if (activeTab === "service") {
      loadServices();
    }
  }, [vehicle.id, activeTab]);

  const loadServices = async () => {
    try {
      const { data, error } = await supabase
        .from("vehicle_services")
        .select("*")
        .eq("vehicle_id", vehicle.id)
        .order("date", { ascending: false });
      
      if (error) throw error;
      setServices(data || []);
    } catch (error) {
      console.error("Error loading services:", error);
    }
  };

  const handleAddService = async () => {
    if (!newService.description || !newService.date) {
      toast.error("Uzupełnij opis i datę serwisu");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from("vehicle_services")
        .insert({
          vehicle_id: vehicle.id,
          type: newService.type || "inne",
          description: newService.description,
          cost: newService.cost || 0,
          odometer: newService.odometer || null,
          notes: newService.notes || null,
          date: newService.date
        });

      if (error) throw error;

      // Update vehicle odometer if provided
      if (newService.odometer && newService.odometer > (vehicle.odometer || 0)) {
        await supabase
          .from("vehicles")
          .update({ odometer: newService.odometer })
          .eq("id", vehicle.id);
      }

      toast.success("Serwis dodany");
      setShowAddServiceModal(false);
      setNewService({
        type: "",
        description: "",
        cost: 0,
        odometer: vehicle.odometer || 0,
        notes: "",
        date: new Date().toISOString().slice(0, 10)
      });
      loadServices();
    } catch (error: any) {
      console.error("Error adding service:", error);
      toast.error(error?.message || "Błąd dodawania serwisu");
    } finally {
      setLoading(false);
    }
  };

  const getExpiryBadge = (dateStr: string | undefined) => {
    if (!dateStr) return <Badge variant="secondary" className="text-xs">Brak danych</Badge>;
    const daysLeft = differenceInDays(parseISO(dateStr), new Date());
    
    if (daysLeft < 0) {
      return <Badge variant="destructive" className="text-xs">Wygasło</Badge>;
    } else if (daysLeft <= 14) {
      return <Badge className="bg-orange-500 text-white text-xs">Za {daysLeft} dni</Badge>;
    } else if (daysLeft <= 30) {
      return <Badge className="bg-yellow-500 text-black text-xs">Za {daysLeft} dni</Badge>;
    }
    return <Badge variant="secondary" className="text-xs">{format(parseISO(dateStr), "dd.MM.yyyy")}</Badge>;
  };

  const latestInspection = vehicle.vehicle_inspections?.[0];
  const latestPolicy = vehicle.vehicle_policies?.find(p => p.type === "OC");

  return (
    <>
      <Card className="rounded-2xl border shadow-soft">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-xl">
                <Car className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">{vehicle.brand} {vehicle.model}</CardTitle>
                <p className="text-sm text-muted-foreground font-mono">{vehicle.plate}</p>
              </div>
            </div>
            <Badge variant="outline" className="text-xs">Własne auto</Badge>
          </div>
        </CardHeader>
        
        <CardContent className="pt-2">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3 mb-4">
              <TabsTrigger value="info" className="text-xs">
                <Info className="h-3 w-3 mr-1" />
                Info
              </TabsTrigger>
              <TabsTrigger value="docs" className="text-xs">
                <FileText className="h-3 w-3 mr-1" />
                Dokumenty
              </TabsTrigger>
              <TabsTrigger value="service" className="text-xs">
                <Wrench className="h-3 w-3 mr-1" />
                Serwis
              </TabsTrigger>
            </TabsList>

            <TabsContent value="info" className="space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Rok:</span>
                  <span className="ml-2 font-medium">{vehicle.year || "-"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Kolor:</span>
                  <span className="ml-2 font-medium">{vehicle.color || "-"}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">VIN:</span>
                  <span className="ml-2 font-mono text-xs">{vehicle.vin || "-"}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground">Przebieg:</span>
                  <span className="ml-2 font-medium">{vehicle.odometer ? `${vehicle.odometer.toLocaleString()} km` : "-"}</span>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="docs" className="space-y-3">
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Przegląd</span>
                  </div>
                  {getExpiryBadge(latestInspection?.valid_to)}
                </div>
                
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">OC</span>
                  </div>
                  {getExpiryBadge(latestPolicy?.valid_to)}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="service" className="space-y-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-medium">Historia serwisów</span>
                <Button size="sm" variant="outline" onClick={() => setShowAddServiceModal(true)}>
                  <Plus className="h-3 w-3 mr-1" />
                  Dodaj
                </Button>
              </div>
              
              {services.length === 0 ? (
                <div className="text-center text-muted-foreground py-4 text-sm">
                  Brak wpisów serwisowych
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {services.map((service) => (
                    <div key={service.id} className="p-3 bg-muted/50 rounded-lg text-sm">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium">{service.description}</div>
                          <div className="text-xs text-muted-foreground">
                            {format(parseISO(service.date), "dd.MM.yyyy", { locale: pl })}
                            {service.odometer && ` • ${service.odometer.toLocaleString()} km`}
                          </div>
                        </div>
                        {service.cost > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {service.cost.toFixed(2)} zł
                          </Badge>
                        )}
                      </div>
                      {service.notes && (
                        <div className="text-xs text-muted-foreground mt-1">{service.notes}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Add Service Modal */}
      <Dialog open={showAddServiceModal} onOpenChange={setShowAddServiceModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dodaj wpis serwisowy</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Data serwisu *</Label>
              <Input 
                type="date" 
                value={newService.date}
                onChange={(e) => setNewService(prev => ({ ...prev, date: e.target.value }))}
              />
            </div>
            
            <div>
              <Label>Opis *</Label>
              <Input 
                value={newService.description}
                onChange={(e) => setNewService(prev => ({ ...prev, description: e.target.value }))}
                placeholder="np. Wymiana oleju"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Koszt (zł)</Label>
                <Input 
                  type="number"
                  value={newService.cost || ""}
                  onChange={(e) => setNewService(prev => ({ ...prev, cost: Number(e.target.value) }))}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Przebieg (km)</Label>
                <Input 
                  type="number"
                  value={newService.odometer || ""}
                  onChange={(e) => setNewService(prev => ({ ...prev, odometer: Number(e.target.value) }))}
                  placeholder="np. 150000"
                />
              </div>
            </div>
            
            <div>
              <Label>Notatki</Label>
              <Textarea 
                value={newService.notes}
                onChange={(e) => setNewService(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Dodatkowe informacje..."
                rows={2}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddServiceModal(false)}>
              Anuluj
            </Button>
            <Button onClick={handleAddService} disabled={loading}>
              {loading ? "Zapisywanie..." : "Zapisz"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface VehicleInfoTabProps {
  vehicle: any;
  onSave: (vehicleId: string, data: any) => void;
}

const FUEL_TYPES = [
  { value: "benzyna", label: "Benzyna" },
  { value: "diesel", label: "Diesel" },
  { value: "hybryda", label: "Hybryda" },
  { value: "gaz", label: "Gaz" },
  { value: "hybryda_gaz", label: "Hybryda + Gaz" },
  { value: "elektryk", label: "Elektryk" },
];

export const VehicleInfoTab = ({ vehicle, onSave }: VehicleInfoTabProps) => {
  const [formData, setFormData] = useState({
    plate: vehicle.plate || "",
    vin: vehicle.vin || "",
    brand: vehicle.brand || "",
    model: vehicle.model || "",
    year: vehicle.year ?? "",
    color: vehicle.color || "",
    fuel_type: vehicle.fuel_type || "",
  });

  // Sync with vehicle prop changes
  useEffect(() => {
    setFormData({
      plate: vehicle.plate || "",
      vin: vehicle.vin || "",
      brand: vehicle.brand || "",
      model: vehicle.model || "",
      year: vehicle.year ?? "",
      color: vehicle.color || "",
      fuel_type: vehicle.fuel_type || "",
    });
  }, [vehicle]);

  const handleSave = (field: string, value: any) => {
    let processedValue = value;
    
    if (field === 'plate' || field === 'vin') {
      processedValue = value.toUpperCase();
    }
    if (field === 'year') {
      processedValue = value ? Number(value) : null;
    }
    if (field === 'color' && !value) {
      processedValue = null;
    }
    
    setFormData(prev => ({ ...prev, [field]: processedValue }));
    onSave(vehicle.id, { [field]: processedValue });
  };

  return (
    <Card className="rounded-lg border border-border/50">
      <CardHeader>
        <CardTitle>Dane pojazdu</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-muted-foreground">Nr rejestracyjny</label>
          <Input 
            value={formData.plate}
            onChange={e => setFormData(prev => ({ ...prev, plate: e.target.value.toUpperCase() }))}
            onBlur={e => handleSave('plate', e.target.value)}
            className="uppercase rounded-lg" 
          />
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">VIN</label>
          <Input 
            value={formData.vin}
            onChange={e => setFormData(prev => ({ ...prev, vin: e.target.value.toUpperCase() }))}
            onBlur={e => handleSave('vin', e.target.value)}
            className="uppercase rounded-lg" 
          />
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">Marka</label>
          <Input 
            value={formData.brand}
            onChange={e => setFormData(prev => ({ ...prev, brand: e.target.value }))}
            onBlur={e => handleSave('brand', e.target.value)}
            className="rounded-lg"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">Model</label>
          <Input 
            value={formData.model}
            onChange={e => setFormData(prev => ({ ...prev, model: e.target.value }))}
            onBlur={e => handleSave('model', e.target.value)}
            className="rounded-lg"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">Rok</label>
          <Input 
            type="number" 
            value={formData.year}
            onChange={e => setFormData(prev => ({ ...prev, year: e.target.value }))}
            onBlur={e => handleSave('year', e.target.value)}
            className="rounded-lg"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">Kolor</label>
          <Input 
            value={formData.color}
            onChange={e => setFormData(prev => ({ ...prev, color: e.target.value }))}
            onBlur={e => handleSave('color', e.target.value)}
            className="rounded-lg"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">Rodzaj paliwa</label>
          <Select 
            value={formData.fuel_type} 
            onValueChange={value => handleSave('fuel_type', value)}
          >
            <SelectTrigger className="rounded-lg">
              <SelectValue placeholder="Wybierz rodzaj paliwa" />
            </SelectTrigger>
            <SelectContent>
              {FUEL_TYPES.map(fuel => (
                <SelectItem key={fuel.value} value={fuel.value}>
                  {fuel.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
};

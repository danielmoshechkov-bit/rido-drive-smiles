import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CarBrandModelSelector } from "@/components/CarBrandModelSelector";
import { InlineEdit } from "@/components/InlineEdit";

interface VehicleInfoTabProps {
  vehicle: any;
  onSave: (vehicleId: string, data: any) => void;
}

const FUEL_TYPES = [
  { value: "benzyna", label: "Benzyna" },
  { value: "diesel", label: "Diesel" },
  { value: "hybryda", label: "Hybryda" },
  { value: "lpg", label: "LPG" },
  { value: "hybryda_gaz", label: "Hybryda + Gaz" },
  { value: "elektryczny", label: "Elektryczny" },
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

  const handleBrandChange = (newBrand: string) => {
    setFormData(prev => ({ ...prev, brand: newBrand, model: "" }));
    onSave(vehicle.id, { brand: newBrand });
  };

  const handleModelChange = (newModel: string) => {
    setFormData(prev => ({ ...prev, model: newModel }));
    onSave(vehicle.id, { model: newModel });
  };

  return (
    <Card className="rounded-lg border border-border/50">
      <CardHeader>
        <CardTitle>Dane pojazdu</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-muted-foreground">Nr rejestracyjny</label>
          <InlineEdit
            value={formData.plate}
            onSave={async (val) => handleSave('plate', val)}
            placeholder="Wpisz nr rejestracyjny"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">VIN</label>
          <InlineEdit
            value={formData.vin}
            onSave={async (val) => handleSave('vin', val)}
            placeholder="Wpisz numer VIN"
          />
        </div>
        
        {/* Car Brand/Model Selector - spans full width */}
        <div className="sm:col-span-2">
          <CarBrandModelSelector
            brand={formData.brand}
            model={formData.model}
            onBrandChange={handleBrandChange}
            onModelChange={handleModelChange}
          />
        </div>

        <div>
          <label className="text-sm font-medium text-muted-foreground">Rok</label>
          <InlineEdit
            value={formData.year?.toString() || ""}
            onSave={async (val) => handleSave('year', val)}
            placeholder="Wpisz rok"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">Kolor</label>
          <InlineEdit
            value={formData.color}
            onSave={async (val) => handleSave('color', val)}
            placeholder="Wpisz kolor"
          />
        </div>
        <div className="sm:col-span-2">
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

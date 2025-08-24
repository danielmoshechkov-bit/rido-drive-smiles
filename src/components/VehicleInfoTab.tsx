import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface VehicleInfoTabProps {
  vehicle: any;
  onSave: (vehicleId: string, data: any) => void;
}

export const VehicleInfoTab = ({ vehicle, onSave }: VehicleInfoTabProps) => {
  return (
    <Card className="rounded-lg border border-border/50">
      <CardHeader>
        <CardTitle>Dane pojazdu</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-muted-foreground">Nr rejestracyjny</label>
          <Input 
            defaultValue={vehicle.plate} 
            onBlur={e => onSave(vehicle.id, { plate: e.target.value })} 
            className="uppercase rounded-lg" 
          />
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">VIN</label>
          <Input 
            defaultValue={vehicle.vin ?? ""} 
            onBlur={e => onSave(vehicle.id, { vin: e.target.value })} 
            className="uppercase rounded-lg" 
          />
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">Marka</label>
          <Input 
            defaultValue={vehicle.brand} 
            onBlur={e => onSave(vehicle.id, { brand: e.target.value })} 
            className="rounded-lg"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">Model</label>
          <Input 
            defaultValue={vehicle.model} 
            onBlur={e => onSave(vehicle.id, { model: e.target.value })} 
            className="rounded-lg"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">Rok</label>
          <Input 
            type="number" 
            defaultValue={vehicle.year ?? ""} 
            onBlur={e => onSave(vehicle.id, { year: e.target.value ? Number(e.target.value) : null })} 
            className="rounded-lg"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-muted-foreground">Kolor</label>
          <Input 
            defaultValue={vehicle.color ?? ""} 
            onBlur={e => onSave(vehicle.id, { color: e.target.value || null })} 
            className="rounded-lg"
          />
        </div>
      </CardContent>
    </Card>
  );
};
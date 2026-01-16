import { 
  Car, Calendar, Fuel, Gauge, Settings, Palette, 
  Zap, Hash, Shield
} from "lucide-react";
import { cn } from "@/lib/utils";

interface VehicleSpecsTableProps {
  listing: {
    brand?: string;
    model?: string;
    year?: number;
    fuelType?: string;
    odometer?: number;
    engineCapacity?: number;
    power?: number;
    bodyType?: string;
    color?: string;
    vin?: string;
  };
}

const FUEL_TYPE_LABELS: Record<string, string> = {
  benzyna: "Benzyna",
  diesel: "Diesel",
  hybryda: "Hybryda",
  elektryczny: "Elektryczny",
  lpg: "LPG",
  cng: "CNG",
};

const BODY_TYPE_LABELS: Record<string, string> = {
  sedan: "Sedan",
  kombi: "Kombi",
  hatchback: "Hatchback",
  suv: "SUV",
  crossover: "Crossover",
  coupe: "Coupe",
  kabriolet: "Kabriolet",
  van: "Van",
  pickup: "Pickup",
  minivan: "Minivan",
};

export function VehicleSpecsTable({ listing }: VehicleSpecsTableProps) {
  const specs = [
    {
      icon: Car,
      label: "Marka i model",
      value: listing.brand && listing.model ? `${listing.brand} ${listing.model}` : null,
      show: listing.brand || listing.model,
    },
    {
      icon: Calendar,
      label: "Rok produkcji",
      value: listing.year?.toString(),
      show: !!listing.year,
    },
    {
      icon: Fuel,
      label: "Paliwo",
      value: listing.fuelType ? FUEL_TYPE_LABELS[listing.fuelType] || listing.fuelType : null,
      show: !!listing.fuelType,
    },
    {
      icon: Gauge,
      label: "Przebieg",
      value: listing.odometer ? `${(listing.odometer / 1000).toFixed(0)} tys. km` : null,
      show: !!listing.odometer,
    },
    {
      icon: Zap,
      label: "Moc",
      value: listing.power ? `${listing.power} KM` : null,
      show: !!listing.power,
    },
    {
      icon: Settings,
      label: "Pojemność",
      value: listing.engineCapacity && listing.engineCapacity > 0 
        ? `${(listing.engineCapacity / 1000).toFixed(1)} L (${listing.engineCapacity} cm³)` 
        : null,
      show: listing.engineCapacity && listing.engineCapacity > 0,
    },
    {
      icon: Car,
      label: "Nadwozie",
      value: listing.bodyType ? BODY_TYPE_LABELS[listing.bodyType] || listing.bodyType : null,
      show: !!listing.bodyType,
    },
    {
      icon: Palette,
      label: "Kolor",
      value: listing.color,
      show: !!listing.color,
    },
    {
      icon: Hash,
      label: "VIN",
      value: listing.vin,
      show: !!listing.vin,
    },
  ].filter(spec => spec.show && spec.value);

  if (specs.length === 0) return null;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Specyfikacja</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {specs.map((spec, idx) => (
          <div 
            key={idx} 
            className="flex items-start gap-3 p-3 rounded-lg bg-muted/50"
          >
            <spec.icon className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">{spec.label}</p>
              <p className="font-medium text-sm">{spec.value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

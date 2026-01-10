import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  ArrowLeft, X, Star, MapPin, Calendar, Fuel, Gauge, Zap, Phone, Mail, GitCompare
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompare, VehicleCompareItem } from "@/contexts/CompareContext";

const FUEL_LABELS: Record<string, string> = {
  benzyna: "Benzyna",
  diesel: "Diesel",
  hybryda: "Hybryda",
  lpg: "LPG",
  elektryczny: "Elektryk",
};

const BODY_TYPE_LABELS: Record<string, string> = {
  sedan: "Sedan",
  kombi: "Kombi",
  hatchback: "Hatchback",
  suv: "SUV",
  coupe: "Coupe",
  cabrio: "Cabrio",
  minivan: "Minivan",
  pickup: "Pickup",
};

export default function VehicleCompare() {
  const navigate = useNavigate();
  const { vehicleItems, removeVehicle, clearVehicles } = useCompare();

  if (vehicleItems.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center">
        <div className="text-center">
          <GitCompare className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Brak ofert do porównania</h2>
          <p className="text-muted-foreground mb-4">Wybierz co najmniej 2 oferty z giełdy</p>
          <Button onClick={() => navigate('/gielda')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Wróć do giełdy
          </Button>
        </div>
      </div>
    );
  }

  const parameters = [
    { key: "price", label: "Cena / tydzień", format: (v: VehicleCompareItem) => v.price ? `${v.price.toLocaleString()} zł` : "—" },
    { key: "year", label: "Rok produkcji", format: (v: VehicleCompareItem) => v.year || "—" },
    { key: "fuelType", label: "Paliwo", format: (v: VehicleCompareItem) => v.fuelType ? (FUEL_LABELS[v.fuelType.toLowerCase()] || v.fuelType) : "—" },
    { key: "mileage", label: "Przebieg", format: (v: VehicleCompareItem) => v.mileage ? `${v.mileage.toLocaleString()} km` : "—" },
    { key: "power", label: "Moc", format: (v: VehicleCompareItem) => v.power ? `${v.power} KM` : "—" },
    { key: "engineCapacity", label: "Pojemność", format: (v: VehicleCompareItem) => v.engineCapacity ? `${(v.engineCapacity / 1000).toFixed(1)} L` : "—" },
    { key: "bodyType", label: "Typ nadwozia", format: (v: VehicleCompareItem) => v.bodyType ? (BODY_TYPE_LABELS[v.bodyType.toLowerCase()] || v.bodyType) : "—" },
    { key: "location", label: "Lokalizacja", format: (v: VehicleCompareItem) => v.location || "—" },
    { key: "rating", label: "Ocena floty", format: (v: VehicleCompareItem) => v.rating ? `★ ${v.rating.toFixed(1)}` : "—" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate('/gielda')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Wróć do giełdy
          </Button>
          <h1 className="text-lg font-bold">
            <GitCompare className="h-5 w-5 inline-block mr-2 text-primary" />
            Porównanie pojazdów
          </h1>
          <Button variant="outline" size="sm" onClick={clearVehicles}>
            Wyczyść wszystkie
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            {/* Vehicle Headers */}
            <thead>
              <tr>
                <th className="w-40 p-2 text-left text-sm font-medium text-muted-foreground">
                  Parametr
                </th>
                {vehicleItems.map((item) => (
                  <th key={item.id} className="p-2 min-w-[200px]">
                    <Card className="relative overflow-hidden group">
                      <button
                        onClick={() => removeVehicle(item.id)}
                        className="absolute top-2 right-2 z-10 bg-destructive text-destructive-foreground rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      <img
                        src={item.photo || "/placeholder.svg"}
                        alt={item.title}
                        className="w-full h-32 object-cover"
                      />
                      <div className="p-3 text-center">
                        <h3 className="font-semibold text-sm line-clamp-1">{item.title}</h3>
                      </div>
                    </Card>
                  </th>
                ))}
                {/* Empty slots */}
                {Array.from({ length: 4 - vehicleItems.length }).map((_, i) => (
                  <th key={`empty-${i}`} className="p-2 min-w-[200px]">
                    <div className="h-48 border-2 border-dashed border-muted-foreground/20 rounded-lg flex items-center justify-center text-muted-foreground/40 text-sm">
                      Wybierz ofertę
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            {/* Parameters */}
            <tbody>
              {parameters.map((param, idx) => (
                <tr key={param.key} className={cn(idx % 2 === 0 ? "bg-muted/30" : "")}>
                  <td className="p-3 text-sm font-medium">{param.label}</td>
                  {vehicleItems.map((item) => (
                    <td key={item.id} className="p-3 text-center text-sm">
                      {param.format(item)}
                    </td>
                  ))}
                  {Array.from({ length: 4 - vehicleItems.length }).map((_, i) => (
                    <td key={`empty-${i}`} className="p-3 text-center text-muted-foreground/30">
                      —
                    </td>
                  ))}
                </tr>
              ))}

              {/* Contact Row */}
              <tr className="border-t">
                <td className="p-3 text-sm font-medium">Kontakt</td>
                {vehicleItems.map((item) => (
                  <td key={item.id} className="p-3 text-center">
                    <div className="flex flex-col gap-1 items-center">
                      {item.contactPhone && (
                        <a 
                          href={`tel:${item.contactPhone}`}
                          className="flex items-center gap-1 text-sm text-primary hover:underline"
                        >
                          <Phone className="h-3.5 w-3.5" />
                          {item.contactPhone}
                        </a>
                      )}
                      {item.contactEmail && (
                        <a 
                          href={`mailto:${item.contactEmail}`}
                          className="flex items-center gap-1 text-xs text-primary hover:underline"
                        >
                          <Mail className="h-3 w-3" />
                          Napisz
                        </a>
                      )}
                      <Button size="sm" className="mt-2 w-full">
                        Rezerwuj
                      </Button>
                    </div>
                  </td>
                ))}
                {Array.from({ length: 4 - vehicleItems.length }).map((_, i) => (
                  <td key={`empty-${i}`} className="p-3" />
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

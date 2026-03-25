import { Home, Maximize, Layers, Calendar, Thermometer, Key, Building2 } from "lucide-react";

interface PropertySpecsTableProps {
  listing: {
    propertyType?: string;
    areaM2?: number;
    rooms?: number;
    floor?: number;
    floorsTotal?: number;
    buildYear?: number;
    heating?: string;
    ownershipType?: string;
    marketType?: string;
  };
}

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  mieszkanie: "Mieszkanie",
  kawalerka: "Kawalerka",
  dom: "Dom",
  dzialka: "Działka",
  lokal: "Lokal użytkowy",
  pokoj: "Pokój",
  inwestycja: "Inwestycja",
};

const HEATING_LABELS: Record<string, string> = {
  miejskie: "Ogrzewanie miejskie",
  gazowe: "Ogrzewanie gazowe",
  elektryczne: "Ogrzewanie elektryczne",
  kominkowe: "Kominek",
  pompaCiepla: "Pompa ciepła",
  inne: "Inne",
};

const OWNERSHIP_LABELS: Record<string, string> = {
  wlasnosc: "Własność",
  własność: "Własność",
  spoldzielcze: "Spółdzielcze",
  spoldzielczeWlasnosc: "Spółdzielcze własnościowe",
  wynajem: "Wynajem",
  uzytkowanie: "Użytkowanie wieczyste",
};

const MARKET_TYPE_LABELS: Record<string, string> = {
  pierwotny: "Rynek pierwotny",
  wtorny: "Rynek wtórny",
};

export function PropertySpecsTable({ listing }: PropertySpecsTableProps) {
  const specs = [
    {
      icon: Home,
      label: "Typ nieruchomości",
      value: PROPERTY_TYPE_LABELS[listing.propertyType || ""] || listing.propertyType,
      show: !!listing.propertyType,
    },
    {
      icon: Maximize,
      label: "Powierzchnia",
      value: listing.areaM2 ? `${listing.areaM2} m²` : null,
      show: !!listing.areaM2,
    },
    {
      icon: Building2,
      label: "Liczba pokoi",
      value: listing.rooms && listing.rooms > 0 ? `${listing.rooms} ${listing.rooms === 1 ? 'pokój' : listing.rooms < 5 ? 'pokoje' : 'pokoi'}` : null,
      show: !!listing.rooms && listing.rooms > 0,
    },
    {
      icon: Layers,
      label: "Piętro",
      value: (listing.floor !== null && listing.floor !== undefined && String(listing.floor) !== 'null')
        ? (listing.floorsTotal 
            ? `${listing.floor === 0 ? 'Parter' : listing.floor} / ${listing.floorsTotal}` 
            : listing.floor === 0 ? 'Parter' : `${listing.floor}`)
        : null,
      show: listing.floor !== null && listing.floor !== undefined && String(listing.floor) !== 'null',
    },
    {
      icon: Calendar,
      label: "Rok budowy",
      value: listing.buildYear?.toString(),
      show: !!listing.buildYear,
    },
    {
      icon: Thermometer,
      label: "Ogrzewanie",
      value: HEATING_LABELS[listing.heating || ""] || listing.heating,
      show: !!listing.heating,
    },
    {
      icon: Key,
      label: "Forma własności",
      value: OWNERSHIP_LABELS[listing.ownershipType || ""] || listing.ownershipType,
      show: !!listing.ownershipType,
    },
    {
      icon: Building2,
      label: "Rynek",
      value: MARKET_TYPE_LABELS[listing.marketType || ""] || listing.marketType,
      show: !!listing.marketType,
    },
  ].filter(spec => spec.show && spec.value);

  if (specs.length === 0) {
    return null;
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Informacje o nieruchomości</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {specs.map((spec, index) => (
          <div 
            key={index}
            className="flex items-start gap-3 p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
          >
            <div className="p-2 rounded-lg bg-primary/10">
              <spec.icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{spec.label}</p>
              <p className="font-medium">{spec.value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useState } from "react";
import { Home, Maximize, Layers, Calendar, Thermometer, Key, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface RoomData {
  name: string;
  area: number;
}

interface PropertySpecsTableProps {
  listing: {
    propertyType?: string;
    areaM2?: number;
    areaTotal?: number;
    areaUsable?: number;
    areaPlot?: number;
    rooms?: number;
    roomsData?: RoomData[];
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

const ROOM_ICONS: Record<string, string> = {
  salon: "🛋️",
  "pokój dzienny": "🛋️",
  "living room": "🛋️",
  sypialnia: "🛏️",
  "pokój": "🛏️",
  bedroom: "🛏️",
  kuchnia: "🍳",
  "aneks kuchenny": "🍳",
  kitchen: "🍳",
  łazienka: "🚿",
  bathroom: "🚿",
  wc: "🚽",
  toaleta: "🚽",
  przedpokój: "🚪",
  korytarz: "🚪",
  hall: "🚪",
  garderoba: "👔",
  balkon: "🌇",
  taras: "☀️",
  loggia: "🌇",
  garaż: "🚗",
  garage: "🚗",
  piwnica: "📦",
  komórka: "📦",
  schowek: "📦",
};

function getRoomIcon(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, icon] of Object.entries(ROOM_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return "📐";
}

// Sort rooms: main rooms first, then auxiliary, balcony/taras last
const ROOM_SORT_ORDER: Record<string, number> = {
  salon: 1, "pokój dzienny": 1, "living": 1,
  sypialnia: 2, bedroom: 2,
  "pokój": 3,
  kuchnia: 4, "aneks": 4, kitchen: 4,
  łazienka: 5, bathroom: 5, wc: 5, toaleta: 5,
  przedpokój: 6, korytarz: 6, hall: 6,
  garderoba: 7,
  piwnica: 8, komórka: 8, schowek: 8,
  garaż: 9,
  balkon: 10, taras: 10, loggia: 10,
};

function getRoomSortOrder(name: string): number {
  const lower = name.toLowerCase();
  for (const [key, order] of Object.entries(ROOM_SORT_ORDER)) {
    if (lower.includes(key)) return order;
  }
  return 7; // default: between main rooms and balcony
}

export function PropertySpecsTable({ listing }: PropertySpecsTableProps) {
  const [activeTab, setActiveTab] = useState<"info" | "rooms">("info");
  
  const hasRoomsData = listing.roomsData && listing.roomsData.length > 0;

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

  if (specs.length === 0 && !hasRoomsData) {
    return null;
  }

  return (
    <div>
      {/* Tab switcher - only show if rooms data exists */}
      {hasRoomsData ? (
        <div className="flex items-center gap-2 mb-4">
          <button
            onClick={() => setActiveTab("info")}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              activeTab === "info"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            Informacje o nieruchomości
          </button>
          <button
            onClick={() => setActiveTab("rooms")}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              activeTab === "rooms"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            Rozkład mieszkania
          </button>
        </div>
      ) : (
        <h2 className="text-xl font-semibold mb-4">Informacje o nieruchomości</h2>
      )}

      {/* Info tab */}
      {activeTab === "info" && specs.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {specs.map((spec, index) => (
            <div 
              key={index}
              className="flex items-center gap-3 p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors min-h-[72px]"
            >
              <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                <spec.icon className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground leading-tight">{spec.label}</p>
                <p className="font-semibold text-sm leading-snug mt-0.5">{spec.value}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rooms tab */}
      {activeTab === "rooms" && hasRoomsData && (
        <div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[...listing.roomsData!]
              .filter(room => room.area > 0)
              .sort((a, b) => getRoomSortOrder(a.name) - getRoomSortOrder(b.name))
              .map((room, index) => (
              <div
                key={index}
                className="flex flex-col items-center p-4 rounded-xl bg-card border shadow-sm hover:shadow-md hover:border-primary/30 transition-all cursor-default"
              >
                <span className="text-2xl mb-2">{getRoomIcon(room.name)}</span>
                <p className="text-sm text-muted-foreground text-center">{room.name || "Pokój"}</p>
                <p className="font-bold text-lg">{room.area} m²</p>
              </div>
            ))}
          </div>

          {/* Summary row */}
          <div className="mt-4 p-3 rounded-lg bg-muted/30 flex flex-wrap gap-4 text-sm">
            {listing.areaTotal && listing.areaTotal > 0 && (
              <span>
                <span className="text-muted-foreground">Powierzchnia całkowita:</span>{" "}
                <span className="font-semibold">{Math.round(listing.areaTotal * 100) / 100} m²</span>
              </span>
            )}
            {listing.areaUsable && listing.areaUsable > 1 && listing.areaUsable !== listing.areaTotal && (
              <span>
                <span className="text-muted-foreground">Powierzchnia użytkowa:</span>{" "}
                <span className="font-semibold">{Math.round(listing.areaUsable * 100) / 100} m²</span>
              </span>
            )}
            {listing.areaPlot && listing.areaPlot > 0 && (
              <span>
                <span className="text-muted-foreground">Działka:</span>{" "}
                <span className="font-semibold">{Math.round(listing.areaPlot * 100) / 100} m²</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

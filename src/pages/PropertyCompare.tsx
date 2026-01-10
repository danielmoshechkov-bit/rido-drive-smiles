import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { 
  ArrowLeft, Phone, Mail, GitCompare, Check, Plus
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompare, PropertyCompareItem } from "@/contexts/CompareContext";
import { ComparePhotoCarousel } from "@/components/marketplace/ComparePhotoCarousel";

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  mieszkanie: "Mieszkanie",
  kawalerka: "Kawalerka",
  dom: "Dom",
  dzialka: "Działka",
  lokal: "Lokal użytkowy",
  pokoj: "Pokój",
  inwestycja: "Inwestycja",
};

const PRICE_TYPE_LABELS: Record<string, string> = {
  sale: "",
  rent_monthly: "/ mies.",
  rent_daily: "/ dzień",
};

export default function PropertyCompare() {
  const navigate = useNavigate();
  const { propertyItems, removeProperty, clearProperties } = useCompare();

  if (propertyItems.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20 flex items-center justify-center">
        <div className="text-center">
          <GitCompare className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Brak nieruchomości do porównania</h2>
          <p className="text-muted-foreground mb-4">Wybierz co najmniej 2 oferty z giełdy</p>
          <Button onClick={() => navigate('/nieruchomosci')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Wróć do nieruchomości
          </Button>
        </div>
      </div>
    );
  }

  const parameters = [
    { 
      key: "price", 
      label: "Cena", 
      format: (p: PropertyCompareItem) => p.price ? (
        <span>
          {p.price.toLocaleString('pl-PL')} zł
          <span className="text-muted-foreground text-xs">{PRICE_TYPE_LABELS[p.priceType || 'sale']}</span>
        </span>
      ) : "—" 
    },
    { key: "propertyType", label: "Typ", format: (p: PropertyCompareItem) => p.propertyType ? (PROPERTY_TYPE_LABELS[p.propertyType] || p.propertyType) : "—" },
    { key: "areaM2", label: "Powierzchnia", format: (p: PropertyCompareItem) => p.areaM2 ? `${p.areaM2} m²` : "—" },
    { 
      key: "pricePerM2", 
      label: "Cena za m²", 
      format: (p: PropertyCompareItem) => p.areaM2 && p.price ? `${Math.round(p.price / p.areaM2).toLocaleString('pl-PL')} zł/m²` : "—" 
    },
    { key: "rooms", label: "Pokoje", format: (p: PropertyCompareItem) => p.rooms || "—" },
    { key: "floor", label: "Piętro", format: (p: PropertyCompareItem) => p.floor !== undefined ? p.floor : "—" },
    { key: "buildYear", label: "Rok budowy", format: (p: PropertyCompareItem) => p.buildYear || "—" },
    { key: "location", label: "Lokalizacja", format: (p: PropertyCompareItem) => p.district ? `${p.district}, ${p.location}` : (p.location || "—") },
    { key: "hasBalcony", label: "Balkon", format: (p: PropertyCompareItem) => p.hasBalcony ? <Check className="h-4 w-4 text-green-500 mx-auto" /> : "—" },
    { key: "hasElevator", label: "Winda", format: (p: PropertyCompareItem) => p.hasElevator ? <Check className="h-4 w-4 text-green-500 mx-auto" /> : "—" },
    { key: "hasParking", label: "Parking", format: (p: PropertyCompareItem) => p.hasParking ? <Check className="h-4 w-4 text-green-500 mx-auto" /> : "—" },
    { key: "hasGarden", label: "Ogród", format: (p: PropertyCompareItem) => p.hasGarden ? <Check className="h-4 w-4 text-green-500 mx-auto" /> : "—" },
    { key: "agencyName", label: "Agencja", format: (p: PropertyCompareItem) => p.agencyName || "—" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate('/nieruchomosci')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Wróć do nieruchomości
          </Button>
          <h1 className="text-lg font-bold">
            <GitCompare className="h-5 w-5 inline-block mr-2 text-primary" />
            Porównanie nieruchomości
          </h1>
          <Button variant="outline" size="sm" onClick={clearProperties}>
            Wyczyść wszystkie
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            {/* Property Headers with Photo Carousel */}
            <thead>
              <tr>
                <th className="w-40 p-2 text-left text-sm font-medium text-muted-foreground">
                  Parametr
                </th>
                {propertyItems.map((item) => (
                  <th key={item.id} className="p-2 min-w-[220px]">
                    <ComparePhotoCarousel
                      photos={item.photos}
                      title={item.title}
                      transactionType={item.transactionType}
                      transactionColor={item.transactionColor}
                      onRemove={() => removeProperty(item.id)}
                    />
                  </th>
                ))}
                {/* Empty slots - clickable */}
                {Array.from({ length: 4 - propertyItems.length }).map((_, i) => (
                  <th key={`empty-${i}`} className="p-2 min-w-[220px]">
                    <div 
                      onClick={() => navigate('/nieruchomosci')}
                      className="h-52 border-2 border-dashed border-muted-foreground/30 rounded-lg flex flex-col items-center justify-center text-muted-foreground/50 cursor-pointer hover:border-primary hover:text-primary hover:bg-primary/5 transition-all"
                    >
                      <Plus className="h-8 w-8 mb-2" />
                      <span className="text-sm font-medium">Dodaj ofertę</span>
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
                  {propertyItems.map((item) => (
                    <td key={item.id} className="p-3 text-center text-sm">
                      {param.format(item)}
                    </td>
                  ))}
                  {Array.from({ length: 4 - propertyItems.length }).map((_, i) => (
                    <td key={`empty-${i}`} className="p-3 text-center text-muted-foreground/30">
                      —
                    </td>
                  ))}
                </tr>
              ))}

              {/* Contact Row */}
              <tr className="border-t">
                <td className="p-3 text-sm font-medium">Kontakt</td>
                {propertyItems.map((item) => (
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
                        Szczegóły
                      </Button>
                    </div>
                  </td>
                ))}
                {Array.from({ length: 4 - propertyItems.length }).map((_, i) => (
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

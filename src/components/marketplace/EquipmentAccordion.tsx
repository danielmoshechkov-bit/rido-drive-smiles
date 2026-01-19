import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Music, Wind, Shield, Gauge, Zap } from "lucide-react";

interface EquipmentAccordionProps {
  equipment: Record<string, boolean>;
  onChange: (equipment: Record<string, boolean>) => void;
}

const EQUIPMENT_CATEGORIES = [
  {
    key: "audio",
    label: "Audio i multimedia",
    icon: Music,
    items: [
      { key: "bluetooth", label: "Bluetooth" },
      { key: "apple_carplay", label: "Apple CarPlay" },
      { key: "android_auto", label: "Android Auto" },
      { key: "navigation", label: "Nawigacja" },
      { key: "radio", label: "Radio" },
      { key: "usb", label: "Gniazda USB" },
      { key: "sound_system", label: "System nagłośnienia premium" },
      { key: "wireless_charging", label: "Ładowanie bezprzewodowe" },
    ],
  },
  {
    key: "comfort",
    label: "Komfort",
    icon: Wind,
    items: [
      { key: "air_conditioning", label: "Klimatyzacja" },
      { key: "auto_ac", label: "Klimatyzacja automatyczna" },
      { key: "heated_seats", label: "Podgrzewane siedzenia" },
      { key: "ventilated_seats", label: "Wentylowane siedzenia" },
      { key: "leather", label: "Skórzana tapicerka" },
      { key: "heated_steering", label: "Podgrzewana kierownica" },
      { key: "electric_seats", label: "Elektryczna regulacja foteli" },
      { key: "memory_seats", label: "Pamięć ustawień foteli" },
      { key: "cruise_control", label: "Tempomat" },
      { key: "adaptive_cruise", label: "Tempomat adaptacyjny" },
      { key: "sunroof", label: "Szyberdach" },
      { key: "panoramic_roof", label: "Dach panoramiczny" },
    ],
  },
  {
    key: "safety",
    label: "Bezpieczeństwo",
    icon: Shield,
    items: [
      { key: "abs", label: "ABS" },
      { key: "esp", label: "ESP" },
      { key: "airbags_front", label: "Poduszki przednie" },
      { key: "airbags_side", label: "Poduszki boczne" },
      { key: "airbags_curtain", label: "Kurtyny powietrzne" },
      { key: "backup_camera", label: "Kamera cofania" },
      { key: "camera_360", label: "Kamera 360°" },
      { key: "parking_sensors_front", label: "Czujniki parkowania przód" },
      { key: "parking_sensors_rear", label: "Czujniki parkowania tył" },
      { key: "isofix", label: "ISOFIX" },
      { key: "tpms", label: "Czujniki ciśnienia opon" },
    ],
  },
  {
    key: "assistance",
    label: "Systemy wspomagania",
    icon: Gauge,
    items: [
      { key: "lane_assist", label: "Asystent pasa ruchu" },
      { key: "blind_spot", label: "Monitoring martwego pola" },
      { key: "collision_warning", label: "Ostrzeganie o kolizji" },
      { key: "auto_brake", label: "Automatyczne hamowanie" },
      { key: "traffic_sign", label: "Rozpoznawanie znaków" },
      { key: "head_up", label: "Wyświetlacz HUD" },
      { key: "auto_parking", label: "Automatyczne parkowanie" },
      { key: "night_vision", label: "Noktowizor" },
    ],
  },
  {
    key: "electric",
    label: "Elektryka i oświetlenie",
    icon: Zap,
    items: [
      { key: "electric_windows", label: "Elektryczne szyby" },
      { key: "electric_mirrors", label: "Elektryczne lusterka" },
      { key: "folding_mirrors", label: "Składane lusterka" },
      { key: "keyless_entry", label: "Otwieranie bezkluczykowe" },
      { key: "keyless_go", label: "Uruchamianie bezkluczykowe" },
      { key: "led_lights", label: "Światła LED" },
      { key: "matrix_led", label: "Światła Matrix LED" },
      { key: "laser_lights", label: "Światła laserowe" },
      { key: "auto_lights", label: "Automatyczne światła" },
      { key: "rain_sensor", label: "Czujnik deszczu" },
    ],
  },
];

export function EquipmentAccordion({ equipment, onChange }: EquipmentAccordionProps) {
  const [openItems, setOpenItems] = useState<string[]>(["audio"]);

  const toggleEquipment = (key: string) => {
    onChange({
      ...equipment,
      [key]: !equipment[key],
    });
  };

  const getCategoryCount = (categoryKey: string) => {
    const category = EQUIPMENT_CATEGORIES.find(c => c.key === categoryKey);
    if (!category) return 0;
    return category.items.filter(item => equipment[item.key]).length;
  };

  return (
    <Accordion
      type="multiple"
      value={openItems}
      onValueChange={setOpenItems}
      className="space-y-2"
    >
      {EQUIPMENT_CATEGORIES.map((category) => {
        const Icon = category.icon;
        const count = getCategoryCount(category.key);
        
        return (
          <AccordionItem
            key={category.key}
            value={category.key}
            className="border rounded-lg px-4"
          >
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 text-primary" />
                <span>{category.label}</span>
                {count > 0 && (
                  <span className="bg-primary/10 text-primary text-xs px-2 py-0.5 rounded-full">
                    {count}
                  </span>
                )}
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2 pb-4">
                {category.items.map((item) => (
                  <div key={item.key} className="flex items-center gap-2">
                    <Checkbox
                      id={item.key}
                      checked={equipment[item.key] || false}
                      onCheckedChange={() => toggleEquipment(item.key)}
                    />
                    <Label
                      htmlFor={item.key}
                      className="text-sm cursor-pointer"
                    >
                      {item.label}
                    </Label>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        );
      })}
    </Accordion>
  );
}

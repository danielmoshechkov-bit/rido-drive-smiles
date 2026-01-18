// GetRido Maps - Category Grid Component (Yandex-style POI categories)
import { 
  UtensilsCrossed, 
  ShoppingCart, 
  Pill, 
  Sparkles as Beauty,
  Banknote,
  Fuel,
  Hospital,
  Hotel,
  Wifi,
  Beer,
  ShoppingBag,
  Film,
  Truck,
  Car,
  Wrench,
  Dumbbell,
  Landmark,
  Coffee,
  ParkingCircle,
  Zap
} from 'lucide-react';

export interface POICategory {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  query: string;
}

export const POI_CATEGORIES: POICategory[] = [
  { id: 'food', label: 'Gdzie jeść', icon: <UtensilsCrossed className="h-5 w-5" />, color: 'bg-orange-500', query: 'restaurant' },
  { id: 'shop', label: 'Sklepy', icon: <ShoppingCart className="h-5 w-5" />, color: 'bg-blue-500', query: 'supermarket' },
  { id: 'pharmacy', label: 'Apteki', icon: <Pill className="h-5 w-5" />, color: 'bg-green-500', query: 'pharmacy' },
  { id: 'beauty', label: 'Uroda', icon: <Beauty className="h-5 w-5" />, color: 'bg-pink-500', query: 'beauty salon' },
  { id: 'atm', label: 'Bankomaty', icon: <Banknote className="h-5 w-5" />, color: 'bg-emerald-600', query: 'atm' },
  { id: 'fuel', label: 'Stacje', icon: <Fuel className="h-5 w-5" />, color: 'bg-amber-600', query: 'gas station' },
  { id: 'hospital', label: 'Szpitale', icon: <Hospital className="h-5 w-5" />, color: 'bg-red-500', query: 'hospital' },
  { id: 'hotel', label: 'Hotele', icon: <Hotel className="h-5 w-5" />, color: 'bg-indigo-500', query: 'hotel' },
  { id: 'wifi', label: 'Wi-Fi', icon: <Wifi className="h-5 w-5" />, color: 'bg-cyan-500', query: 'cafe wifi' },
  { id: 'bar', label: 'Bary', icon: <Beer className="h-5 w-5" />, color: 'bg-amber-500', query: 'bar' },
  { id: 'mall', label: 'Galerie', icon: <ShoppingBag className="h-5 w-5" />, color: 'bg-purple-500', query: 'shopping mall' },
  { id: 'cinema', label: 'Kina', icon: <Film className="h-5 w-5" />, color: 'bg-rose-500', query: 'cinema' },
  { id: 'parking', label: 'Parkingi', icon: <ParkingCircle className="h-5 w-5" />, color: 'bg-blue-600', query: 'parking' },
  { id: 'carwash', label: 'Myjnie', icon: <Car className="h-5 w-5" />, color: 'bg-sky-500', query: 'car wash' },
  { id: 'service', label: 'Serwisy', icon: <Wrench className="h-5 w-5" />, color: 'bg-slate-600', query: 'car service' },
  { id: 'gym', label: 'Fitness', icon: <Dumbbell className="h-5 w-5" />, color: 'bg-violet-500', query: 'gym' },
  { id: 'ev', label: 'Ładowarki EV', icon: <Zap className="h-5 w-5" />, color: 'bg-green-600', query: 'ev charging' },
  { id: 'cafe', label: 'Kawiarnie', icon: <Coffee className="h-5 w-5" />, color: 'bg-amber-700', query: 'cafe' },
  { id: 'attraction', label: 'Zwiedzaj', icon: <Landmark className="h-5 w-5" />, color: 'bg-teal-500', query: 'tourist attraction' },
];

interface CategoryGridProps {
  onCategorySelect: (category: POICategory) => void;
  compact?: boolean;
}

const CategoryGrid = ({ onCategorySelect, compact = false }: CategoryGridProps) => {
  const displayedCategories = compact ? POI_CATEGORIES.slice(0, 8) : POI_CATEGORIES;
  
  return (
    <div className={`grid ${compact ? 'grid-cols-4 gap-2' : 'grid-cols-4 gap-3'}`}>
      {displayedCategories.map((category) => (
        <button
          key={category.id}
          onClick={() => onCategorySelect(category)}
          className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-accent/50 active:scale-95 transition-all"
        >
          <div className={`h-11 w-11 rounded-xl ${category.color} text-white flex items-center justify-center shadow-md`}>
            {category.icon}
          </div>
          <span className="text-xs text-center font-medium text-muted-foreground leading-tight line-clamp-2">
            {category.label}
          </span>
        </button>
      ))}
    </div>
  );
};

export default CategoryGrid;

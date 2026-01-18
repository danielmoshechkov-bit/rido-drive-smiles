// GetRido Maps - Premium Category Grid with modern filled icons
import React from 'react';
import {
  FoodIcon,
  ShopIcon,
  PharmacyIcon,
  BeautyIcon,
  AtmIcon,
  FuelIcon,
  HospitalIcon,
  HotelIcon,
  WifiIcon,
  BarIcon,
  MallIcon,
  CinemaIcon,
  ParkingIcon,
  CarWashIcon,
  ServiceIcon,
  FitnessIcon,
  SightIcon,
} from './CategoryIcons';

// ═══════════════════════════════════════════════════════════════
// POI Category Definitions with Premium Icons
// ═══════════════════════════════════════════════════════════════

export interface POICategory {
  id: string;
  label: string;
  icon: React.ReactNode;
  bgClass: string;
  query: string;
}

// Apple Maps style - flat solid colors with rounded corners
export const POI_CATEGORIES: POICategory[] = [
  { id: 'food', label: 'Gdzie jeść', icon: <FoodIcon />, bgClass: 'bg-orange-500', query: 'restaurant' },
  { id: 'shop', label: 'Sklepy', icon: <ShopIcon />, bgClass: 'bg-blue-500', query: 'supermarket grocery' },
  { id: 'pharmacy', label: 'Apteki', icon: <PharmacyIcon />, bgClass: 'bg-green-500', query: 'pharmacy' },
  { id: 'beauty', label: 'Uroda', icon: <BeautyIcon />, bgClass: 'bg-pink-500', query: 'beauty salon spa' },
  { id: 'atm', label: 'Bankomaty', icon: <AtmIcon />, bgClass: 'bg-emerald-500', query: 'atm bank' },
  { id: 'fuel', label: 'Stacje', icon: <FuelIcon />, bgClass: 'bg-amber-500', query: 'gas station fuel' },
  { id: 'hospital', label: 'Szpitale', icon: <HospitalIcon />, bgClass: 'bg-red-500', query: 'hospital clinic' },
  { id: 'hotel', label: 'Hotele', icon: <HotelIcon />, bgClass: 'bg-indigo-500', query: 'hotel hostel' },
  { id: 'wifi', label: 'Wi-Fi', icon: <WifiIcon />, bgClass: 'bg-cyan-500', query: 'wifi cafe' },
  { id: 'bar', label: 'Bary', icon: <BarIcon />, bgClass: 'bg-yellow-500', query: 'bar pub' },
  { id: 'mall', label: 'Galerie', icon: <MallIcon />, bgClass: 'bg-purple-500', query: 'shopping mall' },
  { id: 'cinema', label: 'Kina', icon: <CinemaIcon />, bgClass: 'bg-rose-500', query: 'cinema movie theater' },
  { id: 'parking', label: 'Parkingi', icon: <ParkingIcon />, bgClass: 'bg-sky-500', query: 'parking' },
  { id: 'carwash', label: 'Myjnie', icon: <CarWashIcon />, bgClass: 'bg-blue-400', query: 'car wash' },
  { id: 'service', label: 'Serwisy', icon: <ServiceIcon />, bgClass: 'bg-slate-500', query: 'car service mechanic' },
  { id: 'fitness', label: 'Fitness', icon: <FitnessIcon />, bgClass: 'bg-violet-500', query: 'gym fitness' },
  { id: 'sight', label: 'Zwiedzaj', icon: <SightIcon />, bgClass: 'bg-amber-400', query: 'tourist attraction' },
];

// ═══════════════════════════════════════════════════════════════
// Category Grid Component - Premium Design
// ═══════════════════════════════════════════════════════════════

interface CategoryGridProps {
  onCategorySelect: (category: POICategory) => void;
  compact?: boolean;
}

const CategoryGrid = ({ onCategorySelect, compact = false }: CategoryGridProps) => {
  const displayCategories = compact ? POI_CATEGORIES.slice(0, 8) : POI_CATEGORIES;

  return (
    <div className={`grid ${compact ? 'grid-cols-4' : 'grid-cols-4'} gap-3`}>
      {displayCategories.map((category) => (
        <button
          key={category.id}
          onClick={() => onCategorySelect(category)}
          className="flex flex-col items-center gap-2 p-3 rounded-2xl hover:bg-accent/50 active:scale-95 transition-all duration-200 group"
        >
          {/* Premium icon container with gradient background - larger */}
          <div className={`
            h-16 w-16 rounded-2xl 
            ${category.bgClass}
            flex items-center justify-center 
            shadow-lg shadow-black/10
            group-hover:shadow-xl group-hover:scale-105
            transition-all duration-200
          `}>
            {/* Icon is white, no wrapper needed */}
            {category.icon}
          </div>
          
          {/* Label */}
          <span className="text-xs font-medium text-center leading-tight text-foreground/80 group-hover:text-foreground transition-colors">
            {category.label}
          </span>
        </button>
      ))}
    </div>
  );
};

export default CategoryGrid;

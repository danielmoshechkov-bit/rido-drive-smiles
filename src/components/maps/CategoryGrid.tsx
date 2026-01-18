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

// Rido Style - inspired by Apple Maps with unique Rido palette
export const POI_CATEGORIES: POICategory[] = [
  { id: 'food', label: 'Gdzie jeść', icon: <FoodIcon />, bgClass: 'bg-orange-400', query: 'restaurant' },
  { id: 'fuel', label: 'Stacje', icon: <FuelIcon />, bgClass: 'bg-sky-500', query: 'gas station fuel' },
  { id: 'pharmacy', label: 'Apteki', icon: <PharmacyIcon />, bgClass: 'bg-red-400', query: 'pharmacy' },
  { id: 'shop', label: 'Sklepy', icon: <ShopIcon />, bgClass: 'bg-blue-500', query: 'supermarket grocery' },
  { id: 'parking', label: 'Parkingi', icon: <ParkingIcon />, bgClass: 'bg-blue-600', query: 'parking' },
  { id: 'atm', label: 'Bankomaty', icon: <AtmIcon />, bgClass: 'bg-teal-500', query: 'atm bank' },
  { id: 'hotel', label: 'Hotele', icon: <HotelIcon />, bgClass: 'bg-indigo-400', query: 'hotel hostel' },
  { id: 'hospital', label: 'Szpitale', icon: <HospitalIcon />, bgClass: 'bg-red-500', query: 'hospital clinic' },
  { id: 'beauty', label: 'Uroda', icon: <BeautyIcon />, bgClass: 'bg-fuchsia-400', query: 'beauty salon spa' },
  { id: 'bar', label: 'Bary', icon: <BarIcon />, bgClass: 'bg-amber-400', query: 'bar pub' },
  { id: 'mall', label: 'Galerie', icon: <MallIcon />, bgClass: 'bg-purple-500', query: 'shopping mall' },
  { id: 'cinema', label: 'Kina', icon: <CinemaIcon />, bgClass: 'bg-rose-400', query: 'cinema movie theater' },
  { id: 'wifi', label: 'Wi-Fi', icon: <WifiIcon />, bgClass: 'bg-violet-400', query: 'wifi cafe' },
  { id: 'carwash', label: 'Myjnie', icon: <CarWashIcon />, bgClass: 'bg-cyan-400', query: 'car wash' },
  { id: 'service', label: 'Serwisy', icon: <ServiceIcon />, bgClass: 'bg-slate-400', query: 'car service mechanic' },
  { id: 'fitness', label: 'Fitness', icon: <FitnessIcon />, bgClass: 'bg-green-500', query: 'gym fitness' },
  { id: 'sight', label: 'Zwiedzaj', icon: <SightIcon />, bgClass: 'bg-yellow-400', query: 'tourist attraction' },
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
          {/* Rido style icon container - Apple Maps inspired */}
          <div className={`
            h-14 w-14 rounded-xl 
            ${category.bgClass}
            flex items-center justify-center 
            shadow-md ring-1 ring-white/10
            group-hover:shadow-lg group-hover:scale-105
            transition-all duration-200
          `}>
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

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

export const POI_CATEGORIES: POICategory[] = [
  { id: 'food', label: 'Gdzie jeść', icon: <FoodIcon />, bgClass: 'bg-gradient-to-br from-orange-400 to-orange-600', query: 'restaurant' },
  { id: 'shop', label: 'Sklepy', icon: <ShopIcon />, bgClass: 'bg-gradient-to-br from-blue-400 to-blue-600', query: 'supermarket grocery' },
  { id: 'pharmacy', label: 'Apteki', icon: <PharmacyIcon />, bgClass: 'bg-gradient-to-br from-green-400 to-green-600', query: 'pharmacy' },
  { id: 'beauty', label: 'Uroda', icon: <BeautyIcon />, bgClass: 'bg-gradient-to-br from-pink-400 to-pink-600', query: 'beauty salon spa' },
  { id: 'atm', label: 'Bankomaty', icon: <AtmIcon />, bgClass: 'bg-gradient-to-br from-emerald-400 to-emerald-600', query: 'atm bank' },
  { id: 'fuel', label: 'Stacje', icon: <FuelIcon />, bgClass: 'bg-gradient-to-br from-amber-400 to-amber-600', query: 'gas station fuel' },
  { id: 'hospital', label: 'Szpitale', icon: <HospitalIcon />, bgClass: 'bg-gradient-to-br from-red-400 to-red-600', query: 'hospital clinic' },
  { id: 'hotel', label: 'Hotele', icon: <HotelIcon />, bgClass: 'bg-gradient-to-br from-indigo-400 to-indigo-600', query: 'hotel hostel' },
  { id: 'wifi', label: 'Wi-Fi', icon: <WifiIcon />, bgClass: 'bg-gradient-to-br from-cyan-400 to-cyan-600', query: 'wifi cafe' },
  { id: 'bar', label: 'Bary', icon: <BarIcon />, bgClass: 'bg-gradient-to-br from-yellow-500 to-orange-500', query: 'bar pub' },
  { id: 'mall', label: 'Galerie', icon: <MallIcon />, bgClass: 'bg-gradient-to-br from-purple-400 to-purple-600', query: 'shopping mall' },
  { id: 'cinema', label: 'Kina', icon: <CinemaIcon />, bgClass: 'bg-gradient-to-br from-rose-400 to-rose-600', query: 'cinema movie theater' },
  { id: 'parking', label: 'Parkingi', icon: <ParkingIcon />, bgClass: 'bg-gradient-to-br from-sky-400 to-sky-600', query: 'parking' },
  { id: 'carwash', label: 'Myjnie', icon: <CarWashIcon />, bgClass: 'bg-gradient-to-br from-blue-300 to-blue-500', query: 'car wash' },
  { id: 'service', label: 'Serwisy', icon: <ServiceIcon />, bgClass: 'bg-gradient-to-br from-slate-400 to-slate-600', query: 'car service mechanic' },
  { id: 'fitness', label: 'Fitness', icon: <FitnessIcon />, bgClass: 'bg-gradient-to-br from-violet-400 to-violet-600', query: 'gym fitness' },
  { id: 'sight', label: 'Zwiedzaj', icon: <SightIcon />, bgClass: 'bg-gradient-to-br from-amber-400 to-yellow-500', query: 'tourist attraction' },
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
          {/* Premium icon container with gradient background */}
          <div className={`
            h-14 w-14 rounded-2xl 
            ${category.bgClass}
            flex items-center justify-center 
            shadow-lg shadow-black/10
            group-hover:shadow-xl group-hover:scale-105
            transition-all duration-200
          `}>
            <div className="text-white drop-shadow-sm">
              {category.icon}
            </div>
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

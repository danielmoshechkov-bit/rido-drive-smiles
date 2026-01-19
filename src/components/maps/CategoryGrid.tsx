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

// Rido Style - uniform dark slate background for clean, professional look
const ICON_BG = 'bg-slate-700';

export const POI_CATEGORIES: POICategory[] = [
  { id: 'food', label: 'Gdzie jeść', icon: <FoodIcon />, bgClass: ICON_BG, query: 'restaurant' },
  { id: 'fuel', label: 'Stacje', icon: <FuelIcon />, bgClass: ICON_BG, query: 'gas station fuel' },
  { id: 'pharmacy', label: 'Apteki', icon: <PharmacyIcon />, bgClass: ICON_BG, query: 'pharmacy' },
  { id: 'shop', label: 'Sklepy', icon: <ShopIcon />, bgClass: ICON_BG, query: 'supermarket grocery' },
  { id: 'parking', label: 'Parkingi', icon: <ParkingIcon />, bgClass: ICON_BG, query: 'parking' },
  { id: 'atm', label: 'Bankomaty', icon: <AtmIcon />, bgClass: ICON_BG, query: 'atm bank' },
  { id: 'hotel', label: 'Hotele', icon: <HotelIcon />, bgClass: ICON_BG, query: 'hotel hostel' },
  { id: 'hospital', label: 'Szpitale', icon: <HospitalIcon />, bgClass: ICON_BG, query: 'hospital clinic' },
  { id: 'beauty', label: 'Uroda', icon: <BeautyIcon />, bgClass: ICON_BG, query: 'beauty salon spa' },
  { id: 'bar', label: 'Bary', icon: <BarIcon />, bgClass: ICON_BG, query: 'bar pub' },
  { id: 'mall', label: 'Galerie', icon: <MallIcon />, bgClass: ICON_BG, query: 'shopping mall' },
  { id: 'cinema', label: 'Kina', icon: <CinemaIcon />, bgClass: ICON_BG, query: 'cinema movie theater' },
  { id: 'wifi', label: 'Wi-Fi', icon: <WifiIcon />, bgClass: ICON_BG, query: 'wifi cafe' },
  { id: 'carwash', label: 'Myjnie', icon: <CarWashIcon />, bgClass: ICON_BG, query: 'car wash' },
  { id: 'service', label: 'Serwisy', icon: <ServiceIcon />, bgClass: ICON_BG, query: 'car service mechanic' },
  { id: 'fitness', label: 'Fitness', icon: <FitnessIcon />, bgClass: ICON_BG, query: 'gym fitness' },
  { id: 'sight', label: 'Zwiedzaj', icon: <SightIcon />, bgClass: ICON_BG, query: 'tourist attraction' },
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
          {/* Rido style icon container - clean dark slate */}
          <div className={`
            h-14 w-14 rounded-xl 
            ${category.bgClass}
            flex items-center justify-center 
            shadow-md
            group-hover:bg-slate-600 group-hover:shadow-lg group-hover:scale-105
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

import React, { createContext, useContext, useState, useCallback } from "react";

export interface VehicleCompareItem {
  id: string;
  title: string;
  price: number;
  priceType?: string;
  photo: string;
  year?: number;
  fuelType?: string;
  mileage?: number;
  engineCapacity?: number;
  power?: number;
  bodyType?: string;
  location?: string;
  rating?: number;
  contactPhone?: string;
  contactEmail?: string;
}

export interface PropertyCompareItem {
  id: string;
  title: string;
  price: number;
  priceType?: string;
  photo: string;
  propertyType?: string;
  areaM2?: number;
  rooms?: number;
  floor?: number;
  buildYear?: number;
  location?: string;
  district?: string;
  hasBalcony?: boolean;
  hasElevator?: boolean;
  hasParking?: boolean;
  hasGarden?: boolean;
  agencyName?: string;
  contactPhone?: string;
  contactEmail?: string;
}

interface CompareContextValue {
  vehicleItems: VehicleCompareItem[];
  propertyItems: PropertyCompareItem[];
  addVehicle: (item: VehicleCompareItem) => void;
  removeVehicle: (id: string) => void;
  clearVehicles: () => void;
  isVehicleSelected: (id: string) => boolean;
  addProperty: (item: PropertyCompareItem) => void;
  removeProperty: (id: string) => void;
  clearProperties: () => void;
  isPropertySelected: (id: string) => boolean;
}

const CompareContext = createContext<CompareContextValue | undefined>(undefined);

const MAX_ITEMS = 4;

export function CompareProvider({ children }: { children: React.ReactNode }) {
  const [vehicleItems, setVehicleItems] = useState<VehicleCompareItem[]>([]);
  const [propertyItems, setPropertyItems] = useState<PropertyCompareItem[]>([]);

  const addVehicle = useCallback((item: VehicleCompareItem) => {
    setVehicleItems(prev => {
      if (prev.length >= MAX_ITEMS) return prev;
      if (prev.some(v => v.id === item.id)) return prev;
      return [...prev, item];
    });
  }, []);

  const removeVehicle = useCallback((id: string) => {
    setVehicleItems(prev => prev.filter(v => v.id !== id));
  }, []);

  const clearVehicles = useCallback(() => {
    setVehicleItems([]);
  }, []);

  const isVehicleSelected = useCallback((id: string) => {
    return vehicleItems.some(v => v.id === id);
  }, [vehicleItems]);

  const addProperty = useCallback((item: PropertyCompareItem) => {
    setPropertyItems(prev => {
      if (prev.length >= MAX_ITEMS) return prev;
      if (prev.some(p => p.id === item.id)) return prev;
      return [...prev, item];
    });
  }, []);

  const removeProperty = useCallback((id: string) => {
    setPropertyItems(prev => prev.filter(p => p.id !== id));
  }, []);

  const clearProperties = useCallback(() => {
    setPropertyItems([]);
  }, []);

  const isPropertySelected = useCallback((id: string) => {
    return propertyItems.some(p => p.id === id);
  }, [propertyItems]);

  return (
    <CompareContext.Provider
      value={{
        vehicleItems,
        propertyItems,
        addVehicle,
        removeVehicle,
        clearVehicles,
        isVehicleSelected,
        addProperty,
        removeProperty,
        clearProperties,
        isPropertySelected,
      }}
    >
      {children}
    </CompareContext.Provider>
  );
}

export function useCompare() {
  const context = useContext(CompareContext);
  if (!context) {
    throw new Error("useCompare must be used within a CompareProvider");
  }
  return context;
}

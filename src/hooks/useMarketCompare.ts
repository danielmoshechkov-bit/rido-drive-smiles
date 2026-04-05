import { useState, useCallback } from "react";
import { toast } from "sonner";

const MAX_COMPARE = 4;
const STORAGE_KEY = "rido_market_compare";

export interface MarketCompareItem {
  id: string;
  title: string;
  price: number | null;
  condition: string | null;
  location: string | null;
  ai_score: number | null;
  description: string | null;
  photo_url: string | null;
}

export function useMarketCompare() {
  const [items, setItems] = useState<MarketCompareItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
    catch { return []; }
  });

  const save = (next: MarketCompareItem[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setItems(next);
  };

  const addItem = useCallback((item: MarketCompareItem) => {
    if (items.some(i => i.id === item.id)) return;
    if (items.length >= MAX_COMPARE) {
      toast.warning(`Maksymalnie ${MAX_COMPARE} ogłoszenia do porównania`);
      return;
    }
    save([...items, item]);
  }, [items]);

  const removeItem = useCallback((id: string) => {
    save(items.filter(i => i.id !== id));
  }, [items]);

  const isSelected = useCallback((id: string) => items.some(i => i.id === id), [items]);

  const clearAll = useCallback(() => { save([]); }, []);

  return { items, addItem, removeItem, isSelected, clearAll, count: items.length };
}

import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useMarketCompare } from "@/hooks/useMarketCompare";
import { GitCompare, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function MarketCompareBar() {
  const navigate = useNavigate();
  const { items, removeItem, clearAll, count } = useMarketCompare();

  if (count < 2) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-primary text-primary-foreground py-3 px-4 shadow-lg">
      <div className="container mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 overflow-hidden">
          <GitCompare className="h-5 w-5 shrink-0" />
          <span className="text-sm font-medium shrink-0">Porównujesz {count}</span>
          <div className="flex gap-1 overflow-x-auto">
            {items.map(item => (
              <div key={item.id} className="relative shrink-0">
                <div className="w-8 h-8 rounded bg-primary-foreground/20 overflow-hidden">
                  {item.photo_url ? (
                    <img src={item.photo_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full" />
                  )}
                </div>
                <button
                  onClick={() => removeItem(item.id)}
                  className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive flex items-center justify-center"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => navigate(`/marketplace/compare?ids=${items.map(i => i.id).join(",")}`)}
          >
            Porównaj teraz
          </Button>
          <Button size="sm" variant="ghost" onClick={clearAll} className="text-primary-foreground/80 hover:text-primary-foreground">
            Wyczyść
          </Button>
        </div>
      </div>
    </div>
  );
}

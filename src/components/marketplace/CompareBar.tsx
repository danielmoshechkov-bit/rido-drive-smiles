import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { X, GitCompare, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompare, VehicleCompareItem, PropertyCompareItem } from "@/contexts/CompareContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ViewingRequestForm } from "@/components/realestate/ViewingRequestForm";

interface CompareBarProps {
  type: "vehicle" | "property";
  className?: string;
}

export function CompareBar({ type, className }: CompareBarProps) {
  const navigate = useNavigate();
  const [showViewingForm, setShowViewingForm] = useState(false);
  const { 
    vehicleItems, 
    propertyItems, 
    removeVehicle, 
    removeProperty, 
    clearVehicles, 
    clearProperties 
  } = useCompare();

  const items = type === "vehicle" ? vehicleItems : propertyItems;
  const removeItem = type === "vehicle" ? removeVehicle : removeProperty;
  const clearItems = type === "vehicle" ? clearVehicles : clearProperties;
  const comparePath = type === "vehicle" ? "/gielda/porownaj" : "/nieruchomosci/porownaj";

  if (items.length === 0) return null;

  const handleCompare = () => {
    navigate(comparePath);
  };

  return (
    <>
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 bg-card border-t shadow-2xl animate-in slide-in-from-bottom-full duration-300",
          className
        )}
      >
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            {/* Selected Items */}
            <div className="flex items-center gap-2 overflow-x-auto flex-1 min-w-0">
              <span className="text-sm font-medium text-muted-foreground shrink-0">
                Wybrane:
              </span>
              <div className="flex items-center gap-2">
                {items.map((item: VehicleCompareItem | PropertyCompareItem) => (
                  <div
                    key={item.id}
                    className="relative group shrink-0 bg-muted rounded-lg overflow-visible"
                  >
                    <img
                      src={item.photos?.[0] || "/placeholder.svg"}
                      alt={item.title}
                      className="h-12 w-16 object-cover"
                    />
                    <button
                      onClick={() => removeItem(item.id)}
                      className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[10px] px-1 py-0.5 truncate">
                      {item.title}
                    </div>
                  </div>
                ))}
                {items.length < 4 && (
                  <div className="h-12 w-16 border-2 border-dashed border-muted-foreground/30 rounded-lg flex items-center justify-center text-muted-foreground/50 text-xs shrink-0">
                    +{4 - items.length}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={clearItems}
                className="gap-1"
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">Wyczyść</span>
              </Button>
              <Button
                size="sm"
                onClick={handleCompare}
                disabled={items.length < 2}
                className="gap-1"
              >
                <GitCompare className="h-4 w-4" />
                Porównaj ({items.length})
              </Button>
              {type === "property" && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => setShowViewingForm(true)}
                  className="gap-1 bg-green-600 hover:bg-green-700"
                >
                  <Eye className="h-4 w-4" />
                  <span className="hidden sm:inline">Umów oglądanie</span>
                  <span className="sm:hidden">Umów</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Viewing Request Dialog */}
      {type === "property" && (
        <Dialog open={showViewingForm} onOpenChange={setShowViewingForm}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Umów oglądanie nieruchomości
              </DialogTitle>
            </DialogHeader>
            <ViewingRequestForm
              listingIds={items.map(i => i.id)}
              listingTitles={items.map(i => i.title)}
              onSuccess={() => {
                setShowViewingForm(false);
                clearItems();
                navigate('/moje-ogladania');
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

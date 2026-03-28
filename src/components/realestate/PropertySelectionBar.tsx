import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { X, GitCompare, Trash2, Eye, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCompare, PropertyCompareItem } from "@/contexts/CompareContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ViewingRequestForm } from "@/components/realestate/ViewingRequestForm";

interface PropertySelectionBarProps {
  viewingIds: string[];
  viewingTitles: string[];
  viewingPhotos?: Record<string, string>;
  onClearViewing: () => void;
  onRemoveViewing?: (id: string) => void;
  isLoggedIn: boolean;
  className?: string;
}

export function PropertySelectionBar({
  viewingIds,
  viewingTitles,
  viewingPhotos = {},
  onClearViewing,
  onRemoveViewing,
  isLoggedIn,
  className,
}: PropertySelectionBarProps) {
  const navigate = useNavigate();
  const [showViewingForm, setShowViewingForm] = useState(false);
  const {
    propertyItems,
    removeProperty,
    clearProperties,
  } = useCompare();

  const hasCompare = propertyItems.length > 0;
  const hasViewing = viewingIds.length > 0;

  if (!hasCompare && !hasViewing) return null;

  const handleCompare = () => {
    navigate("/nieruchomosci/porownaj");
  };

  const handleOpenViewing = () => {
    if (!isLoggedIn) {
      navigate('/auth?redirect=/nieruchomosci');
      return;
    }
    setShowViewingForm(true);
  };

  const handleClearAll = () => {
    clearProperties();
    onClearViewing();
  };

  // Combine all unique items for thumbnail display
  const allThumbnails: Array<{ id: string; title: string; photo: string; type: 'compare' | 'viewing' }> = [];
  
  propertyItems.forEach(item => {
    allThumbnails.push({
      id: item.id,
      title: item.title,
      photo: item.photos?.[0] || '/placeholder.svg',
      type: 'compare',
    });
  });

  viewingIds.forEach((id, idx) => {
    if (!allThumbnails.some(t => t.id === id)) {
      allThumbnails.push({
        id,
        title: viewingTitles[idx] || '',
        photo: viewingPhotos[id] || '/placeholder.svg',
        type: 'viewing',
      });
    }
  });

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
            {/* Selected Items Thumbnails */}
            <div className="flex items-center gap-2 overflow-x-auto flex-1 min-w-0">
              <span className="text-sm font-medium text-muted-foreground shrink-0">
                Wybrane:
              </span>
              <div className="flex items-center gap-2">
                {allThumbnails.map((item) => (
                  <div
                    key={item.id}
                    className="relative group shrink-0"
                    style={{ overflow: 'visible' }}
                  >
                    <div className="h-12 w-16 rounded-lg bg-muted" style={{ overflow: 'hidden' }}>
                      <img
                        src={item.photo}
                        alt={item.title}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <button
                      onClick={() => {
                        if (item.type === 'compare') {
                          removeProperty(item.id);
                        }
                        if (onRemoveViewing && viewingIds.includes(item.id)) {
                          onRemoveViewing(item.id);
                        }
                      }}
                      className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5 shadow-md z-20 hover:scale-110 transition-transform"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[10px] px-1 py-0.5 truncate rounded-b-lg">
                      {item.title}
                    </div>
                  </div>
                ))}
                {allThumbnails.length < 4 && (
                  <div className="h-12 w-16 border-2 border-dashed border-muted-foreground/30 rounded-lg flex items-center justify-center text-muted-foreground/50 text-xs shrink-0">
                    +{4 - allThumbnails.length}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearAll}
                className="gap-1"
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">Wyczyść</span>
              </Button>

              {/* Compare Button - shows when compare items exist */}
              {hasCompare && (
                <Button
                  size="sm"
                  onClick={handleCompare}
                  disabled={propertyItems.length < 2}
                  className="gap-1"
                >
                  <GitCompare className="h-4 w-4" />
                  Porównaj ({propertyItems.length})
                </Button>
              )}

              {/* Viewing Button - shows when viewing items exist */}
              {hasViewing && (
                <Button
                  size="sm"
                  onClick={handleOpenViewing}
                  className="gap-1 bg-green-600 hover:bg-green-700 text-white"
                >
                  <Eye className="h-4 w-4" />
                  <span className="hidden sm:inline">Umów oglądanie ({viewingIds.length})</span>
                  <span className="sm:hidden">Umów ({viewingIds.length})</span>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Viewing Request Dialog */}
      <Dialog open={showViewingForm} onOpenChange={setShowViewingForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Umów oglądanie nieruchomości
            </DialogTitle>
          </DialogHeader>
          <ViewingRequestForm
            listingIds={viewingIds}
            listingTitles={viewingTitles}
            onSuccess={() => {
              setShowViewingForm(false);
              onClearViewing();
              navigate('/moje-ogladania');
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

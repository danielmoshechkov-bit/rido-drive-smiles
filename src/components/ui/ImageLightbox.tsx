import { useState, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ImageLightboxProps {
  images: string[];
  initialIndex?: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alt?: string;
}

export function ImageLightbox({ 
  images, 
  initialIndex = 0, 
  open, 
  onOpenChange,
  alt = "Image"
}: ImageLightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  
  // Reset to initial index when opening
  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex);
    }
  }, [open, initialIndex]);

  const handlePrev = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : images.length - 1));
  }, [images.length]);

  const handleNext = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex(prev => (prev < images.length - 1 ? prev + 1 : 0));
  }, [images.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        setCurrentIndex(prev => (prev > 0 ? prev - 1 : images.length - 1));
      } else if (e.key === "ArrowRight") {
        setCurrentIndex(prev => (prev < images.length - 1 ? prev + 1 : 0));
      } else if (e.key === "Escape") {
        onOpenChange(false);
      }
    };
    
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, images.length, onOpenChange]);

  if (images.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="max-w-[95vw] w-[95vw] h-[90vh] p-0 bg-black/95 border-0 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button - fixed position */}
        <button
          onClick={() => onOpenChange(false)}
          className="absolute top-4 right-4 z-50 p-2 rounded-full bg-black/70 hover:bg-black text-white transition-colors"
        >
          <X className="h-6 w-6" />
        </button>

        {/* Main image container - takes remaining space, fixed layout */}
        <div className="flex-1 relative flex items-center justify-center min-h-0 px-16">
          {/* Image with object-contain to fit within fixed container */}
          <img
            src={images[currentIndex]}
            alt={`${alt} ${currentIndex + 1}`}
            className="max-w-full max-h-full object-contain"
          />

          {/* Navigation arrows - fixed position relative to container edges */}
          {images.length > 1 && (
            <>
              <button
                onClick={handlePrev}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/70 hover:bg-black text-white transition-colors z-10"
              >
                <ChevronLeft className="h-8 w-8" />
              </button>
              <button
                onClick={handleNext}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/70 hover:bg-black text-white transition-colors z-10"
              >
                <ChevronRight className="h-8 w-8" />
              </button>
            </>
          )}
        </div>

        {/* Bottom section - fixed height, always visible */}
        <div className="flex-shrink-0 bg-black/80 p-4">
          {/* Counter */}
          <div className="text-center text-white mb-3 font-medium">
            {currentIndex + 1} / {images.length}
          </div>
          
          {/* Thumbnails - always visible */}
          {images.length > 1 && (
            <div className="flex justify-center gap-2 overflow-x-auto pb-2 touch-pan-x" style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
              {images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentIndex(idx);
                  }}
                  className={cn(
                    "w-16 h-16 rounded-md overflow-hidden flex-shrink-0 border-2 transition-all",
                    idx === currentIndex 
                      ? "border-white opacity-100" 
                      : "border-transparent opacity-60 hover:opacity-100"
                  )}
                >
                  <img
                    src={img}
                    alt={`Thumbnail ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

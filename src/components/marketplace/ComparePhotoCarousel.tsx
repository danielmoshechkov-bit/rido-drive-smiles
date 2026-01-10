import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ComparePhotoCarouselProps {
  photos: string[];
  title: string;
  transactionType?: string;
  transactionColor?: string;
  onRemove: () => void;
  className?: string;
}

export function ComparePhotoCarousel({
  photos,
  title,
  transactionType,
  transactionColor,
  onRemove,
  className,
}: ComparePhotoCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const images = photos.length > 0 ? photos : ["/placeholder.svg"];

  const nextPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev + 1) % images.length);
  };

  const prevPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
  };

  const goToPhoto = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentIndex(index);
  };

  return (
    <Card className={cn("relative overflow-hidden group", className)}>
      {/* Remove button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute top-2 right-2 z-20 bg-destructive text-destructive-foreground rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
      >
        <X className="h-4 w-4" />
      </button>

      {/* Image container */}
      <div className="relative h-36 overflow-hidden">
        <img
          src={images[currentIndex]}
          alt={title}
          className="w-full h-full object-cover transition-opacity duration-300"
        />

        {/* Navigation arrows - always visible */}
        {images.length > 1 && (
          <>
            <button
              onClick={prevPhoto}
              className="absolute left-1 top-1/2 -translate-y-1/2 bg-background/90 hover:bg-background rounded-full p-1.5 shadow-md z-10 border border-border/50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={nextPhoto}
              className="absolute right-1 top-1/2 -translate-y-1/2 bg-background/90 hover:bg-background rounded-full p-1.5 shadow-md z-10 border border-border/50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            {/* Photo indicators - always visible */}
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10 bg-background/70 backdrop-blur-sm rounded-full px-2 py-1">
              {images.slice(0, 5).map((_, idx) => (
                <button
                  key={idx}
                  onClick={(e) => goToPhoto(idx, e)}
                  className={cn(
                    "w-2 h-2 rounded-full transition-colors",
                    idx === currentIndex
                      ? "bg-primary"
                      : "bg-muted-foreground/40 hover:bg-muted-foreground/60"
                  )}
                />
              ))}
              {images.length > 5 && (
                <span className="text-[10px] text-foreground/70 px-1">
                  +{images.length - 5}
                </span>
              )}
            </div>
          </>
        )}

        {/* Transaction type badge */}
        {transactionType && (
          <Badge
            className="absolute bottom-2 right-2 text-xs font-medium shadow-md"
            style={{
              backgroundColor: transactionColor || "hsl(var(--primary))",
              color: "white",
            }}
          >
            {transactionType}
          </Badge>
        )}

        {/* Photo counter */}
        {images.length > 1 && (
          <div className="absolute bottom-2 left-2 bg-background/80 backdrop-blur-sm rounded px-1.5 py-0.5 text-[10px] font-medium">
            {currentIndex + 1}/{images.length}
          </div>
        )}
      </div>

      {/* Title */}
      <div className="p-3 text-center">
        <h3 className="font-semibold text-sm line-clamp-2">{title}</h3>
      </div>
    </Card>
  );
}

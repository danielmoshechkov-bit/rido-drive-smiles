import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, X, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface VehiclePhotoGalleryProps {
  photos: string[];
  title: string;
}

export function VehiclePhotoGallery({ photos, title }: VehiclePhotoGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());

  // Mobile smooth drag
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchCurrentX = useRef(0);
  const isDragging = useRef(false);
  const isHorizontal = useRef<boolean | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDraggingState, setIsDraggingState] = useState(false);

  // Lightbox touch
  const lbTouchStartX = useRef(0);
  const lbTouchEndX = useRef(0);

  const displayPhotos = photos.length > 0 ? photos : ["/placeholder.svg"];

  const handleImageError = (index: number) => {
    setImageErrors(prev => new Set(prev).add(index));
  };

  const getPhotoSrc = (index: number) => {
    if (imageErrors.has(index)) return "/placeholder.svg";
    return displayPhotos[index];
  };

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const nextLightbox = () => setLightboxIndex((prev) => (prev + 1) % displayPhotos.length);
  const prevLightbox = () => setLightboxIndex((prev) => (prev - 1 + displayPhotos.length) % displayPhotos.length);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!lightboxOpen) return;
      if (e.key === "ArrowLeft") prevLightbox();
      if (e.key === "ArrowRight") nextLightbox();
      if (e.key === "Escape") setLightboxOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightboxOpen]);

  // Mobile touch - single photo swipe
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchCurrentX.current = e.touches[0].clientX;
    isDragging.current = true;
    isHorizontal.current = null;
    setIsDraggingState(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current) return;
    touchCurrentX.current = e.touches[0].clientX;
    const dx = touchCurrentX.current - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (isHorizontal.current === null && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      isHorizontal.current = Math.abs(dx) > Math.abs(dy);
    }
    if (!isHorizontal.current) return;
    e.preventDefault();
    if ((currentIndex === 0 && dx > 0) || (currentIndex === displayPhotos.length - 1 && dx < 0)) {
      setDragOffset(dx * 0.25);
    } else {
      setDragOffset(dx);
    }
  }, [currentIndex, displayPhotos.length]);

  const handleTouchEnd = useCallback(() => {
    isDragging.current = false;
    setIsDraggingState(false);
    const dx = touchStartX.current - touchCurrentX.current;
    if (isHorizontal.current && Math.abs(dx) > 40) {
      if (dx > 0 && currentIndex < displayPhotos.length - 1) {
        setCurrentIndex(p => p + 1);
      } else if (dx < 0 && currentIndex > 0) {
        setCurrentIndex(p => p - 1);
      }
    }
    setDragOffset(0);
  }, [currentIndex, displayPhotos.length]);

  const handleLbTouchStart = (e: React.TouchEvent) => { lbTouchStartX.current = e.touches[0].clientX; };
  const handleLbTouchMove = (e: React.TouchEvent) => { lbTouchEndX.current = e.touches[0].clientX; };
  const handleLbTouchEnd = () => {
    const diff = lbTouchStartX.current - lbTouchEndX.current;
    if (Math.abs(diff) > 50) { diff > 0 ? nextLightbox() : prevLightbox(); }
  };

  if (displayPhotos.length === 0) {
    return (
      <div className="aspect-video bg-muted rounded-xl flex items-center justify-center">
        <ImageIcon className="h-16 w-16 text-muted-foreground/50" />
      </div>
    );
  }

  return (
    <>
      {/* Desktop Grid Layout */}
      <div className="hidden md:grid grid-cols-4 gap-2 rounded-xl overflow-hidden">
        <div
          className="col-span-2 row-span-2 relative cursor-pointer group"
          onClick={() => openLightbox(0)}
        >
          <img
            src={getPhotoSrc(0)}
            alt={title}
            className="w-full h-full object-cover object-center aspect-[4/3] group-hover:brightness-90 transition-all"
            onError={() => handleImageError(0)}
          />
        </div>
        {displayPhotos.slice(1, 5).map((_, idx) => (
          <div
            key={idx}
            className="relative cursor-pointer group aspect-[4/3]"
            onClick={() => openLightbox(idx + 1)}
          >
            <img
              src={getPhotoSrc(idx + 1)}
              alt={`${title} ${idx + 2}`}
              className="w-full h-full object-cover object-center group-hover:brightness-90 transition-all"
              onError={() => handleImageError(idx + 1)}
            />
            {idx === 3 && displayPhotos.length > 5 && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <span className="text-white text-lg font-semibold">+{displayPhotos.length - 5} zdjęć</span>
              </div>
            )}
          </div>
        ))}
        {displayPhotos.length < 5 &&
          Array.from({ length: 5 - displayPhotos.length }).map((_, idx) => (
            <div key={`empty-${idx}`} className="bg-muted aspect-[4/3]" />
          ))
        }
      </div>

      {/* Mobile: OTOMOTO-style grid (1 large + 2 small right) */}
      <div className="md:hidden relative rounded-xl overflow-hidden">
        {displayPhotos.length >= 3 ? (
          <div className="grid grid-cols-[1.5fr_1fr] gap-[2px] aspect-[4/3]" onClick={() => openLightbox(0)}>
            <div className="row-span-2 relative overflow-hidden">
              <img
                src={getPhotoSrc(0)}
                alt={title}
                className="w-full h-full object-cover"
                onError={() => handleImageError(0)}
              />
            </div>
            <div className="grid grid-rows-2 gap-[2px]">
              <div className="relative overflow-hidden cursor-pointer" onClick={(e) => { e.stopPropagation(); openLightbox(1); }}>
                <img src={getPhotoSrc(1)} alt={`${title} 2`} className="w-full h-full object-cover" onError={() => handleImageError(1)} />
              </div>
              <div className="relative overflow-hidden cursor-pointer" onClick={(e) => { e.stopPropagation(); openLightbox(2); }}>
                <img src={getPhotoSrc(2)} alt={`${title} 3`} className="w-full h-full object-cover" onError={() => handleImageError(2)} />
                {displayPhotos.length > 3 && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <span className="text-white text-2xl font-bold">+{displayPhotos.length - 3}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          /* 1-2 photos: single carousel */
          <div className="relative aspect-[4/3]">
            <img
              src={getPhotoSrc(currentIndex)}
              alt={title}
              className="w-full h-full object-cover"
              onError={() => handleImageError(currentIndex)}
              onClick={() => openLightbox(currentIndex)}
            />
            {displayPhotos.length > 1 && (
              <>
                <button onClick={() => setCurrentIndex(p => Math.max(0, p - 1))} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white p-2 rounded-full">
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button onClick={() => setCurrentIndex(p => Math.min(displayPhotos.length - 1, p + 1))} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white p-2 rounded-full">
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
          </div>
        )}
        {/* Photo counter */}
        <div className="absolute bottom-3 right-3 bg-black/60 text-white text-sm px-2 py-1 rounded-lg">
          {displayPhotos.length} zdjęć
        </div>
      </div>

      {/* Lightbox Modal */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-0">
          <div
            className="relative w-full h-[85vh] flex items-center justify-center"
            onTouchStart={handleLbTouchStart}
            onTouchMove={handleLbTouchMove}
            onTouchEnd={handleLbTouchEnd}
          >
            <button
              onClick={() => setLightboxOpen(false)}
              className="absolute top-4 right-4 z-50 bg-white/10 hover:bg-white/20 text-white p-2 rounded-full"
            >
              <X className="h-6 w-6" />
            </button>
            <img
              src={getPhotoSrc(lightboxIndex)}
              alt={`${title} ${lightboxIndex + 1}`}
              className="max-w-full max-h-full object-contain"
              onError={() => handleImageError(lightboxIndex)}
            />
            {displayPhotos.length > 1 && (
              <>
                <button onClick={prevLightbox} className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white p-3 rounded-full">
                  <ChevronLeft className="h-8 w-8" />
                </button>
                <button onClick={nextLightbox} className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white p-3 rounded-full">
                  <ChevronRight className="h-8 w-8" />
                </button>
              </>
            )}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white px-4 py-2 rounded-lg">
              {lightboxIndex + 1} / {displayPhotos.length}
            </div>
            <div className="absolute bottom-16 left-1/2 -translate-x-1/2 flex gap-2 max-w-full overflow-x-auto px-4 scrollbar-hide">
              {displayPhotos.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setLightboxIndex(idx)}
                  className={cn(
                    "w-16 h-12 rounded overflow-hidden flex-shrink-0 border-2 transition-all",
                    idx === lightboxIndex ? "border-white" : "border-transparent opacity-50 hover:opacity-100"
                  )}
                >
                  <img src={getPhotoSrc(idx)} alt={`Miniatura ${idx + 1}`} className="w-full h-full object-cover" onError={() => handleImageError(idx)} />
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

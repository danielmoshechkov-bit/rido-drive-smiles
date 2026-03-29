import { useState, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, X, Maximize2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface PropertyPhotoGalleryProps {
  photos: string[];
  title: string;
}

export function PropertyPhotoGallery({ photos, title }: PropertyPhotoGalleryProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());

  // Touch swipe state
  const touchStartX = useRef<number>(0);
  const touchCurrentX = useRef<number>(0);
  const touchEndX = useRef<number>(0);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const lightboxTouchStartX = useRef<number>(0);
  const lightboxTouchEndX = useRef<number>(0);

  const displayPhotos = photos.length > 0 ? photos : ["/placeholder.svg"];
  
  const handleImageError = (index: number) => {
    setImageErrors(prev => new Set(prev).add(index));
  };

  const getPhotoSrc = (index: number) => {
    if (imageErrors.has(index)) return "/placeholder.svg";
    return displayPhotos[index];
  };

  const mainPhoto = displayPhotos[0];
  const sidePhotos = displayPhotos.slice(1, 5);
  const remainingCount = displayPhotos.length > 5 ? displayPhotos.length - 5 : 0;

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setIsLightboxOpen(true);
  };

  const nextPhoto = useCallback(() => {
    setLightboxIndex((prev) => (prev + 1) % displayPhotos.length);
  }, [displayPhotos.length]);

  const prevPhoto = useCallback(() => {
    setLightboxIndex((prev) => (prev - 1 + displayPhotos.length) % displayPhotos.length);
  }, [displayPhotos.length]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") nextPhoto();
    if (e.key === "ArrowLeft") prevPhoto();
    if (e.key === "Escape") setIsLightboxOpen(false);
  };

  // Mobile carousel swipe handlers — smooth drag
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchCurrentX.current = e.touches[0].clientX;
    setIsSwiping(true);
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    touchCurrentX.current = e.touches[0].clientX;
    const diff = touchCurrentX.current - touchStartX.current;
    // Clamp at edges
    if ((currentIndex === 0 && diff > 0) || (currentIndex === displayPhotos.length - 1 && diff < 0)) {
      setSwipeOffset(diff * 0.3); // dampened at edges
    } else {
      setSwipeOffset(diff);
    }
  };
  const handleTouchEnd = () => {
    setIsSwiping(false);
    const diff = touchStartX.current - touchCurrentX.current;
    const threshold = 50;
    if (Math.abs(diff) > threshold) {
      if (diff > 0 && currentIndex < displayPhotos.length - 1) {
        setCurrentIndex((prev) => prev + 1);
      } else if (diff < 0 && currentIndex > 0) {
        setCurrentIndex((prev) => prev - 1);
      }
    }
    setSwipeOffset(0);
  };

  // Lightbox swipe handlers
  const handleLightboxTouchStart = (e: React.TouchEvent) => {
    lightboxTouchStartX.current = e.touches[0].clientX;
  };
  const handleLightboxTouchMove = (e: React.TouchEvent) => {
    lightboxTouchEndX.current = e.touches[0].clientX;
  };
  const handleLightboxTouchEnd = () => {
    const diff = lightboxTouchStartX.current - lightboxTouchEndX.current;
    if (Math.abs(diff) > 50) {
      if (diff > 0) nextPhoto();
      else prevPhoto();
    }
  };

  return (
    <>
      {/* Desktop Grid Layout */}
      <div className="hidden md:grid grid-cols-4 grid-rows-2 gap-2 h-[55vh] min-h-[400px] max-h-[700px] rounded-xl overflow-hidden">
        {/* Main Photo - spans 2 cols and 2 rows */}
        <div 
          className="col-span-2 row-span-2 relative group cursor-pointer"
          onClick={() => openLightbox(0)}
        >
          <img
            src={getPhotoSrc(0)}
            alt={title}
            className="w-full h-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
            onError={() => handleImageError(0)}
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
            <Maximize2 className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>

        {/* Side Photos */}
        {sidePhotos.map((photo, index) => (
          <div 
            key={index}
            className="relative group cursor-pointer"
            onClick={() => openLightbox(index + 1)}
          >
            <img
              src={getPhotoSrc(index + 1)}
              alt={`${title} - zdjęcie ${index + 2}`}
              className="w-full h-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
              onError={() => handleImageError(index + 1)}
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
            
            {index === sidePhotos.length - 1 && remainingCount > 0 && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <span className="text-white text-2xl font-bold">+{remainingCount}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Mobile Carousel - smooth drag swipe */}
      <div 
        className="md:hidden relative aspect-[4/3] rounded-xl overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="flex h-full"
          style={{
            transform: `translateX(calc(-${currentIndex * 100}% + ${swipeOffset}px))`,
            transition: isSwiping ? 'none' : 'transform 0.3s ease-out',
            width: `${displayPhotos.length * 100}%`,
          }}
        >
          {displayPhotos.map((photo, idx) => (
            <img
              key={idx}
              src={getPhotoSrc(idx)}
              alt={`${title} - zdjęcie ${idx + 1}`}
              className="h-full object-cover object-center flex-shrink-0"
              style={{ width: `${100 / displayPhotos.length}%` }}
              onError={() => handleImageError(idx)}
              onClick={() => openLightbox(idx)}
              draggable={false}
            />
          ))}
        </div>
        
        {displayPhotos.length > 1 && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex((prev) => (prev - 1 + displayPhotos.length) % displayPhotos.length);
              }}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIndex((prev) => (prev + 1) % displayPhotos.length);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            
            {/* Photo Indicators */}
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
              {displayPhotos.slice(0, 7).map((_, idx) => (
                <button
                  key={idx}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentIndex(idx);
                  }}
                  className={cn(
                    "w-2 h-2 rounded-full transition-all",
                    idx === currentIndex ? "bg-white w-4" : "bg-white/50"
                  )}
                />
              ))}
              {displayPhotos.length > 7 && (
                <span className="text-white text-xs ml-1">+{displayPhotos.length - 7}</span>
              )}
            </div>
          </>
        )}

        {/* Photo count badge */}
        <div className="absolute top-3 right-3 bg-black/60 text-white px-3 py-1 rounded-full text-sm">
          📷 {currentIndex + 1}/{displayPhotos.length}
        </div>
      </div>

      {/* Lightbox Modal - with touch swipe */}
      <Dialog open={isLightboxOpen} onOpenChange={setIsLightboxOpen}>
        <DialogContent 
          className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-none"
          onKeyDown={handleKeyDown}
        >
          <div 
            className="relative w-full h-[90vh] flex items-center justify-center"
            onTouchStart={handleLightboxTouchStart}
            onTouchMove={handleLightboxTouchMove}
            onTouchEnd={handleLightboxTouchEnd}
          >
            {/* Close Button */}
            <button
              onClick={() => setIsLightboxOpen(false)}
              className="absolute top-4 right-4 z-50 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            >
              <X className="h-6 w-6" />
            </button>

            {/* Photo Counter */}
            <div className="absolute top-4 left-4 z-50 bg-black/60 text-white px-4 py-2 rounded-full">
              {lightboxIndex + 1} / {displayPhotos.length}
            </div>

            {/* Main Image */}
            <img
              src={getPhotoSrc(lightboxIndex)}
              alt={`${title} - zdjęcie ${lightboxIndex + 1}`}
              className="max-w-full max-h-[80vh] object-contain select-none"
              onError={() => handleImageError(lightboxIndex)}
              draggable={false}
            />

            {/* Navigation Buttons */}
            {displayPhotos.length > 1 && (
              <>
                <button
                  onClick={prevPhoto}
                  className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                  <ChevronLeft className="h-8 w-8" />
                </button>
                <button
                  onClick={nextPhoto}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
                >
                  <ChevronRight className="h-8 w-8" />
                </button>
              </>
            )}

            {/* Thumbnail Strip */}
            <div 
              className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 max-w-[80vw] overflow-x-auto p-2 touch-pan-x"
              style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
            >
              {displayPhotos.map((photo, index) => (
                <button
                  key={index}
                  onClick={() => setLightboxIndex(index)}
                  className={cn(
                    "shrink-0 w-16 h-12 md:w-20 md:h-14 rounded-lg overflow-hidden border-2 transition-all",
                    index === lightboxIndex ? "border-white" : "border-transparent opacity-50 hover:opacity-100"
                  )}
                >
                  <img
                    src={getPhotoSrc(index)}
                    alt={`Miniatura ${index + 1}`}
                    className="w-full h-full object-cover"
                    onError={() => handleImageError(index)}
                  />
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

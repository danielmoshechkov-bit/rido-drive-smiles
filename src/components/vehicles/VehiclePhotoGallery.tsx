import { useState, useEffect, useRef } from "react";
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

  const nextLightbox = () => {
    setLightboxIndex((prev) => (prev + 1) % displayPhotos.length);
  };

  const prevLightbox = () => {
    setLightboxIndex((prev) => (prev - 1 + displayPhotos.length) % displayPhotos.length);
  };

  // Keyboard navigation for lightbox
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

  // Mobile carousel navigation
  const nextPhoto = () => {
    setCurrentIndex((prev) => (prev + 1) % displayPhotos.length);
  };

  const prevPhoto = () => {
    setCurrentIndex((prev) => (prev - 1 + displayPhotos.length) % displayPhotos.length);
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
        {/* Main Photo */}
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
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
        </div>

        {/* Side Photos */}
        {displayPhotos.slice(1, 5).map((photo, idx) => (
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
                <span className="text-white text-lg font-semibold">
                  +{displayPhotos.length - 5} zdjęć
                </span>
              </div>
            )}
          </div>
        ))}

        {/* Fill empty slots if less than 5 photos */}
        {displayPhotos.length < 5 && 
          Array.from({ length: 5 - displayPhotos.length }).map((_, idx) => (
            <div key={`empty-${idx}`} className="bg-muted aspect-[4/3]" />
          ))
        }
      </div>

      {/* Mobile Carousel */}
      <div className="md:hidden relative">
        <div 
          className="aspect-[4/3] overflow-hidden rounded-xl"
          onClick={() => openLightbox(currentIndex)}
        >
          <img 
            src={getPhotoSrc(currentIndex)} 
            alt={title}
            className="w-full h-full object-cover object-center"
            onError={() => handleImageError(currentIndex)}
          />
        </div>

        {/* Navigation Arrows */}
        {displayPhotos.length > 1 && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); prevPhoto(); }}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); nextPhoto(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white p-2 rounded-full"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}

        {/* Photo Counter */}
        <div className="absolute bottom-3 right-3 bg-black/60 text-white text-sm px-2 py-1 rounded-lg">
          {currentIndex + 1} / {displayPhotos.length}
        </div>

        {/* Indicators */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
          {displayPhotos.slice(0, 5).map((_, idx) => (
            <button
              key={idx}
              onClick={(e) => { e.stopPropagation(); setCurrentIndex(idx); }}
              className={cn(
                "w-2 h-2 rounded-full transition-all",
                idx === currentIndex ? "bg-white w-4" : "bg-white/50"
              )}
            />
          ))}
        </div>
      </div>

      {/* Lightbox Modal */}
      <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-0">
          <div className="relative w-full h-[85vh] flex items-center justify-center">
            {/* Close Button */}
            <button
              onClick={() => setLightboxOpen(false)}
              className="absolute top-4 right-4 z-50 bg-white/10 hover:bg-white/20 text-white p-2 rounded-full"
            >
              <X className="h-6 w-6" />
            </button>

            {/* Main Image */}
            <img 
              src={getPhotoSrc(lightboxIndex)} 
              alt={`${title} ${lightboxIndex + 1}`}
              className="max-w-full max-h-full object-contain"
              onError={() => handleImageError(lightboxIndex)}
            />

            {/* Navigation */}
            {displayPhotos.length > 1 && (
              <>
                <button
                  onClick={prevLightbox}
                  className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white p-3 rounded-full"
                >
                  <ChevronLeft className="h-8 w-8" />
                </button>
                <button
                  onClick={nextLightbox}
                  className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/10 hover:bg-white/20 text-white p-3 rounded-full"
                >
                  <ChevronRight className="h-8 w-8" />
                </button>
              </>
            )}

            {/* Counter */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white px-4 py-2 rounded-lg">
              {lightboxIndex + 1} / {displayPhotos.length}
            </div>

            {/* Thumbnails */}
            <div 
              className="absolute bottom-16 left-1/2 -translate-x-1/2 flex gap-2 max-w-full overflow-x-auto px-4 touch-pan-x"
              style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}
            >
              {displayPhotos.map((photo, idx) => (
                <button
                  key={idx}
                  onClick={() => setLightboxIndex(idx)}
                  className={cn(
                    "w-16 h-12 rounded overflow-hidden flex-shrink-0 border-2 transition-all",
                    idx === lightboxIndex ? "border-white" : "border-transparent opacity-50 hover:opacity-100"
                  )}
                >
                  <img 
                    src={getPhotoSrc(idx)} 
                    alt={`Miniatura ${idx + 1}`}
                    className="w-full h-full object-cover"
                    onError={() => handleImageError(idx)}
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

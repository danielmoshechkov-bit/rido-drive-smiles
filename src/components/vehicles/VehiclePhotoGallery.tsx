import { useState, useEffect, useRef, useCallback } from "react";
import { ChevronLeft, ChevronRight, X, Image as ImageIcon, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface VehiclePhotoGalleryProps {
  photos: string[];
  title: string;
}

export function VehiclePhotoGallery({ photos, title }: VehiclePhotoGalleryProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [imageErrors, setImageErrors] = useState<Set<number>>(new Set());

  // Mobile carousel state
  const [currentPage, setCurrentPage] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
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

  // Build pages for mobile: each page = 1 large (left ~60%) + 2 small (right stacked ~40%)
  // If only 1-2 photos, show simpler layout
  const mobilePages: number[][] = [];
  if (displayPhotos.length <= 2) {
    // One photo per page
    displayPhotos.forEach((_, i) => mobilePages.push([i]));
  } else {
    let i = 0;
    while (i < displayPhotos.length) {
      const remaining = displayPhotos.length - i;
      if (remaining >= 3) {
        mobilePages.push([i, i + 1, i + 2]);
        i += 3;
      } else if (remaining === 2) {
        mobilePages.push([i, i + 1]);
        i += 2;
      } else {
        mobilePages.push([i]);
        i += 1;
      }
    }
  }

  const totalPages = mobilePages.length;

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

  // Keyboard nav for lightbox
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

  // Mobile touch handlers - smooth single-page swipe
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

    // Determine direction on first significant move
    if (isHorizontal.current === null && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      isHorizontal.current = Math.abs(dx) > Math.abs(dy);
    }

    if (!isHorizontal.current) return;

    e.preventDefault();

    // Apply rubber-band at edges
    if ((currentPage === 0 && dx > 0) || (currentPage === totalPages - 1 && dx < 0)) {
      setDragOffset(dx * 0.25);
    } else {
      setDragOffset(dx);
    }
  }, [currentPage, totalPages]);

  const handleTouchEnd = useCallback(() => {
    isDragging.current = false;
    setIsDraggingState(false);
    const dx = touchStartX.current - touchCurrentX.current;

    if (isHorizontal.current && Math.abs(dx) > 40) {
      if (dx > 0 && currentPage < totalPages - 1) {
        setCurrentPage(p => p + 1);
      } else if (dx < 0 && currentPage > 0) {
        setCurrentPage(p => p - 1);
      }
    }
    setDragOffset(0);
  }, [currentPage, totalPages]);

  // Lightbox touch
  const handleLbTouchStart = (e: React.TouchEvent) => { lbTouchStartX.current = e.touches[0].clientX; };
  const handleLbTouchMove = (e: React.TouchEvent) => { lbTouchEndX.current = e.touches[0].clientX; };
  const handleLbTouchEnd = () => {
    const diff = lbTouchStartX.current - lbTouchEndX.current;
    if (Math.abs(diff) > 50) { diff > 0 ? nextLightbox() : prevLightbox(); }
  };

  // Count remaining photos not visible on current page
  const getExtraCount = (pageIndices: number[]) => {
    const lastIdxOnPage = pageIndices[pageIndices.length - 1];
    return displayPhotos.length - lastIdxOnPage - 1;
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
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
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
                <span className="text-white text-lg font-semibold">
                  +{displayPhotos.length - 5} zdjęć
                </span>
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

      {/* Mobile: OTOMOTO-style photo grid with swipe */}
      <div className="md:hidden relative overflow-hidden" ref={containerRef}>
        <div
          className="flex"
          style={{
            transform: `translateX(calc(-${currentPage * 100}% + ${dragOffset}px))`,
            transition: isDraggingState ? 'none' : 'transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            width: `${totalPages * 100}%`,
          }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {mobilePages.map((pageIndices, pageIdx) => (
            <div
              key={pageIdx}
              className="flex-shrink-0"
              style={{ width: `${100 / totalPages}%` }}
            >
              {pageIndices.length === 1 ? (
                /* Single photo page */
                <div
                  className="aspect-[4/3] relative cursor-pointer"
                  onClick={() => openLightbox(pageIndices[0])}
                >
                  <img
                    src={getPhotoSrc(pageIndices[0])}
                    alt={`${title} ${pageIndices[0] + 1}`}
                    className="w-full h-full object-cover"
                    onError={() => handleImageError(pageIndices[0])}
                    draggable={false}
                  />
                </div>
              ) : pageIndices.length === 2 ? (
                /* Two photos: side by side */
                <div className="aspect-[4/3] grid grid-cols-2 gap-[2px]">
                  {pageIndices.map((photoIdx, i) => (
                    <div
                      key={photoIdx}
                      className="relative cursor-pointer overflow-hidden"
                      onClick={() => openLightbox(photoIdx)}
                    >
                      <img
                        src={getPhotoSrc(photoIdx)}
                        alt={`${title} ${photoIdx + 1}`}
                        className="w-full h-full object-cover"
                        onError={() => handleImageError(photoIdx)}
                        draggable={false}
                      />
                      {/* Show +N on last photo of last page */}
                      {pageIdx === totalPages - 1 && i === pageIndices.length - 1 && getExtraCount(pageIndices) > 0 && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <span className="text-white text-2xl font-bold">+{getExtraCount(pageIndices)}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                /* Three photos: 1 large left (60%) + 2 stacked right (40%) — OTOMOTO style */
                <div className="aspect-[4/3] grid grid-cols-[1.4fr_1fr] gap-[2px]">
                  {/* Large left photo */}
                  <div
                    className="row-span-2 relative cursor-pointer overflow-hidden"
                    onClick={() => openLightbox(pageIndices[0])}
                  >
                    <img
                      src={getPhotoSrc(pageIndices[0])}
                      alt={`${title} ${pageIndices[0] + 1}`}
                      className="w-full h-full object-cover"
                      onError={() => handleImageError(pageIndices[0])}
                      draggable={false}
                    />
                    {/* "Wyróżnione" badge on first page's main photo */}
                    {pageIdx === 0 && (
                      <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
                        {displayPhotos.length} zdjęć
                      </div>
                    )}
                  </div>
                  {/* Two stacked right photos */}
                  <div className="grid grid-rows-2 gap-[2px]">
                    <div
                      className="relative cursor-pointer overflow-hidden"
                      onClick={() => openLightbox(pageIndices[1])}
                    >
                      <img
                        src={getPhotoSrc(pageIndices[1])}
                        alt={`${title} ${pageIndices[1] + 1}`}
                        className="w-full h-full object-cover"
                        onError={() => handleImageError(pageIndices[1])}
                        draggable={false}
                      />
                    </div>
                    <div
                      className="relative cursor-pointer overflow-hidden"
                      onClick={() => openLightbox(pageIndices[2])}
                    >
                      <img
                        src={getPhotoSrc(pageIndices[2])}
                        alt={`${title} ${pageIndices[2] + 1}`}
                        className="w-full h-full object-cover"
                        onError={() => handleImageError(pageIndices[2])}
                        draggable={false}
                      />
                      {/* +N overlay on last thumbnail of a page if more pages follow */}
                      {pageIdx < totalPages - 1 && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <span className="text-white text-2xl font-bold">
                            +{displayPhotos.length - pageIndices[2] - 1}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Favorite button */}
        <button className="absolute bottom-3 right-3 bg-white/90 rounded-full p-2.5 shadow-lg">
          <Heart className="h-5 w-5 text-muted-foreground" />
        </button>

        {/* Page dots */}
        {totalPages > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
            {mobilePages.map((_, idx) => (
              <button
                key={idx}
                onClick={() => setCurrentPage(idx)}
                className={cn(
                  "w-1.5 h-1.5 rounded-full transition-all",
                  idx === currentPage ? "bg-white w-3" : "bg-white/50"
                )}
              />
            ))}
          </div>
        )}
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
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-white px-4 py-2 rounded-lg">
              {lightboxIndex + 1} / {displayPhotos.length}
            </div>
            <div
              className="absolute bottom-16 left-1/2 -translate-x-1/2 flex gap-2 max-w-full overflow-x-auto px-4 scrollbar-hide"
            >
              {displayPhotos.map((_, idx) => (
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

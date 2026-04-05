import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { useListingTranslation } from "@/hooks/useListingTranslation";

import { Heart, MapPin, Sparkles, ImageIcon, ChevronLeft, ChevronRight, GitCompareArrows } from "lucide-react";
import { cn } from "@/lib/utils";

interface GeneralListingCardProps {
  listing: {
    id: string;
    title: string;
    price: number | null;
    price_negotiable?: boolean;
    condition?: string;
    location?: string;
    ai_score?: number | null;
    created_at: string;
    photos?: { url: string; is_ai_enhanced?: boolean }[];
    category?: { name: string } | null;
  };
  variant?: "grid" | "compact" | "list";
  onToggleCompare?: () => void;
  isSelectedForCompare?: boolean;
}

const CONDITION_STYLES: Record<string, { label: string; className: string }> = {
  nowy: { label: "Nowy", className: "bg-green-500/10 text-green-700 border-green-200" },
  jak_nowy: { label: "Jak nowy", className: "bg-teal-500/10 text-teal-700 border-teal-200" },
  dobry: { label: "Dobry", className: "bg-blue-500/10 text-blue-700 border-blue-200" },
  dostateczny: { label: "Dostateczny", className: "bg-yellow-500/10 text-yellow-700 border-yellow-200" },
  do_naprawy: { label: "Do naprawy", className: "bg-red-500/10 text-red-700 border-red-200" },
};

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${mins} min temu`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} godz. temu`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} dni temu`;
  return `${Math.floor(days / 30)} mies. temu`;
}

export function GeneralListingCard({ listing, variant = "grid", onToggleCompare, isSelectedForCompare }: GeneralListingCardProps) {
  const navigate = useNavigate();
  const [currentPhotoIdx, setCurrentPhotoIdx] = useState(0);
  const [isFav, setIsFav] = useState(() => {
    try {
      const favs = JSON.parse(localStorage.getItem("rido_market_favs") || "[]");
      return favs.includes(listing.id);
    } catch { return false; }
  });

  const photos = listing.photos || [];
  const photo = photos[currentPhotoIdx];
  const hasAiPhoto = photos.some(p => p.is_ai_enhanced);
  const cond = listing.condition ? CONDITION_STYLES[listing.condition] : null;

  const toggleFav = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const favs: string[] = JSON.parse(localStorage.getItem("rido_market_favs") || "[]");
    const next = isFav ? favs.filter(f => f !== listing.id) : [...favs, listing.id];
    localStorage.setItem("rido_market_favs", JSON.stringify(next));
    setIsFav(!isFav);
  };

  const handlePrevPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setCurrentPhotoIdx(i => (i > 0 ? i - 1 : photos.length - 1));
  };

  const handleNextPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setCurrentPhotoIdx(i => (i < photos.length - 1 ? i + 1 : 0));
  };

  const aiStars = listing.ai_score ? Math.round(listing.ai_score / 2) : 0;

  // LIST variant - horizontal card
  if (variant === "list") {
    return (
      <article
        onClick={() => navigate(`/marketplace/listing/${listing.id}`)}
        className="group cursor-pointer rounded-xl border bg-card shadow-sm hover:shadow-md transition-all overflow-hidden flex"
      >
        <div className="relative w-[200px] sm:w-[240px] shrink-0 bg-muted overflow-hidden">
          {photo ? (
            <img src={photo.url} alt={listing.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground min-h-[140px]">
              <ImageIcon className="h-8 w-8 mb-1" />
              <span className="text-xs">Brak zdjęcia</span>
            </div>
          )}
          {hasAiPhoto && (
            <Badge className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs gap-1">
              <Sparkles className="h-3 w-3" /> AI foto
            </Badge>
          )}
          <button onClick={toggleFav} className="absolute top-2 right-2 z-10 h-8 w-8 rounded-full bg-background/80 backdrop-blur flex items-center justify-center hover:bg-background transition">
            <Heart className={cn("h-4 w-4", isFav ? "fill-red-500 text-red-500" : "text-foreground")} />
          </button>
        </div>
        <div className="flex-1 p-4 flex flex-col justify-between min-w-0">
          <div>
            <h3 className="font-medium text-sm leading-tight line-clamp-2 mb-1">{listing.title}</h3>
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {cond && <Badge variant="outline" className={cn("text-xs", cond.className)}>{cond.label}</Badge>}
              {listing.location && (
                <span className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{listing.location}</span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-base font-bold text-primary">
              {listing.price ? `${listing.price.toLocaleString("pl-PL")}\u00A0zł` : "Zapytaj o cenę"}
            </span>
            <span className="text-xs text-muted-foreground">{timeAgo(listing.created_at)}</span>
          </div>
        </div>
      </article>
    );
  }

  // GRID / COMPACT variant
  return (
    <article
      onClick={() => navigate(`/marketplace/listing/${listing.id}`)}
      className="group cursor-pointer rounded-xl border bg-card shadow-sm hover:shadow-md transition-all overflow-hidden"
    >
      {/* Image with gallery arrows */}
      <div className="relative aspect-[4/3] bg-muted overflow-hidden">
        {photo ? (
          <img
            src={photo.url}
            alt={listing.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
            <ImageIcon className="h-10 w-10 mb-2" />
            <span className="text-sm">Brak zdjęcia</span>
          </div>
        )}

        {/* Photo navigation arrows */}
        {photos.length > 1 && (
          <>
            <button
              onClick={handlePrevPhoto}
              className="absolute left-1.5 top-1/2 -translate-y-1/2 z-10 h-7 w-7 rounded-full bg-background/80 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 transition hover:bg-background"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={handleNextPhoto}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 z-10 h-7 w-7 rounded-full bg-background/80 backdrop-blur flex items-center justify-center opacity-0 group-hover:opacity-100 transition hover:bg-background"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            {/* Dots */}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10 flex gap-1">
              {photos.slice(0, 5).map((_, i) => (
                <span key={i} className={cn("h-1.5 w-1.5 rounded-full transition", i === currentPhotoIdx ? "bg-white" : "bg-white/50")} />
              ))}
              {photos.length > 5 && <span className="text-white text-[10px] ml-0.5">+{photos.length - 5}</span>}
            </div>
          </>
        )}

        {/* Compare button - top left */}
        {onToggleCompare && (
          <button
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onToggleCompare(); }}
            className={cn(
              "absolute top-2 left-2 z-10 h-8 px-2 rounded-full backdrop-blur flex items-center justify-center gap-1 text-xs font-medium transition",
              isSelectedForCompare
                ? "bg-primary text-primary-foreground"
                : "bg-background/80 text-foreground hover:bg-background"
            )}
          >
            <GitCompareArrows className="h-3.5 w-3.5" />
            {!isSelectedForCompare && <span className="hidden sm:inline">Porównaj</span>}
          </button>
        )}

        {/* Fav heart - top right */}
        <button
          onClick={toggleFav}
          className="absolute top-2 right-2 z-10 h-8 w-8 rounded-full bg-background/80 backdrop-blur flex items-center justify-center hover:bg-background transition"
        >
          <Heart className={cn("h-4 w-4", isFav ? "fill-red-500 text-red-500" : "text-foreground")} />
        </button>

        {/* AI photo badge */}
        {hasAiPhoto && (
          <Badge className="absolute bottom-2 left-2 bg-primary text-primary-foreground text-xs gap-1">
            <Sparkles className="h-3 w-3" /> AI foto
          </Badge>
        )}
      </div>

      {/* Info */}
      <div className="p-3 space-y-1.5">
        <h3 className="font-medium text-sm leading-tight line-clamp-2 min-h-[2.5rem]">
          {listing.title}
        </h3>

        {/* Price */}
        <div className="flex items-baseline gap-1.5">
          <span className="text-base font-bold text-primary">
            {listing.price ? `${listing.price.toLocaleString("pl-PL")}\u00A0zł` : "Zapytaj o cenę"}
          </span>
          {listing.price_negotiable && (
            <span className="text-xs text-muted-foreground">(do negocjacji)</span>
          )}
        </div>

        {/* Condition badge */}
        {cond && (
          <Badge variant="outline" className={cn("text-xs", cond.className)}>
            {cond.label}
          </Badge>
        )}

        {/* Location + time */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
          <div className="flex items-center gap-1 truncate">
            {listing.location && (
              <>
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{listing.location}</span>
              </>
            )}
          </div>
          <span className="shrink-0">{timeAgo(listing.created_at)}</span>
        </div>

        {/* AI score */}
        {aiStars > 0 && (
          <div className="flex items-center gap-0.5 pt-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <span key={i} className={cn("text-xs", i < aiStars ? "text-yellow-500" : "text-muted-foreground/30")}>★</span>
            ))}
            <span className="text-xs text-muted-foreground ml-1">{(listing.ai_score! / 2).toFixed(1)}</span>
          </div>
        )}
      </div>
    </article>
  );
}

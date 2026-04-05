import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Heart, MapPin, Sparkles, ImageIcon } from "lucide-react";
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

export function GeneralListingCard({ listing }: GeneralListingCardProps) {
  const navigate = useNavigate();
  const [isFav, setIsFav] = useState(() => {
    try {
      const favs = JSON.parse(localStorage.getItem("rido_market_favs") || "[]");
      return favs.includes(listing.id);
    } catch { return false; }
  });

  const photo = listing.photos?.[0];
  const hasAiPhoto = listing.photos?.some(p => p.is_ai_enhanced);
  const cond = listing.condition ? CONDITION_STYLES[listing.condition] : null;

  const toggleFav = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const favs: string[] = JSON.parse(localStorage.getItem("rido_market_favs") || "[]");
    const next = isFav ? favs.filter(f => f !== listing.id) : [...favs, listing.id];
    localStorage.setItem("rido_market_favs", JSON.stringify(next));
    setIsFav(!isFav);
  };

  const aiStars = listing.ai_score ? Math.round(listing.ai_score / 2) : 0;

  return (
    <article
      onClick={() => navigate(`/marketplace/listing/${listing.id}`)}
      className="group cursor-pointer rounded-xl border bg-card shadow-sm hover:shadow-md transition-all overflow-hidden"
    >
      {/* Image */}
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

        {/* Fav heart */}
        <button
          onClick={toggleFav}
          className="absolute top-2 right-2 z-10 h-8 w-8 rounded-full bg-background/80 backdrop-blur flex items-center justify-center hover:bg-background transition"
        >
          <Heart className={cn("h-4 w-4", isFav ? "fill-red-500 text-red-500" : "text-foreground")} />
        </button>

        {/* AI photo badge */}
        {hasAiPhoto && (
          <Badge className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs gap-1">
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
            <span className="text-xs text-muted-foreground ml-1">{listing.ai_score?.toFixed(1)}</span>
          </div>
        )}
      </div>
    </article>
  );
}

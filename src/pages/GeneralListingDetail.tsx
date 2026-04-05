import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useCart } from "@/hooks/useCart";
import { PendingReviewBanner } from "@/components/marketplace/PendingReviewBanner";
import { MarketCompareBar } from "@/components/marketplace/MarketCompareBar";
import {
  ArrowLeft, Heart, Share2, MapPin, Eye, ShoppingCart, Star,
  Sparkles, User, Calendar, CheckCircle, Loader2, ImageIcon, AlertTriangle
} from "lucide-react";
import { cn } from "@/lib/utils";

const CONDITION_MAP: Record<string, { label: string; color: string }> = {
  nowy: { label: "Nowy", color: "bg-green-500/10 text-green-700" },
  jak_nowy: { label: "Jak nowy", color: "bg-teal-500/10 text-teal-700" },
  dobry: { label: "Dobry", color: "bg-blue-500/10 text-blue-700" },
  dostateczny: { label: "Dostateczny", color: "bg-yellow-500/10 text-yellow-700" },
  do_naprawy: { label: "Do naprawy", color: "bg-red-500/10 text-red-700" },
};

export default function GeneralListingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [listing, setListing] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [category, setCategory] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState(0);
  const [isFav, setIsFav] = useState(false);
  const [aiAssessing, setAiAssessing] = useState(false);
  const [sellerRating, setSellerRating] = useState<{ avg: number; count: number } | null>(null);
  const { addToCart, isInCart } = useCart();

  useEffect(() => { window.scrollTo(0, 0); }, [id]);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      const [listRes, photoRes] = await Promise.all([
        supabase.from("general_listings").select("*").eq("id", id).single(),
        supabase.from("general_listing_photos").select("*").eq("listing_id", id).order("display_order"),
      ]);

      if (listRes.error || !listRes.data) {
        setListing(null);
        setLoading(false);
        return;
      }
      setListing(listRes.data);
      setPhotos(photoRes.data || []);

      // Category
      if (listRes.data.category_id) {
        const { data: cat } = await supabase
          .from("general_listing_categories")
          .select("name, slug")
          .eq("id", listRes.data.category_id)
          .single();
        if (cat) setCategory(cat);
      }

      // Track view
      supabase.functions.invoke("track-listing-interaction", {
        body: { listingId: id, interactionType: "view" }
      }).catch(() => {});

      // Fetch seller rating
      if (listRes.data.user_id) {
        const { data: reviews } = await supabase
          .from("listing_reviews")
          .select("score_avg")
          .eq("seller_id", listRes.data.user_id);
        if (reviews && reviews.length > 0) {
          const avg = reviews.reduce((s, r) => s + Number(r.score_avg), 0) / reviews.length;
          setSellerRating({ avg, count: reviews.length });
        }
      }

      // Fav
      const favs = JSON.parse(localStorage.getItem("rido_market_favs") || "[]");
      setIsFav(favs.includes(id));

      setLoading(false);
    };
    load();
  }, [id]);

  useEffect(() => {
    if (listing) {
      document.title = `${listing.title} — GetRido Marketplace`;
    }
    return () => { document.title = "GetRido"; };
  }, [listing]);

  const toggleFav = () => {
    const favs: string[] = JSON.parse(localStorage.getItem("rido_market_favs") || "[]");
    const next = isFav ? favs.filter(f => f !== id) : [...favs, id!];
    localStorage.setItem("rido_market_favs", JSON.stringify(next));
    setIsFav(!isFav);
  };

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({ title: listing?.title, url: window.location.href });
    } else {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link skopiowany");
    }
  };

  const handleRefreshAI = async () => {
    if (!listing) return;
    setAiAssessing(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-listing-assessment", {
        body: { listing_id: listing.id, title: listing.title, description: listing.description, price: listing.price, category: category?.name }
      });
      if (error) throw error;
      if (data?.score !== undefined) {
        setListing((prev: any) => ({ ...prev, ai_score: data.score, ai_tips: data.tips || prev.ai_tips }));
        toast.success("Ocena AI zaktualizowana");
      }
    } catch {
      toast.error("Błąd oceny AI");
    } finally {
      setAiAssessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">Nie znaleziono ogłoszenia</h1>
        <Button onClick={() => navigate("/marketplace")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Wróć do listy
        </Button>
      </div>
    );
  }

  const cond = listing.condition ? CONDITION_MAP[listing.condition] : null;
  const currentPhoto = photos[selectedPhoto];
  const aiScore = listing.ai_score;
  const aiTips: string[] = Array.isArray(listing.ai_tips) ? listing.ai_tips : [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Wróć</span>
            </Button>
            <span
              className="hidden md:inline font-bold text-lg text-primary cursor-pointer"
              onClick={() => navigate("/easy")}
            >
              RidoMarket
            </span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleShare} className="gap-1.5">
              <Share2 className="h-4 w-4" />
              <span className="hidden sm:inline">Udostępnij</span>
            </Button>
            <Button
              variant={isFav ? "default" : "outline"} size="sm" onClick={toggleFav}
              className={cn("gap-1.5", isFav && "bg-red-500 hover:bg-red-600 border-red-500")}
            >
              <Heart className={cn("h-4 w-4", isFav && "fill-white")} />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Gallery */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Photos — 3/5 */}
          <div className="lg:col-span-3 space-y-3">
            {/* Main photo */}
            <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-muted">
              {photos.length > 0 ? (
                <>
                  <img
                    src={currentPhoto?.url}
                    alt={listing.title}
                    className="w-full h-full object-cover"
                    onContextMenu={currentPhoto?.is_protected ? (e) => e.preventDefault() : undefined}
                    draggable={currentPhoto?.is_protected ? false : undefined}
                  />
                  {currentPhoto?.is_protected && (
                    <div className="absolute inset-0 pointer-events-none z-10" />
                  )}
                  {currentPhoto?.is_ai_enhanced && (
                    <Badge className="absolute top-3 left-3 bg-primary text-primary-foreground gap-1">
                      <Sparkles className="h-3 w-3" /> AI
                    </Badge>
                  )}
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                  <ImageIcon className="h-16 w-16 mb-2" />
                  <span>Brak zdjęć</span>
                </div>
              )}
            </div>

            {/* Thumbnails */}
            {photos.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {photos.map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPhoto(i)}
                    className={cn(
                      "shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition",
                      selectedPhoto === i ? "border-primary" : "border-transparent opacity-70 hover:opacity-100"
                    )}
                  >
                    <img src={p.url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Info — 2/5 */}
          <div className="lg:col-span-2 space-y-5">
            {/* Breadcrumb */}
            <div className="text-sm text-muted-foreground flex items-center gap-1 flex-wrap">
              <button onClick={() => navigate("/marketplace")} className="hover:text-primary transition">Marketplace</button>
              {category && (
                <>
                  <span>›</span>
                  <button
                    onClick={() => navigate(`/marketplace?cat=${category.slug}`)}
                    className="hover:text-primary transition"
                  >
                    {category.name}
                  </button>
                </>
              )}
              <span>›</span>
              <span className="truncate max-w-[160px]">{listing.title}</span>
            </div>

            {/* Title */}
            <h1 className="text-2xl md:text-3xl font-bold leading-tight">{listing.title}</h1>

            {/* Price */}
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-primary">
                {listing.price ? `${Number(listing.price).toLocaleString("pl-PL")}\u00A0zł` : "Zapytaj o cenę"}
              </span>
              {listing.price_negotiable && (
                <span className="text-sm text-muted-foreground">(do negocjacji)</span>
              )}
            </div>

            {/* Badges row */}
            <div className="flex flex-wrap gap-2">
              {cond && (
                <Badge variant="outline" className={cond.color}>{cond.label}</Badge>
              )}
              {listing.location && (
                <Badge variant="secondary" className="gap-1">
                  <MapPin className="h-3 w-3" /> {listing.location}
                </Badge>
              )}
              <Badge variant="secondary" className="gap-1">
                <Calendar className="h-3 w-3" /> {new Date(listing.created_at).toLocaleDateString("pl-PL")}
              </Badge>
              {listing.views_count > 0 && (
                <Badge variant="secondary" className="gap-1">
                  <Eye className="h-3 w-3" /> {listing.views_count} wyświetleń
                </Badge>
              )}
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                className="gap-1.5"
                disabled={isInCart(listing.id)}
                onClick={() => {
                  const photoUrl = photos[0]?.url || null;
                  addToCart(listing.id, listing.title, listing.price, photoUrl);
                  toast.success("Dodano do koszyka");
                }}
              >
                <ShoppingCart className="h-4 w-4" />
                {isInCart(listing.id) ? "W koszyku" : "Do koszyka"}
              </Button>
              <Button variant="outline" onClick={toggleFav} className="gap-1.5">
                <Heart className={cn("h-4 w-4", isFav && "fill-red-500 text-red-500")} />
                {isFav ? "Obserwujesz" : "Obserwuj"}
              </Button>
            </div>

            <Separator />

            {/* Seller card */}
            <Card className="p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">Sprzedawca</p>
                  {sellerRating ? (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                      <span>{sellerRating.avg.toFixed(1)}</span>
                      <span>({sellerRating.count} ocen)</span>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Użytkownik GetRido</p>
                  )}
                </div>
              </div>
              <Button variant="outline" size="sm" disabled className="w-full mt-2" title="Wiadomości wkrótce">
                Napisz wiadomość
              </Button>
            </Card>

            {/* AI Assessment card */}
            {aiScore !== null && aiScore !== undefined && (
              <Card className="p-4 border-primary/20">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Ocena RidoAI: {Number(aiScore).toFixed(1)}/10
                  </h3>
                  <Button variant="ghost" size="sm" onClick={handleRefreshAI} disabled={aiAssessing}>
                    {aiAssessing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Przelicz"}
                  </Button>
                </div>
                <Progress
                  value={Number(aiScore) * 10}
                  className={cn("h-2.5 mb-3", Number(aiScore) >= 7 ? "[&>div]:bg-green-500" : Number(aiScore) >= 5 ? "[&>div]:bg-yellow-500" : "[&>div]:bg-red-500")}
                />
                {aiTips.length > 0 && (
                  <ul className="space-y-1.5">
                    {aiTips.map((tip, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                        {Number(aiScore) >= 7 ? (
                          <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
                        )}
                        {tip}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
          </div>
        </div>

        {/* Description */}
        <div className="mt-8 max-w-4xl">
          <h2 className="text-xl font-bold mb-4">Opis</h2>
          <div className="prose prose-sm max-w-none text-foreground whitespace-pre-wrap leading-relaxed">
            {listing.description || "Brak opisu."}
          </div>
        </div>

        {/* Params table */}
        <div className="mt-8 max-w-4xl">
          <h2 className="text-xl font-bold mb-4">Parametry</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {listing.condition && (
              <div className="p-3 rounded-xl bg-card border">
                <p className="text-xs text-muted-foreground">Stan</p>
                <p className="font-medium text-sm">{CONDITION_MAP[listing.condition]?.label || listing.condition}</p>
              </div>
            )}
            {listing.location && (
              <div className="p-3 rounded-xl bg-card border">
                <p className="text-xs text-muted-foreground">Lokalizacja</p>
                <p className="font-medium text-sm">{listing.location}</p>
              </div>
            )}
            <div className="p-3 rounded-xl bg-card border">
              <p className="text-xs text-muted-foreground">Dodano</p>
              <p className="font-medium text-sm">{new Date(listing.created_at).toLocaleDateString("pl-PL")}</p>
            </div>
            <div className="p-3 rounded-xl bg-card border">
              <p className="text-xs text-muted-foreground">Negocjacja ceny</p>
              <p className="font-medium text-sm">{listing.price_negotiable ? "Tak" : "Nie"}</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t py-8 bg-card mt-12">
        <div className="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <span
            className="font-semibold cursor-pointer hover:opacity-80"
            onClick={() => navigate("/easy")}
          >
            RIDO Marketplace
          </span>
          <button onClick={() => navigate("/marketplace")} className="text-sm text-primary hover:underline">
            ← Wszystkie ogłoszenia
          </button>
          <p className="text-muted-foreground text-sm">© 2025 get RIDO. Wszystkie prawa zastrzeżone.</p>
        </div>
      </footer>
    </div>
  );
}

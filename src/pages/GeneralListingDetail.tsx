import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { useCart } from "@/hooks/useCart";
import { useListingTranslation } from "@/hooks/useListingTranslation";
import { PendingReviewBanner } from "@/components/marketplace/PendingReviewBanner";
import { MarketCompareBar } from "@/components/marketplace/MarketCompareBar";
import { GeneralListingCard } from "@/components/marketplace/GeneralListingCard";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import {
  ArrowLeft, Heart, Share2, MapPin, Eye, ShoppingCart, Star,
  Sparkles, User, Calendar, CheckCircle, Loader2, ImageIcon,
  Phone, MessageCircle, Tag, Handshake, Package, RefreshCw, X
} from "lucide-react";
import { cn } from "@/lib/utils";

const CONDITION_KEYS: Record<string, { key: string; color: string }> = {
  nowy: { key: "new", color: "bg-green-500/10 text-green-700" },
  jak_nowy: { key: "likeNew", color: "bg-teal-500/10 text-teal-700" },
  dobry: { key: "good", color: "bg-blue-500/10 text-blue-700" },
  dostateczny: { key: "fair", color: "bg-yellow-500/10 text-yellow-700" },
  do_naprawy: { key: "toRepair", color: "bg-red-500/10 text-red-700" },
};

export default function GeneralListingDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const [listing, setListing] = useState<any>(null);
  const [photos, setPhotos] = useState<any[]>([]);
  const [category, setCategory] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState(0);
  const [fullscreenGallery, setFullscreenGallery] = useState(false);
  const [isFav, setIsFav] = useState(false);
  const [aiAssessing, setAiAssessing] = useState(false);
  const [sellerRating, setSellerRating] = useState<{ avg: number; count: number } | null>(null);
  const [similarListings, setSimilarListings] = useState<any[]>([]);
  const [similarPhotos, setSimilarPhotos] = useState<Record<string, any[]>>({});
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

      if (listRes.data.category_id) {
        const { data: cat } = await supabase
          .from("general_listing_categories")
          .select("name, slug")
          .eq("id", listRes.data.category_id)
          .single();
        if (cat) setCategory(cat);

        const { data: similar } = await supabase
          .from("general_listings")
          .select("id, title, price, price_negotiable, condition, location, ai_score, created_at, category_id, views_count, status")
          .eq("category_id", listRes.data.category_id)
          .eq("status", "active")
          .neq("id", id)
          .limit(4);
        if (similar && similar.length > 0) {
          setSimilarListings(similar);
          const simIds = similar.map(s => s.id);
          const { data: simPhotos } = await supabase
            .from("general_listing_photos")
            .select("listing_id, url, is_ai_enhanced, display_order")
            .in("listing_id", simIds)
            .order("display_order");
          if (simPhotos) {
            const map: Record<string, any[]> = {};
            simPhotos.forEach(p => {
              if (!map[p.listing_id]) map[p.listing_id] = [];
              map[p.listing_id].push(p);
            });
            setSimilarPhotos(map);
          }
        }
      }

      supabase.functions.invoke("track-listing-interaction", {
        body: { listingId: id, interactionType: "view" }
      }).catch(() => {});

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

      const favs = JSON.parse(localStorage.getItem("rido_market_favs") || "[]");
      setIsFav(favs.includes(id));
      setLoading(false);
    };
    load();
  }, [id]);

  useEffect(() => {
    if (listing) document.title = `${listing.title} — GetRido Marketplace`;
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
      toast.success(t('listingDetail.linkCopied'));
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
        toast.success(t('listingDetail.aiUpdated'));
      }
    } catch {
      toast.error(t('listingDetail.aiError'));
    } finally {
      setAiAssessing(false);
    }
  };

  const { title: translatedTitle, description: translatedDesc, isTranslated } = useListingTranslation(
    listing?.id || '', listing?.title || '', listing?.description || '', 'general'
  );

  const categoryLabel = category?.slug
    ? (t(`categories.${category.slug}`, { defaultValue: '' }) || category.name)
    : category?.name || '';

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
        <h1 className="text-2xl font-bold">{t('listingDetail.notFound')}</h1>
        <Button onClick={() => navigate("/marketplace")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> {t('listingDetail.backToList')}
        </Button>
      </div>
    );
  }

  const cond = listing.condition ? CONDITION_KEYS[listing.condition] : null;
  const condLabel = cond ? t(`listingDetail.${cond.key}`) : null;

  const aiScoreRaw = listing.ai_score;
  const aiScore5 = aiScoreRaw ? Number(aiScoreRaw) / 2 : null;
  const aiStars = aiScore5 ? Math.round(aiScore5) : 0;
  const aiTips: string[] = Array.isArray(listing.ai_tips) ? listing.ai_tips : [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      <PendingReviewBanner />

      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate("/marketplace")} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">{t('listingDetail.backToList')}</span>
            </Button>
            <div className="hidden md:flex items-center gap-2 cursor-pointer" onClick={() => navigate("/easy")}>
              <img src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" alt="RIDO" className="h-8 w-8" />
              <span className="font-bold text-lg"><span className="text-primary">RIDO</span> Marketplace</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Button variant="outline" size="sm" onClick={handleShare} className="gap-2">
              <Share2 className="h-4 w-4" />
              <span className="hidden sm:inline">{t('listingDetail.share')}</span>
            </Button>
            <Button
              variant={isFav ? "default" : "outline"} size="sm" onClick={toggleFav}
              className={cn("gap-2", isFav && "bg-red-500 hover:bg-red-600 border-red-500")}
            >
              <Heart className={cn("h-4 w-4", isFav && "fill-white")} />
              <span className="hidden sm:inline">{isFav ? t('listingDetail.saved') : t('listingDetail.save')}</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Photo Gallery */}
        <div className="mb-6">
          {photos.length === 0 ? (
            <div className="aspect-[16/9] rounded-xl bg-muted flex flex-col items-center justify-center text-muted-foreground">
              <ImageIcon className="h-16 w-16 mb-2" />
              <span>{t('listingDetail.noPhotos')}</span>
            </div>
          ) : (
            <>
              <div className="hidden md:grid grid-cols-3 gap-2 rounded-xl overflow-hidden" style={{ maxHeight: '460px' }}>
                <div
                  className="col-span-2 relative cursor-pointer group"
                  onClick={() => { setSelectedPhoto(0); setFullscreenGallery(true); }}
                >
                  <img
                    src={photos[0]?.url}
                    alt={listing.title}
                    className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                    onContextMenu={photos[0]?.is_protected ? (e) => e.preventDefault() : undefined}
                    draggable={photos[0]?.is_protected ? false : undefined}
                  />
                  {photos[0]?.is_ai_enhanced && (
                    <Badge className="absolute top-3 left-3 bg-primary text-primary-foreground gap-1">
                      <Sparkles className="h-3 w-3" /> AI
                    </Badge>
                  )}
                </div>
                <div className="grid grid-rows-2 gap-2">
                  {photos.slice(1, 3).map((p, i) => (
                    <div
                      key={p.id || i}
                      className="relative cursor-pointer overflow-hidden group"
                      onClick={() => { setSelectedPhoto(i + 1); setFullscreenGallery(true); }}
                    >
                      <img src={p.url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    </div>
                  ))}
                  {photos.length > 3 ? (
                    <div
                      className="relative cursor-pointer overflow-hidden group"
                      onClick={() => { setSelectedPhoto(3); setFullscreenGallery(true); }}
                    >
                      <img src={photos[3]?.url} alt="" className="w-full h-full object-cover" />
                      {photos.length > 4 && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <span className="text-white font-bold text-lg">+{photos.length - 3}</span>
                        </div>
                      )}
                    </div>
                  ) : photos.length <= 2 ? (
                    <div className="bg-muted flex items-center justify-center text-muted-foreground text-sm">
                      <ImageIcon className="h-6 w-6" />
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="md:hidden relative aspect-[4/3] rounded-xl overflow-hidden bg-muted">
                <img
                  src={photos[selectedPhoto]?.url}
                  alt={listing.title}
                  className="w-full h-full object-cover"
                  onClick={() => setFullscreenGallery(true)}
                />
                {photos.length > 1 && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {photos.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setSelectedPhoto(i)}
                        className={cn("h-2 w-2 rounded-full transition", i === selectedPhoto ? "bg-white" : "bg-white/50")}
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Fullscreen gallery modal */}
        {fullscreenGallery && (
          <div className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center" onClick={() => setFullscreenGallery(false)}>
            <button className="absolute top-4 right-4 text-white z-10" onClick={() => setFullscreenGallery(false)}>
              <X className="h-8 w-8" />
            </button>
            <button
              className="absolute left-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white z-10"
              onClick={(e) => { e.stopPropagation(); setSelectedPhoto(i => i > 0 ? i - 1 : photos.length - 1); }}
            >
              <ArrowLeft className="h-8 w-8" />
            </button>
            <img
              src={photos[selectedPhoto]?.url}
              alt=""
              className="max-h-[90vh] max-w-[90vw] object-contain"
              onClick={e => e.stopPropagation()}
            />
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 text-white/80 hover:text-white z-10"
              onClick={(e) => { e.stopPropagation(); setSelectedPhoto(i => i < photos.length - 1 ? i + 1 : 0); }}
            >
              <ArrowLeft className="h-8 w-8 rotate-180" />
            </button>
            <div className="absolute bottom-6 text-white text-sm">{selectedPhoto + 1} / {photos.length}</div>
          </div>
        )}

        {/* Content: 2/3 left + 1/3 right */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Breadcrumb */}
            <div className="text-sm text-muted-foreground flex items-center gap-1 flex-wrap">
              <button onClick={() => navigate("/marketplace")} className="hover:text-primary transition">Marketplace</button>
              {category && (
                <>
                  <span>›</span>
                  <button onClick={() => navigate(`/marketplace?cat=${category.slug}`)} className="hover:text-primary transition">{categoryLabel}</button>
                </>
              )}
              <span>›</span>
              <span className="truncate max-w-[200px]">{translatedTitle}</span>
            </div>

            {/* Title + price */}
            <div>
              <h1 className="text-2xl md:text-3xl font-bold leading-tight mb-2">
                {translatedTitle}
                {isTranslated && (
                  <span className="text-xs font-normal text-muted-foreground ml-2">
                    ({t('listingDetail.translated')})
                  </span>
                )}
              </h1>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl md:text-4xl font-bold text-primary">
                  {listing.price ? `${Number(listing.price).toLocaleString("pl-PL")}\u00A0zł` : t('listingDetail.askPrice')}
                </span>
                {listing.price_negotiable && (
                  <span className="text-sm text-muted-foreground">({t('listingDetail.negotiable')})</span>
                )}
              </div>
            </div>

            {/* Spec tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {cond && (
                <div className="p-3 rounded-xl bg-card border flex items-start gap-3">
                  <Package className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t('listingDetail.condition')}</p>
                    <p className="font-medium text-sm">{condLabel}</p>
                  </div>
                </div>
              )}
              {listing.location && (
                <div className="p-3 rounded-xl bg-card border flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t('listingDetail.location')}</p>
                    <p className="font-medium text-sm">{listing.location}</p>
                  </div>
                </div>
              )}
              <div className="p-3 rounded-xl bg-card border flex items-start gap-3">
                <Calendar className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">{t('listingDetail.added')}</p>
                  <p className="font-medium text-sm">{new Date(listing.created_at).toLocaleDateString(i18n.language === 'en' ? 'en-GB' : 'pl-PL')}</p>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-card border flex items-start gap-3">
                <Handshake className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">{t('listingDetail.priceNeg')}</p>
                  <p className="font-medium text-sm">{listing.price_negotiable ? t('listingDetail.yes') : t('listingDetail.no')}</p>
                </div>
              </div>
              {category && (
                <div className="p-3 rounded-xl bg-card border flex items-start gap-3">
                  <Tag className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t('listingDetail.category')}</p>
                    <p className="font-medium text-sm">{categoryLabel}</p>
                  </div>
                </div>
              )}
              {listing.views_count > 0 && (
                <div className="p-3 rounded-xl bg-card border flex items-start gap-3">
                  <Eye className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground">{t('listingDetail.views')}</p>
                    <p className="font-medium text-sm">{listing.views_count}</p>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            {/* Description */}
            <div>
              <h2 className="text-xl font-semibold mb-4">{t('listingDetail.description')}</h2>
              <div className="prose prose-sm max-w-none text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {translatedDesc || t('listingDetail.noDescription')}
              </div>
            </div>
          </div>

          {/* RIGHT — sticky contact + AI card */}
          <div className="space-y-6">
            <div className="lg:sticky lg:top-24 space-y-6">
              <Card className="p-6 shadow-lg border-primary/20">
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                  <Phone className="h-5 w-5 text-primary" />
                  {t('listingDetail.contact')}
                </h3>

                <Button className="w-full mb-3" size="lg">
                  <Phone className="h-4 w-4 mr-2" />
                  {t('listingDetail.showContact')}
                </Button>

                <Button variant="outline" className="w-full" size="lg">
                  <MessageCircle className="h-4 w-4 mr-2" />
                  {t('listingDetail.sendMessage')}
                </Button>

                <Button
                  variant="outline"
                  className="w-full mt-3 gap-1.5"
                  size="lg"
                  disabled={isInCart(listing.id)}
                  onClick={() => {
                    const photoUrl = photos[0]?.url || null;
                    addToCart(listing.id, listing.title, listing.price, photoUrl);
                    toast.success(t('listingDetail.addedToCart'));
                  }}
                >
                  <ShoppingCart className="h-4 w-4" />
                  {isInCart(listing.id) ? t('listingDetail.inCart') : t('listingDetail.addToCart')}
                </Button>

                <div
                  className="flex items-center gap-3 mt-4 pt-4 border-t cursor-pointer hover:opacity-80 transition"
                  onClick={() => listing.user_id && navigate(`/marketplace/seller/${listing.user_id}`)}
                >
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <User className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-sm hover:text-primary transition">{t('listingDetail.seller')}</p>
                    {sellerRating ? (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                        <span>{sellerRating.avg.toFixed(1)}</span>
                        <span>({sellerRating.count} {t('listingDetail.reviews')})</span>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">{t('listingDetail.getridoUser')}</p>
                    )}
                  </div>
                </div>

                <p className="text-xs text-muted-foreground mt-3 text-center">
                  {t('listingDetail.offerNo')}: <span className="font-mono">{listing.id.slice(0, 8).toUpperCase()}</span>
                </p>
              </Card>

              {aiScoreRaw !== null && aiScoreRaw !== undefined && (
                <Card className="p-5 border-primary/20">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      {t('listingDetail.aiRating')}
                    </h3>
                    <Button variant="ghost" size="sm" onClick={handleRefreshAI} disabled={aiAssessing} className="gap-1.5">
                      {aiAssessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      {t('listingDetail.recalc')}
                    </Button>
                  </div>

                  <div className="flex items-center gap-1 mb-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={cn(
                          "h-5 w-5",
                          i < aiStars ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/20"
                        )}
                      />
                    ))}
                    <span className="ml-2 text-lg font-bold">{aiScore5!.toFixed(1)} / 5</span>
                  </div>

                  {aiTips.length > 0 && (
                    <ul className="space-y-1.5 mt-3">
                      {aiTips.map((tip, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                          {tip}
                        </li>
                      ))}
                    </ul>
                  )}

                  <p className="text-xs text-muted-foreground mt-3 italic">
                    {t('listingDetail.aiNote')}
                  </p>
                </Card>
              )}
            </div>
          </div>
        </div>

        {/* Similar listings */}
        {similarListings.length > 0 && (
          <div className="mt-12">
            <h2 className="text-xl font-bold mb-6">{t('listingDetail.similar')}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {similarListings.map(sl => (
                <GeneralListingCard
                  key={sl.id}
                  listing={{
                    ...sl,
                    photos: similarPhotos[sl.id] || [],
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </main>

      <footer className="border-t py-12 bg-card mt-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div
              className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => navigate('/easy')}
            >
              <img
                src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png"
                alt="RIDO"
                className="h-8 w-8"
              />
              <span className="font-semibold">RIDO Marketplace</span>
            </div>
            <button onClick={() => navigate("/marketplace")} className="text-sm text-primary hover:underline">
              {t('footer.allListings')}
            </button>
            <p className="text-muted-foreground text-sm">{t('footer.copyright')}</p>
          </div>
        </div>
      </footer>
      <MarketCompareBar />
    </div>
  );
}
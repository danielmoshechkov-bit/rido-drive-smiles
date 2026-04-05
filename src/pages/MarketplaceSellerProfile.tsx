import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { UniversalHomeButton } from "@/components/UniversalHomeButton";
import { GeneralListingCard } from "@/components/marketplace/GeneralListingCard";
import { ArrowLeft, User, Star, Calendar, Package, Loader2 } from "lucide-react";

export default function MarketplaceSellerProfile() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [seller, setSeller] = useState<any>(null);
  const [listings, setListings] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [stats, setStats] = useState({ listingsCount: 0, avgRating: 0, reviewCount: 0 });
  const [page, setPage] = useState(0);
  const PER_PAGE = 12;

  useEffect(() => {
    if (!userId) return;
    loadProfile();
  }, [userId, page]);

  const loadProfile = async () => {
    setLoading(true);

    // Seller profile
    const { data: profile } = await supabase
      .from("marketplace_user_profiles")
      .select("first_name, last_name, created_at")
      .eq("user_id", userId)
      .maybeSingle();

    setSeller(profile);

    // Active listings with photos
    const { data: listingsData } = await supabase
      .from("general_listings")
      .select("id, title, price, price_negotiable, condition, location, ai_score, created_at, views_count")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .range(page * PER_PAGE, (page + 1) * PER_PAGE - 1);

    if (listingsData) {
      const withPhotos = [];
      for (const l of listingsData) {
        const { data: photos } = await supabase
          .from("general_listing_photos")
          .select("url, is_ai_enhanced")
          .eq("listing_id", l.id)
          .order("display_order")
          .limit(3);
        withPhotos.push({ ...l, photos: photos || [] });
      }
      setListings(withPhotos);
    }

    // Count total active
    const { count } = await supabase
      .from("general_listings")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "active");

    // Reviews
    const { data: reviewsData } = await supabase
      .from("listing_reviews")
      .select("score_avg, score_contact, score_description, score_shipping, comment, created_at")
      .eq("seller_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    const allReviews = reviewsData || [];
    setReviews(allReviews);

    const avg = allReviews.length > 0
      ? allReviews.reduce((s, r) => s + Number(r.score_avg), 0) / allReviews.length
      : 0;

    setStats({
      listingsCount: count || 0,
      avgRating: avg,
      reviewCount: allReviews.length,
    });

    setLoading(false);
  };

  useEffect(() => {
    if (seller) {
      document.title = `${seller.first_name} ${seller.last_name || ""} — Sprzedawca GetRido`;
    }
    return () => { document.title = "GetRido"; };
  }, [seller]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!seller) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <h1 className="text-xl font-bold">Nie znaleziono sprzedawcy</h1>
        <Button onClick={() => navigate("/marketplace")}><ArrowLeft className="h-4 w-4 mr-2" /> Marketplace</Button>
      </div>
    );
  }

  const initials = `${seller.first_name?.[0] || ""}${seller.last_name?.[0] || ""}`.toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <UniversalHomeButton />
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <span className="font-bold text-primary">Profil sprzedawcy</span>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-5xl space-y-6">
        {/* Profile header */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
              <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-xl font-bold text-primary shrink-0">
                {initials || <User className="h-8 w-8" />}
              </div>
              <div className="flex-1 text-center sm:text-left">
                <h1 className="text-2xl font-bold">
                  {seller.first_name} {seller.last_name || ""}
                </h1>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-2 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-4 w-4" />
                    Członek od {new Date(seller.created_at).toLocaleDateString("pl-PL", { month: "long", year: "numeric" })}
                  </span>
                  <span className="flex items-center gap-1">
                    <Package className="h-4 w-4" />
                    {stats.listingsCount} aktywnych ogłoszeń
                  </span>
                </div>
                {stats.reviewCount > 0 && (
                  <div className="flex items-center gap-1 mt-2 justify-center sm:justify-start">
                    {[1, 2, 3, 4, 5].map(i => (
                      <Star
                        key={i}
                        className={`h-5 w-5 ${i <= Math.round(stats.avgRating) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}`}
                      />
                    ))}
                    <span className="text-sm font-medium ml-1">{stats.avgRating.toFixed(1)}</span>
                    <span className="text-sm text-muted-foreground">({stats.reviewCount} ocen)</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Listings grid */}
        <div>
          <h2 className="text-xl font-bold mb-4">Ogłoszenia</h2>
          {listings.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Brak aktywnych ogłoszeń
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {listings.map(l => (
                  <GeneralListingCard key={l.id} listing={l} />
                ))}
              </div>
              {stats.listingsCount > (page + 1) * PER_PAGE && (
                <div className="flex justify-center mt-4">
                  <Button variant="outline" onClick={() => setPage(p => p + 1)}>Pokaż więcej</Button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Reviews */}
        {reviews.length > 0 && (
          <div>
            <h2 className="text-xl font-bold mb-4">Oceny kupujących</h2>
            <div className="space-y-3">
              {reviews.map((r, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      {[1, 2, 3, 4, 5].map(s => (
                        <Star
                          key={s}
                          className={`h-4 w-4 ${s <= Math.round(Number(r.score_avg)) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}`}
                        />
                      ))}
                      <span className="text-sm font-medium">{Number(r.score_avg).toFixed(1)}</span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {new Date(r.created_at).toLocaleDateString("pl-PL")}
                      </span>
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground mb-2">
                      <span>Kontakt: {r.score_contact}/5</span>
                      <span>Opis: {r.score_description}/5</span>
                      <span>Wysyłka: {r.score_shipping}/5</span>
                    </div>
                    {r.comment && <p className="text-sm">{r.comment}</p>}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

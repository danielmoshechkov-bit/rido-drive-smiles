import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { GeneralListingCard } from "@/components/marketplace/GeneralListingCard";
import { UniversalHomeButton } from "@/components/UniversalHomeButton";
import { Heart, ArrowLeft, Loader2 } from "lucide-react";

export default function MarketplaceWishlist() {
  const navigate = useNavigate();
  const [listings, setListings] = useState<any[]>([]);
  const [photos, setPhotos] = useState<Record<string, any[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: wishlist } = await supabase
        .from("user_wishlists")
        .select("listing_id")
        .eq("user_id", user.id);

      if (!wishlist || wishlist.length === 0) { setLoading(false); return; }

      const ids = wishlist.map(w => w.listing_id);
      const { data: listData } = await supabase
        .from("general_listings")
        .select("*")
        .in("id", ids);

      if (listData) {
        setListings(listData);
        const { data: photoData } = await supabase
          .from("general_listing_photos")
          .select("listing_id, url, is_ai_enhanced, display_order")
          .in("listing_id", ids)
          .order("display_order");
        if (photoData) {
          const map: Record<string, any[]> = {};
          photoData.forEach(p => { if (!map[p.listing_id]) map[p.listing_id] = []; map[p.listing_id].push(p); });
          setPhotos(map);
        }
      }
      setLoading(false);
    };
    load();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <UniversalHomeButton />
            <span className="font-bold text-lg text-primary">Obserwowane</span>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate("/marketplace")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Marketplace
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : listings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Heart className="h-16 w-16 text-muted-foreground/40 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Brak obserwowanych ogłoszeń</h2>
            <p className="text-muted-foreground mb-4">Kliknij serce na ogłoszeniu aby je zapisać</p>
            <Button onClick={() => navigate("/marketplace")}>Przeglądaj ogłoszenia</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {listings.map(l => (
              <GeneralListingCard key={l.id} listing={{ ...l, photos: photos[l.id] || [] }} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

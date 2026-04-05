import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useWishlist() {
  const [wishlistIds, setWishlistIds] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id || null);
      if (data.user) loadWishlist(data.user.id);
      else loadLocal();
    });
  }, []);

  const loadWishlist = async (uid: string) => {
    const { data } = await supabase
      .from("user_wishlists")
      .select("listing_id")
      .eq("user_id", uid);
    if (data) setWishlistIds(data.map(d => d.listing_id));
  };

  const loadLocal = () => {
    try {
      setWishlistIds(JSON.parse(localStorage.getItem("rido_market_favs") || "[]"));
    } catch { setWishlistIds([]); }
  };

  const toggle = useCallback(async (listing_id: string) => {
    const isFav = wishlistIds.includes(listing_id);
    if (userId) {
      if (isFav) {
        await supabase.from("user_wishlists").delete().eq("user_id", userId).eq("listing_id", listing_id);
        setWishlistIds(prev => prev.filter(id => id !== listing_id));
      } else {
        await supabase.from("user_wishlists").insert({ user_id: userId, listing_id });
        setWishlistIds(prev => [...prev, listing_id]);
      }
    } else {
      const next = isFav ? wishlistIds.filter(id => id !== listing_id) : [...wishlistIds, listing_id];
      localStorage.setItem("rido_market_favs", JSON.stringify(next));
      setWishlistIds(next);
    }
    return !isFav;
  }, [wishlistIds, userId]);

  const isFav = useCallback((listing_id: string) => wishlistIds.includes(listing_id), [wishlistIds]);

  return { wishlistIds, toggle, isFav, isLoggedIn: !!userId };
}

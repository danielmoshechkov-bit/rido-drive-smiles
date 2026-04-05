import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface CartItem {
  id: string;
  listing_id: string;
  title: string;
  price: number | null;
  photo_url: string | null;
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id || null);
      if (data.user) loadCart(data.user.id);
      else loadLocalCart();
    });
  }, []);

  const loadCart = async (uid: string) => {
    setLoading(true);
    const { data } = await supabase
      .from("cart_items")
      .select("id, listing_id")
      .eq("user_id", uid);
    
    if (data && data.length > 0) {
      const listingIds = data.map(d => d.listing_id);
      const { data: listings } = await supabase
        .from("general_listings")
        .select("id, title, price")
        .in("id", listingIds);
      
      const { data: photos } = await supabase
        .from("general_listing_photos")
        .select("listing_id, url")
        .in("listing_id", listingIds)
        .order("display_order")
        .limit(listingIds.length);

      const photoMap: Record<string, string> = {};
      photos?.forEach(p => { if (!photoMap[p.listing_id]) photoMap[p.listing_id] = p.url; });

      setItems(data.map(ci => {
        const l = listings?.find(li => li.id === ci.listing_id);
        return {
          id: ci.id,
          listing_id: ci.listing_id,
          title: l?.title || "",
          price: l?.price || null,
          photo_url: photoMap[ci.listing_id] || null,
        };
      }));
    } else {
      setItems([]);
    }
    setLoading(false);
  };

  const loadLocalCart = () => {
    try {
      const stored = JSON.parse(localStorage.getItem("rido_cart") || "[]");
      setItems(stored);
    } catch { setItems([]); }
  };

  const saveLocal = (newItems: CartItem[]) => {
    localStorage.setItem("rido_cart", JSON.stringify(newItems));
    setItems(newItems);
  };

  const addToCart = useCallback(async (listing_id: string, title?: string, price?: number | null, photo_url?: string | null) => {
    if (items.some(i => i.listing_id === listing_id)) return;
    
    if (userId) {
      const { data, error } = await supabase
        .from("cart_items")
        .insert({ user_id: userId, listing_id })
        .select("id")
        .single();
      if (!error && data) {
        setItems(prev => [...prev, { id: data.id, listing_id, title: title || "", price: price ?? null, photo_url: photo_url ?? null }]);
      }
    } else {
      const newItem: CartItem = { id: crypto.randomUUID(), listing_id, title: title || "", price: price ?? null, photo_url: photo_url ?? null };
      saveLocal([...items, newItem]);
    }
  }, [items, userId]);

  const removeFromCart = useCallback(async (listing_id: string) => {
    if (userId) {
      await supabase.from("cart_items").delete().eq("user_id", userId).eq("listing_id", listing_id);
      setItems(prev => prev.filter(i => i.listing_id !== listing_id));
    } else {
      saveLocal(items.filter(i => i.listing_id !== listing_id));
    }
  }, [items, userId]);

  const clearCart = useCallback(async () => {
    if (userId) {
      await supabase.from("cart_items").delete().eq("user_id", userId);
    }
    localStorage.removeItem("rido_cart");
    setItems([]);
  }, [userId]);

  const isInCart = useCallback((listing_id: string) => items.some(i => i.listing_id === listing_id), [items]);

  return { items, cartCount: items.length, addToCart, removeFromCart, clearCart, isInCart, loading };
}

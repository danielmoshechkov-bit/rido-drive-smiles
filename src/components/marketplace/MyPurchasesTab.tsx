import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShoppingBag, Star, ImageIcon } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface CartItemWithListing {
  id: string;
  listing_id: string;
  added_at: string;
  title: string;
  price: number | null;
  seller_id: string;
  photo_url: string | null;
}

interface PendingReview {
  id: string;
  listing_id: string;
  seller_id: string;
}

export function MyPurchasesTab({ userId }: { userId?: string }) {
  const navigate = useNavigate();
  const [items, setItems] = useState<CartItemWithListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingReviews, setPendingReviews] = useState<PendingReview[]>([]);
  const [reviewModal, setReviewModal] = useState<PendingReview | null>(null);
  const [scores, setScores] = useState({ contact: 0, description: 0, shipping: 0 });
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!userId) return;
    loadData();
  }, [userId]);

  const loadData = async () => {
    if (!userId) return;
    setLoading(true);

    // Cart items
    const { data: cartItems } = await supabase
      .from("cart_items")
      .select("id, listing_id, added_at")
      .eq("user_id", userId)
      .order("added_at", { ascending: false });

    if (cartItems && cartItems.length > 0) {
      const withDetails: CartItemWithListing[] = [];
      for (const item of cartItems) {
        const { data: listing } = await supabase
          .from("general_listings")
          .select("title, price, user_id")
          .eq("id", item.listing_id)
          .single();

        const { data: photo } = await supabase
          .from("general_listing_photos")
          .select("url")
          .eq("listing_id", item.listing_id)
          .order("display_order")
          .limit(1);

        if (listing) {
          withDetails.push({
            ...item,
            title: listing.title,
            price: listing.price,
            seller_id: listing.user_id,
            photo_url: photo?.[0]?.url || null,
          });
        }
      }
      setItems(withDetails);
    }

    // Pending reviews
    const { data: pending } = await supabase
      .from("pending_reviews")
      .select("id, listing_id, seller_id")
      .eq("buyer_id", userId);
    if (pending) setPendingReviews(pending);

    setLoading(false);
  };

  const submitReview = async () => {
    if (!reviewModal || !userId) return;
    if (scores.contact === 0 || scores.description === 0 || scores.shipping === 0) {
      toast.error("Oceń wszystkie kategorie");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("listing_reviews").insert({
      reviewer_id: userId,
      seller_id: reviewModal.seller_id,
      listing_id: reviewModal.listing_id,
      score_contact: scores.contact,
      score_description: scores.description,
      score_shipping: scores.shipping,
      comment: comment || null,
    });

    if (error) {
      toast.error("Błąd zapisu oceny");
    } else {
      await supabase.from("pending_reviews").delete().eq("id", reviewModal.id);
      toast.success("Dziękujemy za ocenę!");
      setReviewModal(null);
      setScores({ contact: 0, description: 0, shipping: 0 });
      setComment("");
      loadData();
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold text-lg mb-2">Brak zakupów</h3>
          <p className="text-muted-foreground mb-4">Tu pojawią się Twoje produkty z koszyka</p>
          <Button onClick={() => navigate("/marketplace")}>Przeglądaj ogłoszenia</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {items.map(item => {
        const hasPending = pendingReviews.find(p => p.listing_id === item.listing_id);
        return (
          <Card key={item.id} className="overflow-hidden">
            <CardContent className="p-3 flex items-center gap-3">
              <div className="h-12 w-12 rounded bg-muted overflow-hidden shrink-0">
                {item.photo_url ? (
                  <img src={item.photo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="h-full w-full flex items-center justify-center">
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h4
                  className="font-medium text-sm truncate cursor-pointer hover:text-primary"
                  onClick={() => navigate(`/marketplace/listing/${item.listing_id}`)}
                >
                  {item.title}
                </h4>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-sm font-semibold">
                    {item.price ? `${item.price.toLocaleString("pl-PL")} zł` : "—"}
                  </span>
                  <Badge variant="outline" className="text-xs">W koszyku</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Dodano: {new Date(item.added_at).toLocaleDateString("pl-PL")}
                </p>
              </div>
              {hasPending && (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 gap-1"
                  onClick={() => setReviewModal(hasPending)}
                >
                  <Star className="h-3 w-3" /> Oceń
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}

      {/* Review Dialog */}
      <Dialog open={!!reviewModal} onOpenChange={() => setReviewModal(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Jak przebiegła transakcja?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <StarRatingRow label="Kontakt ze sprzedawcą" value={scores.contact} onChange={v => setScores(p => ({ ...p, contact: v }))} />
            <StarRatingRow label="Zgodność opisu" value={scores.description} onChange={v => setScores(p => ({ ...p, description: v }))} />
            <StarRatingRow label="Szybkość wysyłki" value={scores.shipping} onChange={v => setScores(p => ({ ...p, shipping: v }))} />
            <div>
              <label className="text-sm font-medium">Komentarz (opcjonalnie)</label>
              <Textarea
                value={comment}
                onChange={e => setComment(e.target.value.slice(0, 500))}
                placeholder="Napisz opinię..."
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground text-right mt-1">{comment.length}/500</p>
            </div>
            <Button onClick={submitReview} disabled={submitting} className="w-full">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Wyślij ocenę
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StarRatingRow({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <p className="text-sm font-medium mb-1">{label}</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(i => (
          <button
            key={i}
            onClick={() => onChange(i)}
            className="p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            <Star
              className={`h-6 w-6 transition ${i <= value ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}`}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

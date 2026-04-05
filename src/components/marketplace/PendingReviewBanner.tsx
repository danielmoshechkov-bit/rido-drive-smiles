import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Star, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface PendingReview {
  id: string;
  listing_id: string;
  seller_id: string;
  listing_title?: string;
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(s => (
        <button
          key={s}
          type="button"
          onClick={() => onChange(s)}
          className="p-1 min-h-[44px] min-w-[44px] flex items-center justify-center"
        >
          <Star className={cn("h-6 w-6 transition", s <= value ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30")} />
        </button>
      ))}
    </div>
  );
}

export function PendingReviewBanner() {
  const navigate = useNavigate();
  const [pending, setPending] = useState<PendingReview[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [current, setCurrent] = useState<PendingReview | null>(null);
  const [scoreContact, setScoreContact] = useState(0);
  const [scoreDescription, setScoreDescription] = useState(0);
  const [scoreShipping, setScoreShipping] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("pending_reviews")
        .select("id, listing_id, seller_id")
        .eq("buyer_id", user.id);

      if (data && data.length > 0) {
        // Get listing titles
        const ids = data.map(d => d.listing_id).filter(Boolean);
        let titleMap: Record<string, string> = {};
        if (ids.length > 0) {
          const { data: listings } = await supabase
            .from("general_listings")
            .select("id, title")
            .in("id", ids);
          listings?.forEach(l => { titleMap[l.id] = l.title; });
        }
        setPending(data.map(d => ({ ...d, listing_title: titleMap[d.listing_id] || "Ogłoszenie" })));
      }
    };
    load();
  }, []);

  const openReview = (p: PendingReview) => {
    setCurrent(p);
    setScoreContact(0);
    setScoreDescription(0);
    setScoreShipping(0);
    setComment("");
    setShowModal(true);
  };

  const submitReview = async () => {
    if (!current) return;
    if (scoreContact === 0 || scoreDescription === 0 || scoreShipping === 0) {
      toast.error("Oceń wszystkie kategorie");
      return;
    }
    setSubmitting(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("listing_reviews").insert({
      reviewer_id: user.id,
      seller_id: current.seller_id,
      listing_id: current.listing_id,
      score_contact: scoreContact,
      score_description: scoreDescription,
      score_shipping: scoreShipping,
      comment: comment.trim() || null,
    });

    if (error) {
      toast.error("Błąd zapisu oceny");
      setSubmitting(false);
      return;
    }

    await supabase.from("pending_reviews").delete().eq("id", current.id);
    setPending(prev => prev.filter(p => p.id !== current.id));
    setShowModal(false);
    toast.success("Dziękujemy za ocenę!");
    setSubmitting(false);
  };

  if (pending.length === 0) return null;

  return (
    <>
      <div className="bg-yellow-50 dark:bg-yellow-950/30 border-b border-yellow-200 dark:border-yellow-800 px-4 py-2">
        <div className="container mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 text-yellow-600" />
            <span className="font-medium text-yellow-800 dark:text-yellow-200">
              Oceń zakup: {pending[0].listing_title}
            </span>
          </div>
          <Button size="sm" variant="outline" onClick={() => openReview(pending[0])} className="border-yellow-300">
            Wystaw ocenę
          </Button>
        </div>
      </div>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Jak przebiegła transakcja?</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            <div>
              <p className="text-sm font-medium mb-1">Kontakt ze sprzedawcą</p>
              <StarRating value={scoreContact} onChange={setScoreContact} />
            </div>
            <div>
              <p className="text-sm font-medium mb-1">Zgodność opisu ze stanem produktu</p>
              <StarRating value={scoreDescription} onChange={setScoreDescription} />
            </div>
            <div>
              <p className="text-sm font-medium mb-1">Szybkość wysyłki</p>
              <StarRating value={scoreShipping} onChange={setScoreShipping} />
            </div>
            <div>
              <p className="text-sm font-medium mb-1">Komentarz (opcjonalny)</p>
              <Textarea
                value={comment}
                onChange={e => setComment(e.target.value)}
                maxLength={500}
                placeholder="Opisz swoje doświadczenie..."
                rows={3}
              />
              <p className="text-xs text-muted-foreground mt-1 text-right">{comment.length}/500</p>
            </div>
            <Button onClick={submitReview} disabled={submitting} className="w-full">
              {submitting ? "Wysyłanie..." : "Wyślij ocenę"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

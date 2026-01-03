import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Star, Trash2, Edit2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { pl } from "date-fns/locale";

interface Review {
  id: string;
  created_at: string;
  reviewer_id: string;
  reviewer_type: string;
  reviewee_id: string;
  car_condition_rating: number | null;
  service_quality_rating: number | null;
  problem_help_rating: number | null;
  driver_rating: number | null;
  comment: string | null;
  status: string;
  rental_id: string;
  reviewer_name?: string;
}

interface VehicleReviewsTabProps {
  vehicleId: string;
}

export function VehicleReviewsTab({ vehicleId }: VehicleReviewsTabProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editComment, setEditComment] = useState("");

  useEffect(() => {
    loadReviews();
  }, [vehicleId]);

  const loadReviews = async () => {
    setLoading(true);
    try {
      // First get rentals for this vehicle
      const { data: rentals } = await supabase
        .from("vehicle_rentals")
        .select("id")
        .eq("vehicle_id", vehicleId);

      if (!rentals?.length) {
        setReviews([]);
        setLoading(false);
        return;
      }

      const rentalIds = rentals.map(r => r.id);

      // Get reviews for these rentals
      const { data: reviewsData, error } = await supabase
        .from("rental_reviews")
        .select("*")
        .in("rental_id", rentalIds)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Get reviewer names
      const reviewerIds = [...new Set((reviewsData || []).map(r => r.reviewer_id))];
      const { data: drivers } = await supabase
        .from("drivers")
        .select("id, first_name, last_name")
        .in("id", reviewerIds);

      const driverMap: Record<string, string> = {};
      drivers?.forEach(d => {
        driverMap[d.id] = `${d.first_name || ""} ${d.last_name || ""}`.trim() || "Anonim";
      });

      const reviewsWithNames = (reviewsData || []).map(r => ({
        ...r,
        reviewer_name: driverMap[r.reviewer_id] || "Nieznany"
      }));

      setReviews(reviewsWithNames);
    } catch (error) {
      console.error("Error loading reviews:", error);
      toast.error("Błąd ładowania recenzji");
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (reviewId: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from("rental_reviews")
        .update({ 
          status: newStatus,
          ...(newStatus === "approved" ? { approved_at: new Date().toISOString() } : {})
        })
        .eq("id", reviewId);

      if (error) throw error;
      toast.success("Status zaktualizowany");
      loadReviews();
    } catch (error) {
      toast.error("Błąd aktualizacji statusu");
    }
  };

  const deleteReview = async (reviewId: string) => {
    if (!confirm("Czy na pewno chcesz usunąć tę recenzję?")) return;

    try {
      const { error } = await supabase
        .from("rental_reviews")
        .delete()
        .eq("id", reviewId);

      if (error) throw error;
      toast.success("Recenzja usunięta");
      loadReviews();
    } catch (error) {
      toast.error("Błąd usuwania recenzji");
    }
  };

  const startEdit = (review: Review) => {
    setEditingId(review.id);
    setEditComment(review.comment || "");
  };

  const saveEdit = async () => {
    if (!editingId) return;

    try {
      const { error } = await supabase
        .from("rental_reviews")
        .update({ comment: editComment })
        .eq("id", editingId);

      if (error) throw error;
      toast.success("Komentarz zaktualizowany");
      setEditingId(null);
      loadReviews();
    } catch (error) {
      toast.error("Błąd aktualizacji komentarza");
    }
  };

  const renderStars = (rating: number | null) => {
    if (rating === null) return <span className="text-muted-foreground">–</span>;
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map(star => (
          <Star
            key={star}
            className={`h-3 w-3 ${star <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}`}
          />
        ))}
      </div>
    );
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge variant="default" className="bg-green-500">Zatwierdzona</Badge>;
      case "rejected":
        return <Badge variant="destructive">Odrzucona</Badge>;
      default:
        return <Badge variant="secondary">Oczekuje</Badge>;
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Ładowanie recenzji...</div>;
  }

  if (reviews.length === 0) {
    return (
      <div className="text-center py-8">
        <Star className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-muted-foreground">Brak recenzji dla tego pojazdu</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground mb-4">
        Łącznie: {reviews.length} recenzji
      </div>

      {reviews.map(review => (
        <div key={review.id} className="border rounded-lg p-4 space-y-3">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <div className="font-medium">{review.reviewer_name}</div>
              <div className="text-xs text-muted-foreground">
                {format(new Date(review.created_at), "dd MMM yyyy, HH:mm", { locale: pl })}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {getStatusBadge(review.status)}
              <Select
                value={review.status}
                onValueChange={(val) => updateStatus(review.id, val)}
              >
                <SelectTrigger className="w-[120px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Oczekuje</SelectItem>
                  <SelectItem value="approved">Zatwierdź</SelectItem>
                  <SelectItem value="rejected">Odrzuć</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Ratings */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            {review.reviewer_type === "driver" ? (
              <>
                <div>
                  <span className="text-muted-foreground">Stan auta:</span>
                  <div>{renderStars(review.car_condition_rating)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Obsługa:</span>
                  <div>{renderStars(review.service_quality_rating)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Pomoc:</span>
                  <div>{renderStars(review.problem_help_rating)}</div>
                </div>
              </>
            ) : (
              <div>
                <span className="text-muted-foreground">Ocena kierowcy:</span>
                <div>{renderStars(review.driver_rating)}</div>
              </div>
            )}
          </div>

          {/* Comment */}
          <div>
            <span className="text-sm text-muted-foreground">Komentarz:</span>
            {editingId === review.id ? (
              <div className="flex gap-2 mt-1">
                <Input
                  value={editComment}
                  onChange={(e) => setEditComment(e.target.value)}
                  className="flex-1"
                />
                <Button size="icon" variant="ghost" onClick={saveEdit}>
                  <Check className="h-4 w-4 text-green-600" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => setEditingId(null)}>
                  <X className="h-4 w-4 text-red-600" />
                </Button>
              </div>
            ) : (
              <p className="text-sm mt-1">{review.comment || <span className="italic text-muted-foreground">Brak komentarza</span>}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => startEdit(review)}
              disabled={editingId === review.id}
            >
              <Edit2 className="h-4 w-4 mr-1" />
              Edytuj
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={() => deleteReview(review.id)}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Usuń
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

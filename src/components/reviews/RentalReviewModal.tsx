import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Star } from "lucide-react";

interface RentalReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rental: {
    id: string;
    driverName?: string;
    driverId?: string;
    fleetName?: string;
    fleetId?: string;
  };
  reviewerType: "driver" | "fleet";
  reviewerId: string;
  onSuccess: () => void;
  mandatory?: boolean;
}

export function RentalReviewModal({
  open,
  onOpenChange,
  rental,
  reviewerType,
  reviewerId,
  onSuccess,
  mandatory = false
}: RentalReviewModalProps) {
  const [carCondition, setCarCondition] = useState(0);
  const [serviceQuality, setServiceQuality] = useState(0);
  const [problemHelp, setProblemHelp] = useState(0);
  const [driverRating, setDriverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const handleClose = () => {
    if (mandatory) {
      toast.error("Najpierw oceń najem!");
      return;
    }
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    // Validation
    if (reviewerType === "driver") {
      if (carCondition === 0 || serviceQuality === 0 || problemHelp === 0) {
        toast.error("Oceń wszystkie kategorie (1-5 gwiazdek)");
        return;
      }
      if (!comment.trim()) {
        toast.error("Dodaj komentarz");
        return;
      }
    } else {
      if (driverRating === 0) {
        toast.error("Oceń kierowcę (1-5 gwiazdek)");
        return;
      }
    }

    setSaving(true);
    try {
      const reviewData: any = {
        rental_id: rental.id,
        reviewer_type: reviewerType,
        reviewer_id: reviewerId,
        reviewee_id: reviewerType === "driver" ? rental.fleetId : rental.driverId,
        comment: comment || null,
        status: "pending"
      };

      if (reviewerType === "driver") {
        reviewData.car_condition_rating = carCondition;
        reviewData.service_quality_rating = serviceQuality;
        reviewData.problem_help_rating = problemHelp;
      } else {
        reviewData.driver_rating = driverRating;
      }

      const { error } = await supabase
        .from("rental_reviews")
        .insert(reviewData);

      if (error) throw error;

      // Mark rental as reviewed
      const updateField = reviewerType === "driver" ? "driver_reviewed" : "fleet_reviewed";
      await supabase
        .from("vehicle_rentals")
        .update({ [updateField]: true })
        .eq("id", rental.id);

      toast.success("Dziękujemy za ocenę! Zostanie opublikowana po weryfikacji.");
      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error submitting review:", error);
      toast.error(error.message || "Błąd wysyłania oceny");
    } finally {
      setSaving(false);
    }
  };

  const StarRating = ({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map(star => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            className="p-1 hover:scale-110 transition-transform"
          >
            <Star
              className={`h-8 w-8 ${star <= value ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground"}`}
            />
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md" onInteractOutside={(e) => mandatory && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>
            {reviewerType === "driver" 
              ? `Oceń flotę: ${rental.fleetName}`
              : `Oceń kierowcę: ${rental.driverName}`
            }
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {reviewerType === "driver" ? (
            <>
              <StarRating
                value={carCondition}
                onChange={setCarCondition}
                label="Stan auta"
              />
              <StarRating
                value={serviceQuality}
                onChange={setServiceQuality}
                label="Jakość obsługi przez flotę"
              />
              <StarRating
                value={problemHelp}
                onChange={setProblemHelp}
                label="Pomoc przy problemach z autem"
              />
              <div className="space-y-2">
                <Label>Komentarz *</Label>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Opisz swoje doświadczenia z tą flotą..."
                  rows={3}
                />
              </div>
            </>
          ) : (
            <>
              <StarRating
                value={driverRating}
                onChange={setDriverRating}
                label="Ocena kierowcy"
              />
              <div className="space-y-2">
                <Label>Komentarz (opcjonalny)</Label>
                <Textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Dodaj komentarz o kierowcy..."
                  rows={3}
                />
              </div>
            </>
          )}

          {reviewerType === "driver" && (
            <div className="bg-muted/50 rounded-lg p-3 text-sm">
              <p className="text-muted-foreground">
                Średnia ocena: <strong>
                  {carCondition && serviceQuality && problemHelp
                    ? ((carCondition + serviceQuality + problemHelp) / 3).toFixed(1)
                    : "—"
                  }
                </strong> / 5
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          {!mandatory && (
            <Button variant="outline" onClick={handleClose}>
              Anuluj
            </Button>
          )}
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Wysyłanie..." : "Wyślij ocenę"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

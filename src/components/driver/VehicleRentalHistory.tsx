import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Star, Calendar, User } from "lucide-react";

interface RentalHistoryItem {
  id: string;
  rental_start: string;
  rental_end: string | null;
  status: string;
  driver?: {
    first_name: string | null;
    last_name: string | null;
  };
  rental_reviews?: Array<{
    car_condition_rating: number | null;
    service_quality_rating: number | null;
    comment: string | null;
    status: string;
  }>;
}

export const VehicleRentalHistory = ({ vehicleId }: { vehicleId: string }) => {
  const [history, setHistory] = useState<RentalHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadHistory = async () => {
      const { data, error } = await supabase
        .from("vehicle_rentals")
        .select(`
          id,
          rental_start,
          rental_end,
          status,
          driver:drivers (
            first_name,
            last_name
          ),
          rental_reviews (
            car_condition_rating,
            service_quality_rating,
            comment,
            status
          )
        `)
        .eq("vehicle_id", vehicleId)
        .order("rental_start", { ascending: false });

      if (error) {
        console.error("Error loading rental history:", error);
      } else {
        setHistory(data || []);
      }
      setLoading(false);
    };

    loadHistory();
  }, [vehicleId]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        <div className="h-12 bg-muted rounded"></div>
        <div className="h-12 bg-muted rounded"></div>
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Brak historii wynajmu</p>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-100";
      case "completed":
        return "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-100";
      case "cancelled":
        return "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-100";
      default:
        return "bg-muted text-muted-foreground";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "active":
        return "Aktywny";
      case "completed":
        return "Zakończony";
      case "cancelled":
        return "Anulowany";
      case "pending":
        return "Oczekujący";
      default:
        return status;
    }
  };

  const renderStars = (rating: number | null) => {
    if (!rating) return null;
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-3 w-3 ${
              star <= rating
                ? "fill-yellow-400 text-yellow-400"
                : "text-muted-foreground"
            }`}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {history.map((rental) => {
        const approvedReview = rental.rental_reviews?.find(
          (r) => r.status === "approved"
        );
        const avgRating = approvedReview
          ? Math.round(
              ((approvedReview.car_condition_rating || 0) +
                (approvedReview.service_quality_rating || 0)) /
                2
            )
          : null;

        return (
          <div
            key={rental.id}
            className="border rounded-xl p-3 space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {rental.driver?.first_name} {rental.driver?.last_name}
                </span>
              </div>
              <Badge className={`text-xs ${getStatusColor(rental.status)}`}>
                {getStatusLabel(rental.status)}
              </Badge>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>
                {new Date(rental.rental_start).toLocaleDateString("pl-PL")}
                {rental.rental_end && (
                  <> — {new Date(rental.rental_end).toLocaleDateString("pl-PL")}</>
                )}
              </span>
            </div>

            {avgRating && (
              <div className="flex items-center gap-2">
                {renderStars(avgRating)}
                {approvedReview?.comment && (
                  <span className="text-xs text-muted-foreground italic truncate">
                    "{approvedReview.comment}"
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

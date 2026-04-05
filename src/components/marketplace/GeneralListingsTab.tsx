import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Package, Eye, Archive, Loader2, Trash2, Edit } from "lucide-react";

interface GeneralListing {
  id: string;
  title: string;
  price: number | null;
  status: string;
  views_count: number;
  created_at: string;
  location: string | null;
  condition: string | null;
}

export function GeneralListingsTab({ userId }: { userId?: string }) {
  const navigate = useNavigate();
  const [listings, setListings] = useState<GeneralListing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    loadListings();
  }, [userId]);

  const loadListings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("general_listings" as any)
      .select("id, title, price, status, views_count, created_at, location, condition")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (!error && data) setListings(data as any);
    setLoading(false);
  };

  const archiveListing = async (id: string) => {
    const { error } = await supabase
      .from("general_listings" as any)
      .update({ status: "archived" } as any)
      .eq("id", id);

    if (error) {
      toast.error("Nie udało się zarchiwizować");
    } else {
      toast.success("Zarchiwizowano");
      loadListings();
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "active": return <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">Aktywne</Badge>;
      case "sold": return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">Sprzedane</Badge>;
      case "archived": return <Badge variant="secondary">Archiwum</Badge>;
      case "draft": return <Badge variant="outline">Szkic</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (listings.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="font-semibold text-lg mb-2">Brak ogłoszeń</h3>
          <p className="text-muted-foreground mb-4">Dodaj swoje pierwsze ogłoszenie z AI</p>
          <Button onClick={() => navigate("/marketplace/dodaj")}>
            Dodaj ogłoszenie
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {listings.map((listing) => (
        <Card key={listing.id} className="overflow-hidden">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <h3 className="font-medium truncate">{listing.title}</h3>
              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                {listing.price && (
                  <span className="font-semibold text-foreground">
                    {listing.price.toLocaleString("pl-PL")} zł
                  </span>
                )}
                {listing.location && <span>{listing.location}</span>}
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3" /> {listing.views_count}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {statusBadge(listing.status)}
              {listing.status === "active" && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => archiveListing(listing.id)}
                  title="Archiwizuj"
                >
                  <Archive className="h-4 w-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

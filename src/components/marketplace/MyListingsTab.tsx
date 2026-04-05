import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Package, Eye, Plus, Loader2, Star, Sparkles, Wand2,
  MoreVertical, Edit, RefreshCw, CheckCircle, Archive, Trash2, ImageIcon
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useGetRidoAI } from "@/hooks/useGetRidoAI";

interface ListingWithPhoto {
  id: string;
  title: string;
  price: number | null;
  status: string;
  views_count: number;
  created_at: string;
  location: string | null;
  condition: string | null;
  description: string | null;
  photo_url?: string | null;
}

interface SellerMetrics {
  active: number;
  sold: number;
  totalViews: number;
  avgRating: number;
  ratingCount: number;
}

const STATUS_FILTERS = [
  { value: "active", label: "Aktywne" },
  { value: "sold", label: "Sprzedane" },
  { value: "archived", label: "Archiwalne" },
  { value: "draft", label: "Robocze" },
];

export function MyListingsTab({ userId }: { userId?: string }) {
  const navigate = useNavigate();
  const { execute: aiExecute } = useGetRidoAI();
  const [listings, setListings] = useState<ListingWithPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("active");
  const [metrics, setMetrics] = useState<SellerMetrics>({ active: 0, sold: 0, totalViews: 0, avgRating: 0, ratingCount: 0 });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [aiTips, setAiTips] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!userId) return;
    loadAll();
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    loadListings();
  }, [statusFilter, userId]);

  const loadAll = async () => {
    await Promise.all([loadListings(), loadMetrics()]);
  };

  const loadMetrics = async () => {
    if (!userId) return;
    const [activeRes, soldRes, viewsRes, ratingsRes] = await Promise.all([
      supabase.from("general_listings").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "active"),
      supabase.from("general_listings").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "sold"),
      supabase.from("general_listings").select("views_count").eq("user_id", userId),
      supabase.from("listing_reviews").select("score_avg").eq("seller_id", userId),
    ]);

    const totalViews = (viewsRes.data || []).reduce((s, r) => s + (r.views_count || 0), 0);
    const ratings = ratingsRes.data || [];
    const avgRating = ratings.length > 0 ? ratings.reduce((s, r) => s + Number(r.score_avg), 0) / ratings.length : 0;

    setMetrics({
      active: activeRes.count || 0,
      sold: soldRes.count || 0,
      totalViews,
      avgRating,
      ratingCount: ratings.length,
    });
  };

  const loadListings = async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("general_listings")
      .select("id, title, price, status, views_count, created_at, location, condition, description")
      .eq("user_id", userId)
      .eq("status", statusFilter)
      .order("created_at", { ascending: false });

    if (!error && data) {
      // Load first photo for each
      const withPhotos: ListingWithPhoto[] = [];
      for (const listing of data) {
        const { data: photoData } = await supabase
          .from("general_listing_photos")
          .select("url")
          .eq("listing_id", listing.id)
          .order("display_order")
          .limit(1);
        withPhotos.push({ ...listing, photo_url: photoData?.[0]?.url || null });
      }
      setListings(withPhotos);

      // Load AI tips for active listings with >20 views
      const tippable = withPhotos.filter(l => l.status === "active" && l.views_count > 20);
      for (const l of tippable.slice(0, 3)) {
        loadAiTip(l);
      }
    }
    setLoading(false);
  };

  const loadAiTip = async (listing: ListingWithPhoto) => {
    const result = await aiExecute({
      taskType: "seller_tip",
      query: `Daj 1 krótką wskazówkę (max 20 słów) jak poprawić to ogłoszenie żeby sprzedało się szybciej. Tytuł: "${listing.title}", Cena: ${listing.price} zł, Wyświetlenia: ${listing.views_count}`,
      mode: "quick",
    });
    if (result?.result) {
      setAiTips(prev => ({ ...prev, [listing.id]: result.result }));
    }
  };

  const handleRefresh = async (id: string) => {
    const { error } = await supabase
      .from("general_listings")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error("Błąd odświeżania");
    else { toast.success("Ogłoszenie odświeżone"); loadListings(); }
  };

  const handleMarkSold = async (id: string) => {
    const { error } = await supabase
      .from("general_listings")
      .update({ status: "sold" })
      .eq("id", id);
    if (error) toast.error("Błąd");
    else { toast.success("Oznaczono jako sprzedane"); loadAll(); }
  };

  const handleArchive = async (id: string) => {
    const { error } = await supabase
      .from("general_listings")
      .update({ status: "archived" })
      .eq("id", id);
    if (error) toast.error("Błąd");
    else { toast.success("Zarchiwizowano"); loadAll(); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase
      .from("general_listings")
      .delete()
      .eq("id", deleteId);
    if (error) toast.error("Nie można usunąć");
    else { toast.success("Usunięto"); loadAll(); }
    setDeleteId(null);
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "active": return <Badge className="bg-green-500/10 text-green-700 border-green-200">Aktywne</Badge>;
      case "sold": return <Badge className="bg-blue-500/10 text-blue-700 border-blue-200">Sprzedane</Badge>;
      case "archived": return <Badge variant="secondary">Archiwum</Badge>;
      case "draft": return <Badge variant="outline">Szkic</Badge>;
      default: return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <Package className="h-5 w-5 mx-auto mb-1 text-primary" />
            <p className="text-2xl font-bold">{metrics.active}</p>
            <p className="text-xs text-muted-foreground">Aktywne</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <CheckCircle className="h-5 w-5 mx-auto mb-1 text-green-500" />
            <p className="text-2xl font-bold">{metrics.sold}</p>
            <p className="text-xs text-muted-foreground">Sprzedane</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Eye className="h-5 w-5 mx-auto mb-1 text-primary" />
            <p className="text-2xl font-bold">{metrics.totalViews}</p>
            <p className="text-xs text-muted-foreground">Wyświetlenia</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Star className="h-5 w-5 mx-auto mb-1 text-yellow-500" />
            <p className="text-2xl font-bold">{metrics.avgRating > 0 ? metrics.avgRating.toFixed(1) : "—"}</p>
            <p className="text-xs text-muted-foreground">{metrics.ratingCount} ocen</p>
          </CardContent>
        </Card>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {STATUS_FILTERS.map(f => (
          <Button
            key={f.value}
            variant={statusFilter === f.value ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {/* Add button */}
      <Button onClick={() => navigate("/marketplace/dodaj")} className="gap-2">
        <Plus className="h-4 w-4" /> Dodaj nowe ogłoszenie
      </Button>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : listings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Brak ogłoszeń w tej kategorii</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 px-2 font-medium">Ogłoszenie</th>
                  <th className="text-right py-2 px-2 font-medium">Cena</th>
                  <th className="text-center py-2 px-2 font-medium">Status</th>
                  <th className="text-right py-2 px-2 font-medium">Wyświetlenia</th>
                  <th className="text-right py-2 px-2 font-medium">Data</th>
                  <th className="text-right py-2 px-2 font-medium">Akcje</th>
                </tr>
              </thead>
              <tbody>
                {listings.map(l => (
                  <tr key={l.id} className="border-b hover:bg-muted/50 transition">
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded bg-muted overflow-hidden shrink-0">
                          {l.photo_url ? (
                            <img src={l.photo_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center">
                              <ImageIcon className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <span className="truncate max-w-[200px] font-medium cursor-pointer hover:text-primary"
                          onClick={() => navigate(`/marketplace/listing/${l.id}`)}
                        >
                          {l.title}
                        </span>
                      </div>
                    </td>
                    <td className="text-right py-2 px-2 font-semibold">
                      {l.price ? `${l.price.toLocaleString("pl-PL")} zł` : "—"}
                    </td>
                    <td className="text-center py-2 px-2">{statusBadge(l.status)}</td>
                    <td className="text-right py-2 px-2">{l.views_count}</td>
                    <td className="text-right py-2 px-2 text-muted-foreground">
                      {new Date(l.created_at).toLocaleDateString("pl-PL")}
                    </td>
                    <td className="text-right py-2 px-2">
                      <ListingActions listing={l} onRefresh={handleRefresh} onSold={handleMarkSold} onArchive={handleArchive} onDelete={setDeleteId} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {listings.map(l => (
              <Card key={l.id} className="overflow-hidden">
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <div className="h-14 w-14 rounded bg-muted overflow-hidden shrink-0">
                      {l.photo_url ? (
                        <img src={l.photo_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center">
                          <ImageIcon className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium truncate text-sm cursor-pointer" onClick={() => navigate(`/marketplace/listing/${l.id}`)}>{l.title}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        {statusBadge(l.status)}
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Eye className="h-3 w-3" />{l.views_count}
                        </span>
                      </div>
                      <p className="text-sm font-semibold mt-1">
                        {l.price ? `${l.price.toLocaleString("pl-PL")} zł` : "—"}
                      </p>
                    </div>
                    <ListingActions listing={l} onRefresh={handleRefresh} onSold={handleMarkSold} onArchive={handleArchive} onDelete={setDeleteId} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* AI tips */}
          {Object.keys(aiTips).length > 0 && (
            <Alert className="border-yellow-500/50 bg-yellow-50/50 dark:bg-yellow-950/20">
              <Sparkles className="h-4 w-4 text-yellow-600" />
              <AlertDescription>
                <p className="font-medium text-yellow-700 dark:text-yellow-400 mb-2">Wskazówki Rido AI</p>
                {Object.entries(aiTips).map(([id, tip]) => {
                  const listing = listings.find(l => l.id === id);
                  return (
                    <p key={id} className="text-sm text-yellow-800 dark:text-yellow-300 mb-1">
                      <strong>{listing?.title?.slice(0, 30)}...</strong>: {tip}
                    </p>
                  );
                })}
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usunąć ogłoszenie?</AlertDialogTitle>
            <AlertDialogDescription>
              Tej operacji nie można cofnąć. Ogłoszenie i jego zdjęcia zostaną trwale usunięte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Usuń
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ListingActions({ listing, onRefresh, onSold, onArchive, onDelete }: {
  listing: ListingWithPhoto;
  onRefresh: (id: string) => void;
  onSold: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const navigate = useNavigate();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => navigate(`/marketplace/edit-listing/${listing.id}`)}>
          <Edit className="h-4 w-4 mr-2" /> Edytuj
        </DropdownMenuItem>
        {listing.status === "active" && (
          <>
            <DropdownMenuItem onClick={() => navigate(`/marketplace/edit-listing/${listing.id}#ai-photos`)}>
              <Wand2 className="h-4 w-4 mr-2" /> Dodaj AI zdjęcia
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onRefresh(listing.id)}>
              <RefreshCw className="h-4 w-4 mr-2" /> Odśwież
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSold(listing.id)}>
              <CheckCircle className="h-4 w-4 mr-2" /> Oznacz jako sprzedane
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onArchive(listing.id)}>
              <Archive className="h-4 w-4 mr-2" /> Archiwizuj
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        {listing.status !== "sold" && (
          <DropdownMenuItem onClick={() => onDelete(listing.id)} className="text-destructive">
            <Trash2 className="h-4 w-4 mr-2" /> Usuń
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

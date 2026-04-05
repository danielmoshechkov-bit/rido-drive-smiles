import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TabsContent, TabsTrigger } from "@/components/ui/tabs";
import { TabsPill } from "@/components/ui/TabsPill";
import { UniversalHomeButton } from "@/components/UniversalHomeButton";
import { MyGetRidoButton } from "@/components/MyGetRidoButton";
import { AdminPortalSwitcher } from "@/components/admin/AdminPortalSwitcher";
import { toast } from "sonner";
import {
  Search, List, Grid, Settings, Loader2, Trash2, Eye, EyeOff,
  Package, TrendingUp, Users, ShoppingCart
} from "lucide-react";

interface GeneralListing {
  id: string;
  title: string;
  price: number | null;
  status: string;
  views_count: number;
  created_at: string;
  location: string | null;
  condition: string | null;
  category_id: string | null;
  user_id: string;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

export default function AdminRidoMarket() {
  const [user, setUser] = useState<any>(null);
  const [listings, setListings] = useState<GeneralListing[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [stats, setStats] = useState({ total: 0, active: 0, sold: 0, views: 0 });

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    init();
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);

    const [listingsRes, catsRes] = await Promise.all([
      supabase
        .from("general_listings" as any)
        .select("id, title, price, status, views_count, created_at, location, condition, category_id, user_id")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("general_listing_categories" as any)
        .select("id, name, slug")
        .order("name"),
    ]);

    const data = (listingsRes.data || []) as any as GeneralListing[];
    setListings(data);
    setCategories((catsRes.data || []) as any as Category[]);

    setStats({
      total: data.length,
      active: data.filter((l) => l.status === "active").length,
      sold: data.filter((l) => l.status === "sold").length,
      views: data.reduce((s, l) => s + (l.views_count || 0), 0),
    });

    setLoading(false);
  };

  const toggleStatus = async (id: string, current: string) => {
    const next = current === "active" ? "archived" : "active";
    const { error } = await supabase
      .from("general_listings" as any)
      .update({ status: next } as any)
      .eq("id", id);
    if (error) { toast.error("Błąd"); return; }
    toast.success(next === "active" ? "Aktywowano" : "Zarchiwizowano");
    loadData();
  };

  const deleteListing = async (id: string) => {
    if (!confirm("Usunąć ogłoszenie?")) return;
    const { error } = await supabase
      .from("general_listings" as any)
      .delete()
      .eq("id", id);
    if (error) { toast.error("Błąd usuwania"); return; }
    toast.success("Usunięto");
    loadData();
  };

  const getCategoryName = (catId: string | null) => {
    if (!catId) return "—";
    return categories.find((c) => c.id === catId)?.name || "—";
  };

  const filtered = listings.filter((l) => {
    const matchSearch = l.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchStatus = filterStatus === "all" || l.status === filterStatus;
    const matchCat = filterCategory === "all" || l.category_id === filterCategory;
    return matchSearch && matchStatus && matchCat;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6">
        <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b mb-6">
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-4">
              <UniversalHomeButton />
              <AdminPortalSwitcher />
            </div>
            <MyGetRidoButton user={user} />
          </div>
        </header>

        <div className="mb-6">
          <h1 className="text-2xl font-bold">RidoMarket — Admin</h1>
          <p className="text-muted-foreground">Zarządzaj ogłoszeniami ogólnymi marketplace</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {[
            { label: "Wszystkie", value: stats.total, icon: Package },
            { label: "Aktywne", value: stats.active, icon: ShoppingCart },
            { label: "Sprzedane", value: stats.sold, icon: TrendingUp },
            { label: "Wyświetlenia", value: stats.views, icon: Users },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-4 flex items-center gap-3">
                <s.icon className="h-5 w-5 text-primary shrink-0" />
                <div>
                  <p className="text-2xl font-bold">{s.value}</p>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <TabsPill defaultValue="listings" className="space-y-6">
          <TabsTrigger value="listings" className="flex items-center gap-2">
            <List className="h-4 w-4" /> Ogłoszenia
          </TabsTrigger>
          <TabsTrigger value="categories" className="flex items-center gap-2">
            <Grid className="h-4 w-4" /> Kategorie
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" /> Ustawienia
          </TabsTrigger>

          {/* Listings Tab */}
          <TabsContent value="listings">
            <Card>
              <CardHeader>
                <CardTitle>Ogłoszenia ({filtered.length})</CardTitle>
                <CardDescription>Moderuj ogłoszenia RidoMarket</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-6">
                  <div className="md:col-span-2 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Szukaj po tytule..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Wszystkie</SelectItem>
                      <SelectItem value="active">Aktywne</SelectItem>
                      <SelectItem value="sold">Sprzedane</SelectItem>
                      <SelectItem value="archived">Archiwalne</SelectItem>
                      <SelectItem value="draft">Szkice</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={filterCategory} onValueChange={setFilterCategory}>
                    <SelectTrigger><SelectValue placeholder="Kategoria" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Wszystkie</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {filtered.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">Brak ogłoszeń</p>
                ) : (
                  <div className="space-y-2">
                    {filtered.map((l) => (
                      <div key={l.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{l.title}</p>
                          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                            {l.price != null && (
                              <span className="font-semibold text-foreground">
                                {l.price.toLocaleString("pl-PL")} zł
                              </span>
                            )}
                            <span>{getCategoryName(l.category_id)}</span>
                            {l.location && <span>📍 {l.location}</span>}
                            <span className="flex items-center gap-0.5">
                              <Eye className="h-3 w-3" /> {l.views_count}
                            </span>
                            <span>{new Date(l.created_at).toLocaleDateString("pl-PL")}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-3">
                          <Badge variant={
                            l.status === "active" ? "default" :
                            l.status === "sold" ? "secondary" :
                            "outline"
                          }>
                            {l.status === "active" ? "Aktywne" :
                             l.status === "sold" ? "Sprzedane" :
                             l.status === "archived" ? "Archiwum" :
                             l.status}
                          </Badge>
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => toggleStatus(l.id, l.status)}
                            title={l.status === "active" ? "Archiwizuj" : "Aktywuj"}
                          >
                            {l.status === "active" ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            onClick={() => deleteListing(l.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Categories Tab */}
          <TabsContent value="categories">
            <Card>
              <CardHeader>
                <CardTitle>Kategorie ogłoszeń</CardTitle>
                <CardDescription>Zarządzaj kategoriami marketplace ogólnego</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {categories.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="font-medium">{c.name}</p>
                      <p className="text-sm text-muted-foreground font-mono">{c.slug}</p>
                    </div>
                    <Badge variant="secondary">
                      {listings.filter((l) => l.category_id === c.id).length} ogłoszeń
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>Ustawienia RidoMarket</CardTitle>
                <CardDescription>Konfiguracja marketplace ogólnego</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Ustawienia będą rozbudowywane w kolejnych fazach (moderacja AI, limity, promowanie).
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </TabsPill>
      </div>
    </div>
  );
}

import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { GeneralListingCard } from "@/components/marketplace/GeneralListingCard";
import { UniversalHomeButton } from "@/components/UniversalHomeButton";
import { MyGetRidoButton } from "@/components/MyGetRidoButton";
import Footer from "@/components/Footer";
import {
  Search, Sparkles, Plus, SlidersHorizontal, PackageOpen, Loader2, ChevronLeft, ChevronRight, X
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Category {
  id: string;
  name: string;
  slug: string;
  listings_count: number;
}

interface ListingRow {
  id: string;
  title: string;
  price: number | null;
  price_negotiable: boolean;
  condition: string | null;
  location: string | null;
  ai_score: number | null;
  created_at: string;
  category_id: string | null;
  views_count: number;
  status: string;
}

const PER_PAGE = 20;

const CONDITIONS = [
  { value: "", label: "Wszystkie stany" },
  { value: "nowy", label: "Nowy" },
  { value: "jak_nowy", label: "Jak nowy" },
  { value: "dobry", label: "Dobry" },
  { value: "dostateczny", label: "Dostateczny" },
];

export default function GeneralMarketplace() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [listings, setListings] = useState<any[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [photosMap, setPhotosMap] = useState<Record<string, any[]>>({});

  // Filters
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [conditionFilter, setConditionFilter] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [sortBy, setSortBy] = useState("newest");

  // AI search
  const [aiQuery, setAiQuery] = useState("");
  const [aiSearching, setAiSearching] = useState(false);
  const [aiResults, setAiResults] = useState<string[] | null>(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    fetchCategories();
    fetchListings();
  }, []);

  const fetchCategories = async () => {
    const { data } = await supabase
      .from("general_listing_categories")
      .select("id, name, slug, listings_count")
      .order("name");
    if (data) setCategories(data);
  };

  const fetchListings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("general_listings")
      .select("id, title, price, price_negotiable, condition, location, ai_score, created_at, category_id, views_count, status")
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      toast.error("Błąd ładowania ogłoszeń");
    }
    if (data) {
      setListings(data);
      // Fetch photos for these listings
      const ids = data.map(l => l.id);
      if (ids.length > 0) {
        const { data: photos } = await supabase
          .from("general_listing_photos")
          .select("listing_id, url, is_ai_enhanced, display_order")
          .in("listing_id", ids)
          .order("display_order");
        if (photos) {
          const map: Record<string, any[]> = {};
          photos.forEach(p => {
            if (!map[p.listing_id]) map[p.listing_id] = [];
            map[p.listing_id].push(p);
          });
          setPhotosMap(map);
        }
      }
    }
    setLoading(false);
  };

  // Filtered + sorted
  const filtered = useMemo(() => {
    let result = [...listings];

    // AI search filter
    if (aiResults) {
      result = result.filter(l => aiResults.includes(l.id));
    }

    if (selectedCategory) {
      result = result.filter(l => l.category_id === selectedCategory);
    }
    if (conditionFilter) {
      result = result.filter(l => l.condition === conditionFilter);
    }
    if (priceMin) {
      result = result.filter(l => l.price && l.price >= Number(priceMin));
    }
    if (priceMax) {
      result = result.filter(l => l.price && l.price <= Number(priceMax));
    }
    if (locationFilter.trim()) {
      const q = locationFilter.toLowerCase();
      result = result.filter(l => l.location?.toLowerCase().includes(q));
    }

    // Sort
    switch (sortBy) {
      case "price_asc": result.sort((a, b) => (a.price || 0) - (b.price || 0)); break;
      case "price_desc": result.sort((a, b) => (b.price || 0) - (a.price || 0)); break;
      case "ai_score": result.sort((a, b) => (b.ai_score || 0) - (a.ai_score || 0)); break;
      default: break; // already newest first
    }
    return result;
  }, [listings, selectedCategory, conditionFilter, priceMin, priceMax, locationFilter, sortBy, aiResults]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * PER_PAGE;
    return filtered.slice(start, start + PER_PAGE);
  }, [filtered, currentPage]);

  useEffect(() => { setCurrentPage(1); }, [selectedCategory, conditionFilter, priceMin, priceMax, locationFilter, sortBy, aiResults]);

  const handleAISearch = async () => {
    if (!aiQuery.trim()) return;
    setAiSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-search", {
        body: { query: aiQuery, context: "general_listings" }
      });
      if (error) throw error;
      if (data?.ids && Array.isArray(data.ids)) {
        setAiResults(data.ids);
        if (data.ids.length === 0) toast.info("Nie znaleziono pasujących ogłoszeń");
      } else if (data?.results) {
        setAiResults(data.results.map((r: any) => r.id));
      } else {
        toast.info("AI nie zwróciło wyników — spróbuj zmienić zapytanie");
      }
    } catch (err) {
      console.error(err);
      toast.error("Błąd wyszukiwania AI");
    } finally {
      setAiSearching(false);
    }
  };

  const clearAllFilters = () => {
    setSelectedCategory(null);
    setConditionFilter("");
    setPriceMin("");
    setPriceMax("");
    setLocationFilter("");
    setAiResults(null);
    setAiQuery("");
  };

  const hasActiveFilters = !!(selectedCategory || conditionFilter || priceMin || priceMax || locationFilter || aiResults);

  // Sidebar content (reusable between desktop and mobile sheet)
  const FiltersContent = () => (
    <div className="space-y-5">
      {/* AI Search */}
      <div>
        <label className="text-sm font-medium mb-1.5 block">Wyszukiwarka AI</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
            <Input
              placeholder='Opisz czego szukasz...'
              value={aiQuery}
              onChange={e => setAiQuery(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAISearch()}
              className="pl-9"
            />
          </div>
          <Button onClick={handleAISearch} disabled={aiSearching} size="icon" className="shrink-0">
            {aiSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>
        {aiResults && (
          <button
            onClick={() => { setAiResults(null); setAiQuery(""); }}
            className="text-xs text-primary mt-1 hover:underline flex items-center gap-1"
          >
            <X className="h-3 w-3" /> Wyczyść wyniki AI
          </button>
        )}
      </div>

      <Separator />

      {/* Categories */}
      <div>
        <label className="text-sm font-medium mb-1.5 block">Kategorie</label>
        <div className="space-y-0.5 max-h-56 overflow-y-auto">
          <button
            onClick={() => setSelectedCategory(null)}
            className={cn(
              "w-full text-left px-3 py-1.5 rounded-lg text-sm hover:bg-muted transition",
              !selectedCategory && "bg-primary/10 text-primary font-medium"
            )}
          >
            Wszystkie
          </button>
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={cn(
                "w-full text-left px-3 py-1.5 rounded-lg text-sm hover:bg-muted transition flex justify-between",
                selectedCategory === cat.id && "bg-primary/10 text-primary font-medium"
              )}
            >
              <span>{cat.name}</span>
              <span className="text-muted-foreground text-xs">{cat.listings_count}</span>
            </button>
          ))}
        </div>
      </div>

      <Separator />

      {/* Price */}
      <div>
        <label className="text-sm font-medium mb-1.5 block">Cena (zł)</label>
        <div className="flex gap-2">
          <Input type="number" placeholder="Od" value={priceMin} onChange={e => setPriceMin(e.target.value)} />
          <Input type="number" placeholder="Do" value={priceMax} onChange={e => setPriceMax(e.target.value)} />
        </div>
      </div>

      {/* Condition */}
      <div>
        <label className="text-sm font-medium mb-1.5 block">Stan</label>
        <Select value={conditionFilter} onValueChange={setConditionFilter}>
          <SelectTrigger><SelectValue placeholder="Wszystkie stany" /></SelectTrigger>
          <SelectContent>
            {CONDITIONS.map(c => (
              <SelectItem key={c.value} value={c.value || "all"}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Location */}
      <div>
        <label className="text-sm font-medium mb-1.5 block">Lokalizacja</label>
        <Input placeholder="Miasto..." value={locationFilter} onChange={e => setLocationFilter(e.target.value)} />
      </div>

      {hasActiveFilters && (
        <Button variant="outline" size="sm" onClick={clearAllFilters} className="w-full">
          <X className="h-3.5 w-3.5 mr-1" /> Wyczyść filtry
        </Button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <UniversalHomeButton />
            <span className="font-bold text-lg md:text-xl text-primary">RidoMarket</span>
          </div>
          <div className="flex gap-2">
            <MyGetRidoButton user={user} />
            <Button onClick={() => navigate("/marketplace/dodaj")} size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Dodaj ogłoszenie</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <div className="flex gap-6">
          {/* Desktop sidebar */}
          <aside className="hidden lg:block w-[280px] shrink-0">
            <div className="sticky top-24 space-y-0">
              <FiltersContent />
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 min-w-0">
            {/* Top bar */}
            <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                {/* Mobile filter button */}
                <Sheet>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="sm" className="lg:hidden gap-1.5">
                      <SlidersHorizontal className="h-4 w-4" />
                      Filtry
                      {hasActiveFilters && <Badge className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-xs">!</Badge>}
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-[300px] overflow-y-auto">
                    <div className="pt-6">
                      <FiltersContent />
                    </div>
                  </SheetContent>
                </Sheet>

                <span className="text-sm text-muted-foreground">
                  {filtered.length} ogłoszeń
                </span>
              </div>

              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Najnowsze</SelectItem>
                  <SelectItem value="price_asc">Najtańsze</SelectItem>
                  <SelectItem value="price_desc">Najdroższe</SelectItem>
                  <SelectItem value="ai_score">Ocena AI</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Grid */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : paginated.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <PackageOpen className="h-16 w-16 text-muted-foreground/50 mb-4" />
                <h2 className="text-xl font-semibold mb-2">Brak ogłoszeń</h2>
                <p className="text-muted-foreground mb-4">
                  {hasActiveFilters ? "Zmień filtry lub" : "Bądź pierwszy —"} dodaj ogłoszenie!
                </p>
                <Button onClick={() => navigate("/marketplace/dodaj")}>
                  <Plus className="h-4 w-4 mr-2" /> Dodaj ogłoszenie
                </Button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                  {paginated.map(listing => (
                    <GeneralListingCard
                      key={listing.id}
                      listing={{
                        ...listing,
                        photos: photosMap[listing.id] || [],
                      }}
                    />
                  ))}
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 mt-8">
                    <Button
                      variant="outline" size="sm"
                      disabled={currentPage === 1}
                      onClick={() => setCurrentPage(p => p - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {Array.from({ length: Math.min(totalPages, 7) }).map((_, i) => {
                      let page: number;
                      if (totalPages <= 7) {
                        page = i + 1;
                      } else if (currentPage <= 4) {
                        page = i + 1;
                      } else if (currentPage >= totalPages - 3) {
                        page = totalPages - 6 + i;
                      } else {
                        page = currentPage - 3 + i;
                      }
                      return (
                        <Button
                          key={page}
                          variant={currentPage === page ? "default" : "outline"}
                          size="sm"
                          onClick={() => setCurrentPage(page)}
                          className="w-9"
                        >
                          {page}
                        </Button>
                      );
                    })}
                    <Button
                      variant="outline" size="sm"
                      disabled={currentPage === totalPages}
                      onClick={() => setCurrentPage(p => p + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>

      <Footer />
    </div>
  );
}

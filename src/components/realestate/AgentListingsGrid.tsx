import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Search, Eye, Heart, GitCompare, Phone, Edit, Trash2, Plus, 
  Building, Home, Warehouse, Store, ChevronLeft, ChevronRight,
  ArrowUpDown, Grid3X3, List, Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Listing {
  id: string;
  title: string;
  price: number;
  property_type: string;
  location: string;
  status: string;
  views: number;
  favorites: number;
  compares: number;
  contact_reveals: number;
  listing_number: string;
  created_at: string;
}

interface AgentListingsGridProps {
  listings: Listing[];
  onAddListing: () => void;
  onEnrichAll?: () => void;
  agentVerified: boolean;
  agentId: string;
}

const CATEGORIES = [
  { key: "all", label: "Wszystkie", icon: Grid3X3 },
  { key: "mieszkanie", label: "Mieszkania", icon: Home },
  { key: "dom", label: "Domy", icon: Building },
  { key: "lokal", label: "Lokale", icon: Store },
  { key: "magazyn", label: "Magazyny", icon: Warehouse },
];

const TRANSACTION_TYPES = [
  { key: "all", label: "Wszystkie" },
  { key: "sprzedaż", label: "Sprzedaż" },
  { key: "wynajem", label: "Wynajem" },
];

const PER_PAGE_OPTIONS = [12, 16, 24];

function getStatusBadge(status: string) {
  switch (status) {
    case "active":
      return <Badge className="bg-green-500/15 text-green-600 border-green-500/30 text-xs">Aktywne</Badge>;
    case "draft":
      return <Badge variant="secondary" className="text-xs">Szkic</Badge>;
    case "inactive":
      return <Badge variant="outline" className="text-xs">Nieaktywne</Badge>;
    default:
      return <Badge variant="secondary" className="text-xs">{status}</Badge>;
  }
}

export function AgentListingsGrid({ listings, onAddListing, onEnrichAll, agentVerified, agentId }: AgentListingsGridProps) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [transaction, setTransaction] = useState("all");
  const [sortBy, setSortBy] = useState<"newest" | "price_asc" | "price_desc" | "views">("newest");
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(12);

  const filtered = useMemo(() => {
    let result = [...listings];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(l =>
        l.title.toLowerCase().includes(q) ||
        l.location.toLowerCase().includes(q) ||
        l.listing_number.toLowerCase().includes(q)
      );
    }

    // Category
    if (category !== "all") {
      result = result.filter(l => l.property_type.toLowerCase().includes(category));
    }

    // Transaction type from title
    if (transaction !== "all") {
      result = result.filter(l => {
        const titleLower = l.title.toLowerCase();
        if (transaction === "wynajem") return titleLower.includes("wynaj") || titleLower.includes("do wynaj");
        if (transaction === "sprzedaż") return !titleLower.includes("wynaj");
        return true;
      });
    }

    // Sort
    switch (sortBy) {
      case "price_asc": result.sort((a, b) => a.price - b.price); break;
      case "price_desc": result.sort((a, b) => b.price - a.price); break;
      case "views": result.sort((a, b) => b.views - a.views); break;
      default: result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    return result;
  }, [listings, search, category, transaction, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * perPage;
    return filtered.slice(start, start + perPage);
  }, [filtered, currentPage, perPage]);

  // Reset page on filter change
  const resetPage = () => setCurrentPage(1);

  const formatPrice = (price: number) => {
    return price.toLocaleString("pl-PL") + " zł";
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("pl-PL", { day: "2-digit", month: "short", year: "numeric" });
    } catch { return dateStr; }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-foreground">Moje ogłoszenia</h2>
          <p className="text-sm text-muted-foreground">{filtered.length} z {listings.length} ogłoszeń</p>
        </div>
        <div className="flex items-center gap-2">
          {onEnrichAll && (
            <Button variant="outline" size="sm" onClick={onEnrichAll}>
              <Sparkles className="h-4 w-4 mr-1" />
              Wzbogać AI
            </Button>
          )}
          <Button size="sm" onClick={onAddListing} disabled={!agentVerified}>
            <Plus className="h-4 w-4 mr-1" />
            Dodaj ogłoszenie
          </Button>
        </div>
      </div>

      {/* Filters row */}
      <div className="flex flex-col md:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Szukaj po tytule, lokalizacji, numerze..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetPage(); }}
            className="pl-9"
          />
        </div>

        {/* Transaction type */}
        <Select value={transaction} onValueChange={(v) => { setTransaction(v); resetPage(); }}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TRANSACTION_TYPES.map(t => (
              <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Sort */}
        <Select value={sortBy} onValueChange={(v: any) => { setSortBy(v); resetPage(); }}>
          <SelectTrigger className="w-[160px]">
            <ArrowUpDown className="h-3.5 w-3.5 mr-1" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Najnowsze</SelectItem>
            <SelectItem value="price_asc">Cena rosnąco</SelectItem>
            <SelectItem value="price_desc">Cena malejąco</SelectItem>
            <SelectItem value="views">Wyświetlenia</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map(cat => {
          const Icon = cat.icon;
          const isActive = category === cat.key;
          const count = cat.key === "all" ? listings.length : listings.filter(l => l.property_type.toLowerCase().includes(cat.key)).length;
          return (
            <button
              key={cat.key}
              onClick={() => { setCategory(cat.key); resetPage(); }}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border",
                isActive
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {cat.label}
              <span className={cn("text-xs ml-0.5", isActive ? "text-primary-foreground/80" : "text-muted-foreground")}>
                ({count})
              </span>
            </button>
          );
        })}
      </div>

      {/* Grid */}
      {paginated.length === 0 ? (
        <div className="text-center py-16">
          <Building className="h-14 w-14 mx-auto text-muted-foreground/30 mb-3" />
          <h3 className="text-lg font-medium mb-1">Brak wyników</h3>
          <p className="text-sm text-muted-foreground">Zmień filtry lub dodaj nowe ogłoszenie</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {paginated.map(listing => (
            <Card key={listing.id} className="overflow-hidden hover:shadow-md transition-shadow group">
              {/* Color bar top */}
              <div className={cn(
                "h-1.5",
                listing.status === "active" ? "bg-green-500" : listing.status === "draft" ? "bg-muted" : "bg-orange-400"
              )} />

              <div className="p-4 flex flex-col h-full">
                {/* Title & status */}
                <div className="mb-2">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <h4 className="font-semibold text-sm text-foreground line-clamp-2 leading-snug flex-1">
                      {listing.title}
                    </h4>
                    {getStatusBadge(listing.status)}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-1">
                    {listing.property_type} • {listing.location}
                  </p>
                </div>

                {/* Price */}
                <div className="mb-3">
                  <span className="text-lg font-bold text-primary">{formatPrice(listing.price)}</span>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-4 gap-1 mb-3">
                  <div className="flex flex-col items-center text-center">
                    <Eye className="h-3.5 w-3.5 text-blue-500 mb-0.5" />
                    <span className="text-xs font-semibold">{listing.views}</span>
                  </div>
                  <div className="flex flex-col items-center text-center">
                    <Heart className="h-3.5 w-3.5 text-red-500 mb-0.5" />
                    <span className="text-xs font-semibold">{listing.favorites}</span>
                  </div>
                  <div className="flex flex-col items-center text-center">
                    <GitCompare className="h-3.5 w-3.5 text-purple-500 mb-0.5" />
                    <span className="text-xs font-semibold">{listing.compares}</span>
                  </div>
                  <div className="flex flex-col items-center text-center">
                    <Phone className="h-3.5 w-3.5 text-green-500 mb-0.5" />
                    <span className="text-xs font-semibold">{listing.contact_reveals}</span>
                  </div>
                </div>

                {/* Meta */}
                <div className="mt-auto pt-2 border-t flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">
                    <span className="font-mono">{listing.listing_number}</span>
                    <span className="mx-1">•</span>
                    <span>{formatDate(listing.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <Button variant="ghost" size="icon" className="h-7 w-7">
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Pokaż:</span>
            <Select value={String(perPage)} onValueChange={(v) => { setPerPage(Number(v)); resetPage(); }}>
              <SelectTrigger className="w-[70px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PER_PAGE_OPTIONS.map(n => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage(p => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              return (
                <Button
                  key={pageNum}
                  variant={currentPage === pageNum ? "default" : "outline"}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setCurrentPage(pageNum)}
                >
                  {pageNum}
                </Button>
              );
            })}

            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(p => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <span className="text-sm text-muted-foreground">
            Strona {currentPage} z {totalPages}
          </span>
        </div>
      )}
    </div>
  );
}

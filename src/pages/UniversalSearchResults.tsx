import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Search, Sparkles, Loader2, Car, Home, Wrench, LayoutGrid, Rows3, List, ArrowLeft } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { UniversalHomeButton } from '@/components/UniversalHomeButton';
import { MyGetRidoButton } from '@/components/MyGetRidoButton';
import { ListingCard } from '@/components/marketplace/ListingCard';
import { PropertyListingCard } from '@/components/realestate/PropertyListingCard';
import { ServiceListingCard } from '@/components/services/ServiceListingCard';
import { cn } from '@/lib/utils';

type ViewMode = 'grid' | 'compact' | 'list';
type CategoryFilter = 'all' | 'vehicles' | 'realEstate' | 'services';

interface SearchResults {
  vehicles?: { items: any[]; count: number; filters: any; explanation: string };
  realEstate?: { items: any[]; count: number; filters: any; explanation: string };
  services?: { items: any[]; count: number; filters: any; explanation: string };
}

export default function UniversalSearchResults() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialQuery = searchParams.get('query') || '';
  
  const [query, setQuery] = useState(initialQuery);
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState<SearchResults>({});
  const [explanation, setExplanation] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [user, setUser] = useState<any>(null);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  useEffect(() => {
    if (initialQuery && !hasSearched) {
      handleSearch(initialQuery);
    }
  }, [initialQuery]);

  const handleSearch = async (searchQuery?: string) => {
    const finalQuery = searchQuery || query;
    if (!finalQuery.trim()) return;

    setIsLoading(true);
    setHasSearched(true);

    try {
      const { data, error } = await supabase.functions.invoke('ai-search', {
        body: {
          query: finalQuery,
          searchType: 'universal',
          userId: user?.id,
          ipAddress: 'browser',
          deviceFingerprint: navigator.userAgent,
        },
      });

      if (error) {
        if (error.message?.includes('429')) {
          toast.error('Zbyt wiele zapytań. Poczekaj chwilę.');
        } else {
          toast.error('Błąd wyszukiwania AI');
        }
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      setResults(data.results || {});
      setExplanation(data.explanation || '');
      
      const totalResults = (data.results?.vehicles?.count || 0) + 
                          (data.results?.realEstate?.count || 0) + 
                          (data.results?.services?.count || 0);
      toast.success(`Znaleziono ${totalResults} wyników`);
    } catch (err) {
      console.error('Universal search error:', err);
      toast.error('Błąd połączenia z AI');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) {
      handleSearch();
    }
  };

  const totalCounts = useMemo(() => ({
    vehicles: results.vehicles?.count || 0,
    realEstate: results.realEstate?.count || 0,
    services: results.services?.count || 0,
    all: (results.vehicles?.count || 0) + (results.realEstate?.count || 0) + (results.services?.count || 0)
  }), [results]);

  const showVehicles = categoryFilter === 'all' || categoryFilter === 'vehicles';
  const showRealEstate = categoryFilter === 'all' || categoryFilter === 'realEstate';
  const showServices = categoryFilter === 'all' || categoryFilter === 'services';

  const getGridClass = () => {
    if (viewMode === 'list') return 'flex flex-col gap-3';
    if (viewMode === 'compact') return 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3';
    return 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4';
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <UniversalHomeButton />
          <MyGetRidoButton user={user} />
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {/* Back button */}
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Wróć do strony głównej
        </Button>

        {/* Search Bar */}
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-accent/5 rounded-2xl p-6 border border-primary/10 mb-6">
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground z-10" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Zapytaj Rido - auto, mieszkanie, usługi..."
                className="h-14 text-lg pl-12 pr-24 rounded-full border-2 border-primary/20 focus:border-primary bg-background shadow-sm"
                disabled={isLoading}
              />
              <Button
                onClick={() => handleSearch()}
                disabled={isLoading || !query.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-10 px-4 rounded-full bg-primary hover:bg-primary/90"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              </Button>
            </div>
          </div>

          {/* AI Explanation */}
          {explanation && (
            <div className="mt-4 p-4 bg-background/80 rounded-xl border border-primary/10">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-primary mb-1">Rido AI:</p>
                  <p className="text-sm text-muted-foreground">{explanation}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Filters Row */}
        {hasSearched && (
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            {/* Category Tabs - Purple Pill Style */}
            <Tabs value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as CategoryFilter)}>
              <TabsList className="bg-primary text-white rounded-full p-1 h-auto gap-1">
                <TabsTrigger 
                  value="all" 
                  className={cn(
                    "px-4 py-2 rounded-full text-sm whitespace-nowrap transition-all duration-150",
                    "data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:font-semibold",
                    "hover:bg-white/20 focus-visible:outline-none"
                  )}
                >
                  Wszystko
                  {totalCounts.all > 0 && <Badge variant="secondary" className="ml-2 bg-white/20 text-white data-[state=active]:bg-primary/20 data-[state=active]:text-primary">{totalCounts.all}</Badge>}
                </TabsTrigger>
                <TabsTrigger 
                  value="vehicles" 
                  className={cn(
                    "px-4 py-2 rounded-full text-sm whitespace-nowrap transition-all duration-150 flex items-center gap-2",
                    "data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:font-semibold",
                    "hover:bg-white/20 focus-visible:outline-none",
                    "disabled:opacity-40"
                  )}
                  disabled={totalCounts.vehicles === 0}
                >
                  <Car className="h-4 w-4" />
                  <span>Pojazdy</span>
                  {totalCounts.vehicles > 0 && <Badge variant="secondary" className="ml-1 bg-white/20 text-white">{totalCounts.vehicles}</Badge>}
                </TabsTrigger>
                <TabsTrigger 
                  value="realEstate" 
                  className={cn(
                    "px-4 py-2 rounded-full text-sm whitespace-nowrap transition-all duration-150 flex items-center gap-2",
                    "data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:font-semibold",
                    "hover:bg-white/20 focus-visible:outline-none",
                    "disabled:opacity-40"
                  )}
                  disabled={totalCounts.realEstate === 0}
                >
                  <Home className="h-4 w-4 mr-1" />
                  <span>Nieruchomości</span>
                  {totalCounts.realEstate > 0 && <Badge variant="secondary" className="ml-1 bg-white/20 text-white">{totalCounts.realEstate}</Badge>}
                </TabsTrigger>
                <TabsTrigger 
                  value="services" 
                  className={cn(
                    "px-4 py-2 rounded-full text-sm whitespace-nowrap transition-all duration-150 flex items-center gap-2",
                    "data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:font-semibold",
                    "hover:bg-white/20 focus-visible:outline-none",
                    "disabled:opacity-40"
                  )}
                  disabled={totalCounts.services === 0}
                >
                  <Wrench className="h-4 w-4" />
                  <span>Usługi</span>
                  {totalCounts.services > 0 && <Badge variant="secondary" className="ml-1 bg-white/20 text-white">{totalCounts.services}</Badge>}
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* View Mode Toggle */}
            <div className="flex gap-0.5 bg-muted rounded-lg p-0.5">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="icon"
                className="h-8 w-8"
                onClick={() => setViewMode('grid')}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'compact' ? 'default' : 'ghost'}
                size="icon"
                className="h-8 w-8"
                onClick={() => setViewMode('compact')}
              >
                <Rows3 className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="icon"
                className="h-8 w-8"
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-muted-foreground">Rido AI przeszukuje wszystkie portale...</p>
          </div>
        )}

        {/* Results */}
        {!isLoading && hasSearched && (
          <div className="space-y-8">
            {/* Vehicles Section */}
            {showVehicles && results.vehicles && results.vehicles.count > 0 && (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Car className="h-5 w-5 text-primary" />
                    Pojazdy ({results.vehicles.count})
                  </h2>
                  <Button variant="link" onClick={() => navigate(`/gielda?query=${encodeURIComponent(query)}`)}>
                    Zobacz więcej →
                  </Button>
                </div>
                {results.vehicles.explanation && (
                  <p className="text-sm text-muted-foreground mb-3">{results.vehicles.explanation}</p>
                )}
                <div className={getGridClass()}>
                  {results.vehicles.items.slice(0, 4).map((listing: any) => (
                    <div key={listing.id} onClick={() => navigate(`/gielda/ogloszenie/${listing.id}`)}>
                      <ListingCard
                        listing={listing}
                        variant={viewMode}
                        isLoggedIn={!!user}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Real Estate Section */}
            {showRealEstate && results.realEstate && results.realEstate.count > 0 && (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Home className="h-5 w-5 text-primary" />
                    Nieruchomości ({results.realEstate.count})
                  </h2>
                  <Button variant="link" onClick={() => navigate(`/nieruchomosci?query=${encodeURIComponent(query)}`)}>
                    Zobacz więcej →
                  </Button>
                </div>
                {results.realEstate.explanation && (
                  <p className="text-sm text-muted-foreground mb-3">{results.realEstate.explanation}</p>
                )}
                <div className={getGridClass()}>
                  {results.realEstate.items.slice(0, 4).map((listing: any) => (
                    <div key={listing.id} onClick={() => navigate(`/nieruchomosci/ogloszenie/${listing.id}`)}>
                      <PropertyListingCard
                        listing={listing}
                        variant={viewMode}
                        isLoggedIn={!!user}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Services Section */}
            {showServices && results.services && results.services.count > 0 && (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <Wrench className="h-5 w-5 text-primary" />
                    Usługi ({results.services.count})
                  </h2>
                  <Button variant="link" onClick={() => navigate(`/uslugi?query=${encodeURIComponent(query)}`)}>
                    Zobacz więcej →
                  </Button>
                </div>
                {results.services.explanation && (
                  <p className="text-sm text-muted-foreground mb-3">{results.services.explanation}</p>
                )}
                <div className={getGridClass()}>
                  {results.services.items.slice(0, 4).map((provider: any) => (
                    <ServiceListingCard
                      key={provider.id}
                      provider={provider}
                      isLoggedIn={!!user}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* No Results */}
            {totalCounts.all === 0 && (
              <div className="text-center py-16">
                <p className="text-lg text-muted-foreground mb-4">Brak wyników dla tego zapytania</p>
                <p className="text-sm text-muted-foreground">Spróbuj sformułować zapytanie inaczej</p>
              </div>
            )}
          </div>
        )}

        {/* Initial State */}
        {!isLoading && !hasSearched && (
          <div className="text-center py-16">
            <Sparkles className="h-16 w-16 text-primary/30 mx-auto mb-4" />
            <p className="text-lg text-muted-foreground mb-2">Wpisz zapytanie, aby wyszukać</p>
            <p className="text-sm text-muted-foreground">
              Możesz szukać jednocześnie aut, mieszkań i usług - np. "szukam auta miejskiego i małego mieszkania w Warszawie plus przeprowadzka"
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

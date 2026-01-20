import { useState, useRef, useEffect } from 'react';
import { Search, Loader2, Sparkles, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface SearchFilters {
  brands: string[];
  models: string[];
  cities: string[];
  fuelTypes: string[];
  yearFrom: number | null;
  yearTo: number | null;
  priceMin: number | null;
  priceMax: number | null;
}

interface RidoSearchBarProps {
  onSearchResults?: (results: any[], filters: SearchFilters, explanation: string) => void;
  className?: string;
}

const EXAMPLE_QUERIES = [
  { label: "hybryda od 2020", query: "szukam hybrydy od 2020 roku" },
  { label: "LPG do 400 zł/tydzień", query: "auto na LPG do 400 zł tygodniowo" },
  { label: "Toyota lub Honda", query: "Toyota albo Honda z niskim przebiegiem" },
  { label: "elektryczne", query: "samochód elektryczny do wynajęcia" },
];

export function RidoSearchBar({ onSearchResults, className }: RidoSearchBarProps) {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [lastExplanation, setLastExplanation] = useState<string | null>(null);
  const [lastFilters, setLastFilters] = useState<SearchFilters | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id || null);
    };
    checkUser();
  }, []);

  const handleSearch = async (searchQuery?: string) => {
    const finalQuery = searchQuery || query;
    if (!finalQuery.trim()) return;

    setIsLoading(true);
    setShowResults(false);

    try {
      const { data, error } = await supabase.functions.invoke('ai-search', {
        body: {
          query: finalQuery,
          userId,
          ipAddress: 'browser',
          deviceFingerprint: navigator.userAgent,
        },
      });

      if (error) {
        if (error.message?.includes('402')) {
          toast.error('Wyczerpano limit zapytań. Wykup kredyty aby kontynuować.');
        } else if (error.message?.includes('429')) {
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

      setLastExplanation(data.explanation);
      setLastFilters(data.filters);
      setShowResults(true);

      if (onSearchResults) {
        onSearchResults(data.results || [], data.filters, data.explanation);
      }

      toast.success(`Znaleziono ${data.totalResults} wyników`);
    } catch (err) {
      console.error('AI search error:', err);
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

  const handleExampleClick = (exampleQuery: string) => {
    setQuery(exampleQuery);
    handleSearch(exampleQuery);
  };

  const clearSearch = () => {
    setQuery('');
    setShowResults(false);
    setLastExplanation(null);
    setLastFilters(null);
    inputRef.current?.focus();
  };

  return (
    <div className={cn("w-full", className)}>
      {/* Main Search Container */}
      <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-accent/5 rounded-2xl p-6 border border-primary/10">
        <div className="flex items-center gap-4">
          {/* Search Input Section */}
          <div className="flex-1 relative">
            <div className="relative flex items-center">
              <Search className="absolute left-4 h-5 w-5 text-muted-foreground z-10" />
              <Input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Zapytaj Rido o wymarzone auto..."
                className="h-14 text-lg pl-12 pr-24 rounded-full border-2 border-primary/20 focus:border-primary bg-background shadow-sm"
                disabled={isLoading}
              />
              {query && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-16 h-8 w-8 rounded-full"
                  onClick={clearSearch}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
              <Button
                onClick={() => handleSearch()}
                disabled={isLoading || !query.trim()}
                className="absolute right-2 h-10 px-4 rounded-full bg-primary hover:bg-primary/90"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Rido AI Mascot */}
          <div className="hidden md:flex items-start gap-2 shrink-0">
            {/* Speech Bubble */}
            <div className="relative bg-background rounded-xl px-4 py-2 shadow-md border animate-bounce-gentle">
              <span className="text-sm font-medium whitespace-nowrap">Zapytaj Rido! 🚗</span>
              {/* Arrow pointing to mascot */}
              <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-0 h-0 border-t-[6px] border-t-transparent border-b-[6px] border-b-transparent border-l-[8px] border-l-background" />
            </div>
            {/* Mascot Image */}
            <img
              src="/lovable-uploads/rido-mascot-transparent.png"
              alt="Rido AI"
              className="h-16 w-16 object-contain drop-shadow-lg animate-bounce-slow"
            />
          </div>
        </div>

        {/* Example Chips */}
        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <span className="text-sm text-muted-foreground">Przykłady:</span>
          {EXAMPLE_QUERIES.map((example, idx) => (
            <Badge
              key={idx}
              variant="secondary"
              className="cursor-pointer hover:bg-primary/20 transition-colors px-3 py-1"
              onClick={() => handleExampleClick(example.query)}
            >
              {example.label}
            </Badge>
          ))}
        </div>

        {/* AI Response Preview */}
        {showResults && lastExplanation && (
          <div className="mt-4 p-4 bg-background/80 rounded-xl border border-primary/10">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-primary mb-1">Rido AI znalazł:</p>
                <p className="text-sm text-muted-foreground">{lastExplanation}</p>
                {lastFilters && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {lastFilters.brands?.map((brand, i) => (
                      <Badge key={`b-${i}`} variant="outline" className="text-xs">
                        {brand}
                      </Badge>
                    ))}
                    {lastFilters.fuelTypes?.map((fuel, i) => (
                      <Badge key={`f-${i}`} variant="outline" className="text-xs">
                        {fuel}
                      </Badge>
                    ))}
                    {lastFilters.priceMax && (
                      <Badge variant="outline" className="text-xs">
                        do {lastFilters.priceMax} zł/tydzień
                      </Badge>
                    )}
                    {lastFilters.yearFrom && (
                      <Badge variant="outline" className="text-xs">
                        od {lastFilters.yearFrom} roku
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

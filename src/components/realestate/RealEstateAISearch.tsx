import { useState, useEffect } from "react";
import { Search, Sparkles, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Owner emails with full AI access
const OWNER_EMAILS = ['daniel.moshechkov@gmail.com', 'anastasiia.shapovalova1991@gmail.com'];

interface RealEstateAISearchProps {
  onSearchResults: (results: any[], filters: any, explanation: string) => void;
  onLoading?: (loading: boolean) => void;
}

export function RealEstateAISearch({ onSearchResults, onLoading }: RealEstateAISearchProps) {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [hasAIAccess, setHasAIAccess] = useState(false);

  useEffect(() => {
    const checkAccess = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setHasAIAccess(user?.email ? OWNER_EMAILS.includes(user.email) : false);
    };
    checkAccess();
  }, []);

  const handleSearch = async () => {
    if (!query.trim()) {
      toast.error("Wpisz zapytanie");
      return;
    }

    setIsSearching(true);
    onLoading?.(true);

    try {
      // Get user ID and IP for tracking
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data, error } = await supabase.functions.invoke('ai-search', {
        body: {
          query: query.trim(),
          searchType: 'real_estate',
          userId: user?.id,
          ipAddress: 'client',
        }
      });

      if (error) {
        if (error.message?.includes('429') || error.message?.includes('limit')) {
          toast.error("Przekroczono limit zapytań AI. Zaloguj się lub spróbuj później.");
        } else {
          toast.error("Błąd wyszukiwania AI");
        }
        return;
      }

      if (data?.error) {
        toast.error(data.error);
        return;
      }

      const { results = [], filters = {}, explanation = '' } = data || {};
      
      onSearchResults(results, filters, explanation);
      
      if (explanation) {
        toast.success(explanation, { duration: 5000 });
      }
    } catch (error) {
      console.error('AI Search error:', error);
      toast.error("Błąd połączenia z AI");
    } finally {
      setIsSearching(false);
      onLoading?.(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isSearching) {
      handleSearch();
    }
  };

  const exampleQueries = [
    "2 pokoje w Krakowie do 500 tys",
    "Dom z ogrodem na obrzeżach Warszawy",
    "Kawalerka na wynajem centrum do 2500 zł",
  ];

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
          <Input
            value={query}
            onChange={(e) => hasAIAccess && setQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={hasAIAccess ? "Opisz czego szukasz, np. '3 pokoje z balkonem w Gdańsku do 600 tys'" : "Wyszukiwarka AI - wkrótce dostępna"}
            className="pl-10 pr-4 disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={isSearching || !hasAIAccess}
          />
        </div>
        <Button
          onClick={handleSearch}
          disabled={isSearching || !query.trim() || !hasAIAccess}
          className="gap-2"
        >
          {isSearching ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Szukam...
            </>
          ) : (
            <>
              <Search className="h-4 w-4" />
              Szukaj AI
            </>
          )}
        </Button>
      </div>
      
      {/* Example queries - only shown for owners */}
      {hasAIAccess && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-muted-foreground">Przykłady:</span>
          {exampleQueries.map((example, idx) => (
            <button
              key={idx}
              onClick={() => setQuery(example)}
              className="text-xs text-primary hover:underline"
              disabled={isSearching}
            >
              "{example}"
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

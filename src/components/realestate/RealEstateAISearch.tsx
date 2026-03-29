import { useState, useEffect } from "react";
import { Search, Sparkles, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const OWNER_EMAILS = ['daniel.moshechkov@gmail.com', 'anastasiia.shapovalova1991@gmail.com'];

interface RealEstateAISearchProps {
  onSearchResults: (results: any[], filters: any, explanation: string) => void;
  onLoading?: (loading: boolean) => void;
}

export function RealEstateAISearch({ onSearchResults, onLoading }: RealEstateAISearchProps) {
  const [query, setQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [hasAIAccess, setHasAIAccess] = useState(false);
  const [explanation, setExplanation] = useState("");
  const navigate = useNavigate();

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
    setExplanation("");
    onLoading?.(true);

    try {
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

      const { results = [], filters = {}, explanation: expl = '' } = data || {};
      
      setExplanation(expl);
      onSearchResults(results, filters, expl);
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

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
          <Input
            value={query}
            onChange={(e) => hasAIAccess && setQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={hasAIAccess ? "Opisz czego szukasz, np. '3 pokoje z balkonem w Gdańsku do 600 tys'" : "Wyszukiwarka AI — wkrótce dostępna"}
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

      {/* Rido mascot response bubble */}
      {explanation && (
        <div className="flex items-start gap-3 mt-3">
          <img
            src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png"
            alt="RidoAI"
            className="shrink-0 w-8 h-8 rounded-full shadow-md"
          />
          <div className="relative bg-muted/60 border rounded-2xl rounded-tl-sm px-4 py-2.5 text-sm text-foreground max-w-full">
            {explanation}
            <button
              onClick={() => navigate('/nieruchomosci')}
              className="ml-2 text-primary hover:underline font-medium"
            >
              Zobacz wyniki →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

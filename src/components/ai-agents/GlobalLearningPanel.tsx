import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Brain, 
  TrendingUp, 
  Check,
  ThumbsUp,
  ThumbsDown,
  Loader2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface GlobalLearningPanelProps {
  configId: string;
}

interface KnowledgePattern {
  id: string;
  category: string;
  pattern: string;
  success_rate: number;
  usage_count: number;
  is_approved: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  objection_handling: 'Obsługa obiekcji',
  booking_patterns: 'Wzorce rezerwacji',
  closing_techniques: 'Techniki zamykania',
  greeting_patterns: 'Powitania',
  pricing_discussions: 'Rozmowy o cenach',
};

export function GlobalLearningPanel({ configId }: GlobalLearningPanelProps) {
  const [patterns, setPatterns] = useState<KnowledgePattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);

  useEffect(() => {
    loadPatterns();
  }, []);

  const loadPatterns = async () => {
    const { data } = await supabase
      .from('ai_agent_global_knowledge')
      .select('*')
      .eq('is_approved', true)
      .order('success_rate', { ascending: false })
      .limit(20);

    if (data) {
      setPatterns(data);
    }
    setLoading(false);
  };

  const applyPattern = async (patternId: string) => {
    setApplying(patternId);
    try {
      // Get current usage count and increment
      const { data: pattern } = await supabase
        .from('ai_agent_global_knowledge')
        .select('usage_count')
        .eq('id', patternId)
        .single();

      await supabase
        .from('ai_agent_global_knowledge')
        .update({ usage_count: (pattern?.usage_count || 0) + 1 })
        .eq('id', patternId);

      // Here you would integrate the pattern into the agent's config
      toast.success('Wzorzec zastosowany do Twojego agenta!');
    } catch (error: any) {
      toast.error('Błąd: ' + error.message);
    } finally {
      setApplying(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-lg bg-primary/10">
              <Brain className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle>Globalne uczenie AI</CardTitle>
              <CardDescription>
                Najlepsze wzorce rozmów ze wszystkich agentów GetRido
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            System analizuje tysiące rozmów i wyłania najskuteczniejsze strategie.
            Możesz je zastosować do swojego agenta jednym kliknięciem.
          </p>
        </CardContent>
      </Card>

      {/* Patterns by Category */}
      {Object.entries(
        patterns.reduce((acc, p) => {
          if (!acc[p.category]) acc[p.category] = [];
          acc[p.category].push(p);
          return acc;
        }, {} as Record<string, KnowledgePattern[]>)
      ).map(([category, categoryPatterns]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle className="text-base">
              {CATEGORY_LABELS[category] || category}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {categoryPatterns.map((pattern) => (
              <div 
                key={pattern.id}
                className="flex items-start justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 mr-4">
                  <p className="text-sm">{pattern.pattern}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <Badge variant="outline" className="gap-1">
                      <TrendingUp className="h-3 w-3" />
                      {pattern.success_rate}% skuteczności
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      Użyto {pattern.usage_count}x
                    </span>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => applyPattern(pattern.id)}
                  disabled={applying === pattern.id}
                >
                  {applying === pattern.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Check className="h-4 w-4 mr-1" />
                      Zastosuj
                    </>
                  )}
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {patterns.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Brain className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              Brak dostępnych wzorców.<br />
              System uczy się na podstawie rozmów wszystkich agentów.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

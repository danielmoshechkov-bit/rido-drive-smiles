import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAISalesKnowledge } from '@/hooks/useAISalesAgents';
import { Brain, Lightbulb, Target, XCircle, Clock, Rocket } from 'lucide-react';

const TYPE_CONFIG: Record<string, { icon: any; label: string; color: string }> = {
  successful_objection_handling: { icon: Target, label: 'Odpowiedź na obiekcję', color: 'text-green-600' },
  effective_opener: { icon: Rocket, label: 'Skuteczny opener', color: 'text-blue-600' },
  closing_phrase: { icon: Target, label: 'Fraza zamykająca', color: 'text-purple-600' },
  failed_approach: { icon: XCircle, label: 'Nie działa', color: 'text-red-600' },
  customer_insight: { icon: Lightbulb, label: 'Obserwacja', color: 'text-yellow-600' },
  timing_insight: { icon: Clock, label: 'Timing', color: 'text-orange-600' },
};

export function AISalesKnowledgeBase() {
  const { data: knowledge = [], isLoading } = useAISalesKnowledge();

  const topPhrase = knowledge.length > 0 ? knowledge[0] : null;
  const avgRate = knowledge.length > 0
    ? (knowledge.reduce((s: number, k: any) => s + (k.success_rate || 0), 0) / knowledge.length).toFixed(0)
    : '0';

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Łącznie insightów</div><div className="text-2xl font-bold">{knowledge.length}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Najskuteczniejsza fraza</div><p className="text-sm font-medium line-clamp-2 mt-1">{topPhrase?.content || '—'}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Śr. success rate</div><div className="text-2xl font-bold">{avgRate}%</div></CardContent></Card>
      </div>

      {/* Info box */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Brain className="h-5 w-5 text-primary mt-0.5" />
          <div className="text-sm">
            <p className="font-medium">Samouczący się agent</p>
            <p className="text-muted-foreground">Im więcej rozmów przeprowadzi Twój agent, tym skuteczniejszy będzie. Po 50 rozmowach agent zaczyna znacząco przewyższać średnią rynkową. Po 500 rozmowach staje się ekspertem sprzedażowym w swojej branży.</p>
          </div>
        </div>
      </div>

      {/* Knowledge table */}
      <Card>
        <CardHeader>
          <CardTitle>Baza wiedzy</CardTitle>
          <CardDescription>Wszystko czego nauczył się agent</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
          ) : knowledge.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Brain className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>Brak wiedzy</p>
              <p className="text-sm">Agent zacznie się uczyć po pierwszych rozmowach</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Typ</TableHead>
                  <TableHead>Treść</TableHead>
                  <TableHead>Kontekst</TableHead>
                  <TableHead className="text-right">Success %</TableHead>
                  <TableHead className="text-right">Użyto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {knowledge.map((k: any) => {
                  const cfg = TYPE_CONFIG[k.knowledge_type] || TYPE_CONFIG.customer_insight;
                  const Icon = cfg.icon;
                  return (
                    <TableRow key={k.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Icon className={`h-4 w-4 ${cfg.color}`} />
                          <span className="text-sm">{cfg.label}</span>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[300px]"><p className="text-sm line-clamp-2">{k.content}</p></TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px]"><p className="line-clamp-1">{k.context || '—'}</p></TableCell>
                      <TableCell className="text-right">
                        <span className={`font-bold ${(k.success_rate || 0) >= 70 ? 'text-green-600' : (k.success_rate || 0) >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {k.success_rate || 0}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right">{k.usage_count || 0}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, BarChart3, Brain, Zap, FlaskConical, TrendingUp, AlertTriangle, CheckCircle, FileText } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

export function MarketingAIReportsTab() {
  const [reports, setReports] = useState<any[]>([]);
  const [abTests, setAbTests] = useState<any[]>([]);
  const [weeklyReports, setWeeklyReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNewTest, setShowNewTest] = useState(false);
  const [testForm, setTestForm] = useState({ name: '', hypothesis: '' });

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [{ data: reps }, { data: tests }, { data: weekly }] = await Promise.all([
      (supabase as any).from('daily_sales_reports').select('*').order('report_date', { ascending: false }).limit(30),
      (supabase as any).from('ab_tests').select('*').order('created_at', { ascending: false }),
      (supabase as any).from('weekly_learning_reports').select('*').order('week_start', { ascending: false }).limit(12),
    ]);
    setReports(reps || []);
    setAbTests(tests || []);
    setWeeklyReports(weekly || []);
    setLoading(false);
  };

  const latestReport = reports[0];
  const consensus = latestReport?.consensus;
  const chartData = [...reports].reverse().map(r => ({
    date: r.report_date?.slice(5) || '',
    confidence: (r.consensus?.confidence_score || 0) * 100,
    agreement: (r.consensus?.models_agreement || 0) * 100,
  }));

  const endTest = async (testId: string) => {
    await (supabase as any).from('ab_tests').update({ status: 'completed' }).eq('id', testId);
    toast('Test zakończony');
    loadData();
  };

  const createTest = async () => {
    if (!testForm.name) return;
    await (supabase as any).from('ab_tests').insert({
      name: testForm.name, hypothesis: testForm.hypothesis,
      variant_a: {}, variant_b: {}, ends_at: new Date(Date.now() + 7 * 86400000).toISOString()
    });
    setShowNewTest(false);
    setTestForm({ name: '', hypothesis: '' });
    loadData();
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold flex items-center gap-2"><Brain className="h-6 w-6 text-primary" /> Raporty AI & Intelligence</h2>

      {/* SEKCJA 1 — Wykres trendu */}
      {chartData.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Dzienny puls AI — ostatnie 30 dni</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="confidence" stroke="#7A4EDA" name="Pewność AI %" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="agreement" stroke="#22c55e" name="Zgodność modeli %" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* SEKCJA 2 — Raport na dziś */}
      {consensus ? (
        <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-transparent">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Zap className="h-6 w-6 text-primary shrink-0 mt-1" />
              <div className="flex-1">
                <p className="text-xs text-muted-foreground mb-1">Konsensus AI — {latestReport?.report_date}</p>
                <p className="font-semibold text-lg">"{consensus.consensus_insight || 'Brak danych'}"</p>
                <div className="flex gap-4 mt-3">
                  <div className="text-xs"><span className="text-muted-foreground">Zgodność modeli:</span> <strong>{Math.round((consensus.models_agreement || 0) * 100)}%</strong></div>
                  <div className="text-xs"><span className="text-muted-foreground">Pewność:</span> <strong>{Math.round((consensus.confidence_score || 0) * 100)}%</strong></div>
                </div>
              </div>
            </div>
            {/* 3 columns */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
              <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-3">
                <p className="text-xs font-semibold text-green-700 mb-1">✅ Działało</p>
                <p className="text-xs text-muted-foreground">{consensus.final_recommendation || '—'}</p>
              </div>
              <div className="bg-red-50 dark:bg-red-950/30 rounded-lg p-3">
                <p className="text-xs font-semibold text-red-700 mb-1">❌ Nie działało</p>
                <p className="text-xs text-muted-foreground">{consensus.disagreements || '—'}</p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3">
                <p className="text-xs font-semibold text-blue-700 mb-1">🔬 Proponowany A/B test</p>
                <p className="text-xs text-muted-foreground">{consensus.ab_test_suggestion || '—'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Brain className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="text-sm">Brak danych raportów AI. System zacznie generować raporty automatycznie.</p>
          </CardContent>
        </Card>
      )}

      {/* SEKCJA 3 — Głosy modeli */}
      {latestReport && (
        <Accordion type="single" collapsible>
          {latestReport.claude_analysis && (
            <AccordionItem value="claude">
              <AccordionTrigger className="text-sm">🟣 Claude: {latestReport.claude_analysis?.key_insight || 'brak'}</AccordionTrigger>
              <AccordionContent className="text-xs text-muted-foreground">
                <pre className="whitespace-pre-wrap">{JSON.stringify(latestReport.claude_analysis, null, 2)}</pre>
              </AccordionContent>
            </AccordionItem>
          )}
          {latestReport.gpt_analysis && (
            <AccordionItem value="gpt">
              <AccordionTrigger className="text-sm">🟢 GPT-4: {latestReport.gpt_analysis?.key_insight || 'brak'}</AccordionTrigger>
              <AccordionContent className="text-xs text-muted-foreground">
                <pre className="whitespace-pre-wrap">{JSON.stringify(latestReport.gpt_analysis, null, 2)}</pre>
              </AccordionContent>
            </AccordionItem>
          )}
          {latestReport.gemini_analysis && (
            <AccordionItem value="gemini">
              <AccordionTrigger className="text-sm">🔵 Gemini: {latestReport.gemini_analysis?.key_insight || 'brak'}</AccordionTrigger>
              <AccordionContent className="text-xs text-muted-foreground">
                <pre className="whitespace-pre-wrap">{JSON.stringify(latestReport.gemini_analysis, null, 2)}</pre>
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      )}

      {/* SEKCJA 4 — Ewolucja AI / Branże */}
      {weeklyReports.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Ewolucja AI — nauka tygodniowa</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {weeklyReports.slice(0, 4).map(w => (
                <div key={w.id} className="flex items-center justify-between p-2 bg-muted rounded text-xs">
                  <span>Tydzień od {w.week_start}</span>
                  <span className="text-muted-foreground">{w.consensus?.weekly_trend || '—'}</span>
                  {w.actions_applied?.length > 0 && <Badge variant="outline" className="text-xs">Akcje: {w.actions_applied.length}</Badge>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* SEKCJA 5 — A/B Testy */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2"><FlaskConical className="h-4 w-4" /> A/B Testy</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setShowNewTest(true)} className="gap-1 text-xs">+ Nowy test</Button>
          </div>
        </CardHeader>
        <CardContent>
          {abTests.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Brak testów A/B. System zasugeruje pierwszy test automatycznie.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nazwa</TableHead><TableHead>Hipoteza</TableHead><TableHead>Status</TableHead><TableHead>Zwycięzca</TableHead><TableHead>Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {abTests.map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium text-sm">{t.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{t.hypothesis}</TableCell>
                    <TableCell>
                      <Badge variant={t.status === 'running' ? 'default' : t.status === 'completed' ? 'secondary' : 'outline'}>
                        {t.status === 'running' ? 'Aktywny' : t.status === 'completed' ? 'Zakończony' : t.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{t.winner || '—'}</TableCell>
                    <TableCell>
                      {t.status === 'running' && <Button size="sm" variant="outline" className="text-xs h-7" onClick={() => endTest(t.id)}>Zakończ</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* SEKCJA 6 — Eksport */}
      <Card>
        <CardContent className="py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-medium">Raport miesięczny</p>
              <p className="text-xs text-muted-foreground">Generuj pełne podsumowanie za ostatnie 30 dni</p>
            </div>
          </div>
          <Button size="sm" onClick={() => window.print()}>Generuj PDF</Button>
        </CardContent>
      </Card>

      {/* New Test Modal */}
      <Dialog open={showNewTest} onOpenChange={setShowNewTest}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nowy test A/B</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nazwa testu</Label><Input value={testForm.name} onChange={e => setTestForm(f => ({ ...f, name: e.target.value }))} placeholder="np. Poranny SMS vs wieczorny" /></div>
            <div><Label>Hipoteza</Label><Textarea value={testForm.hypothesis} onChange={e => setTestForm(f => ({ ...f, hypothesis: e.target.value }))} placeholder="Sądzimy że..." rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewTest(false)}>Anuluj</Button>
            <Button onClick={createTest}>Utwórz test</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


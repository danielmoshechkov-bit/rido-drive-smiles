import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Brain,
  TrendingUp,
  Calculator,
  PieChart,
  AlertCircle,
  CheckCircle,
  Loader2,
  RefreshCw,
  ChevronRight,
  Lightbulb,
  Calendar,
  Building2
} from 'lucide-react';

interface TaxCategory {
  id: string;
  code: string;
  name: string;
  description: string | null;
  kpir_column: number | null;
  ryczalt_rate: number | null;
  vat_deductible_percent: number | null;
}

interface TaxSummary {
  total_revenue: number;
  total_costs: number;
  net_income: number;
  vat_due: number;
  vat_deductible: number;
  costs_by_category: { [key: string]: number };
}

interface TaxSimulation {
  type: string;
  name: string;
  tax_amount: number;
  effective_rate: number;
  zus_amount: number;
  total_burden: number;
  recommended: boolean;
}

interface TaxAdvisorPanelProps {
  entityId: string;
}

export function TaxAdvisorPanel({ entityId }: TaxAdvisorPanelProps) {
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [categories, setCategories] = useState<TaxCategory[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const [summary, setSummary] = useState<TaxSummary | null>(null);
  const [simulations, setSimulations] = useState<TaxSimulation[]>([]);
  const [aiAdvice, setAiAdvice] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<string[]>([]);

  useEffect(() => {
    fetchCategories();
    fetchSummary();
  }, [entityId, selectedPeriod]);

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('tax_categories')
        .select('*')
        .eq('is_active', true)
        .order('code');

      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Error fetching tax categories:', error);
    }
  };

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const [year, month] = selectedPeriod.split('-').map(Number);
      const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0];
      const endDate = new Date(year, month, 0).toISOString().split('T')[0];

      // Fetch invoice items for revenue calculation
      const { data: invoiceItems, error: itemsError } = await supabase
        .from('invoice_items')
        .select('gross_amount, vat_amount, invoice_id')
        .gte('created_at', startDate)
        .lte('created_at', endDate);

      if (itemsError) throw itemsError;

      // Fetch accounting entries (costs)
      const { data: entries, error: entError } = await supabase
        .from('accounting_entries')
        .select('amount, entry_type, tax_category_id')
        .eq('entity_id', entityId)
        .gte('entry_date', startDate)
        .lte('entry_date', endDate);

      if (entError) throw entError;

      // Calculate summary
      const revenue = invoiceItems?.reduce((sum, item) => sum + (item.gross_amount || 0), 0) || 0;
      const vatDue = invoiceItems?.reduce((sum, item) => sum + (item.vat_amount || 0), 0) || 0;
      
      const costs = entries?.reduce((sum, e) => {
        if (e.entry_type === 'expense') return sum + e.amount;
        return sum;
      }, 0) || 0;

      // Group costs by category
      const costsByCategory: { [key: string]: number } = {};
      entries?.forEach(e => {
        if (e.entry_type === 'expense' && e.tax_category_id) {
          const cat = categories.find(c => c.id === e.tax_category_id);
          if (cat) {
            costsByCategory[cat.name] = (costsByCategory[cat.name] || 0) + e.amount;
          }
        }
      });

      const newSummary: TaxSummary = {
        total_revenue: revenue,
        total_costs: costs,
        net_income: revenue - costs,
        vat_due: vatDue,
        vat_deductible: costs * 0.23 * 0.5, // Simplified VAT deduction
        costs_by_category: costsByCategory,
      };

      setSummary(newSummary);
      calculateTaxSimulations(newSummary);
      generateAlerts(newSummary);
    } catch (error) {
      console.error('Error fetching summary:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateTaxSimulations = (data: TaxSummary) => {
    const income = data.net_income;
    const monthlyIncome = income;

    // ZUS dla przedsiębiorców (uproszczone)
    const zusBase = 4694.40; // Minimalna podstawa 2024
    const zusSmall = 402.65; // Mały ZUS
    const zusNormal = 1600.32; // Pełny ZUS (składki społeczne + zdrowotna)

    // 1. Skala podatkowa (12% do 120k, 32% powyżej)
    let taxSkala = 0;
    const yearlyIncome = monthlyIncome * 12;
    if (yearlyIncome <= 30000) {
      taxSkala = 0; // Kwota wolna
    } else if (yearlyIncome <= 120000) {
      taxSkala = (yearlyIncome - 30000) * 0.12;
    } else {
      taxSkala = (120000 - 30000) * 0.12 + (yearlyIncome - 120000) * 0.32;
    }
    taxSkala = taxSkala / 12; // Miesięcznie

    // 2. Podatek liniowy 19%
    const taxLiniowy = Math.max(0, income * 0.19);

    // 3. Ryczałt (dla usług transportowych 5.5%)
    const taxRyczalt = data.total_revenue * 0.055;

    const sims: TaxSimulation[] = [
      {
        type: 'skala',
        name: 'Skala podatkowa (12%/32%)',
        tax_amount: taxSkala,
        effective_rate: income > 0 ? (taxSkala / income) * 100 : 0,
        zus_amount: zusNormal,
        total_burden: taxSkala + zusNormal,
        recommended: taxSkala + zusNormal <= taxLiniowy + zusNormal && taxSkala + zusNormal <= taxRyczalt + zusSmall,
      },
      {
        type: 'liniowy',
        name: 'Podatek liniowy (19%)',
        tax_amount: taxLiniowy,
        effective_rate: 19,
        zus_amount: zusNormal,
        total_burden: taxLiniowy + zusNormal,
        recommended: taxLiniowy + zusNormal < taxSkala + zusNormal && taxLiniowy + zusNormal <= taxRyczalt + zusSmall,
      },
      {
        type: 'ryczalt',
        name: 'Ryczałt (5.5% transport)',
        tax_amount: taxRyczalt,
        effective_rate: data.total_revenue > 0 ? (taxRyczalt / data.total_revenue) * 100 : 0,
        zus_amount: zusSmall,
        total_burden: taxRyczalt + zusSmall,
        recommended: taxRyczalt + zusSmall < taxSkala + zusNormal && taxRyczalt + zusSmall < taxLiniowy + zusNormal,
      },
    ];

    // Find best option
    const minBurden = Math.min(...sims.map(s => s.total_burden));
    sims.forEach(s => {
      s.recommended = s.total_burden === minBurden;
    });

    setSimulations(sims);
  };

  const generateAlerts = (data: TaxSummary) => {
    const newAlerts: string[] = [];

    // VAT limit check
    if (data.total_revenue > 200000 / 12) {
      newAlerts.push('Przychody przekraczają limit zwolnienia z VAT (200 000 PLN/rok)');
    }

    // Ryczałt limit check
    if (data.total_revenue * 12 > 2000000) {
      newAlerts.push('Przychody mogą przekroczyć limit ryczałtu (2 mln EUR)');
    }

    // High costs warning
    if (data.total_costs > data.total_revenue * 0.8) {
      newAlerts.push('Wysokie koszty (>80% przychodów) - sprawdź możliwość optymalizacji');
    }

    // Quarterly VAT deadline
    const now = new Date();
    const month = now.getMonth() + 1;
    if (month % 3 === 0 && now.getDate() > 20) {
      newAlerts.push('Zbliża się termin rozliczenia kwartalnego VAT (25 dzień miesiąca)');
    }

    setAlerts(newAlerts);
  };

  const handleAIAnalysis = async () => {
    setAnalyzing(true);
    try {
      const prompt = `Przeanalizuj dane finansowe przedsiębiorcy za ${selectedPeriod}:
      - Przychód: ${summary?.total_revenue?.toFixed(2)} PLN
      - Koszty: ${summary?.total_costs?.toFixed(2)} PLN
      - Dochód: ${summary?.net_income?.toFixed(2)} PLN
      - VAT należny: ${summary?.vat_due?.toFixed(2)} PLN
      
      Koszty wg kategorii: ${JSON.stringify(summary?.costs_by_category)}
      
      Podaj krótkie (max 3 zdania) rekomendacje optymalizacji podatkowej dla kierowcy Uber/Bolt prowadzącego JDG.`;

      const { data, error } = await supabase.functions.invoke('ai-service', {
        body: {
          type: 'chat',
          payload: {
            messages: [{ role: 'user', content: prompt }]
          }
        }
      });

      if (error) throw error;

      setAiAdvice(data.content || 'Brak odpowiedzi AI');
    } catch (error) {
      console.error('Error getting AI advice:', error);
      toast({ title: 'Błąd', description: 'Nie udało się uzyskać analizy AI', variant: 'destructive' });
    } finally {
      setAnalyzing(false);
    }
  };

  // Generate month options
  const monthOptions = [];
  for (let i = 0; i < 12; i++) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const label = date.toLocaleDateString('pl-PL', { year: 'numeric', month: 'long' });
    monthOptions.push({ value, label });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Brain className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">AI Doradca Podatkowy</h2>
            <p className="text-sm text-muted-foreground">Analiza i optymalizacja podatkowa</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger className="w-[180px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={fetchSummary}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-800">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div className="space-y-1">
                {alerts.map((alert, idx) => (
                  <p key={idx} className="text-sm text-yellow-800 dark:text-yellow-200">
                    {alert}
                  </p>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Przychód</p>
                <p className="text-2xl font-bold text-green-600">
                  {summary?.total_revenue?.toFixed(2)} PLN
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500/20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Koszty</p>
                <p className="text-2xl font-bold text-red-600">
                  {summary?.total_costs?.toFixed(2)} PLN
                </p>
              </div>
              <Calculator className="h-8 w-8 text-red-500/20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Dochód</p>
                <p className="text-2xl font-bold">
                  {summary?.net_income?.toFixed(2)} PLN
                </p>
              </div>
              <PieChart className="h-8 w-8 text-primary/20" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">VAT do zapłaty</p>
                <p className="text-2xl font-bold text-orange-600">
                  {((summary?.vat_due || 0) - (summary?.vat_deductible || 0)).toFixed(2)} PLN
                </p>
              </div>
              <Building2 className="h-8 w-8 text-orange-500/20" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tax Simulations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
            Symulacja form opodatkowania
          </CardTitle>
          <CardDescription>
            Porównanie obciążeń podatkowych dla różnych form opodatkowania
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {simulations.map((sim) => (
              <div
                key={sim.type}
                className={`p-4 border rounded-lg ${sim.recommended ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : ''}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{sim.name}</span>
                    {sim.recommended && (
                      <Badge variant="default" className="bg-green-500">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Rekomendowane
                      </Badge>
                    )}
                  </div>
                  <span className="text-lg font-bold">{sim.total_burden.toFixed(2)} PLN</span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm text-muted-foreground">
                  <div>
                    <span>Podatek: </span>
                    <span className="font-medium text-foreground">{sim.tax_amount.toFixed(2)} PLN</span>
                  </div>
                  <div>
                    <span>Efektywna stawka: </span>
                    <span className="font-medium text-foreground">{sim.effective_rate.toFixed(1)}%</span>
                  </div>
                  <div>
                    <span>ZUS: </span>
                    <span className="font-medium text-foreground">{sim.zus_amount.toFixed(2)} PLN</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* AI Advice */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5" />
            Rekomendacje AI
          </CardTitle>
        </CardHeader>
        <CardContent>
          {aiAdvice ? (
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm">{aiAdvice}</p>
            </div>
          ) : (
            <div className="text-center py-6">
              <Brain className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">
                Kliknij przycisk, aby uzyskać spersonalizowane porady podatkowe
              </p>
              <Button onClick={handleAIAnalysis} disabled={analyzing}>
                {analyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Analizuję...
                  </>
                ) : (
                  <>
                    <Brain className="h-4 w-4 mr-2" />
                    Analizuj z AI
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cost Categories */}
      <Card>
        <CardHeader>
          <CardTitle>Koszty wg kategorii podatkowych</CardTitle>
          <CardDescription>
            Podział kosztów zgodny z KPiR
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Object.entries(summary?.costs_by_category || {}).map(([category, amount]) => {
              const cat = categories.find(c => c.name === category);
              const percentage = summary?.total_costs ? (amount / summary.total_costs) * 100 : 0;

              return (
                <div key={category} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span>{category}</span>
                      {cat?.kpir_column && (
                        <Badge variant="outline" className="text-xs">
                          Kolumna {cat.kpir_column}
                        </Badge>
                      )}
                      {cat?.vat_deductible_percent !== 100 && (
                        <Badge variant="secondary" className="text-xs">
                          VAT {cat?.vat_deductible_percent}%
                        </Badge>
                      )}
                    </div>
                    <span className="font-medium">{amount.toFixed(2)} PLN</span>
                  </div>
                  <Progress value={percentage} className="h-2" />
                </div>
              );
            })}

            {Object.keys(summary?.costs_by_category || {}).length === 0 && (
              <p className="text-center text-muted-foreground py-4">
                Brak skategoryzowanych kosztów
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

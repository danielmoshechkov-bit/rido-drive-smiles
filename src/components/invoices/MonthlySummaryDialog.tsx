import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Minus,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
} from 'recharts';

export interface MonthlySummaryData {
  period: string;
  month: number;
  year: number;
  total_income: number;
  total_costs: number;
  profit: number;
  invoices_count: number;
  costs_count: number;
  paid_count: number;
  unpaid_count: number;
  // New fields for comparison
  previous_month?: {
    total_income: number;
    total_costs: number;
    profit: number;
    invoices_count: number;
    costs_count: number;
  };
  // Daily breakdown for chart
  daily_breakdown?: Array<{
    day: number;
    income: number;
    costs: number;
  }>;
  // Weekly breakdown
  weekly_breakdown?: Array<{
    week: string;
    income: number;
    costs: number;
  }>;
}

interface MonthlySummaryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: MonthlySummaryData | null;
  onMonthChange?: (month: number, year: number) => void;
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function PercentageBadge({ current, previous }: { current: number; previous: number }) {
  if (!previous || previous === 0) {
    return <Badge variant="secondary" className="text-xs">brak danych</Badge>;
  }
  
  const change = ((current - previous) / previous) * 100;
  const isPositive = change > 0;
  const isNeutral = Math.abs(change) < 0.5;
  
  if (isNeutral) {
    return (
      <Badge variant="secondary" className="text-xs flex items-center gap-1">
        <Minus className="h-3 w-3" />
        0%
      </Badge>
    );
  }
  
  return (
    <Badge 
      variant={isPositive ? 'default' : 'destructive'} 
      className={`text-xs flex items-center gap-1 ${isPositive ? 'bg-green-500 hover:bg-green-600' : ''}`}
    >
      {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      {isPositive ? '+' : ''}{change.toFixed(1)}%
    </Badge>
  );
}

function ComparisonRow({ 
  label, 
  current, 
  previous, 
  isCurrency = true,
  reverseColors = false 
}: { 
  label: string; 
  current: number; 
  previous?: number; 
  isCurrency?: boolean;
  reverseColors?: boolean;
}) {
  const diff = previous !== undefined ? current - previous : 0;
  const isPositive = diff > 0;
  
  // For costs, positive diff is bad (higher costs), so reverse the color
  const colorClass = reverseColors 
    ? (isPositive ? 'text-destructive' : 'text-green-600')
    : (isPositive ? 'text-green-600' : 'text-destructive');
  
  return (
    <div className="flex justify-between items-center py-2 border-b last:border-0">
      <span className="text-muted-foreground text-sm">{label}</span>
      <div className="flex items-center gap-3">
        <span className="font-semibold">
          {isCurrency ? `${formatCurrency(current)} PLN` : current}
        </span>
        {previous !== undefined && (
          <div className="flex items-center gap-1 text-xs">
            <span className={colorClass}>
              {diff >= 0 ? '+' : ''}{isCurrency ? formatCurrency(diff) : diff}
            </span>
            <PercentageBadge current={current} previous={previous} />
          </div>
        )}
      </div>
    </div>
  );
}

export function MonthlySummaryDialog({
  open,
  onOpenChange,
  data,
  onMonthChange,
}: MonthlySummaryDialogProps) {
  const [viewMode, setViewMode] = useState<'overview' | 'chart'>('overview');

  // Generate chart data
  const chartData = useMemo(() => {
    if (!data) return [];
    
    if (data.weekly_breakdown && data.weekly_breakdown.length > 0) {
      return data.weekly_breakdown.map(w => ({
        name: w.week,
        Przychody: w.income,
        Koszty: w.costs,
      }));
    }
    
    if (data.daily_breakdown && data.daily_breakdown.length > 0) {
      return data.daily_breakdown.map(d => ({
        name: `${d.day}`,
        Przychody: d.income,
        Koszty: d.costs,
      }));
    }
    
    // Fallback: show current vs previous month
    if (data.previous_month) {
      return [
        {
          name: 'Poprzedni miesiąc',
          Przychody: data.previous_month.total_income,
          Koszty: data.previous_month.total_costs,
        },
        {
          name: 'Bieżący miesiąc',
          Przychody: data.total_income,
          Koszty: data.total_costs,
        },
      ];
    }
    
    // Single month data
    return [
      {
        name: data.period,
        Przychody: data.total_income,
        Koszty: data.total_costs,
      },
    ];
  }, [data]);

  // Comparison summary chart
  const comparisonChartData = useMemo(() => {
    if (!data?.previous_month) return null;
    
    return [
      {
        name: 'Przychody',
        'Poprzedni miesiąc': data.previous_month.total_income,
        'Bieżący miesiąc': data.total_income,
      },
      {
        name: 'Koszty',
        'Poprzedni miesiąc': data.previous_month.total_costs,
        'Bieżący miesiąc': data.total_costs,
      },
      {
        name: 'Zysk',
        'Poprzedni miesiąc': data.previous_month.profit,
        'Bieżący miesiąc': data.profit,
      },
    ];
  }, [data]);

  const handlePreviousMonth = () => {
    if (!data || !onMonthChange) return;
    const newMonth = data.month === 1 ? 12 : data.month - 1;
    const newYear = data.month === 1 ? data.year - 1 : data.year;
    onMonthChange(newMonth, newYear);
  };

  const handleNextMonth = () => {
    if (!data || !onMonthChange) return;
    const newMonth = data.month === 12 ? 1 : data.month + 1;
    const newYear = data.month === 12 ? data.year + 1 : data.year;
    onMonthChange(newMonth, newYear);
  };

  if (!data) return null;

  const profitMargin = data.total_income > 0 
    ? ((data.profit / data.total_income) * 100).toFixed(1) 
    : '0';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              <span>Podsumowanie finansowe</span>
            </div>
            {onMonthChange && (
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={handlePreviousMonth}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium min-w-[120px] text-center">
                  {data.period}
                </span>
                <Button variant="ghost" size="icon" onClick={handleNextMonth}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as typeof viewMode)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Przegląd
            </TabsTrigger>
            <TabsTrigger value="chart" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              Wykresy
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4 mt-4">
            {/* Main metrics */}
            <div className="grid grid-cols-3 gap-3">
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Przychody</p>
                  <p className="text-lg font-bold text-primary">
                    {formatCurrency(data.total_income)} PLN
                  </p>
                  {data.previous_month && (
                    <PercentageBadge 
                      current={data.total_income} 
                      previous={data.previous_month.total_income} 
                    />
                  )}
                </CardContent>
              </Card>
              
              <Card className="bg-destructive/5 border-destructive/20">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Koszty</p>
                  <p className="text-lg font-bold text-destructive">
                    {formatCurrency(data.total_costs)} PLN
                  </p>
                  {data.previous_month && (
                    <PercentageBadge 
                      current={data.total_costs} 
                      previous={data.previous_month.total_costs} 
                    />
                  )}
                </CardContent>
              </Card>
              
              <Card className={`border-2 ${data.profit >= 0 ? 'bg-primary/5 border-primary/30' : 'bg-destructive/5 border-destructive/30'}`}>
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Zysk netto</p>
                  <p className={`text-lg font-bold ${data.profit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                    {data.profit >= 0 ? '+' : ''}{formatCurrency(data.profit)} PLN
                  </p>
                  {data.previous_month && (
                    <PercentageBadge 
                      current={data.profit} 
                      previous={data.previous_month.profit} 
                    />
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Comparison with previous month */}
            {data.previous_month && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    Porównanie z poprzednim miesiącem
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-1">
                  <ComparisonRow 
                    label="Przychody" 
                    current={data.total_income} 
                    previous={data.previous_month.total_income} 
                  />
                  <ComparisonRow 
                    label="Koszty" 
                    current={data.total_costs} 
                    previous={data.previous_month.total_costs}
                    reverseColors={true}
                  />
                  <ComparisonRow 
                    label="Zysk" 
                    current={data.profit} 
                    previous={data.previous_month.profit} 
                  />
                  <ComparisonRow 
                    label="Faktury wystawione" 
                    current={data.invoices_count} 
                    previous={data.previous_month.invoices_count}
                    isCurrency={false}
                  />
                </CardContent>
              </Card>
            )}

            {/* Invoice stats */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Statystyki faktur</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-sm">Sprzedaż</span>
                    <Badge variant="outline">{data.invoices_count} faktur</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-sm">Koszty</span>
                    <Badge variant="outline">{data.costs_count} faktur</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-sm">Opłacone</span>
                    <Badge className="bg-green-500">{data.paid_count}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground text-sm">Nieopłacone</span>
                    <Badge variant="destructive">{data.unpaid_count}</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Profit margin */}
            <Card className="bg-muted/50">
              <CardContent className="p-4 flex justify-between items-center">
                <span className="text-muted-foreground">Marża zysku</span>
                <span className="font-bold text-lg">{profitMargin}%</span>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="chart" className="space-y-4 mt-4">
            {/* Main comparison bar chart */}
            {comparisonChartData && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Porównanie miesięcy</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={comparisonChartData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                      <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="name" width={80} />
                      <Tooltip 
                        formatter={(value: number) => [`${formatCurrency(value)} PLN`]}
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--background))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                      />
                      <Legend />
                      <Bar dataKey="Poprzedni miesiąc" fill="hsl(var(--muted-foreground))" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="Bieżący miesiąc" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Income vs Costs chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Przychody vs Koszty</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" />
                    <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip 
                      formatter={(value: number) => [`${formatCurrency(value)} PLN`]}
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--background))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Legend />
                    <Bar dataKey="Przychody" fill="hsl(142.1 76.2% 36.3%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Koszty" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Profit trend indicator */}
            <Card className={data.profit >= 0 ? 'bg-primary/5 border-primary/20' : 'bg-destructive/5 border-destructive/20'}>
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {data.profit >= 0 ? (
                    <TrendingUp className="h-5 w-5 text-primary" />
                  ) : (
                    <TrendingDown className="h-5 w-5 text-destructive" />
                  )}
                  <span className="font-medium">
                    {data.profit >= 0 ? 'Miesiąc zakończony z zyskiem' : 'Miesiąc zakończony ze stratą'}
                  </span>
                </div>
                <span className={`font-bold text-xl ${data.profit >= 0 ? 'text-primary' : 'text-destructive'}`}>
                  {data.profit >= 0 ? '+' : ''}{formatCurrency(data.profit)} PLN
                </span>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Zamknij
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

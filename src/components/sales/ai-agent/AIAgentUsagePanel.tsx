import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { BarChart3, Clock, Phone, Calendar, AlertTriangle } from "lucide-react";
import { AIAgentConfig } from "@/hooks/useAIAgentConfig";
import { useCurrentMonthUsage, useAIAgentUsage } from "@/hooks/useAIAgentUsage";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { pl } from "date-fns/locale";

interface AIAgentUsagePanelProps {
  config: AIAgentConfig;
}

export function AIAgentUsagePanel({ config }: AIAgentUsagePanelProps) {
  const { data: currentUsage } = useCurrentMonthUsage(config.id);
  const { data: usageHistory } = useAIAgentUsage(config.id);

  const minutesUsed = currentUsage?.minutes_used || 0;
  const minutesLimit = config.max_minutes_per_month;
  const minutesPercentage = (minutesUsed / minutesLimit) * 100;

  const callsToday = 0; // This would come from a daily query
  const callsLimit = config.max_calls_per_day;
  const callsPercentage = (callsToday / callsLimit) * 100;

  const chartData = usageHistory?.map(u => ({
    month: format(new Date(u.month), "MMM", { locale: pl }),
    minutes: u.minutes_used,
    calls: u.calls_count,
    bookings: u.bookings_count,
  })).reverse() || [];

  return (
    <div className="space-y-6">
      {/* Current Month Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Minuty (miesiąc)</span>
              </div>
              {minutesPercentage >= 80 && (
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              )}
            </div>
            <p className="text-2xl font-bold">
              {Math.round(minutesUsed)} / {minutesLimit}
            </p>
            <Progress value={minutesPercentage} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {Math.round(minutesPercentage)}% wykorzystane
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Połączenia (dziś)</span>
            </div>
            <p className="text-2xl font-bold">
              {callsToday} / {callsLimit}
            </p>
            <Progress value={callsPercentage} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {Math.round(callsPercentage)}% limitu dziennego
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Umówione (miesiąc)</span>
            </div>
            <p className="text-2xl font-bold">
              {currentUsage?.bookings_count || 0}
            </p>
            <p className="text-xs text-muted-foreground mt-3">
              Spotkania zarezerwowane przez AI
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Tokeny AI</span>
            </div>
            <p className="text-2xl font-bold">
              {currentUsage?.tokens_used?.toLocaleString() || 0}
            </p>
            <p className="text-xs text-muted-foreground mt-3">
              Zużyte w tym miesiącu
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Warning Banner */}
      {minutesPercentage >= 80 && (
        <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  Zbliżasz się do limitu minut
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  Wykorzystałeś {Math.round(minutesPercentage)}% miesięcznego limitu. 
                  Rozważ zwiększenie limitu lub AI Agent zostanie automatycznie wstrzymany.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Usage Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Historia zużycia</CardTitle>
          <CardDescription>
            Zużycie minut i połączeń w ostatnich miesiącach
          </CardDescription>
        </CardHeader>
        <CardContent>
          {chartData.length > 0 ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis 
                    dataKey="month" 
                    className="text-xs"
                  />
                  <YAxis className="text-xs" />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px"
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="minutes"
                    name="Minuty"
                    stroke="hsl(var(--primary))"
                    fill="hsl(var(--primary))"
                    fillOpacity={0.2}
                  />
                  <Area
                    type="monotone"
                    dataKey="bookings"
                    name="Rezerwacje"
                    stroke="hsl(142 76% 36%)"
                    fill="hsl(142 76% 36%)"
                    fillOpacity={0.2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[300px] flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Brak danych do wyświetlenia</p>
                <p className="text-sm mt-1">
                  Statystyki pojawią się po pierwszych połączeniach AI
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Limits Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Ustawione limity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-muted/50 rounded-xl">
              <p className="text-sm text-muted-foreground">Max połączeń / dzień</p>
              <p className="text-xl font-bold">{config.max_calls_per_day}</p>
            </div>
            <div className="p-4 bg-muted/50 rounded-xl">
              <p className="text-sm text-muted-foreground">Max minut / miesiąc</p>
              <p className="text-xl font-bold">{config.max_minutes_per_month}</p>
            </div>
            <div className="p-4 bg-muted/50 rounded-xl">
              <p className="text-sm text-muted-foreground">Max prób / lead</p>
              <p className="text-xl font-bold">{config.max_retries_per_lead}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            Możesz zmienić limity w zakładce "Konfiguracja"
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

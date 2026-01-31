import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Phone, 
  PhoneOff, 
  PhoneIncoming, 
  Clock, 
  Calendar as CalendarIcon,
  ChevronDown,
  Search,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  Minus
} from "lucide-react";
import { useAIAgentCalls, useAIAgentCallStats, AIAgentCall } from "@/hooks/useAIAgentCalls";
import { format } from "date-fns";
import { pl } from "date-fns/locale";

interface AIAgentCallsLogProps {
  configId: string;
}

export function AIAgentCallsLog({ configId }: AIAgentCallsLogProps) {
  const { data: calls, isLoading } = useAIAgentCalls(configId);
  const { data: stats } = useAIAgentCallStats(configId);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedCall, setExpandedCall] = useState<string | null>(null);

  const filteredCalls = calls?.filter(call => {
    if (statusFilter !== "all" && call.call_status !== statusFilter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        call.lead?.company_name?.toLowerCase().includes(query) ||
        call.lead?.phone?.includes(query)
      );
    }
    return true;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "completed":
        return <Badge className="bg-green-500">Zakończone</Badge>;
      case "in_progress":
        return <Badge className="bg-blue-500">W trakcie</Badge>;
      case "pending":
        return <Badge variant="secondary">Oczekuje</Badge>;
      case "failed":
        return <Badge variant="destructive">Nieudane</Badge>;
      case "no_answer":
        return <Badge variant="outline">Brak odpowiedzi</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getOutcomeBadge = (outcome: string | null) => {
    switch (outcome) {
      case "booked":
        return <Badge className="bg-green-500">Umówione</Badge>;
      case "callback":
        return <Badge className="bg-amber-500">Oddzwoń</Badge>;
      case "not_interested":
        return <Badge variant="secondary">Niezainteresowany</Badge>;
      case "escalate_human":
        return <Badge className="bg-purple-500">Do handlowca</Badge>;
      default:
        return null;
    }
  };

  const getSentimentIcon = (sentiment: string | null) => {
    switch (sentiment) {
      case "positive":
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case "negative":
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      default:
        return <Minus className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "-";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Połączenia</span>
              </div>
              <p className="text-2xl font-bold mt-1">{stats.total_calls}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Umówione</span>
              </div>
              <p className="text-2xl font-bold mt-1">{stats.booked_meetings}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Minuty</span>
              </div>
              <p className="text-2xl font-bold mt-1">{Math.round(stats.total_minutes)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Konwersja</span>
              </div>
              <p className="text-2xl font-bold mt-1">{stats.conversion_rate.toFixed(1)}%</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Dziennik rozmów AI
          </CardTitle>
          <CardDescription>
            Historia wszystkich połączeń wykonanych przez AI Agenta
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Szukaj firmy lub numeru..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Wszystkie</SelectItem>
                <SelectItem value="completed">Zakończone</SelectItem>
                <SelectItem value="pending">Oczekujące</SelectItem>
                <SelectItem value="failed">Nieudane</SelectItem>
                <SelectItem value="no_answer">Brak odpowiedzi</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Calls List */}
          {(!filteredCalls || filteredCalls.length === 0) ? (
            <div className="text-center py-12 text-muted-foreground">
              <PhoneOff className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Brak połączeń do wyświetlenia</p>
              <p className="text-sm mt-1">
                Połączenia pojawią się po aktywacji AI Agenta
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCalls.map((call) => (
                <Collapsible
                  key={call.id}
                  open={expandedCall === call.id}
                  onOpenChange={(open) => setExpandedCall(open ? call.id : null)}
                >
                  <CollapsibleTrigger asChild>
                    <div className="w-full p-4 rounded-xl border hover:bg-muted/50 cursor-pointer transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <PhoneIncoming className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">
                              {call.lead?.company_name || "Nieznana firma"}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {call.lead?.phone || "-"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right hidden sm:block">
                            <p className="text-sm font-medium">
                              {formatDuration(call.duration_seconds)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {call.created_at ? format(new Date(call.created_at), "d MMM, HH:mm", { locale: pl }) : "-"}
                            </p>
                          </div>
                          <div className="flex flex-col gap-1 items-end">
                            {getStatusBadge(call.call_status)}
                            {getOutcomeBadge(call.outcome)}
                          </div>
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-4 pb-4 space-y-4">
                      {/* Call Details */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
                        <div>
                          <p className="text-xs text-muted-foreground">Czas trwania</p>
                          <p className="font-medium">{formatDuration(call.duration_seconds)}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Tokeny AI</p>
                          <p className="font-medium">{call.tokens_used || 0}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Koszt (min)</p>
                          <p className="font-medium">{call.cost_minutes || 0}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            Sentyment {getSentimentIcon(call.sentiment)}
                          </p>
                          <p className="font-medium capitalize">{call.sentiment || "-"}</p>
                        </div>
                      </div>

                      {/* AI Summary */}
                      {call.ai_summary && (
                        <div className="bg-muted/50 rounded-lg p-3">
                          <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" />
                            Podsumowanie AI
                          </p>
                          <p className="text-sm">{call.ai_summary}</p>
                        </div>
                      )}

                      {/* Transcript */}
                      {call.transcript && (
                        <div className="bg-muted/50 rounded-lg p-3">
                          <p className="text-xs text-muted-foreground mb-1">Transkrypcja</p>
                          <p className="text-sm whitespace-pre-wrap">{call.transcript}</p>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

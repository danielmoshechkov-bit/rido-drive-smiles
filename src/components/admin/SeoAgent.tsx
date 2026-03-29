import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, FileText, Search, CheckCircle, Calendar, Play, X, Check } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { pl } from "date-fns/locale";

interface AuditResult {
  id: string;
  listing_id: string | null;
  audit_type: string;
  issue: string | null;
  suggestion: string | null;
  score: number | null;
  status: string;
  approved_at: string | null;
  created_at: string;
}

function MetricCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    purple: "bg-purple-50 text-purple-700 border-purple-200",
    green: "bg-green-50 text-green-700 border-green-200",
    gray: "bg-muted text-muted-foreground border-border",
  };

  return (
    <Card className={`border ${colorMap[color] || colorMap.gray}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-medium truncate">{label}</p>
            <p className="text-xl font-bold">{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function SeoAgent() {
  const [results, setResults] = useState<AuditResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);
  const [tab, setTab] = useState("pending");

  const fetchResults = useCallback(async () => {
    const { data } = await supabase
      .from("seo_audit_results")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    setResults((data as AuditResult[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  const pendingCount = results.filter((r) => r.status === "pending").length;
  const approvedToday = results.filter(
    (r) => r.status === "approved" && r.approved_at && new Date(r.approved_at).toDateString() === new Date().toDateString()
  ).length;
  const pendingDescriptions = results.filter((r) => r.status === "pending" && r.audit_type === "description").length;
  const pendingAudits = results.filter((r) => r.status === "pending" && r.audit_type === "title").length;
  const lastRun = results.length > 0 ? results[0].created_at : null;

  const runSeoAgent = async () => {
    setIsRunning(true);
    toast.info("Agent SEO uruchomiony...");
    try {
      const { data, error } = await supabase.functions.invoke("seo-agent");
      if (error) throw error;
      toast.success(
        `Agent zakończył: ${data?.titles_audited || 0} tytułów, ${data?.descriptions_generated || 0} opisów`
      );
      await fetchResults();
    } catch (e: any) {
      toast.error("Błąd agenta: " + (e.message || "Nieznany błąd"));
    } finally {
      setIsRunning(false);
    }
  };

  const approve = async (result: AuditResult) => {
    try {
      // Update audit status
      await supabase
        .from("seo_audit_results")
        .update({ status: "approved", approved_at: new Date().toISOString() } as any)
        .eq("id", result.id);

      // Apply to listing
      if (result.listing_id && result.suggestion) {
        if (result.audit_type === "title") {
          await supabase
            .from("agent_listings")
            .update({ title: result.suggestion })
            .eq("id", result.listing_id);
        } else if (result.audit_type === "description") {
          await supabase
            .from("agent_listings")
            .update({ ai_seo_description: result.suggestion, description: result.suggestion })
            .eq("id", result.listing_id);
        }
      }

      toast.success("Sugestia zatwierdzona i zastosowana");
      await fetchResults();
    } catch {
      toast.error("Błąd zatwierdzania");
    }
  };

  const reject = async (id: string) => {
    await supabase
      .from("seo_audit_results")
      .update({ status: "rejected" } as any)
      .eq("id", id);
    toast.info("Sugestia odrzucona");
    await fetchResults();
  };

  const filtered = results.filter((r) => r.status === tab);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">🤖 Agent SEO</h2>
        <p className="text-sm text-muted-foreground">
          Automatyczny audyt tytułów i generowanie opisów SEO dla ogłoszeń
        </p>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard icon={FileText} label="Ogłoszeń bez opisu AI" value={pendingDescriptions} color="amber" />
        <MetricCard icon={Search} label="Sugestii tytułów" value={pendingAudits} color="purple" />
        <MetricCard icon={CheckCircle} label="Zatwierdzonych dziś" value={approvedToday} color="green" />
        <MetricCard
          icon={Calendar}
          label="Ostatni run"
          value={lastRun ? format(new Date(lastRun), "dd MMM HH:mm", { locale: pl }) : "—"}
          color="gray"
        />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={runSeoAgent} disabled={isRunning} className="bg-primary hover:bg-primary/90">
          {isRunning ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Agent pracuje...
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" />
              Uruchom agenta teraz
            </>
          )}
        </Button>
        <Badge variant="outline" className="text-xs">
          Automatyczny run: co poniedziałek 6:00
        </Badge>
      </div>

      {/* Results */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="pending">
            Oczekujące ({pendingCount})
          </TabsTrigger>
          <TabsTrigger value="approved">Zatwierdzone</TabsTrigger>
          <TabsTrigger value="rejected">Odrzucone</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4 space-y-3">
          {filtered.length === 0 && (
            <p className="text-center text-muted-foreground py-8">
              Brak wyników w tej kategorii
            </p>
          )}
          {filtered.map((result) => (
            <Card key={result.id} className="border">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="outline" className="text-xs">
                        {result.audit_type === "title"
                          ? "Tytuł"
                          : result.audit_type === "description"
                          ? "Opis"
                          : "Brakująca strona"}
                      </Badge>
                      {result.score && (
                        <Badge
                          variant={result.score >= 7 ? "default" : "secondary"}
                          className="text-xs"
                        >
                          Ocena: {result.score}/10
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(result.created_at), "dd.MM.yyyy HH:mm")}
                      </span>
                    </div>

                    {result.issue && (
                      <p className="text-sm text-muted-foreground mb-2">
                        Problem: {result.issue}
                      </p>
                    )}

                    {result.suggestion && (
                      <div className="bg-purple-50 dark:bg-purple-950/20 rounded-lg p-3 text-sm">
                        <span className="font-medium text-purple-900 dark:text-purple-300">
                          Sugestia AI:{" "}
                        </span>
                        <span className="text-purple-700 dark:text-purple-400">
                          {result.suggestion.length > 300
                            ? result.suggestion.slice(0, 300) + "..."
                            : result.suggestion}
                        </span>
                      </div>
                    )}
                  </div>

                  {result.status === "pending" && (
                    <div className="flex flex-col gap-2 shrink-0">
                      <Button
                        size="sm"
                        onClick={() => approve(result)}
                        className="bg-green-600 hover:bg-green-700 text-white"
                      >
                        <Check className="mr-1 h-3 w-3" />
                        Zatwierdź
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => reject(result.id)}
                      >
                        <X className="mr-1 h-3 w-3" />
                        Odrzuć
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

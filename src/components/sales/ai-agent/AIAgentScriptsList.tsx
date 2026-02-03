import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, FileText, Check, Archive, Eye, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface Script {
  id: string;
  title: string;
  scenario_type: string;
  language: string;
  style: string;
  status: string;
  content_json: any;
  version: number;
  created_at: string;
  updated_at: string;
}

interface AIAgentScriptsListProps {
  configId: string;
}

const SCENARIO_LABELS: Record<string, string> = {
  lead_callback: "Oddzwonienie do leada",
  booking: "Umawianie terminu",
  pricing: "Pytania o cenę",
  upsell: "Upsell usług",
  objections_price: "Obiekcja: za drogo",
  objections_time: "Obiekcja: nie teraz",
  objections_think: "Obiekcja: muszę pomyśleć",
  followup_missed: "Follow-up po nieodebranym",
  followup_summary: "Podsumowanie rozmowy",
  premium: "Podejście premium",
};

const STATUS_BADGES: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  draft_ai: { label: "Wersja robocza", variant: "secondary" },
  approved: { label: "Zatwierdzone", variant: "default" },
  archived: { label: "Zarchiwizowane", variant: "outline" },
};

export function AIAgentScriptsList({ configId }: AIAgentScriptsListProps) {
  const queryClient = useQueryClient();
  const [selectedScript, setSelectedScript] = useState<Script | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const { data: scripts, isLoading } = useQuery({
    queryKey: ["ai-call-scripts", configId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_call_scripts")
        .select("*")
        .eq("config_id", configId)
        .neq("status", "archived")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Script[];
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("ai_call_scripts")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-call-scripts", configId] });
      toast.success("Status skryptu zaktualizowany");
    },
    onError: (error) => {
      toast.error("Błąd aktualizacji: " + (error as Error).message);
    },
  });

  const handleRegenerate = async () => {
    setIsRegenerating(true);
    try {
      const { error } = await supabase.functions.invoke("ai-generate-call-scripts", {
        body: { config_id: configId, regenerate: true },
      });
      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: ["ai-call-scripts", configId] });
      toast.success("Skrypty zostały wygenerowane ponownie");
    } catch (err) {
      toast.error("Błąd generowania skryptów");
    } finally {
      setIsRegenerating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Skrypty rozmów AI
              </CardTitle>
              <CardDescription>
                Skrypty wygenerowane na podstawie profilu firmy
              </CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={handleRegenerate}
              disabled={isRegenerating}
            >
              {isRegenerating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Wygeneruj ponownie
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!scripts || scripts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p>Brak skryptów rozmów.</p>
              <p className="text-sm">Wypełnij profil firmy i kliknij "Zapisz i wygeneruj skrypty"</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tytuł</TableHead>
                  <TableHead>Scenariusz</TableHead>
                  <TableHead>Język</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Wersja</TableHead>
                  <TableHead className="text-right">Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scripts.map((script) => (
                  <TableRow key={script.id}>
                    <TableCell className="font-medium">{script.title || "Bez tytułu"}</TableCell>
                    <TableCell>
                      {SCENARIO_LABELS[script.scenario_type] || script.scenario_type}
                    </TableCell>
                    <TableCell>{script.language?.toUpperCase()}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGES[script.status]?.variant || "secondary"}>
                        {STATUS_BADGES[script.status]?.label || script.status}
                      </Badge>
                    </TableCell>
                    <TableCell>v{script.version}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setSelectedScript(script)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {script.status !== "approved" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => updateStatusMutation.mutate({ id: script.id, status: "approved" })}
                          >
                            <Check className="h-4 w-4 text-green-600" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => updateStatusMutation.mutate({ id: script.id, status: "archived" })}
                        >
                          <Archive className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Script Preview Dialog */}
      <Dialog open={!!selectedScript} onOpenChange={() => setSelectedScript(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{selectedScript?.title || "Podgląd skryptu"}</DialogTitle>
          </DialogHeader>
          {selectedScript && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Badge variant="outline">
                  {SCENARIO_LABELS[selectedScript.scenario_type] || selectedScript.scenario_type}
                </Badge>
                <Badge variant={STATUS_BADGES[selectedScript.status]?.variant || "secondary"}>
                  {STATUS_BADGES[selectedScript.status]?.label || selectedScript.status}
                </Badge>
              </div>
              
              <div className="space-y-3">
                {selectedScript.content_json?.goal && (
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground">Cel rozmowy:</h4>
                    <p>{selectedScript.content_json.goal}</p>
                  </div>
                )}
                
                {selectedScript.content_json?.opening && (
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground">Otwarcie:</h4>
                    <p className="p-3 bg-muted rounded-lg">{selectedScript.content_json.opening}</p>
                  </div>
                )}
                
                {selectedScript.content_json?.questions && (
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground">Pytania:</h4>
                    <ul className="list-disc pl-5 space-y-1">
                      {selectedScript.content_json.questions.map((q: any, i: number) => (
                        <li key={i} className="text-foreground">{q.text}</li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {selectedScript.content_json?.objections && selectedScript.content_json.objections.length > 0 && (
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground">Obiekcje i odpowiedzi:</h4>
                    {selectedScript.content_json.objections.map((obj: any, i: number) => (
                      <div key={i} className="p-3 bg-muted rounded-lg mt-2">
                        <p className="text-sm font-medium">Klient: "{obj.trigger}"</p>
                        <p className="text-sm mt-1">AI: {obj.response}</p>
                      </div>
                    ))}
                  </div>
                )}
                
                {selectedScript.content_json?.closing && (
                  <div>
                    <h4 className="font-medium text-sm text-muted-foreground">Zamknięcie:</h4>
                    <p className="p-3 bg-muted rounded-lg">{selectedScript.content_json.closing}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

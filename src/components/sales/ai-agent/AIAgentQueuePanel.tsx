import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Phone, 
  Plus, 
  Trash2, 
  Clock, 
  AlertCircle,
  Play,
  RefreshCw
} from "lucide-react";
import { useAIAgentQueue, useAddToQueue, useRemoveFromQueue, type AIAgentQueueItem } from "@/hooks/useAIAgentQueue";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { pl } from "date-fns/locale";

interface AIAgentQueuePanelProps {
  configId: string;
}

const STATUS_BADGES: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending: { label: "Oczekuje", variant: "secondary" },
  processing: { label: "W trakcie", variant: "default" },
  completed: { label: "Zakończone", variant: "outline" },
  failed: { label: "Błąd", variant: "destructive" },
  cancelled: { label: "Anulowane", variant: "outline" },
  no_answer: { label: "Brak odpowiedzi", variant: "secondary" },
  busy: { label: "Zajęty", variant: "secondary" },
  voicemail: { label: "Poczta głosowa", variant: "outline" },
};

export function AIAgentQueuePanel({ configId }: AIAgentQueuePanelProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState("");
  const [priority, setPriority] = useState("5");
  const [scheduledAt, setScheduledAt] = useState("");

  const { data: queue = [], isLoading } = useAIAgentQueue(configId);
  const addToQueue = useAddToQueue();
  const removeFromQueue = useRemoveFromQueue();

  // Pobierz leady z ai_consent = true
  const { data: availableLeads = [] } = useQuery({
    queryKey: ["leads-for-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_leads")
        .select("id, company_name, first_name, last_name, phone")
        .eq("ai_consent", true)
        .limit(100);

      if (error) throw error;
      return data || [];
    },
  });

  const handleAddToQueue = async () => {
    if (!selectedLeadId) return;

    await addToQueue.mutateAsync({
      configId,
      leadId: selectedLeadId,
      priority: parseInt(priority),
      scheduledAt: scheduledAt || undefined,
    });

    setIsAddDialogOpen(false);
    setSelectedLeadId("");
    setPriority("5");
    setScheduledAt("");
  };

  const handleRemove = async (item: AIAgentQueueItem) => {
    await removeFromQueue.mutateAsync(item.id);
  };

  const pendingCount = queue.filter(q => q.status === "pending").length;
  const processingCount = queue.filter(q => q.status === "processing").length;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">W kolejce</p>
                <p className="text-2xl font-bold">{pendingCount}</p>
              </div>
              <Clock className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">W trakcie</p>
                <p className="text-2xl font-bold">{processingCount}</p>
              </div>
              <Phone className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Zakończone dziś</p>
                <p className="text-2xl font-bold">
                  {queue.filter(q => 
                    q.status === "completed" && 
                    q.completed_at && 
                    new Date(q.completed_at).toDateString() === new Date().toDateString()
                  ).length}
                </p>
              </div>
              <Play className="h-8 w-8 text-primary" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Błędy</p>
                <p className="text-2xl font-bold text-destructive">
                  {queue.filter(q => q.status === "failed").length}
                </p>
              </div>
              <AlertCircle className="h-8 w-8 text-destructive" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Queue Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Kolejka połączeń
            </CardTitle>
            <CardDescription>
              Zarządzaj leadami w kolejce do automatycznych połączeń
            </CardDescription>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Dodaj do kolejki
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Dodaj lead do kolejki</DialogTitle>
                <DialogDescription>
                  Wybierz lead z listy i ustaw priorytet połączenia
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Lead</Label>
                  <Select value={selectedLeadId} onValueChange={setSelectedLeadId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz lead..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableLeads.map((lead: any) => (
                        <SelectItem key={lead.id} value={lead.id}>
                          {lead.company_name} - {lead.first_name} {lead.last_name} ({lead.phone})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {availableLeads.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Brak leadów ze zgodą na kontakt AI. Włącz "Zgoda AI" na karcie leada.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Priorytet (1=najwyższy, 10=najniższy)</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((p) => (
                        <SelectItem key={p} value={p.toString()}>
                          {p} {p === 1 ? "(najwyższy)" : p === 10 ? "(najniższy)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Zaplanuj na (opcjonalnie)</Label>
                  <Input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Anuluj
                </Button>
                <Button 
                  onClick={handleAddToQueue} 
                  disabled={!selectedLeadId || addToQueue.isPending}
                >
                  Dodaj
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : queue.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Phone className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Brak leadów w kolejce</p>
              <p className="text-sm">Dodaj leady aby rozpocząć automatyczne połączenia</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Firma</TableHead>
                  <TableHead>Kontakt</TableHead>
                  <TableHead>Telefon</TableHead>
                  <TableHead>Priorytet</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Zaplanowano</TableHead>
                  <TableHead>Próby</TableHead>
                  <TableHead className="w-[100px]">Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">
                      {item.lead?.company_name || "-"}
                    </TableCell>
                    <TableCell>
                      {item.lead ? `${item.lead.first_name || ''} ${item.lead.last_name || ''}`.trim() || "-" : "-"}
                    </TableCell>
                    <TableCell>{item.lead?.phone || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={item.priority <= 3 ? "destructive" : item.priority <= 6 ? "default" : "secondary"}>
                        {item.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGES[item.status]?.variant || "outline"}>
                        {STATUS_BADGES[item.status]?.label || item.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {item.scheduled_at 
                        ? format(new Date(item.scheduled_at), "dd MMM HH:mm", { locale: pl })
                        : "ASAP"
                      }
                    </TableCell>
                    <TableCell>
                      {item.retry_count}/{item.max_retries}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemove(item)}
                        disabled={item.status === "processing"}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  Inbox, 
  Search, 
  Phone, 
  MoreHorizontal, 
  Plus,
  Upload,
  RefreshCw,
  User,
  Clock,
  CheckCircle,
  XCircle,
  Calendar
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { pl } from "date-fns/locale";
import { toast } from "sonner";

interface AIAgentLeadInboxProps {
  configId: string;
}

const STATUS_BADGES: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; icon: React.ReactNode }> = {
  new: { label: "Nowy", variant: "default", icon: <Plus className="h-3 w-3" /> },
  contacted: { label: "Skontaktowany", variant: "secondary", icon: <Phone className="h-3 w-3" /> },
  qualified: { label: "Zakwalifikowany", variant: "default", icon: <CheckCircle className="h-3 w-3" /> },
  not_interested: { label: "Nie zainteresowany", variant: "outline", icon: <XCircle className="h-3 w-3" /> },
  scheduled: { label: "Umówiony", variant: "default", icon: <Calendar className="h-3 w-3" /> },
  callback: { label: "Do oddzwonienia", variant: "secondary", icon: <Clock className="h-3 w-3" /> },
};

const SOURCE_LABELS: Record<string, string> = {
  manual: "Ręczny",
  meta: "Meta/Facebook",
  google_sheets: "Google Sheets",
  telegram: "Telegram",
  website: "Strona www",
};

export function AIAgentLeadInbox({ configId }: AIAgentLeadInboxProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const queryClient = useQueryClient();

  // Fetch leads with ai_consent = true
  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["ai-agent-leads", configId, statusFilter, sourceFilter],
    queryFn: async () => {
      let query = supabase
        .from("sales_leads")
        .select("*")
        .eq("ai_consent", true)
        .order("created_at", { ascending: false })
        .limit(100);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      if (sourceFilter !== "all") {
        query = query.eq("source", sourceFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  // Add to queue mutation
  const addToQueue = useMutation({
    mutationFn: async (leadId: string) => {
      const { error } = await supabase
        .from("ai_call_queue")
        .insert({
          config_id: configId,
          lead_id: leadId,
          priority: 5,
          status: "pending",
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-call-queue"] });
      toast.success("Lead dodany do kolejki połączeń");
    },
    onError: () => {
      toast.error("Błąd dodawania do kolejki");
    },
  });

  // Filter leads by search
  const filteredLeads = leads.filter((lead: any) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      lead.company_name?.toLowerCase().includes(query) ||
      lead.first_name?.toLowerCase().includes(query) ||
      lead.last_name?.toLowerCase().includes(query) ||
      lead.phone?.includes(query) ||
      lead.email?.toLowerCase().includes(query)
    );
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Inbox className="h-5 w-5" />
              Lead Inbox (AI Call)
            </CardTitle>
            <CardDescription>
              Leady ze zgodą na kontakt AI - dodaj do kolejki połączeń
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-2">
              <Upload className="h-4 w-4" />
              Import CSV
            </Button>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              Dodaj lead
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Szukaj..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie</SelectItem>
              <SelectItem value="new">Nowe</SelectItem>
              <SelectItem value="contacted">Skontaktowane</SelectItem>
              <SelectItem value="qualified">Zakwalifikowane</SelectItem>
              <SelectItem value="scheduled">Umówione</SelectItem>
              <SelectItem value="callback">Do oddzwonienia</SelectItem>
              <SelectItem value="not_interested">Nie zainteresowani</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Źródło" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszystkie</SelectItem>
              <SelectItem value="manual">Ręczne</SelectItem>
              <SelectItem value="meta">Meta/Facebook</SelectItem>
              <SelectItem value="google_sheets">Google Sheets</SelectItem>
              <SelectItem value="telegram">Telegram</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Inbox className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="font-medium">Brak leadów ze zgodą na AI</p>
            <p className="text-sm mt-1">
              Włącz "Zgoda AI" na karcie leada lub zaimportuj nowe leady
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Firma / Kontakt</TableHead>
                <TableHead>Telefon</TableHead>
                <TableHead>Źródło</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Data</TableHead>
                <TableHead className="w-[100px]">Akcje</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeads.map((lead: any) => (
                <TableRow key={lead.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                        <User className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-medium">{lead.company_name || "—"}</p>
                        <p className="text-sm text-muted-foreground">
                          {[lead.first_name, lead.last_name].filter(Boolean).join(" ") || "—"}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono">{lead.phone || "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {SOURCE_LABELS[lead.source] || lead.source || "—"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {STATUS_BADGES[lead.status] ? (
                      <Badge variant={STATUS_BADGES[lead.status].variant} className="gap-1">
                        {STATUS_BADGES[lead.status].icon}
                        {STATUS_BADGES[lead.status].label}
                      </Badge>
                    ) : (
                      <Badge variant="outline">{lead.status || "—"}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {lead.created_at 
                      ? format(new Date(lead.created_at), "d MMM HH:mm", { locale: pl })
                      : "—"
                    }
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => addToQueue.mutate(lead.id)}
                          disabled={addToQueue.isPending}
                        >
                          <Phone className="h-4 w-4 mr-2" />
                          Zadzwoń teraz
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => addToQueue.mutate(lead.id)}
                          disabled={addToQueue.isPending}
                        >
                          <Clock className="h-4 w-4 mr-2" />
                          Dodaj do kolejki
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>
                          <User className="h-4 w-4 mr-2" />
                          Zobacz szczegóły
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

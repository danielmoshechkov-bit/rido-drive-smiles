import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAISalesAgents, useAISalesLeads, useDeleteAISalesAgent, useUpdateAISalesAgent } from '@/hooks/useAISalesAgents';
import { Bot, Plus, Users, CalendarCheck, TrendingUp, Trash2, Edit, Pause, Play } from 'lucide-react';
import { format } from 'date-fns';

interface Props {
  onCreateAgent: () => void;
  onEditAgent: (id: string) => void;
}

export function AISalesOverview({ onCreateAgent, onEditAgent }: Props) {
  const { data: agents = [], isLoading } = useAISalesAgents();
  const { data: leads = [] } = useAISalesLeads();
  const deleteAgent = useDeleteAISalesAgent();
  const updateAgent = useUpdateAISalesAgent();

  const activeAgents = agents.filter((a: any) => a.status === 'active').length;
  const todayLeads = leads.filter((l: any) => {
    const d = new Date(l.created_at);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  }).length;
  const totalMeetings = agents.reduce((s: number, a: any) => s + (a.total_meetings_booked || 0), 0);
  const avgConversion = agents.length > 0
    ? (agents.reduce((s: number, a: any) => s + (a.conversion_rate || 0), 0) / agents.length).toFixed(1)
    : '0';

  const toggleStatus = (agent: any) => {
    const newStatus = agent.status === 'active' ? 'paused' : 'active';
    updateAgent.mutate({ id: agent.id, status: newStatus });
  };

  const statusBadge = (status: string) => {
    const map: Record<string, { variant: any; label: string }> = {
      active: { variant: 'default', label: 'Aktywny' },
      paused: { variant: 'secondary', label: 'Pauza' },
      inactive: { variant: 'outline', label: 'Nieaktywny' },
      learning: { variant: 'default', label: '🧠 Uczy się' },
    };
    const cfg = map[status] || map.inactive;
    return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Aktywni agenci</div><div className="text-2xl font-bold flex items-center gap-2"><Bot className="h-5 w-5 text-primary" />{activeAgents}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Leady dziś</div><div className="text-2xl font-bold flex items-center gap-2"><Users className="h-5 w-5 text-blue-500" />{todayLeads}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Spotkania umówione</div><div className="text-2xl font-bold flex items-center gap-2"><CalendarCheck className="h-5 w-5 text-green-500" />{totalMeetings}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-sm text-muted-foreground">Śr. conversion</div><div className="text-2xl font-bold flex items-center gap-2"><TrendingUp className="h-5 w-5 text-purple-500" />{avgConversion}%</div></CardContent></Card>
      </div>

      {/* Agent list */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>AI Agenci Sprzedażowi</CardTitle>
            <CardDescription>Zarządzaj swoimi agentami</CardDescription>
          </div>
          <Button onClick={onCreateAgent} className="gap-2"><Plus className="h-4 w-4" />Nowy Agent</Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>
          ) : agents.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Bot className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p className="font-medium">Brak agentów</p>
              <p className="text-sm mb-4">Utwórz pierwszego AI agenta sprzedażowego</p>
              <Button onClick={onCreateAgent} className="gap-2"><Plus className="h-4 w-4" />Utwórz agenta</Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Leady</TableHead>
                  <TableHead className="text-right">Umówione</TableHead>
                  <TableHead className="text-right">Conversion</TableHead>
                  <TableHead>Ostatnia aktywność</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {agents.map((agent: any) => (
                  <TableRow key={agent.id}>
                    <TableCell className="font-medium">{agent.name}</TableCell>
                    <TableCell>{statusBadge(agent.status)}</TableCell>
                    <TableCell className="text-right">{agent.total_leads || 0}</TableCell>
                    <TableCell className="text-right">{agent.total_meetings_booked || 0}</TableCell>
                    <TableCell className="text-right">{agent.conversion_rate || 0}%</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {agent.last_learning_at ? format(new Date(agent.last_learning_at), 'dd.MM.yyyy HH:mm') : '—'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEditAgent(agent.id)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleStatus(agent)}>
                          {agent.status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteAgent.mutate(agent.id)}>
                          <Trash2 className="h-4 w-4" />
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
    </div>
  );
}

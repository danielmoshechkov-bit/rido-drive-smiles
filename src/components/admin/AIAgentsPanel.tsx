import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Shield, Calculator, FileText, Loader2, Play, Bot, CheckCircle, XCircle } from 'lucide-react';
import { AI_MODELS } from '@/config/aiModels';

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  shield: Shield,
  calculator: Calculator,
  'file-text': FileText,
  bot: Bot,
};

interface AgentConfig {
  id: string;
  agent_id: string;
  name: string;
  icon: string;
  description: string;
  model: string;
  system_prompt: string;
  is_active: boolean;
  last_test_at: string | null;
  last_test_result: string | null;
}

export function AIAgentsPanel() {
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ agentName: string; result: string } | null>(null);
  const [editedPrompts, setEditedPrompts] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchAgents();
  }, []);

  const fetchAgents = async () => {
    const { data, error } = await supabase
      .from('ai_agents_config' as any)
      .select('*')
      .order('created_at');

    if (error) {
      console.error('Error fetching agents:', error);
      toast.error('Błąd ładowania agentów');
    } else {
      setAgents((data as any[]) || []);
    }
    setLoading(false);
  };

  const updateAgent = async (agentId: string, updates: Partial<AgentConfig>) => {
    setSaving(agentId);
    const { error } = await supabase
      .from('ai_agents_config' as any)
      .update({ ...updates, updated_at: new Date().toISOString() } as any)
      .eq('agent_id', agentId);

    if (error) {
      toast.error('Błąd zapisu');
    } else {
      toast.success('Zapisano');
      fetchAgents();
    }
    setSaving(null);
  };

  const testAgent = async (agent: AgentConfig) => {
    setTesting(agent.agent_id);
    try {
      const { data, error } = await supabase.functions.invoke('ai-agent-test', {
        body: {
          model: agent.model,
          system_prompt: editedPrompts[agent.agent_id] || agent.system_prompt,
          agent_id: agent.agent_id,
        },
      });

      if (error) throw error;

      const result = data?.response || data?.error || 'Brak odpowiedzi';
      setTestResult({ agentName: agent.name, result });

      // Save test result
      await supabase
        .from('ai_agents_config' as any)
        .update({
          last_test_at: new Date().toISOString(),
          last_test_result: result,
        } as any)
        .eq('agent_id', agent.agent_id);

      fetchAgents();
    } catch (err: any) {
      setTestResult({ agentName: agent.name, result: `Błąd: ${err.message}` });
    }
    setTesting(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">
          <Bot className="h-6 w-6 text-primary" />
          Agenci Systemowi AI
        </h2>
        <p className="text-muted-foreground mt-1">
          Zarządzaj agentami AI wykonującymi automatyczne zadania w systemie
        </p>
      </div>

      <div className="grid gap-6">
        {agents.map((agent) => {
          const IconComponent = ICON_MAP[agent.icon] || Bot;
          const currentPrompt = editedPrompts[agent.agent_id] ?? agent.system_prompt;

          return (
            <Card key={agent.id} className={!agent.is_active ? 'opacity-60' : ''}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <IconComponent className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{agent.name}</CardTitle>
                      <CardDescription>{agent.description}</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={agent.is_active ? 'default' : 'secondary'}>
                      {agent.is_active ? 'Aktywny' : 'Nieaktywny'}
                    </Badge>
                    <Switch
                      checked={agent.is_active}
                      onCheckedChange={(checked) =>
                        updateAgent(agent.agent_id, { is_active: checked })
                      }
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Model selection */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Model AI</Label>
                    <Select
                      value={agent.model}
                      onValueChange={(value) => updateAgent(agent.agent_id, { model: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AI_MODELS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                            {m.provider !== 'lovable' && ` (${m.provider})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Ostatni test</Label>
                    <div className="text-sm text-muted-foreground p-2 bg-muted rounded-md h-10 flex items-center">
                      {agent.last_test_at ? (
                        <span className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3 text-green-500" />
                          {new Date(agent.last_test_at).toLocaleString('pl-PL')}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <XCircle className="h-3 w-3 text-muted-foreground" />
                          Nie testowano
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* System prompt */}
                <div className="space-y-2">
                  <Label>System prompt</Label>
                  <Textarea
                    value={currentPrompt}
                    onChange={(e) =>
                      setEditedPrompts((prev) => ({
                        ...prev,
                        [agent.agent_id]: e.target.value,
                      }))
                    }
                    rows={4}
                    className="font-mono text-sm"
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  {editedPrompts[agent.agent_id] !== undefined &&
                    editedPrompts[agent.agent_id] !== agent.system_prompt && (
                      <Button
                        onClick={() =>
                          updateAgent(agent.agent_id, {
                            system_prompt: editedPrompts[agent.agent_id],
                          })
                        }
                        disabled={saving === agent.agent_id}
                        size="sm"
                      >
                        {saving === agent.agent_id ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        ) : null}
                        Zapisz prompt
                      </Button>
                    )}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => testAgent(agent)}
                    disabled={testing === agent.agent_id}
                    className="gap-2"
                  >
                    {testing === agent.agent_id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    Testuj teraz
                  </Button>
                </div>

                {/* Last test result inline */}
                {agent.last_test_result && (
                  <div className="p-3 bg-muted/50 rounded-lg text-sm border">
                    <p className="text-xs text-muted-foreground mb-1">Ostatnia odpowiedź:</p>
                    <p className="text-foreground">{agent.last_test_result}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Test result modal */}
      <Dialog open={!!testResult} onOpenChange={() => setTestResult(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Odpowiedź: {testResult?.agentName}
            </DialogTitle>
          </DialogHeader>
          <div className="p-4 bg-muted rounded-lg text-sm whitespace-pre-wrap">
            {testResult?.result}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

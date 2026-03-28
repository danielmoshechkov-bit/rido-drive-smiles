import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { AdminPortalSwitcher } from '@/components/admin/AdminPortalSwitcher';
import { UserDropdown } from '@/components/UserDropdown';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Bot, Loader2, Play, CheckCircle, XCircle, Plus, Shield, Calculator,
  FileText, Home, Car, Wrench, ShoppingCart, Phone, Brain, Sparkles,
  MessageSquare, Image, Search, Globe, Mic, BarChart3, Mail,
} from 'lucide-react';

const ICON_MAP: Record<string, React.ComponentType<any>> = {
  shield: Shield, calculator: Calculator, 'file-text': FileText,
  bot: Bot, home: Home, car: Car, wrench: Wrench, cart: ShoppingCart,
  phone: Phone, brain: Brain, sparkles: Sparkles, message: MessageSquare,
  image: Image, search: Search, globe: Globe, mic: Mic, chart: BarChart3,
  mail: Mail,
};

const ICON_OPTIONS = Object.keys(ICON_MAP);

const MODELS = [
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'moonshot-v1-8k', label: 'Kimi (Moonshot)' },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
];

const MODULES = [
  { value: 'portal', label: 'Portal GetRido', icon: Globe },
  { value: 'nieruchomosci', label: 'Nieruchomości', icon: Home },
  { value: 'warsztat', label: 'Warsztat', icon: Wrench },
  { value: 'flota', label: 'Flota i Kierowcy', icon: Car },
  { value: 'marketplace', label: 'Marketplace Pojazdów', icon: ShoppingCart },
  { value: 'faktury', label: 'Faktury / Księgowość', icon: Calculator },
  { value: 'sprzedaz', label: 'Sprzedaż / CRM', icon: BarChart3 },
  { value: 'komunikacja', label: 'Komunikacja', icon: MessageSquare },
  { value: 'ogolne', label: 'Ogólne / System', icon: Bot },
];

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
  module?: string;
}

export default function AdminAIAgentsPage() {
  const navigate = useNavigate();
  const { isAdmin, loading: roleLoading } = useUserRole();
  const [agents, setAgents] = useState<AgentConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ agentName: string; result: string } | null>(null);
  const [editedPrompts, setEditedPrompts] = useState<Record<string, string>>({});
  const [activeModule, setActiveModule] = useState('all');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newAgent, setNewAgent] = useState({
    agent_id: '', name: '', description: '', icon: 'bot', model: 'gpt-4o-mini',
    system_prompt: '', module: 'ogolne',
  });

  useEffect(() => {
    if (!roleLoading && !isAdmin) navigate('/');
  }, [roleLoading, isAdmin]);

  useEffect(() => { fetchAgents(); }, []);

  const fetchAgents = async () => {
    const { data, error } = await supabase
      .from('ai_agents_config' as any)
      .select('*')
      .order('created_at');
    if (!error) setAgents((data as any[]) || []);
    setLoading(false);
  };

  const updateAgent = async (agentId: string, updates: Partial<AgentConfig>) => {
    setSaving(agentId);
    const { error } = await supabase
      .from('ai_agents_config' as any)
      .update({ ...updates, updated_at: new Date().toISOString() } as any)
      .eq('agent_id', agentId);
    if (error) toast.error('Błąd zapisu');
    else { toast.success('Zapisano'); fetchAgents(); }
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
      await supabase.from('ai_agents_config' as any).update({
        last_test_at: new Date().toISOString(), last_test_result: result,
      } as any).eq('agent_id', agent.agent_id);
      fetchAgents();
    } catch (err: any) {
      setTestResult({ agentName: agent.name, result: `Błąd: ${err.message}` });
    }
    setTesting(null);
  };

  const addAgent = async () => {
    if (!newAgent.agent_id || !newAgent.name) {
      toast.error('Podaj ID i nazwę agenta');
      return;
    }
    const { error } = await supabase.from('ai_agents_config' as any).insert({
      agent_id: newAgent.agent_id,
      name: newAgent.name,
      description: newAgent.description,
      icon: newAgent.icon,
      model: newAgent.model,
      system_prompt: newAgent.system_prompt,
      is_active: true,
    } as any);
    if (error) toast.error('Błąd dodawania: ' + error.message);
    else {
      toast.success('Agent dodany');
      setAddDialogOpen(false);
      setNewAgent({ agent_id: '', name: '', description: '', icon: 'bot', model: 'gpt-4o-mini', system_prompt: '', module: 'ogolne' });
      fetchAgents();
    }
  };

  // Group agents by module (using description keyword matching as fallback)
  const getAgentModule = (agent: AgentConfig): string => {
    const desc = (agent.description + ' ' + agent.agent_id).toLowerCase();
    if (desc.includes('nieruchom') || desc.includes('listing') || desc.includes('asari')) return 'nieruchomosci';
    if (desc.includes('warsztat') || desc.includes('workshop') || desc.includes('parts') || desc.includes('serwis')) return 'warsztat';
    if (desc.includes('faktur') || desc.includes('invoice') || desc.includes('ksef') || desc.includes('księgow') || desc.includes('accounting')) return 'faktury';
    if (desc.includes('flot') || desc.includes('driver') || desc.includes('kierowc')) return 'flota';
    if (desc.includes('marketplace') || desc.includes('pojazd') || desc.includes('vehicle')) return 'marketplace';
    if (desc.includes('sprzedaż') || desc.includes('sales') || desc.includes('crm') || desc.includes('lead')) return 'sprzedaz';
    if (desc.includes('mail') || desc.includes('sms') || desc.includes('komunikac') || desc.includes('chat')) return 'komunikacja';
    return 'ogolne';
  };

  const filteredAgents = activeModule === 'all'
    ? agents
    : agents.filter(a => getAgentModule(a) === activeModule);

  const moduleCounts = MODULES.map(m => ({
    ...m,
    count: agents.filter(a => getAgentModule(a) === m.value).length,
  }));

  if (loading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <img src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" alt="Logo" className="h-6 w-6" />
            <AdminPortalSwitcher />
          </div>
          <UserDropdown />
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Title */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Bot className="h-6 w-6 text-primary" />
              Agenci AI — Zarządzanie
            </h1>
            <p className="text-muted-foreground mt-1">
              {agents.length} agentów • {agents.filter(a => a.is_active).length} aktywnych
            </p>
          </div>
          <Button onClick={() => setAddDialogOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Dodaj agenta
          </Button>
        </div>

        {/* Module filter */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={activeModule === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveModule('all')}
          >
            Wszystkie ({agents.length})
          </Button>
          {moduleCounts.filter(m => m.count > 0).map(m => {
            const Icon = m.icon;
            return (
              <Button
                key={m.value}
                variant={activeModule === m.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActiveModule(m.value)}
                className="gap-1.5"
              >
                <Icon className="h-3.5 w-3.5" />
                {m.label} ({m.count})
              </Button>
            );
          })}
        </div>

        {/* Agents grid */}
        <div className="grid gap-4">
          {filteredAgents.map((agent) => {
            const IconComponent = ICON_MAP[agent.icon] || Bot;
            const currentPrompt = editedPrompts[agent.agent_id] ?? agent.system_prompt;
            const module = MODULES.find(m => m.value === getAgentModule(agent));

            return (
              <Card key={agent.id} className={!agent.is_active ? 'opacity-50' : ''}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <IconComponent className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          {agent.name}
                          {module && (
                            <Badge variant="outline" className="text-xs font-normal">
                              {module.label}
                            </Badge>
                          )}
                        </CardTitle>
                        <CardDescription>{agent.description}</CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={agent.is_active ? 'default' : 'secondary'}>
                        {agent.is_active ? 'Aktywny' : 'Nieaktywny'}
                      </Badge>
                      <Switch
                        checked={agent.is_active}
                        onCheckedChange={(checked) => updateAgent(agent.agent_id, { is_active: checked })}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Model AI</Label>
                      <Select
                        value={agent.model}
                        onValueChange={(value) => updateAgent(agent.agent_id, { model: value })}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {MODELS.map(m => (
                            <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>ID agenta</Label>
                      <Input value={agent.agent_id} disabled className="bg-muted font-mono text-xs" />
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
                            <XCircle className="h-3 w-3" /> Nie testowano
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>System prompt</Label>
                    <Textarea
                      value={currentPrompt}
                      onChange={(e) => setEditedPrompts(prev => ({ ...prev, [agent.agent_id]: e.target.value }))}
                      rows={3}
                      className="font-mono text-xs"
                    />
                  </div>

                  <div className="flex gap-3">
                    {editedPrompts[agent.agent_id] !== undefined &&
                      editedPrompts[agent.agent_id] !== agent.system_prompt && (
                        <Button
                          onClick={() => updateAgent(agent.agent_id, { system_prompt: editedPrompts[agent.agent_id] })}
                          disabled={saving === agent.agent_id}
                          size="sm"
                        >
                          {saving === agent.agent_id && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                          Zapisz prompt
                        </Button>
                      )}
                    <Button
                      variant="outline" size="sm"
                      onClick={() => testAgent(agent)}
                      disabled={testing === agent.agent_id}
                      className="gap-2"
                    >
                      {testing === agent.agent_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                      Testuj
                    </Button>
                  </div>

                  {agent.last_test_result && (
                    <div className="p-3 bg-muted/50 rounded-lg text-sm border">
                      <p className="text-xs text-muted-foreground mb-1">Ostatnia odpowiedź:</p>
                      <p className="text-foreground line-clamp-3">{agent.last_test_result}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}

          {filteredAgents.length === 0 && (
            <Card className="p-12 text-center">
              <Bot className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Brak agentów w tym module</p>
              <Button variant="outline" className="mt-4" onClick={() => setAddDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Dodaj agenta
              </Button>
            </Card>
          )}
        </div>
      </div>

      {/* Add agent dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Dodaj nowego agenta AI</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>ID agenta (unikalne)</Label>
                <Input
                  value={newAgent.agent_id}
                  onChange={(e) => setNewAgent(p => ({ ...p, agent_id: e.target.value }))}
                  placeholder="np. wycena_robocizny"
                  className="font-mono text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label>Nazwa</Label>
                <Input
                  value={newAgent.name}
                  onChange={(e) => setNewAgent(p => ({ ...p, name: e.target.value }))}
                  placeholder="np. Wycena Robocizny AI"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Opis</Label>
              <Input
                value={newAgent.description}
                onChange={(e) => setNewAgent(p => ({ ...p, description: e.target.value }))}
                placeholder="Co robi ten agent?"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Ikona</Label>
                <Select value={newAgent.icon} onValueChange={(v) => setNewAgent(p => ({ ...p, icon: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ICON_OPTIONS.map(i => {
                      const Ic = ICON_MAP[i];
                      return (
                        <SelectItem key={i} value={i}>
                          <span className="flex items-center gap-2"><Ic className="h-4 w-4" />{i}</span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Model AI</Label>
                <Select value={newAgent.model} onValueChange={(v) => setNewAgent(p => ({ ...p, model: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODELS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Moduł</Label>
                <Select value={newAgent.module} onValueChange={(v) => setNewAgent(p => ({ ...p, module: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODULES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>System prompt</Label>
              <Textarea
                value={newAgent.system_prompt}
                onChange={(e) => setNewAgent(p => ({ ...p, system_prompt: e.target.value }))}
                rows={4}
                placeholder="Instrukcja dla agenta AI..."
                className="font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Anuluj</Button>
            <Button onClick={addAgent}>Dodaj agenta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Test result modal */}
      <Dialog open={!!testResult} onOpenChange={() => setTestResult(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Odpowiedź: {testResult?.agentName}
            </DialogTitle>
          </DialogHeader>
          <div className="p-4 bg-muted rounded-lg text-sm whitespace-pre-wrap max-h-[400px] overflow-auto">
            {testResult?.result}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

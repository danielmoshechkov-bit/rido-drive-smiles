import { useState, useEffect } from 'react';
import { Save, Loader2, Plus, Trash2, Bot, CreditCard, Settings2, Key, AlertCircle, Send, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AISettings {
  id: string;
  ai_model: string;
  system_prompt: string;
  guest_daily_limit: number;
  user_monthly_limit: number;
  ai_enabled: boolean;
  ai_provider?: string;
  custom_api_key?: string;
}

interface CreditPackage {
  id: string;
  name: string;
  credits: number;
  price_pln: number;
  is_active: boolean;
  sort_order: number;
}

interface QueryCost {
  id: string;
  query_type: string;
  cost_credits: number;
  description: string | null;
}

const AI_PROVIDERS = [
  { value: 'lovable', label: 'Lovable AI Gateway (zalecane)', requiresKey: false },
  { value: 'openai', label: 'OpenAI (własny klucz)', requiresKey: true },
  { value: 'google', label: 'Google AI (własny klucz)', requiresKey: true },
];

const AI_MODELS = [
  { value: 'google/gemini-3-flash-preview', label: 'Gemini 3 Flash (szybki, zalecany)', provider: 'lovable' },
  { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash (stabilny)', provider: 'lovable' },
  { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro (zaawansowany)', provider: 'lovable' },
  { value: 'openai/gpt-5-mini', label: 'GPT-5 Mini (dobry balans)', provider: 'lovable' },
  { value: 'openai/gpt-5', label: 'GPT-5 (najlepszy, drogi)', provider: 'lovable' },
  { value: 'gpt-4o', label: 'GPT-4o', provider: 'openai' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini', provider: 'openai' },
  { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', provider: 'google' },
  { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', provider: 'google' },
];

export function AISettingsPanel() {
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [queryCosts, setQueryCosts] = useState<QueryCost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  
  // AI Test state
  const [testQuery, setTestQuery] = useState('');
  const [testResponse, setTestResponse] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [settingsRes, packagesRes, costsRes] = await Promise.all([
        supabase.from('ai_settings').select('*').limit(1).maybeSingle(),
        supabase.from('ai_credit_packages').select('*').order('sort_order'),
        supabase.from('ai_query_costs').select('*').order('query_type'),
      ]);

      if (settingsRes.data) {
        setSettings(settingsRes.data);
      }
      if (packagesRes.data) {
        setPackages(packagesRes.data);
      }
      if (costsRes.data) {
        setQueryCosts(costsRes.data);
      }
    } catch (error) {
      console.error('Error loading AI settings:', error);
      toast({
        title: "Błąd",
        description: "Nie udało się załadować ustawień AI",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!settings) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('ai_settings')
        .update({
          ai_model: settings.ai_model,
          system_prompt: settings.system_prompt,
          guest_daily_limit: settings.guest_daily_limit,
          user_monthly_limit: settings.user_monthly_limit,
          ai_enabled: settings.ai_enabled,
        })
        .eq('id', settings.id);

      if (error) throw error;

      toast({
        title: "Zapisano",
        description: "Ustawienia AI zostały zaktualizowane",
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: "Błąd",
        description: "Nie udało się zapisać ustawień",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const addPackage = async () => {
    try {
      const { data, error } = await supabase
        .from('ai_credit_packages')
        .insert({
          name: 'Nowy pakiet',
          credits: 50,
          price_pln: 9.99,
          sort_order: packages.length + 1,
        })
        .select()
        .single();

      if (error) throw error;
      if (data) {
        setPackages([...packages, data]);
      }
    } catch (error) {
      console.error('Error adding package:', error);
      toast({
        title: "Błąd",
        description: "Nie udało się dodać pakietu",
        variant: "destructive",
      });
    }
  };

  const updatePackage = async (pkg: CreditPackage) => {
    try {
      const { error } = await supabase
        .from('ai_credit_packages')
        .update({
          name: pkg.name,
          credits: pkg.credits,
          price_pln: pkg.price_pln,
          is_active: pkg.is_active,
        })
        .eq('id', pkg.id);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating package:', error);
    }
  };

  const deletePackage = async (id: string) => {
    try {
      const { error } = await supabase
        .from('ai_credit_packages')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setPackages(packages.filter(p => p.id !== id));
    } catch (error) {
      console.error('Error deleting package:', error);
    }
  };

  const updateQueryCost = async (cost: QueryCost) => {
    try {
      const { error } = await supabase
        .from('ai_query_costs')
        .update({
          cost_credits: cost.cost_credits,
          description: cost.description,
        })
        .eq('id', cost.id);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating query cost:', error);
    }
  };

  const testAIConnection = async () => {
    if (!testQuery.trim()) {
      toast({
        title: "Błąd",
        description: "Wpisz zapytanie testowe",
        variant: "destructive",
      });
      return;
    }
    
    setIsTesting(true);
    setTestStatus('idle');
    setTestResponse('');
    
    try {
      const { data, error } = await supabase.functions.invoke('ai-search', {
        body: { 
          query: testQuery,
          type: 'test',
        },
      });
      
      if (error) throw error;
      
      setTestResponse(data?.response || data?.message || JSON.stringify(data, null, 2));
      setTestStatus('success');
      
      toast({
        title: "Test zakończony",
        description: "Połączenie z AI działa poprawnie",
      });
    } catch (error: any) {
      console.error('AI test error:', error);
      setTestResponse(error.message || 'Błąd połączenia z AI');
      setTestStatus('error');
      
      toast({
        title: "Błąd testu",
        description: error.message || "Nie udało się połączyć z AI",
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="text-center p-8 text-muted-foreground">
        Nie znaleziono ustawień AI
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {/* Main Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <CardTitle>Ustawienia AI</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="ai-enabled" className="text-sm">AI włączone</Label>
              <Switch
                id="ai-enabled"
                checked={settings.ai_enabled}
                onCheckedChange={(checked) => setSettings({ ...settings, ai_enabled: checked })}
              />
            </div>
          </div>
          <CardDescription>
            Konfiguracja asystenta Rido AI
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* AI Provider Selection */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              Dostawca AI
            </Label>
            <Select
              value={settings.ai_provider || 'lovable'}
              onValueChange={(value) => setSettings({ ...settings, ai_provider: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_PROVIDERS.map((provider) => (
                  <SelectItem key={provider.value} value={provider.value}>
                    {provider.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Custom API Key - only show when not using Lovable */}
          {settings.ai_provider && settings.ai_provider !== 'lovable' && (
            <div className="space-y-2">
              <Label>Klucz API</Label>
              <Input
                type="password"
                value={settings.custom_api_key || ''}
                onChange={(e) => setSettings({ ...settings, custom_api_key: e.target.value })}
                placeholder={settings.ai_provider === 'openai' ? 'sk-...' : 'AIza...'}
              />
              <Alert variant="default" className="mt-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Klucz będzie zaszyfrowany i używany tylko po stronie serwera.
                  Upewnij się, że masz odpowiednie limity ustawione na koncie dostawcy.
                </AlertDescription>
              </Alert>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Model AI</Label>
              <Select
                value={settings.ai_model}
                onValueChange={(value) => setSettings({ ...settings, ai_model: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AI_MODELS
                    .filter(model => 
                      (settings.ai_provider || 'lovable') === 'lovable' 
                        ? model.provider === 'lovable'
                        : model.provider === settings.ai_provider
                    )
                    .map((model) => (
                      <SelectItem key={model.value} value={model.value}>
                        {model.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Limit dzienny dla gości</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={settings.guest_daily_limit}
                onChange={(e) => setSettings({ ...settings, guest_daily_limit: parseInt(e.target.value) || 0 })}
              />
            </div>

            <div className="space-y-2">
              <Label>Limit miesięczny dla użytkowników</Label>
              <Input
                type="number"
                min={0}
                max={1000}
                value={settings.user_monthly_limit}
                onChange={(e) => setSettings({ ...settings, user_monthly_limit: parseInt(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Instrukcje systemowe (prompt)</Label>
            <Textarea
              value={settings.system_prompt}
              onChange={(e) => setSettings({ ...settings, system_prompt: e.target.value })}
              rows={6}
              className="font-mono text-sm"
            />
          </div>

          <Button onClick={saveSettings} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Zapisz ustawienia
          </Button>
        </CardContent>
      </Card>

      {/* AI Test Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            <CardTitle>Test AI</CardTitle>
          </div>
          <CardDescription>
            Sprawdź czy połączenie z AI działa poprawnie
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Zapytanie testowe</Label>
            <div className="flex gap-2">
              <Input
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                placeholder="Np. Znajdź mieszkanie 3-pokojowe w Krakowie"
                onKeyDown={(e) => e.key === 'Enter' && testAIConnection()}
              />
              <Button 
                onClick={testAIConnection} 
                disabled={isTesting || !settings?.ai_enabled}
              >
                {isTesting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Test
                  </>
                )}
              </Button>
            </div>
          </div>
          
          {testResponse && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Odpowiedź AI</Label>
                {testStatus === 'success' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                {testStatus === 'error' && <XCircle className="h-4 w-4 text-destructive" />}
              </div>
              <ScrollArea className="h-[200px] w-full rounded-md border p-4">
                <pre className="text-sm whitespace-pre-wrap font-mono">
                  {testResponse}
                </pre>
              </ScrollArea>
            </div>
          )}
          
          {!settings?.ai_enabled && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Włącz AI powyżej, aby móc testować połączenie
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Credit Packages */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              <CardTitle>Pakiety kredytów</CardTitle>
            </div>
            <Button size="sm" variant="outline" onClick={addPackage}>
              <Plus className="h-4 w-4 mr-1" />
              Dodaj pakiet
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nazwa</TableHead>
                <TableHead>Kredyty</TableHead>
                <TableHead>Cena (PLN)</TableHead>
                <TableHead>Aktywny</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {packages.map((pkg) => (
                <TableRow key={pkg.id}>
                  <TableCell>
                    <Input
                      value={pkg.name}
                      onChange={(e) => {
                        const updated = { ...pkg, name: e.target.value };
                        setPackages(packages.map(p => p.id === pkg.id ? updated : p));
                      }}
                      onBlur={() => updatePackage(pkg)}
                      className="h-8"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      value={pkg.credits}
                      onChange={(e) => {
                        const updated = { ...pkg, credits: parseInt(e.target.value) || 0 };
                        setPackages(packages.map(p => p.id === pkg.id ? updated : p));
                      }}
                      onBlur={() => updatePackage(pkg)}
                      className="h-8 w-20"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      value={pkg.price_pln}
                      onChange={(e) => {
                        const updated = { ...pkg, price_pln: parseFloat(e.target.value) || 0 };
                        setPackages(packages.map(p => p.id === pkg.id ? updated : p));
                      }}
                      onBlur={() => updatePackage(pkg)}
                      className="h-8 w-24"
                    />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={pkg.is_active}
                      onCheckedChange={(checked) => {
                        const updated = { ...pkg, is_active: checked };
                        setPackages(packages.map(p => p.id === pkg.id ? updated : p));
                        updatePackage(updated);
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      onClick={() => deletePackage(pkg.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Query Costs */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5" />
            <CardTitle>Koszty zapytań</CardTitle>
          </div>
          <CardDescription>
            Ile kredytów kosztuje każdy typ zapytania
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Typ zapytania</TableHead>
                <TableHead>Koszt (kredyty)</TableHead>
                <TableHead>Opis</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queryCosts.map((cost) => (
                <TableRow key={cost.id}>
                  <TableCell className="font-medium">{cost.query_type}</TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min={1}
                      value={cost.cost_credits}
                      onChange={(e) => {
                        const updated = { ...cost, cost_credits: parseInt(e.target.value) || 1 };
                        setQueryCosts(queryCosts.map(c => c.id === cost.id ? updated : c));
                      }}
                      onBlur={() => updateQueryCost(cost)}
                      className="h-8 w-20"
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={cost.description || ''}
                      onChange={(e) => {
                        const updated = { ...cost, description: e.target.value };
                        setQueryCosts(queryCosts.map(c => c.id === cost.id ? updated : c));
                      }}
                      onBlur={() => updateQueryCost(cost)}
                      className="h-8"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

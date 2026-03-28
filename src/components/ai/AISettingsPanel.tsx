import { useState, useEffect } from 'react';
import { Save, Loader2, Plus, Trash2, Bot, CreditCard, Settings2, Key, AlertCircle, Send, CheckCircle2, XCircle, Zap, Image, Search, FileText, History, RefreshCw } from 'lucide-react';
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
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
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
  // New fields for dual AI engines
  openai_api_key_encrypted?: string;
  gemini_api_key_encrypted?: string;
  ai_search_enabled?: boolean;
  ai_seo_enabled?: boolean;
  ai_photo_enabled?: boolean;
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

interface AIHistoryEntry {
  id: string;
  query_type: string;
  query_summary: string | null;
  model_used: string | null;
  ai_type: string | null;
  credits_used: number;
  tokens_used: number | null;
  response_time_ms: number | null;
  was_free: boolean | null;
  created_at: string;
  user_id: string | null;
}

interface QueryCostBase {
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

import { AI_MODELS as SHARED_AI_MODELS } from '@/config/aiModels';

const AI_MODELS = [
  ...SHARED_AI_MODELS.map(m => ({
    value: m.value,
    label: m.label,
    provider: m.provider === 'lovable' ? 'lovable' as const : m.provider === 'anthropic' ? 'openai' as const : 'google' as const,
  })),
];

export function AISettingsPanel() {
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [queryCosts, setQueryCosts] = useState<QueryCost[]>([]);
  const [aiHistory, setAIHistory] = useState<AIHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const { toast } = useToast();
  
  // API Key inputs (temporary, not persisted directly)
  const [openaiKey, setOpenaiKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  
  // Test states - OpenAI
  const [testQuery, setTestQuery] = useState('');
  const [testResponse, setTestResponse] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'success' | 'error'>('idle');
  
  // Test states - Gemini Photo
  const [isTestingGemini, setIsTestingGemini] = useState(false);
  const [geminiTestStatus, setGeminiTestStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [geminiTestImageUrl, setGeminiTestImageUrl] = useState('');
  const [geminiTestPrompt, setGeminiTestPrompt] = useState('Popraw jasność i kontrast tego zdjęcia');
  const [geminiTestResult, setGeminiTestResult] = useState<{ original: string; edited: string } | null>(null);

  useEffect(() => {
    loadData();
    loadAIHistory();
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
        // Show masked keys if set
        if (settingsRes.data.openai_api_key_encrypted) {
          setOpenaiKey('••••••••••••••••');
        }
        if (settingsRes.data.gemini_api_key_encrypted) {
          setGeminiKey('••••••••••••••••');
        }
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

  const loadAIHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('ai_credit_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setAIHistory(data || []);
    } catch (error) {
      console.error('Error loading AI history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const saveSettings = async () => {
    if (!settings) return;
    
    setIsSaving(true);
    try {
      const updateData: Record<string, unknown> = {
        ai_model: settings.ai_model,
        system_prompt: settings.system_prompt,
        guest_daily_limit: settings.guest_daily_limit,
        user_monthly_limit: settings.user_monthly_limit,
        ai_enabled: settings.ai_enabled,
        ai_search_enabled: settings.ai_search_enabled,
        ai_seo_enabled: settings.ai_seo_enabled,
        ai_photo_enabled: settings.ai_photo_enabled,
      };
      
      // Only update keys if they've been changed (not masked)
      if (openaiKey && !openaiKey.includes('•')) {
        updateData.openai_api_key_encrypted = openaiKey;
      }
      if (geminiKey && !geminiKey.includes('•')) {
        updateData.gemini_api_key_encrypted = geminiKey;
      }
      
      const { error } = await supabase
        .from('ai_settings')
        .update(updateData)
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

  const testOpenAIConnection = async () => {
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
      const { data, error } = await supabase.functions.invoke('ai-service', {
        body: { 
          type: 'test',
          payload: { query: testQuery },
        },
      });
      
      if (error) throw error;
      
      setTestResponse(data?.response || data?.message || JSON.stringify(data, null, 2));
      setTestStatus('success');
      
      toast({
        title: "Test OpenAI zakończony",
        description: "Połączenie działa poprawnie",
      });
    } catch (error: unknown) {
      console.error('OpenAI test error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Błąd połączenia z AI';
      setTestResponse(errorMessage);
      setTestStatus('error');
      
      toast({
        title: "Błąd testu OpenAI",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const testGeminiConnection = async () => {
    if (!geminiTestImageUrl.trim()) {
      toast({
        title: "Błąd",
        description: "Podaj URL zdjęcia testowego",
        variant: "destructive",
      });
      return;
    }
    
    setIsTestingGemini(true);
    setGeminiTestStatus('idle');
    setGeminiTestResult(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('ai-photo-edit', {
        body: { 
          imageUrl: geminiTestImageUrl.trim(),
          instruction: geminiTestPrompt.trim() || 'Popraw jasność i kontrast',
          listingType: 'real_estate',
          listingId: 'test',
          photoIndex: 0,
        },
      });
      
      if (error) throw error;
      
      if (data?.editedUrl) {
        setGeminiTestResult({
          original: geminiTestImageUrl.trim(),
          edited: data.editedUrl
        });
        setGeminiTestStatus('success');
        toast({
          title: "Test Gemini zakończony",
          description: "Zdjęcie zostało przetworzone przez AI",
        });
      } else {
        throw new Error(data?.error || 'Brak edytowanego zdjęcia w odpowiedzi');
      }
    } catch (error: unknown) {
      console.error('Gemini test error:', error);
      setGeminiTestStatus('error');
      
      const errorMessage = error instanceof Error ? error.message : 'Błąd połączenia z Gemini';
      toast({
        title: "Błąd testu Gemini",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsTestingGemini(false);
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
      {/* AI Integrations - Main Card */}
      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              <CardTitle>Integracje AI</CardTitle>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="ai-enabled" className="text-sm">System AI</Label>
              <Switch
                id="ai-enabled"
                checked={settings.ai_enabled}
                onCheckedChange={(checked) => setSettings({ ...settings, ai_enabled: checked })}
              />
            </div>
          </div>
          <CardDescription>
            Konfiguracja dwóch silników AI: OpenAI (GPT-5.2) dla wyszukiwarki i SEO, Gemini dla edycji zdjęć
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Feature Toggles */}
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
              <div className="flex items-center gap-3">
                <Search className="h-5 w-5 text-blue-500" />
                <div>
                  <Label className="font-medium">AI Search</Label>
                  <p className="text-xs text-muted-foreground">Inteligentna wyszukiwarka</p>
                </div>
              </div>
              <Switch
                checked={settings.ai_search_enabled !== false}
                onCheckedChange={(checked) => setSettings({ ...settings, ai_search_enabled: checked })}
              />
            </div>
            
            <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-green-500" />
                <div>
                  <Label className="font-medium">AI SEO</Label>
                  <p className="text-xs text-muted-foreground">Automatyczne SEO</p>
                </div>
              </div>
              <Switch
                checked={settings.ai_seo_enabled !== false}
                onCheckedChange={(checked) => setSettings({ ...settings, ai_seo_enabled: checked })}
              />
            </div>
            
            <div className="flex items-center justify-between p-4 rounded-lg border bg-card">
              <div className="flex items-center gap-3">
                <Image className="h-5 w-5 text-purple-500" />
                <div>
                  <Label className="font-medium">AI Photo</Label>
                  <p className="text-xs text-muted-foreground">Edycja zdjęć</p>
                </div>
              </div>
              <Switch
                checked={settings.ai_photo_enabled !== false}
                onCheckedChange={(checked) => setSettings({ ...settings, ai_photo_enabled: checked })}
              />
            </div>
          </div>

          <Separator />

          {/* OpenAI Configuration */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              <h3 className="font-semibold">OpenAI (GPT-5.2)</h3>
              <Badge variant="secondary">Wyszukiwarka + SEO + Opisy</Badge>
            </div>
            
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  Klucz API OpenAI (opcjonalny)
                </Label>
                <Input
                  type="password"
                  value={openaiKey}
                  onChange={(e) => setOpenaiKey(e.target.value)}
                  placeholder="sk-... (pozostaw puste dla Lovable Gateway)"
                />
                <p className="text-xs text-muted-foreground">
                  Jeśli puste, używany jest Lovable AI Gateway (zalecane)
                </p>
              </div>
              
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
                      .filter(model => model.provider === 'lovable')
                      .map((model) => (
                        <SelectItem key={model.value} value={model.value}>
                          {model.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <Separator />

          {/* Gemini Configuration */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Image className="h-5 w-5" />
              <h3 className="font-semibold">Gemini (nano banana)</h3>
              <Badge variant="secondary">Edycja zdjęć</Badge>
            </div>
            
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  Klucz API Gemini (opcjonalny)
                </Label>
                <Input
                  type="password"
                  value={geminiKey}
                  onChange={(e) => setGeminiKey(e.target.value)}
                  placeholder="AIza... (pozostaw puste dla Lovable Gateway)"
                />
                <p className="text-xs text-muted-foreground">
                  Jeśli puste, używany jest Lovable AI Gateway (zalecane)
                </p>
              </div>
              
              <div className="flex items-end">
                <Button
                  variant="outline"
                  onClick={testGeminiConnection}
                  disabled={isTestingGemini || !settings.ai_enabled || !settings.ai_photo_enabled}
                  className="w-full"
                >
                  {isTestingGemini ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : geminiTestStatus === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500 mr-2" />
                  ) : geminiTestStatus === 'error' ? (
                    <XCircle className="h-4 w-4 text-destructive mr-2" />
                  ) : (
                    <Image className="h-4 w-4 mr-2" />
                  )}
                  Testuj Gemini
                </Button>
              </div>
            </div>
          </div>

          <Separator />

          {/* Limits */}
          <div className="grid gap-4 md:grid-cols-2">
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
              rows={4}
              className="font-mono text-sm"
            />
          </div>

          <Button onClick={saveSettings} disabled={isSaving} className="w-full md:w-auto">
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
            <CardTitle>Test OpenAI (Wyszukiwarka)</CardTitle>
          </div>
          <CardDescription>
            Sprawdź czy połączenie z OpenAI/Lovable Gateway działa poprawnie
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Zapytanie testowe</Label>
            <div className="flex gap-2">
              <Input
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                placeholder="Np. Znajdź mieszkanie 3-pokojowe w Krakowie do 500 tys"
                onKeyDown={(e) => e.key === 'Enter' && testOpenAIConnection()}
              />
              <Button 
                onClick={testOpenAIConnection} 
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
              <ScrollArea className="h-[150px] w-full rounded-md border p-4">
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

      {/* Gemini Photo Test Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Image className="h-5 w-5" />
            <CardTitle>Test Gemini (Edycja zdjęć)</CardTitle>
          </div>
          <CardDescription>
            Sprawdź czy AI do edycji zdjęć działa poprawnie - wklej URL zdjęcia i wpisz instrukcję
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>URL zdjęcia testowego</Label>
              <Input
                value={geminiTestImageUrl}
                onChange={(e) => setGeminiTestImageUrl(e.target.value)}
                placeholder="https://images.unsplash.com/photo-..."
              />
              <p className="text-xs text-muted-foreground">
                Wklej link do zdjęcia (np. z Unsplash lub istniejące zdjęcie z ogłoszenia)
              </p>
            </div>
            
            <div className="space-y-2">
              <Label>Instrukcja dla AI</Label>
              <Input
                value={geminiTestPrompt}
                onChange={(e) => setGeminiTestPrompt(e.target.value)}
                placeholder="Np. Popraw jasność, usuń szum..."
              />
            </div>
          </div>
          
          <Button 
            onClick={testGeminiConnection} 
            disabled={isTestingGemini || !settings?.ai_enabled || !settings?.ai_photo_enabled || !geminiTestImageUrl.trim()}
            className="w-full md:w-auto"
          >
            {isTestingGemini ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Przetwarzam...
              </>
            ) : (
              <>
                <Image className="h-4 w-4 mr-2" />
                Testuj edycję zdjęcia
              </>
            )}
          </Button>
          
          {geminiTestResult && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Wynik edycji</Label>
                {geminiTestStatus === 'success' && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                {geminiTestStatus === 'error' && <XCircle className="h-4 w-4 text-destructive" />}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground text-center">Oryginał</p>
                  <div className="aspect-video rounded-lg overflow-hidden border bg-muted">
                    <img 
                      src={geminiTestResult.original} 
                      alt="Original" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground text-center">Po edycji AI</p>
                  <div className="aspect-video rounded-lg overflow-hidden border bg-muted">
                    <img 
                      src={geminiTestResult.edited} 
                      alt="Edited by AI" 
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {!settings?.ai_photo_enabled && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Włącz "AI Photo" powyżej, aby móc testować edycję zdjęć
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
            Ile kredytów kosztuje każdy typ zapytania AI
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

      {/* AI History - NEW SECTION */}
      <Card className="border-green-500/30 bg-green-500/5">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="h-5 w-5 text-green-600" />
              <CardTitle>Historia zapytań AI</CardTitle>
              <Badge variant="secondary" className="bg-green-100 text-green-700">
                {aiHistory.length} wpisów
              </Badge>
            </div>
            <Button 
              size="sm" 
              variant="outline" 
              onClick={loadAIHistory}
              disabled={isLoadingHistory}
            >
              {isLoadingHistory ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              <span className="ml-2">Odśwież</span>
            </Button>
          </div>
          <CardDescription>
            Ostatnie zapytania do AI - pokazuje że system działa poprawnie
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingHistory ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : aiHistory.length === 0 ? (
            <div className="text-center p-8 text-muted-foreground">
              <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Brak historii zapytań AI</p>
              <p className="text-sm">Wykonaj test powyżej lub poczekaj aż użytkownicy zaczną korzystać z AI</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Typ</TableHead>
                    <TableHead>Zapytanie</TableHead>
                    <TableHead>Model</TableHead>
                    <TableHead className="text-right">Czas (ms)</TableHead>
                    <TableHead className="text-right">Kredyty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aiHistory.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {new Date(entry.created_at).toLocaleString('pl-PL', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant="outline" 
                          className={
                            entry.query_type === 'test' ? 'border-purple-500 text-purple-600' :
                            entry.query_type === 'search' ? 'border-blue-500 text-blue-600' :
                            entry.query_type === 'seo' ? 'border-green-500 text-green-600' :
                            entry.query_type === 'photo' ? 'border-orange-500 text-orange-600' :
                            'border-gray-500 text-gray-600'
                          }
                        >
                          {entry.query_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">
                        {entry.query_summary || '-'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {entry.model_used || 'Lovable Gateway'}
                      </TableCell>
                      <TableCell className="text-right text-xs">
                        {entry.response_time_ms ? `${entry.response_time_ms}ms` : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={entry.was_free ? 'secondary' : 'default'}>
                          {entry.credits_used} {entry.was_free && '(free)'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

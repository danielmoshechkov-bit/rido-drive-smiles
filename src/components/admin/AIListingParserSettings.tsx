import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Bot, Sparkles, FileText, Home, Layers, MapPin, CheckCircle, Loader2, Save, Play, RotateCcw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AI_MODELS, DEFAULT_AI_MODEL } from '@/config/aiModels';

const PARSER_FEATURES = [
  { key: 'extract_rooms', label: 'Wyodrębnij pokoje z opisu', desc: 'Nazwy, metraże i typy pomieszczeń', icon: Home },
  { key: 'extract_amenities', label: 'Wyodrębnij udogodnienia', desc: 'Balkon, winda, garaż, parking itp.', icon: CheckCircle },
  { key: 'extract_building_info', label: 'Wyodrębnij dane budynku', desc: 'Rok budowy, materiał, ogrzewanie', icon: Layers },
  { key: 'extract_location', label: 'Wyodrębnij lokalizację', desc: 'Dzielnica, ulica, okolica', icon: MapPin },
  { key: 'correct_area', label: 'Weryfikuj powierzchnię', desc: 'Przelicz i popraw metraż na podstawie opisu', icon: FileText },
  { key: 'generate_summary', label: 'Generuj streszczenie HTML', desc: 'Sformatowany opis z kluczowymi informacjami', icon: Sparkles },
];

interface ParserSettings {
  enabled: boolean;
  model: string;
  auto_parse_on_import: boolean;
  features: Record<string, boolean>;
}

export function AIListingParserSettings() {
  const [settings, setSettings] = useState<ParserSettings>({
    enabled: true,
    model: DEFAULT_AI_MODEL,
    auto_parse_on_import: true,
    features: {
      extract_rooms: true,
      extract_amenities: true,
      extract_building_info: true,
      extract_location: true,
      correct_area: true,
      generate_summary: true,
    },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Batch processing state
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchDone, setBatchDone] = useState(false);
  const [batchStats, setBatchStats] = useState({ unparsed: 0, total: 0 });
  const [forceReparse, setForceReparse] = useState(false);

  useEffect(() => {
    loadSettings();
    loadBatchStats();
  }, []);

  const loadSettings = async () => {
    try {
      const { data } = await supabase
        .from('portal_integrations')
        .select('*')
        .eq('key', 'ai_listing_parser')
        .maybeSingle();

      if (data?.config_json) {
        const cfg = data.config_json as any;
        setSettings({
          enabled: data.is_enabled ?? true,
          model: cfg.model || DEFAULT_AI_MODEL,
          auto_parse_on_import: cfg.auto_parse_on_import ?? true,
          features: { ...settings.features, ...(cfg.features || {}) },
        });
      }
    } catch (err) {
      console.error('Error loading parser settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadBatchStats = async () => {
    try {
      const { count: totalCount } = await supabase
        .from('real_estate_listings')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active');
      
      const { count: unparsedCount } = await supabase
        .from('real_estate_listings')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .is('ai_parsed_at', null);
      
      setBatchStats({ unparsed: unparsedCount || 0, total: totalCount || 0 });
    } catch (err) {
      console.error('Error loading batch stats:', err);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from('portal_integrations')
        .select('id')
        .eq('key', 'ai_listing_parser')
        .maybeSingle();

      const payload = {
        key: 'ai_listing_parser',
        name: 'AI Parser Ogłoszeń',
        is_enabled: settings.enabled,
        config_json: {
          model: settings.model,
          auto_parse_on_import: settings.auto_parse_on_import,
          features: settings.features,
        },
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        await supabase
          .from('portal_integrations')
          .update(payload)
          .eq('key', 'ai_listing_parser');
      } else {
        await supabase
          .from('portal_integrations')
          .insert(payload);
      }

      toast.success('Ustawienia parsera AI zapisane');
    } catch (err) {
      toast.error('Błąd zapisu ustawień');
    } finally {
      setSaving(false);
    }
  };

  const handleBatchAnalyze = async () => {
    setBatchProcessing(true);
    setBatchDone(false);
    setBatchProgress(0);

    try {
      // Get listings to process
      let query = supabase
        .from('real_estate_listings')
        .select('id')
        .eq('status', 'active')
        .not('description', 'is', null);

      if (!forceReparse) {
        query = query.is('ai_parsed_at', null);
      }

      const { data: listings } = await query.limit(500);
      const ids = listings?.map(l => l.id) || [];

      if (ids.length === 0) {
        toast.info('Wszystkie ogłoszenia mają już dane AI');
        setBatchProcessing(false);
        return;
      }

      setBatchTotal(ids.length);
      const batchSize = 5;
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);

        const { data, error } = await supabase.functions.invoke('parse-listing-ai', {
          body: { batch_ids: batch, model: settings.model }
        });

        if (error) {
          console.error('Batch error:', error);
          errorCount += batch.length;
        } else {
          successCount += data?.success_count || 0;
          errorCount += data?.error_count || 0;
        }

        setBatchProgress(Math.min(i + batchSize, ids.length));
      }

      setBatchDone(true);
      toast.success(`✅ Przeanalizowano ${successCount} ogłoszeń${errorCount > 0 ? `, ${errorCount} błędów` : ''}`);
      loadBatchStats();
    } catch (err) {
      console.error('Batch process error:', err);
      toast.error('Błąd przetwarzania AI');
    } finally {
      setBatchProcessing(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bot className="h-5 w-5 text-primary" />
              <div>
                <CardTitle className="text-base">Parser AI Ogłoszeń</CardTitle>
                <CardDescription>
                  Automatyczne wyciąganie i rozmieszczanie danych z ogłoszeń importowanych z ASARI i innych CRM
                </CardDescription>
              </div>
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(v) => setSettings(s => ({ ...s, enabled: v }))}
            />
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Model selection */}
          <div className="space-y-2">
            <Label>Model AI do parsowania</Label>
            <Select
              value={settings.model}
              onValueChange={(v) => setSettings(s => ({ ...s, model: v }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {AI_MODELS.map(m => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                    {m.provider !== 'lovable' && ` (${m.provider})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Ten sam model jest używany we wszystkich modułach portalu
            </p>
          </div>

          {/* Auto parse toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
            <div>
              <p className="text-sm font-medium">Automatyczne parsowanie przy imporcie</p>
              <p className="text-xs text-muted-foreground">
                Nowe ogłoszenia z ASARI/CRM będą automatycznie analizowane przez AI
              </p>
            </div>
            <Switch
              checked={settings.auto_parse_on_import}
              onCheckedChange={(v) => setSettings(s => ({ ...s, auto_parse_on_import: v }))}
            />
          </div>

          <Separator />

          {/* Features toggles */}
          <div>
            <h4 className="text-sm font-semibold mb-3">Funkcje parsowania</h4>
            <div className="space-y-3">
              {PARSER_FEATURES.map(feature => (
                <div key={feature.key} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <feature.icon className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{feature.label}</p>
                      <p className="text-xs text-muted-foreground">{feature.desc}</p>
                    </div>
                  </div>
                  <Switch
                    checked={settings.features[feature.key] ?? true}
                    onCheckedChange={(v) => setSettings(s => ({
                      ...s,
                      features: { ...s.features, [feature.key]: v }
                    }))}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Zapisz ustawienia
            </Button>
            <Badge variant="secondary" className="text-xs">
              Wspólne dla całego portalu
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Batch Analysis Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Analiza masowa ogłoszeń</CardTitle>
              <CardDescription>
                Przeanalizuj wszystkie ogłoszenia przez AI — wyciągnij dane, popraw metraże, dodaj pokoje
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-lg bg-muted/50 text-center">
              <p className="text-2xl font-bold">{batchStats.total}</p>
              <p className="text-xs text-muted-foreground">Ogłoszeń aktywnych</p>
            </div>
            <div className="p-4 rounded-lg bg-orange-50 dark:bg-orange-900/20 text-center">
              <p className="text-2xl font-bold text-orange-600">{batchStats.unparsed}</p>
              <p className="text-xs text-muted-foreground">Bez danych AI</p>
            </div>
          </div>

          {/* Force reparse toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div className="flex items-center gap-3">
              <RotateCcw className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Przetwórz ponownie wszystkie</p>
                <p className="text-xs text-muted-foreground">
                  Nadpisz istniejące dane AI (normalnie przetwarza tylko nowe)
                </p>
              </div>
            </div>
            <Switch checked={forceReparse} onCheckedChange={setForceReparse} />
          </div>

          {/* Progress */}
          {batchProcessing && batchTotal > 0 && (
            <div className="space-y-2">
              <Progress value={(batchProgress / batchTotal) * 100} className="h-3" />
              <p className="text-sm text-muted-foreground text-center">
                Przetworzono {batchProgress} / {batchTotal} ogłoszeń...
              </p>
            </div>
          )}

          {batchDone && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span className="text-sm font-medium text-green-700 dark:text-green-300">
                Analiza zakończona! Odśwież stronę żeby zobaczyć wyniki.
              </span>
            </div>
          )}

          {/* Action button */}
          <Button
            onClick={handleBatchAnalyze}
            disabled={batchProcessing || (!forceReparse && batchStats.unparsed === 0)}
            className="w-full gap-2"
            size="lg"
          >
            {batchProcessing ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Play className="h-5 w-5" />
            )}
            {batchProcessing
              ? 'Analizuję ogłoszenia...'
              : forceReparse
                ? `Przeanalizuj wszystkie ${batchStats.total} ogłoszeń`
                : `Przeanalizuj ${batchStats.unparsed} nowych ogłoszeń`
            }
          </Button>

          <p className="text-xs text-muted-foreground text-center">
            Używa modelu: {AI_MODELS.find(m => m.value === settings.model)?.label || settings.model}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

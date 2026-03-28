import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Bot, Sparkles, FileText, Home, Layers, MapPin, CheckCircle, Loader2, Save } from 'lucide-react';
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

  useEffect(() => {
    loadSettings();
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
    </div>
  );
}

import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Volume2, Key, Trash2, Database, Play, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TTSSettings {
  tts_provider: string;
  tts_voice_name: string;
  tts_enabled: boolean;
  stt_provider: string;
  elevenlabs_api_key_encrypted?: string;
  google_tts_api_key_encrypted?: string;
}

interface CacheStats {
  total_phrases: number;
  total_size_bytes: number;
  estimated_savings_pln: number;
}

const TTS_PROVIDERS = [
  { value: 'openai', label: 'OpenAI TTS', description: 'Wysokiej jakości głosy (alloy, echo, fable, onyx, nova, shimmer)' },
  { value: 'elevenlabs', label: 'ElevenLabs', description: 'Najlepsza jakość, klonowanie głosu (wymaga klucza)' },
  { value: 'google', label: 'Google Cloud TTS', description: 'Wiele języków, WaveNet (wymaga klucza)' },
  { value: 'browser', label: 'Przeglądarka (Web Speech)', description: 'Darmowe, działa offline, niższa jakość' },
];

const OPENAI_VOICES = [
  { value: 'alloy', label: 'Alloy', description: 'Neutralny, uniwersalny' },
  { value: 'echo', label: 'Echo', description: 'Męski, spokojny' },
  { value: 'fable', label: 'Fable', description: 'Męski, ekspresyjny' },
  { value: 'onyx', label: 'Onyx', description: 'Męski, głęboki' },
  { value: 'nova', label: 'Nova', description: 'Kobiecy, przyjazny' },
  { value: 'shimmer', label: 'Shimmer', description: 'Kobiecy, ciepły' },
];

export function TTSSettingsPanel() {
  const [settings, setSettings] = useState<TTSSettings | null>(null);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [elevenLabsKey, setElevenLabsKey] = useState('');
  const [googleKey, setGoogleKey] = useState('');
  const { toast } = useToast();

  useEffect(() => {
    loadSettings();
    loadCacheStats();
  }, []);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('ai_settings')
        .select('tts_provider, tts_voice_name, tts_enabled, stt_provider, elevenlabs_api_key_encrypted, google_tts_api_key_encrypted')
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      
      setSettings(data || {
        tts_provider: 'openai',
        tts_voice_name: 'alloy',
        tts_enabled: true,
        stt_provider: 'openai'
      });

      if (data?.elevenlabs_api_key_encrypted) {
        setElevenLabsKey('••••••••••••');
      }
      if (data?.google_tts_api_key_encrypted) {
        setGoogleKey('••••••••••••');
      }
    } catch (error) {
      console.error('Error loading TTS settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCacheStats = async () => {
    try {
      const { data, error } = await supabase
        .rpc('get_voice_cache_stats');

      if (error) throw error;
      if (data && data[0]) {
        setCacheStats(data[0]);
      }
    } catch (error) {
      console.error('Error loading cache stats:', error);
      // Fallback - count manually
      const { count } = await supabase
        .from('voice_phrase_cache')
        .select('*', { count: 'exact', head: true });
      
      setCacheStats({
        total_phrases: count || 0,
        total_size_bytes: 0,
        estimated_savings_pln: (count || 0) * 0.015
      });
    }
  };

  const saveSettings = async () => {
    if (!settings) return;
    
    setSaving(true);
    try {
      const updateData: Record<string, unknown> = {
        tts_provider: settings.tts_provider,
        tts_voice_name: settings.tts_voice_name,
        tts_enabled: settings.tts_enabled,
        stt_provider: settings.stt_provider,
      };

      if (elevenLabsKey && !elevenLabsKey.includes('•')) {
        updateData.elevenlabs_api_key_encrypted = elevenLabsKey;
      }
      if (googleKey && !googleKey.includes('•')) {
        updateData.google_tts_api_key_encrypted = googleKey;
      }

      const { error } = await supabase
        .from('ai_settings')
        .update(updateData)
        .not('id', 'is', null);

      if (error) throw error;

      toast({
        title: 'Zapisano',
        description: 'Ustawienia TTS zostały zaktualizowane'
      });
    } catch (error) {
      console.error('Error saving TTS settings:', error);
      toast({
        title: 'Błąd',
        description: 'Nie udało się zapisać ustawień',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const testVoice = async () => {
    if (!settings) return;
    
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          action: 'speak',
          payload: {
            text: 'To jest test głosu. Nawigacja GetRido działa poprawnie.',
            voice: settings.tts_voice_name
          }
        }
      });

      if (error) throw error;

      if (data?.audioUrl) {
        const audio = new Audio(data.audioUrl);
        audio.play();
        toast({
          title: data.cached ? 'Z cache' : 'Wygenerowano',
          description: 'Audio zostało odtworzone'
        });
      }
    } catch (error) {
      console.error('Error testing voice:', error);
      toast({
        title: 'Błąd',
        description: 'Nie udało się przetestować głosu',
        variant: 'destructive'
      });
    } finally {
      setTesting(false);
    }
  };

  const clearCache = async () => {
    if (!confirm('Czy na pewno chcesz wyczyścić cache głosów? Spowoduje to ponowne generowanie wszystkich fraz.')) {
      return;
    }

    setClearing(true);
    try {
      const { error } = await supabase
        .from('voice_phrase_cache')
        .delete()
        .not('id', 'is', null);

      if (error) throw error;

      setCacheStats({
        total_phrases: 0,
        total_size_bytes: 0,
        estimated_savings_pln: 0
      });

      toast({
        title: 'Wyczyszczono',
        description: 'Cache głosów został wyczyszczony'
      });
    } catch (error) {
      console.error('Error clearing cache:', error);
      toast({
        title: 'Błąd',
        description: 'Nie udało się wyczyścić cache',
        variant: 'destructive'
      });
    } finally {
      setClearing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div className="space-y-6">
      {/* Main TTS Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Volume2 className="h-5 w-5 text-primary" />
              <CardTitle>Ustawienia TTS (Text-to-Speech)</CardTitle>
            </div>
            <Switch
              checked={settings.tts_enabled}
              onCheckedChange={(checked) => setSettings({ ...settings, tts_enabled: checked })}
            />
          </div>
          <CardDescription>
            Synteza mowy dla nawigacji i asystenta głosowego
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Provider Selection */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Provider TTS</Label>
              <Select
                value={settings.tts_provider}
                onValueChange={(value) => setSettings({ ...settings, tts_provider: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TTS_PROVIDERS.map((provider) => (
                    <SelectItem key={provider.value} value={provider.value}>
                      <div className="flex flex-col">
                        <span>{provider.label}</span>
                        <span className="text-xs text-muted-foreground">{provider.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Voice Selection for OpenAI */}
            {settings.tts_provider === 'openai' && (
              <div className="space-y-2">
                <Label>Głos</Label>
                <Select
                  value={settings.tts_voice_name}
                  onValueChange={(value) => setSettings({ ...settings, tts_voice_name: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {OPENAI_VOICES.map((voice) => (
                      <SelectItem key={voice.value} value={voice.value}>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{voice.label}</span>
                          <span className="text-xs text-muted-foreground">- {voice.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* ElevenLabs API Key */}
          {settings.tts_provider === 'elevenlabs' && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Key className="h-4 w-4" />
                Klucz API ElevenLabs
              </Label>
              <Input
                type="password"
                value={elevenLabsKey}
                onChange={(e) => setElevenLabsKey(e.target.value)}
                placeholder="Wklej klucz API z elevenlabs.io..."
              />
            </div>
          )}

          {/* Google TTS API Key */}
          {settings.tts_provider === 'google' && (
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Key className="h-4 w-4" />
                Klucz API Google Cloud TTS
              </Label>
              <Input
                type="password"
                value={googleKey}
                onChange={(e) => setGoogleKey(e.target.value)}
                placeholder="Wklej klucz API z Google Cloud..."
              />
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button onClick={saveSettings} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Zapisz ustawienia
            </Button>
            <Button variant="outline" onClick={testVoice} disabled={testing || !settings.tts_enabled}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              Testuj głos
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Cache Statistics */}
      <Card className="border-blue-500/30 bg-blue-500/5">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-blue-600" />
            <CardTitle>Cache głosów</CardTitle>
          </div>
          <CardDescription>
            Zapisane frazy głosowe (nawigacja, komendy) - oszczędność na wielokrotnym generowaniu
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3 mb-4">
            <div className="p-4 rounded-lg bg-background border">
              <div className="text-2xl font-bold text-primary">{cacheStats?.total_phrases || 0}</div>
              <div className="text-sm text-muted-foreground">Zapisanych fraz</div>
            </div>
            <div className="p-4 rounded-lg bg-background border">
              <div className="text-2xl font-bold text-green-600">
                ~{(cacheStats?.estimated_savings_pln || 0).toFixed(2)} PLN
              </div>
              <div className="text-sm text-muted-foreground">Szacowana oszczędność</div>
            </div>
            <div className="p-4 rounded-lg bg-background border">
              <div className="text-2xl font-bold text-blue-600">
                {((cacheStats?.total_size_bytes || 0) / 1024 / 1024).toFixed(2)} MB
              </div>
              <div className="text-sm text-muted-foreground">Rozmiar cache</div>
            </div>
          </div>

          <Button 
            variant="outline" 
            onClick={clearCache} 
            disabled={clearing || !cacheStats?.total_phrases}
            className="text-destructive"
          >
            {clearing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
            Wyczyść cache
          </Button>

          <p className="text-xs text-muted-foreground mt-4">
            <strong>Jak działa cache:</strong> Frazy nawigacyjne ("Skręć w lewo", "Za 200 metrów") są generowane raz 
            i zapisywane. Przy kolejnych użyciach pobierane z cache bez kosztów. Średnia oszczędność: ~0.015 PLN/fraza.
          </p>
        </CardContent>
      </Card>

      {/* STT Settings */}
      <Card>
        <CardHeader>
          <CardTitle>STT (Speech-to-Text)</CardTitle>
          <CardDescription>
            Rozpoznawanie mowy dla asystenta głosowego
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>Provider STT</Label>
            <Select
              value={settings.stt_provider}
              onValueChange={(value) => setSettings({ ...settings, stt_provider: value })}
            >
              <SelectTrigger className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">
                  <div className="flex items-center gap-2">
                    OpenAI Whisper
                    <Badge variant="secondary">Zalecane</Badge>
                  </div>
                </SelectItem>
                <SelectItem value="browser">Web Speech API (przeglądarka)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              OpenAI Whisper oferuje najlepszą jakość dla języka polskiego
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

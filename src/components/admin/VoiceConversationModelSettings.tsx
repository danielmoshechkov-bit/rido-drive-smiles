import { useEffect, useMemo, useState } from "react";
import { Brain, Loader2, Save, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  useSaveVoiceAiRouting,
  useVoiceAiRouting,
  type VoiceRoutingForm,
  type VoiceRoutingResponse,
} from "@/hooks/useVoiceAiRouting";

interface VoiceConversationModelSettingsProps {
  compact?: boolean;
  previewData?: VoiceRoutingResponse;
}

export function VoiceConversationModelSettings({ compact = false, previewData }: VoiceConversationModelSettingsProps) {
  const isLocalPreview = import.meta.env.DEV && !!previewData;
  const remote = useVoiceAiRouting(!isLocalPreview);
  const saveRouting = useSaveVoiceAiRouting(!isLocalPreview);
  const [inlinePreviewData, setInlinePreviewData] = useState<VoiceRoutingResponse | null>(null);
  const isInlinePreview = import.meta.env.DEV && !previewData && !!remote.error && !!inlinePreviewData;
  const isPreviewMode = isLocalPreview || isInlinePreview;
  const data = isLocalPreview ? previewData : (isInlinePreview ? inlinePreviewData : remote.data);
  const isLoading = !isLocalPreview && remote.isLoading;
  const error = !isLocalPreview ? remote.error : null;
  const [form, setForm] = useState<VoiceRoutingForm | null>(null);

  useEffect(() => {
    if (!import.meta.env.DEV || previewData || !remote.error) return;
    let mounted = true;
    import("./voiceAiRoutingPreviewData").then(({ voiceAiRoutingPreviewData }) => {
      if (mounted) setInlinePreviewData(voiceAiRoutingPreviewData);
    });
    return () => { mounted = false; };
  }, [previewData, remote.error]);

  useEffect(() => {
    if (data?.routing) setForm(data.routing);
  }, [data?.routing]);

  const providerByKey = useMemo(
    () => new Map((data?.providers || []).map((provider) => [provider.provider_key, provider])),
    [data?.providers],
  );
  const selectedPrimary = providerByKey.get(form?.provider_key || "");
  const selectedBackup = providerByKey.get(form?.backup_provider_key || "");

  if (isLoading) return <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if ((error && !isInlinePreview) || !data || !form) {
    return <div className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">Nie udało się pobrać globalnego routingu rozmowy.</div>;
  }

  const selectProvider = (providerKey: string, fallback: boolean) => {
    const provider = providerByKey.get(providerKey);
    if (!provider) return;
    setForm((current) => current ? {
      ...current,
      ...(fallback
        ? { backup_provider_key: providerKey, backup_model_override: provider.default_model }
        : { provider_key: providerKey, model_override: provider.default_model }),
    } : current);
  };

  const content = (
    <div className="space-y-4">
      {isInlinePreview && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          Backend routingu jest niedostępny. Poniżej widoczny jest automatyczny podgląd lokalny; zapis pozostaje wyłączony.
        </div>
      )}

      {!data.providers.length && (
        <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <ShieldAlert className="h-4 w-4 mt-0.5" />
          Aktywuj kompatybilnego dostawcę w „Dostawcy & API” i skonfiguruj jego klucz po stronie serwera.
        </div>
      )}

      {isPreviewMode && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-sky-300 bg-sky-50 p-3 text-sm text-sky-900">
          <div>
            <p className="font-medium">Podgląd lokalny — zapis wyłączony</p>
            <p className="text-xs text-sky-800">Dane są syntetyczne. Ten ekran nie odczytuje ani nie zapisuje danych w Supabase.</p>
          </div>
          <Badge variant="outline" className="border-sky-400">DEV only</Badge>
        </div>
      )}

      <div className="flex items-center justify-between rounded-lg border p-3">
        <div>
          <Label>Globalny model rozmowy</Label>
          <p className="text-xs text-muted-foreground">Dotyczy bieżących odpowiedzi i narzędzi; nie zmienia głosu ElevenLabs.</p>
        </div>
        <Switch checked={form.is_enabled} onCheckedChange={(is_enabled) => setForm({ ...form, is_enabled })} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Główny dostawca</Label>
          <Select value={form.provider_key || ""} onValueChange={(value) => selectProvider(value, false)}>
            <SelectTrigger><SelectValue placeholder="Wybierz aktywnego dostawcę" /></SelectTrigger>
            <SelectContent>
              {data.providers.map((provider) => (
                <SelectItem key={provider.provider_key} value={provider.provider_key} disabled={!provider.key_configured}>
                  {provider.display_name} — {provider.key_configured ? "klucz skonfigurowany" : "brak klucza"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedPrimary && (
            <p className="text-xs text-muted-foreground">
              {selectedPrimary.adapter_key} · {selectedPrimary.key_configured ? "klucz skonfigurowany" : "brak klucza — wybór zablokowany"}
            </p>
          )}
          <Select
            value={form.model_override || selectedPrimary?.default_model || ""}
            disabled={!selectedPrimary?.key_configured}
            onValueChange={(model_override) => setForm({ ...form, model_override })}
          >
            <SelectTrigger><SelectValue placeholder="Model" /></SelectTrigger>
            <SelectContent>
              {data.providers.filter((provider) => provider.provider_key === form.provider_key).map((provider) => (
                <SelectItem key={provider.default_model} value={provider.default_model}>{provider.default_model}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Model zapasowy</Label>
            <div className="flex items-center gap-2 text-xs"><span>Auto-fallback</span><Switch checked={form.allow_fallback} onCheckedChange={(allow_fallback) => setForm({ ...form, allow_fallback })} /></div>
          </div>
          <Select disabled={!form.allow_fallback} value={form.backup_provider_key || ""} onValueChange={(value) => selectProvider(value, true)}>
            <SelectTrigger><SelectValue placeholder="Wybierz zapasowego" /></SelectTrigger>
            <SelectContent>
              {data.providers.filter((provider) => provider.provider_key !== form.provider_key).map((provider) => (
                <SelectItem key={provider.provider_key} value={provider.provider_key} disabled={!provider.key_configured}>
                  {provider.display_name} — {provider.key_configured ? "klucz skonfigurowany" : "brak klucza"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedBackup && (
            <p className="text-xs text-muted-foreground">
              {selectedBackup.adapter_key} · {selectedBackup.key_configured ? "klucz skonfigurowany" : "brak klucza — wybór zablokowany"}
            </p>
          )}
          <Select
            value={form.backup_model_override || selectedBackup?.default_model || ""}
            disabled={!form.allow_fallback || !selectedBackup?.key_configured}
            onValueChange={(backup_model_override) => setForm({ ...form, backup_model_override })}
          >
            <SelectTrigger><SelectValue placeholder="Model zapasowy" /></SelectTrigger>
            <SelectContent>
              {data.providers.filter((provider) => provider.provider_key === form.backup_provider_key).map((provider) => (
                <SelectItem key={provider.default_model} value={provider.default_model}>{provider.default_model}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1"><Label>Timeout modelu (ms)</Label><Input type="number" min={1000} max={30000} step={500} value={form.model_timeout_ms} onChange={(event) => setForm({ ...form, model_timeout_ms: Number(event.target.value) })} /></div>
        <div className="space-y-1"><Label>Maks. rund narzędzi</Label><Input type="number" min={1} max={5} value={form.max_tool_rounds} onChange={(event) => setForm({ ...form, max_tool_rounds: Number(event.target.value) })} /></div>
        <div className="space-y-1"><Label>Limit tokenów odpowiedzi</Label><Input type="number" min={64} max={800} step={32} value={form.max_output_tokens} onChange={(event) => setForm({ ...form, max_output_tokens: Number(event.target.value) })} /></div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 p-3 text-xs">
        <div>
          <span className="font-medium">Analiza po rozmowie:</span> {data.analysis_model || "brak konfiguracji"}
          <span className="text-muted-foreground"> — oddzielny rekord `voice_call_analyzer`</span>
        </div>
        {form.updated_at && <Badge variant="outline">Routing: {new Date(form.updated_at).toLocaleString("pl-PL")}</Badge>}
      </div>

      <Button
        disabled={isPreviewMode || saveRouting.isPending || !data.providers.length || !selectedPrimary?.key_configured || (form.allow_fallback && !selectedBackup?.key_configured)}
        onClick={async () => {
          try {
            await saveRouting.mutateAsync(form);
            toast.success("Globalny routing rozmowy zapisany");
          } catch (saveError) {
            toast.error((saveError as Error).message);
          }
        }}
        className="gap-2"
      >
        {saveRouting.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {isPreviewMode ? "Zapis wyłączony w podglądzie" : "Zapisz model rozmowy"}
      </Button>
    </div>
  );

  if (compact) return <div className="rounded-lg border bg-card p-4">{content}</div>;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Brain className="h-5 w-5" />Model sterujący rozmową</CardTitle>
        <CardDescription>Ten sam rekord `voice_agent`, który jest widoczny w „Funkcje → AI”. Lista zawiera wyłącznie aktywne modele z kompletnym adapterem: streaming, narzędzia, timeout i bezpieczny fallback.</CardDescription>
      </CardHeader>
      <CardContent>{content}</CardContent>
    </Card>
  );
}

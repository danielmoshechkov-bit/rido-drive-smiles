import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Bot, 
  Phone, 
  Key, 
  Settings, 
  Users, 
  Clock,
  Save,
  AlertCircle,
  CheckCircle
} from "lucide-react";
import { useAIVoiceGlobalSettings, useUpdateAIVoiceGlobalSettings } from "@/hooks/useAIVoiceGlobalSettings";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface WhitelistItem {
  id: string;
  email: string;
  note: string | null;
  is_active: boolean;
  valid_until: string | null;
  created_at: string;
}

const TTS_PROVIDERS = [
  { value: "elevenlabs", label: "ElevenLabs", description: "Najwyższa jakość, naturalne polskie głosy" },
  { value: "openai", label: "OpenAI TTS", description: "Dobra jakość, szybka synteza" },
  { value: "google", label: "Google Cloud TTS", description: "Dobre polskie głosy, pay-as-you-go" },
];

const TELEPHONY_PROVIDERS = [
  { value: "twilio", label: "Twilio", description: "Najpopularniejsze API telefoniczne" },
  { value: "vonage", label: "Vonage (Nexmo)", description: "Alternatywa dla Twilio" },
];

const STT_PROVIDERS = [
  { value: "whisper", label: "OpenAI Whisper", description: "Najlepsza dokładność" },
  { value: "google", label: "Google Speech-to-Text", description: "Szybkie rozpoznawanie" },
];

export function AIVoiceAgentGlobalSettings() {
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useAIVoiceGlobalSettings();
  const updateSettings = useUpdateAIVoiceGlobalSettings();

  const [formData, setFormData] = useState({
    telephony_provider: "twilio",
    tts_provider: "elevenlabs",
    stt_provider: "whisper",
    global_max_calls_per_day: 500,
    global_max_minutes_per_month: 10000,
    calling_hours_start: "09:00",
    calling_hours_end: "20:00",
    calling_timezone: "Europe/Warsaw",
    is_enabled: false,
    auto_calling_enabled: false,
    booking_integration_enabled: true,
    sms_notifications_enabled: true,
    email_notifications_enabled: true,
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        telephony_provider: settings.telephony_provider || "twilio",
        tts_provider: settings.tts_provider || "elevenlabs",
        stt_provider: settings.stt_provider || "whisper",
        global_max_calls_per_day: settings.global_max_calls_per_day || 500,
        global_max_minutes_per_month: settings.global_max_minutes_per_month || 10000,
        calling_hours_start: settings.calling_hours_start || "09:00",
        calling_hours_end: settings.calling_hours_end || "20:00",
        calling_timezone: settings.calling_timezone || "Europe/Warsaw",
        is_enabled: settings.is_enabled || false,
        auto_calling_enabled: settings.auto_calling_enabled || false,
        booking_integration_enabled: settings.booking_integration_enabled ?? true,
        sms_notifications_enabled: settings.sms_notifications_enabled ?? true,
        email_notifications_enabled: settings.email_notifications_enabled ?? true,
      });
    }
  }, [settings]);

  // Whitelist management
  const { data: whitelist = [] } = useQuery({
    queryKey: ["ai-agent-whitelist"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_agent_access_whitelist" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as WhitelistItem[];
    },
  });

  const [newEmail, setNewEmail] = useState("");

  const addToWhitelist = useMutation({
    mutationFn: async (email: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("ai_agent_access_whitelist" as any)
        .insert([{ 
          email: email.toLowerCase(), 
          granted_by_user_id: user?.id,
          is_active: true 
        }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agent-whitelist"] });
      setNewEmail("");
      toast.success("Email dodany do whitelist");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const removeFromWhitelist = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("ai_agent_access_whitelist" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-agent-whitelist"] });
      toast.success("Email usunięty z whitelist");
    },
  });

  const handleSave = async () => {
    await updateSettings.mutateAsync(formData);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      <div className={`rounded-xl p-4 border ${formData.is_enabled ? 'bg-primary/5 border-primary/20' : 'bg-muted border-border'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {formData.is_enabled ? (
              <CheckCircle className="h-5 w-5 text-primary" />
            ) : (
              <AlertCircle className="h-5 w-5 text-muted-foreground" />
            )}
            <div>
              <p className="font-medium">
                {formData.is_enabled ? "Moduł aktywny" : "Moduł nieaktywny"}
              </p>
              <p className="text-sm text-muted-foreground">
                {formData.is_enabled 
                  ? "AI Sales Agent jest dostępny dla wszystkich użytkowników" 
                  : "Tylko użytkownicy z whitelist mają dostęp"
                }
              </p>
            </div>
          </div>
          <Switch
            checked={formData.is_enabled}
            onCheckedChange={(checked) => setFormData({ ...formData, is_enabled: checked })}
          />
        </div>
      </div>

      <Tabs defaultValue="providers">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="providers" className="gap-2">
            <Key className="h-4 w-4" />
            Providery
          </TabsTrigger>
          <TabsTrigger value="limits" className="gap-2">
            <Clock className="h-4 w-4" />
            Limity
          </TabsTrigger>
          <TabsTrigger value="features" className="gap-2">
            <Settings className="h-4 w-4" />
            Funkcje
          </TabsTrigger>
          <TabsTrigger value="whitelist" className="gap-2">
            <Users className="h-4 w-4" />
            Whitelist
          </TabsTrigger>
        </TabsList>

        <TabsContent value="providers" className="space-y-6 mt-6">
          {/* Telephony Provider */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5" />
                Telefonia
              </CardTitle>
              <CardDescription>
                Wybierz dostawcę usług telefonicznych
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Provider telefonii</Label>
                <Select
                  value={formData.telephony_provider}
                  onValueChange={(v) => setFormData({ ...formData, telephony_provider: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TELEPHONY_PROVIDERS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        <div>
                          <span className="font-medium">{p.label}</span>
                          <span className="text-muted-foreground ml-2 text-xs">
                            - {p.description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formData.telephony_provider === "twilio" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>TWILIO_ACCOUNT_SID</Label>
                    <Input
                      type="password"
                      placeholder="ACxxxxxxxxxxxxxxxx"
                      disabled
                    />
                    <p className="text-xs text-muted-foreground">
                      Ustaw w Supabase Secrets
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>TWILIO_AUTH_TOKEN</Label>
                    <Input
                      type="password"
                      placeholder="xxxxxxxxxxxxxxxx"
                      disabled
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* TTS Provider */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                Synteza mowy (TTS)
              </CardTitle>
              <CardDescription>
                Wybierz dostawcę syntezy głosu
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Provider TTS</Label>
                <Select
                  value={formData.tts_provider}
                  onValueChange={(v) => setFormData({ ...formData, tts_provider: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TTS_PROVIDERS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        <div>
                          <span className="font-medium">{p.label}</span>
                          <span className="text-muted-foreground ml-2 text-xs">
                            - {p.description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>
                  {formData.tts_provider === "elevenlabs" && "ELEVENLABS_API_KEY"}
                  {formData.tts_provider === "openai" && "OPENAI_API_KEY"}
                  {formData.tts_provider === "google" && "GOOGLE_TTS_API_KEY"}
                </Label>
                <Input
                  type="password"
                  placeholder="Klucz API..."
                  disabled
                />
                <p className="text-xs text-muted-foreground">
                  Ustaw w Supabase Secrets
                </p>
              </div>
            </CardContent>
          </Card>

          {/* STT Provider */}
          <Card>
            <CardHeader>
              <CardTitle>Rozpoznawanie mowy (STT)</CardTitle>
              <CardDescription>
                Wybierz dostawcę rozpoznawania mowy
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label>Provider STT</Label>
                <Select
                  value={formData.stt_provider}
                  onValueChange={(v) => setFormData({ ...formData, stt_provider: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STT_PROVIDERS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        <div>
                          <span className="font-medium">{p.label}</span>
                          <span className="text-muted-foreground ml-2 text-xs">
                            - {p.description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="limits" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Globalne limity</CardTitle>
              <CardDescription>
                Ograniczenia dla wszystkich użytkowników
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Max połączeń / dzień (globalnie)</Label>
                  <Input
                    type="number"
                    value={formData.global_max_calls_per_day}
                    onChange={(e) => setFormData({ ...formData, global_max_calls_per_day: parseInt(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max minut / miesiąc (globalnie)</Label>
                  <Input
                    type="number"
                    value={formData.global_max_minutes_per_month}
                    onChange={(e) => setFormData({ ...formData, global_max_minutes_per_month: parseInt(e.target.value) })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Godziny dzwonienia</Label>
                <div className="flex gap-2 items-center">
                  <Input
                    type="time"
                    value={formData.calling_hours_start}
                    onChange={(e) => setFormData({ ...formData, calling_hours_start: e.target.value })}
                    className="w-32"
                  />
                  <span>-</span>
                  <Input
                    type="time"
                    value={formData.calling_hours_end}
                    onChange={(e) => setFormData({ ...formData, calling_hours_end: e.target.value })}
                    className="w-32"
                  />
                  <Badge variant="outline">{formData.calling_timezone}</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="features" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Funkcje modułu</CardTitle>
              <CardDescription>
                Włącz/wyłącz poszczególne funkcjonalności
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Automatyczne dzwonienie</Label>
                  <p className="text-xs text-muted-foreground">
                    AI automatycznie dzwoni do leadów z kolejki
                  </p>
                </div>
                <Switch
                  checked={formData.auto_calling_enabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, auto_calling_enabled: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Integracja z kalendarzem</Label>
                  <p className="text-xs text-muted-foreground">
                    AI może umawiać spotkania w kalendarzu
                  </p>
                </div>
                <Switch
                  checked={formData.booking_integration_enabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, booking_integration_enabled: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Powiadomienia SMS</Label>
                  <p className="text-xs text-muted-foreground">
                    Wysyłaj SMS po rozmowie
                  </p>
                </div>
                <Switch
                  checked={formData.sms_notifications_enabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, sms_notifications_enabled: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Powiadomienia Email</Label>
                  <p className="text-xs text-muted-foreground">
                    Wysyłaj email po rozmowie
                  </p>
                </div>
                <Switch
                  checked={formData.email_notifications_enabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, email_notifications_enabled: checked })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="whitelist" className="space-y-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Whitelist użytkowników
              </CardTitle>
              <CardDescription>
                Użytkownicy z dostępem do AI Agent (gdy moduł jest wyłączony globalnie)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="email@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
                <Button 
                  onClick={() => addToWhitelist.mutate(newEmail)}
                  disabled={!newEmail || addToWhitelist.isPending}
                >
                  Dodaj
                </Button>
              </div>

              <div className="space-y-2">
                {whitelist.map((item) => (
                  <div 
                    key={item.id} 
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div>
                      <span className="font-medium">{item.email}</span>
                      {item.note && (
                        <span className="text-sm text-muted-foreground ml-2">
                          ({item.note})
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={item.is_active ? "default" : "secondary"}>
                        {item.is_active ? "Aktywny" : "Nieaktywny"}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeFromWhitelist.mutate(item.id)}
                      >
                        Usuń
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateSettings.isPending} className="gap-2">
          <Save className="h-4 w-4" />
          Zapisz ustawienia
        </Button>
      </div>
    </div>
  );
}

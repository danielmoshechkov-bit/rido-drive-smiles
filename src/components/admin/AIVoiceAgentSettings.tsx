import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Bot, Phone, Mic, ShieldCheck, ShieldAlert, CheckCircle2, XCircle,
  Loader2, Save, Plug, KeyRound,
} from "lucide-react";

interface SecretStatus {
  key: string;
  is_set: boolean;
  source: "panel" | "env" | null;
  is_encrypted: boolean;
  updated_at: string | null;
}

// Definicja pól (rozszerzalna — "jeden panel na wszystkie klucze AI").
// testWith: który klucz wywołać przy "Testuj połączenie" dla tego wiersza.
const SECTIONS: {
  group: string;
  icon: typeof Bot;
  description: string;
  keys: { key: string; label: string; placeholder: string; optional?: boolean; testWith: string }[];
}[] = [
  {
    group: "ElevenLabs",
    icon: Bot,
    description: "Synteza mowy i agent konwersacyjny (głos AI).",
    keys: [
      { key: "ELEVENLABS_API_KEY", label: "ElevenLabs API Key", placeholder: "sk_…", testWith: "ELEVENLABS_API_KEY" },
    ],
  },
  {
    group: "Twilio",
    icon: Phone,
    description: "Telefonia — numery, połączenia przychodzące i wychodzące.",
    keys: [
      { key: "TWILIO_ACCOUNT_SID", label: "Twilio Account SID", placeholder: "AC…", testWith: "TWILIO_ACCOUNT_SID" },
      { key: "TWILIO_AUTH_TOKEN", label: "Twilio Auth Token", placeholder: "••••••••", testWith: "TWILIO_ACCOUNT_SID" },
      { key: "TWILIO_PHONE_NUMBER", label: "Twilio Phone Number", placeholder: "+48…", testWith: "TWILIO_PHONE_NUMBER" },
    ],
  },
  {
    group: "Deepgram",
    icon: Mic,
    description: "Transkrypcja mowy (STT) — opcjonalnie (alternatywa dla wbudowanego STT ElevenLabs).",
    keys: [
      { key: "DEEPGRAM_API_KEY", label: "Deepgram API Key (opcjonalnie)", placeholder: "…", optional: true, testWith: "DEEPGRAM_API_KEY" },
    ],
  },
];

export function AIVoiceAgentSettings() {
  const [loading, setLoading] = useState(true);
  const [encryption, setEncryption] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, SecretStatus>>({});
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({});

  const loadStatus = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("admin-ai-secrets", { body: { action: "status" } });
    if (error || !data?.success) {
      toast.error("Nie udało się pobrać statusu kluczy");
    } else {
      setEncryption(!!data.encryption);
      const map: Record<string, SecretStatus> = {};
      for (const s of data.statuses as SecretStatus[]) map[s.key] = s;
      setStatuses(map);
    }
    setLoading(false);
  };

  useEffect(() => { loadStatus(); }, []);

  const saveKey = async (key: string) => {
    const value = (inputs[key] || "").trim();
    if (!value) { toast.error("Wpisz wartość klucza"); return; }
    setSavingKey(key);
    const { data, error } = await supabase.functions.invoke("admin-ai-secrets", { body: { action: "set", key, value } });
    if (error || !data?.success) {
      toast.error("Błąd zapisu: " + (data?.error || error?.message || "nieznany"));
    } else {
      toast.success(`Zapisano ${key}${data.encrypted ? " (zaszyfrowany)" : ""}`);
      setInputs((p) => ({ ...p, [key]: "" }));
      setTestResults((p) => { const c = { ...p }; delete c[key]; return c; });
      await loadStatus();
    }
    setSavingKey(null);
  };

  const testKey = async (rowKey: string, testWith: string) => {
    setTestingKey(rowKey);
    const { data, error } = await supabase.functions.invoke("admin-ai-secrets", { body: { action: "test", key: testWith } });
    if (error || !data?.success) {
      setTestResults((p) => ({ ...p, [rowKey]: { ok: false, message: data?.error || error?.message || "Błąd testu" } }));
    } else {
      setTestResults((p) => ({ ...p, [rowKey]: { ok: data.ok, message: data.message } }));
    }
    setTestingKey(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Banner bezpieczeństwa */}
      <div className="rounded-xl border bg-muted/40 p-4">
        <div className="flex items-start gap-3">
          <KeyRound className="h-5 w-5 text-primary mt-0.5" />
          <div className="text-sm">
            <p className="font-medium">Klucze API modułu głosowego</p>
            <p className="text-muted-foreground mt-1">
              Wpisujesz klucze tutaj — trafiają do bezpiecznego magazynu dostępnego wyłącznie dla serwera
              (edge). Wartość nie jest nigdy pokazywana ani wysyłana do przeglądarki. Nowy klucz nadpisuje stary.
            </p>
            <div className="mt-2">
              {encryption ? (
                <Badge variant="outline" className="gap-1 border-green-300 text-green-700">
                  <ShieldCheck className="h-3.5 w-3.5" /> Szyfrowanie at-rest: włączone
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 border-amber-300 text-amber-700">
                  <ShieldAlert className="h-3.5 w-3.5" /> Szyfrowanie at-rest: wyłączone (ustaw sekret AI_SECRETS_ENC_KEY)
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {SECTIONS.map((section) => {
        const Icon = section.icon;
        return (
          <Card key={section.group}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Icon className="h-5 w-5" /> {section.group}
              </CardTitle>
              <CardDescription>{section.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {section.keys.map((k) => {
                const st = statuses[k.key];
                const isSet = st?.is_set;
                const tr = testResults[k.key];
                return (
                  <div key={k.key} className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="font-mono text-xs">{k.label}</Label>
                      {isSet ? (
                        <Badge variant="outline" className="gap-1 border-green-300 text-green-700">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Ustawiony
                          {st?.source === "env" && <span className="opacity-60">(env)</span>}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1 border-muted-foreground/30 text-muted-foreground">
                          <XCircle className="h-3.5 w-3.5" /> Brak{k.optional ? " (opcjonalny)" : ""}
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Input
                        type="password"
                        autoComplete="new-password"
                        placeholder={isSet ? "Wpisz nowy, aby nadpisać…" : k.placeholder}
                        value={inputs[k.key] || ""}
                        onChange={(e) => setInputs((p) => ({ ...p, [k.key]: e.target.value }))}
                        className="flex-1 font-mono text-sm"
                      />
                      <Button
                        onClick={() => saveKey(k.key)}
                        disabled={savingKey === k.key || !(inputs[k.key] || "").trim()}
                        size="sm"
                        className="gap-1.5 shrink-0"
                      >
                        {savingKey === k.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Zapisz
                      </Button>
                      <Button
                        onClick={() => testKey(k.key, k.testWith)}
                        disabled={testingKey === k.key}
                        size="sm"
                        variant="outline"
                        className="gap-1.5 shrink-0"
                      >
                        {testingKey === k.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug className="h-4 w-4" />}
                        Testuj połączenie
                      </Button>
                    </div>
                    {st?.updated_at && (
                      <p className="text-xs text-muted-foreground">
                        Zaktualizowano: {new Date(st.updated_at).toLocaleString("pl-PL")}
                      </p>
                    )}
                    {tr && (
                      <p className={`text-xs font-medium ${tr.ok ? "text-green-600" : "text-red-600"}`}>
                        {tr.message}
                      </p>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <h4 className="font-medium">Status modułu Asystent głosowy AI</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Włącz/wyłącz moduł w zakładce „Funkcje" (flaga globalna). Telefonia rusza po ustawieniu
                kluczy powyżej (status ✓) oraz potwierdzeniu prywatności (ZRM ElevenLabs + ZDR Anthropic).
              </p>
            </div>
            <Badge variant="secondary">Feature: ai_voice_agent_enabled</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

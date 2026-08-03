import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Brain, KeyRound, Route, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { VoiceConversationModelSettings } from "@/components/admin/VoiceConversationModelSettings";
import { voiceAiRoutingPreviewData } from "@/components/admin/voiceAiRoutingPreviewData";

const previewQueryClient = new QueryClient({
  defaultOptions: { queries: { enabled: false, retry: false }, mutations: { retry: false } },
});

const previewHref = (tab: "mapping" | "voice-agent") => `/admin/ai?tab=${tab}&voicePreview=1`;

function PreviewNavigation({ activeTab }: { activeTab: "mapping" | "voice-agent" }) {
  return (
    <nav className="flex flex-wrap gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-purple-600 p-2 text-white shadow-sm">
      <a
        href={previewHref("mapping")}
        className={`rounded-xl px-5 py-2 text-sm font-medium ${activeTab === "mapping" ? "bg-white text-violet-700" : "hover:bg-white/10"}`}
      >
        Funkcje → AI
      </a>
      <a
        href={previewHref("voice-agent")}
        className={`rounded-xl px-5 py-2 text-sm font-medium ${activeTab === "voice-agent" ? "bg-white text-violet-700" : "hover:bg-white/10"}`}
      >
        AI Voice Agent
      </a>
    </nav>
  );
}

function MappingPreview() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Route className="h-5 w-5" />Centrum sterowania AI</CardTitle>
        <CardDescription>
          Kategoria „Głos”. Funkcja obsługi telefonu korzysta z kontrolowanego rejestru modeli rozmowy, a nie z ogólnej listy STT/TTS i grafiki.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Głos</Badge>
          <Badge variant="outline">Obsługa rozmów telefonicznych</Badge>
          <span className="text-xs text-muted-foreground">rekord: voice_agent</span>
        </div>
        <VoiceConversationModelSettings compact previewData={voiceAiRoutingPreviewData} />
      </CardContent>
    </Card>
  );
}

function VoiceAgentPreview() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-muted/40 p-4">
        <div className="flex items-start gap-3">
          <KeyRound className="mt-0.5 h-5 w-5 text-primary" />
          <div className="text-sm">
            <p className="font-medium">Klucze API modeli rozmowy pozostają w „Dostawcy & API”</p>
            <p className="mt-1 text-muted-foreground">
              Ten formularz pokazuje wyłącznie stan skonfigurowania. Nie pobiera ani nie powiela wartości kluczy.
            </p>
            <Badge variant="outline" className="mt-2 gap-1 border-amber-300 text-amber-700">
              <ShieldAlert className="h-3.5 w-3.5" /> Syntetyczny status w podglądzie
            </Badge>
          </div>
        </div>
      </div>
      <VoiceConversationModelSettings previewData={voiceAiRoutingPreviewData} />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status ścieżki głosowej</CardTitle>
          <CardDescription>Model rozmowy jest oddzielony od ElevenLabs, transkrypcji i analizy po rozmowie.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm md:grid-cols-2">
          <div className="rounded-lg border p-3"><p className="font-medium">Backend rozmowy</p><p className="text-muted-foreground">SSE, narzędzia, timeout i bezpieczny fallback.</p></div>
          <div className="rounded-lg border p-3"><p className="font-medium">ElevenLabs</p><p className="text-muted-foreground">Warstwa głosu, STT/TTS i webhook — nie model LLM odpowiedzi.</p></div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function VoiceAiRoutingLocalPreview() {
  const requestedTab = new URLSearchParams(window.location.search).get("tab");
  const activeTab: "mapping" | "voice-agent" = requestedTab === "mapping" ? "mapping" : "voice-agent";

  return (
    <QueryClientProvider client={previewQueryClient}>
      <main className="min-h-screen bg-muted/30 px-4 py-8">
        <div className="mx-auto max-w-6xl space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-sm text-violet-700"><Brain className="h-4 w-4" />Centrum AI — Mózg Platformy</p>
              <h1 className="text-3xl font-bold">Globalna konfiguracja agenta głosowego</h1>
              <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                Obie zakładki korzystają z tego samego syntetycznego rekordu <code>voice_agent</code>.
              </p>
            </div>
            <Badge className="bg-sky-600">Podgląd lokalny — zapis wyłączony</Badge>
          </div>

          <PreviewNavigation activeTab={activeTab} />
          {activeTab === "mapping" ? <MappingPreview /> : <VoiceAgentPreview />}
        </div>
      </main>
    </QueryClientProvider>
  );
}

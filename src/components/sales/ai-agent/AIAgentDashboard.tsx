import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Bot, Settings, Phone, Calendar, BarChart3, AlertCircle, Inbox, Building2, FileText } from "lucide-react";
import { useAIAgentConfig, useCreateAIAgentConfig } from "@/hooks/useAIAgentConfig";
import { AIAgentConfigPanel } from "./AIAgentConfigPanel";
import { AIAgentVoiceSelector } from "./AIAgentVoiceSelector";
import { AIAgentCallsLog } from "./AIAgentCallsLog";
import { AIAgentUsagePanel } from "./AIAgentUsagePanel";
import { AIAgentCalendarPanel } from "./AIAgentCalendarPanel";
import { AIAgentQueuePanel } from "./AIAgentQueuePanel";
import { AIAgentLeadInbox } from "./AIAgentLeadInbox";
import { AIAgentBusinessProfile } from "./AIAgentBusinessProfile";
import { AIAgentScriptsList } from "./AIAgentScriptsList";

export function AIAgentDashboard() {
  const [activeTab, setActiveTab] = useState("config");
  const { data: config, isLoading } = useAIAgentConfig();
  const createConfig = useCreateAIAgentConfig();

  const handleCreateConfig = async () => {
    await createConfig.mutateAsync({
      company_name: "Moja firma",
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!config) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Bot className="h-8 w-8 text-primary" />
          </div>
          <CardTitle>AI Agent Sprzedaży</CardTitle>
          <CardDescription>
            Skonfiguruj AI Agenta, który będzie automatycznie dzwonił do Twoich leadów,
            kwalifikował ich i umawiał spotkania w Twoim kalendarzu.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <div className="bg-muted/50 rounded-xl p-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 justify-center mb-2">
              <AlertCircle className="h-4 w-4" />
              <span className="font-medium">Funkcja w wersji beta</span>
            </div>
            <p>API połączeń (ElevenLabs, Twilio) zostaną podłączone później.</p>
          </div>
          <Button 
            onClick={handleCreateConfig} 
            disabled={createConfig.isPending}
            className="gap-2"
          >
            <Bot className="h-4 w-4" />
            Rozpocznij konfigurację
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            AI Agent Sprzedaży
          </h2>
          <p className="text-muted-foreground">
            Konfiguracja i monitoring agenta głosowego
          </p>
        </div>
        <Badge 
          variant={config.is_active ? "default" : "secondary"}
          className="w-fit"
        >
          {config.is_active ? "Aktywny" : "Nieaktywny"}
        </Badge>
      </div>

      {/* Status banner */}
      {!config.is_active && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
            <AlertCircle className="h-4 w-4" />
            <span className="font-medium">Agent nieaktywny</span>
          </div>
          <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
            Uzupełnij konfigurację i aktywuj agenta aby rozpocząć automatyczne połączenia.
          </p>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-9">
          <TabsTrigger value="config" className="gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Konfiguracja</span>
          </TabsTrigger>
          <TabsTrigger value="profile" className="gap-2">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Profil</span>
          </TabsTrigger>
          <TabsTrigger value="scripts" className="gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Skrypty</span>
          </TabsTrigger>
          <TabsTrigger value="leads" className="gap-2">
            <Inbox className="h-4 w-4" />
            <span className="hidden sm:inline">Leady</span>
          </TabsTrigger>
          <TabsTrigger value="queue" className="gap-2">
            <Phone className="h-4 w-4" />
            <span className="hidden sm:inline">Kolejka</span>
          </TabsTrigger>
          <TabsTrigger value="voice" className="gap-2">
            <Bot className="h-4 w-4" />
            <span className="hidden sm:inline">Głos</span>
          </TabsTrigger>
          <TabsTrigger value="calendar" className="gap-2">
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">Kalendarz</span>
          </TabsTrigger>
          <TabsTrigger value="calls" className="gap-2">
            <Phone className="h-4 w-4" />
            <span className="hidden sm:inline">Rozmowy</span>
          </TabsTrigger>
          <TabsTrigger value="usage" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Zużycie</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="mt-6">
          <AIAgentConfigPanel config={config} />
        </TabsContent>

        <TabsContent value="profile" className="mt-6">
          <AIAgentBusinessProfile configId={config.id} />
        </TabsContent>

        <TabsContent value="scripts" className="mt-6">
          <AIAgentScriptsList configId={config.id} />
        </TabsContent>

        <TabsContent value="leads" className="mt-6">
          <AIAgentLeadInbox configId={config.id} />
        </TabsContent>

        <TabsContent value="queue" className="mt-6">
          <AIAgentQueuePanel configId={config.id} />
        </TabsContent>

        <TabsContent value="voice" className="mt-6">
          <AIAgentVoiceSelector config={config} />
        </TabsContent>

        <TabsContent value="calendar" className="mt-6">
          <AIAgentCalendarPanel configId={config.id} />
        </TabsContent>

        <TabsContent value="calls" className="mt-6">
          <AIAgentCallsLog configId={config.id} />
        </TabsContent>

        <TabsContent value="usage" className="mt-6">
          <AIAgentUsagePanel config={config} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

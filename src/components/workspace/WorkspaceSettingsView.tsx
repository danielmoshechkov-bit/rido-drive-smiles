import { useState } from "react";
import { WorkspaceProject } from "@/hooks/useWorkspace";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Settings, Calendar, Mail, Globe, Link2, Shield, 
  ExternalLink, CheckCircle2, AlertTriangle, Loader2
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  project: WorkspaceProject;
  workspace: any;
}

export function WorkspaceSettingsView({ project, workspace }: Props) {
  const [googleConnected, setGoogleConnected] = useState(false);
  const [calendarSync, setCalendarSync] = useState(false);
  const [driveSync, setDriveSync] = useState(false);
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [connecting, setConnecting] = useState(false);

  const handleGoogleConnect = async () => {
    setConnecting(true);
    // Simulate OAuth flow - in production this would redirect to Google OAuth
    setTimeout(() => {
      setGoogleConnected(true);
      setCalendarSync(true);
      setConnecting(false);
      toast.success("Połączono z Google Workspace!");
    }, 2000);
  };

  const handleDisconnect = () => {
    setGoogleConnected(false);
    setCalendarSync(false);
    setDriveSync(false);
    toast.info("Rozłączono Google Workspace");
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Project info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Ustawienia projektu
          </CardTitle>
          <CardDescription>Nazwa, opis i ogólne ustawienia projektu</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-xs font-medium">Nazwa projektu</Label>
            <Input defaultValue={project.name} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs font-medium">Opis</Label>
            <Input defaultValue={project.description || ""} className="mt-1" placeholder="Krótki opis projektu..." />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs font-medium">Kolor</Label>
            <div className="w-6 h-6 rounded-full border" style={{ backgroundColor: project.color }} />
          </div>
        </CardContent>
      </Card>

      {/* Google Workspace Integration */}
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Google Workspace
            {googleConnected && <Badge className="bg-green-100 text-green-700 text-[10px]">Połączono</Badge>}
          </CardTitle>
          <CardDescription>Połącz Google Calendar, Gmail i Drive z projektem</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!googleConnected ? (
            <div className="text-center py-4">
              <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-muted flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
              </div>
              <p className="text-sm text-muted-foreground mb-4">
                Połącz konto Google aby synchronizować kalendarz, pliki i powiadomienia
              </p>
              <Button onClick={handleGoogleConnect} disabled={connecting} className="gap-2">
                {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                {connecting ? "Łączenie..." : "Połącz z Google"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Calendar Sync */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-blue-500" />
                  <div>
                    <p className="text-sm font-medium">Google Calendar</p>
                    <p className="text-xs text-muted-foreground">Synchronizuj terminy zadań z kalendarzem Google</p>
                  </div>
                </div>
                <Switch checked={calendarSync} onCheckedChange={setCalendarSync} />
              </div>

              {calendarSync && (
                <div className="ml-8 p-3 rounded-lg border border-dashed space-y-2">
                  <div className="flex items-center gap-2 text-xs">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    <span>Deadlines zadań → wydarzenia Google Calendar</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    <span>Spotkania zespołu widoczne w kalendarzu projektu</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    <span>Automatyczne przypomnienia przed deadlinem</span>
                  </div>
                </div>
              )}

              {/* Drive Sync */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <svg viewBox="0 0 24 24" className="h-5 w-5">
                    <path d="M7.71 3.5L1.15 15l3.43 5.93h6.58L17.72 9.43 7.71 3.5z" fill="#4285F4"/>
                    <path d="M16.29 3.5H7.71l6.57 11.36 6.57-3.79-4.56-7.57z" fill="#0F9D58"/>
                    <path d="M1.15 15l3.43 5.93h16.84l3.43-5.93H1.15z" fill="#FFCD40"/>
                  </svg>
                  <div>
                    <p className="text-sm font-medium">Google Drive</p>
                    <p className="text-xs text-muted-foreground">Dokumenty projektu w folderze Drive</p>
                  </div>
                </div>
                <Switch checked={driveSync} onCheckedChange={setDriveSync} />
              </div>

              {/* Gmail */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-red-500" />
                  <div>
                    <p className="text-sm font-medium">Powiadomienia email</p>
                    <p className="text-xs text-muted-foreground">Otrzymuj powiadomienia o zmianach na email</p>
                  </div>
                </div>
                <Switch checked={emailNotifs} onCheckedChange={setEmailNotifs} />
              </div>

              <Separator />

              <Button variant="outline" size="sm" className="text-destructive" onClick={handleDisconnect}>
                Rozłącz Google Workspace
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Webhooks */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Webhooks & Integracje
          </CardTitle>
          <CardDescription>Połącz z zewnętrznymi narzędziami (Slack, Zapier, Make)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs font-medium">Webhook URL</Label>
            <div className="flex gap-2 mt-1">
              <Input
                value={webhookUrl}
                onChange={e => setWebhookUrl(e.target.value)}
                placeholder="https://hooks.zapier.com/..."
                className="flex-1"
              />
              <Button size="sm" variant="outline" onClick={() => toast.success("Webhook zapisany")}>
                Zapisz
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Wysyłaj powiadomienia o nowych zadaniach, wiadomościach i zmianach statusów
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Bezpieczeństwo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Wymagaj 2FA dla członków</p>
              <p className="text-xs text-muted-foreground">Dodatkowe zabezpieczenie dostępu</p>
            </div>
            <Switch />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Logi aktywności</p>
              <p className="text-xs text-muted-foreground">Zapisuj wszystkie akcje w projekcie</p>
            </div>
            <Switch defaultChecked />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

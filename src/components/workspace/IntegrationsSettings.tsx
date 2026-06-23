import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HardDrive, Mail, MessageSquare, Calendar, Plug } from "lucide-react";

/**
 * INTEGRACJE (KONEKTORY) — szkielet UI pod wizję RidoAI (W1: Dysk/Gmail/kalendarz).
 * Na razie BEZ działającego OAuth — tylko miejsce gotowe pod konektory.
 * Każdy konektor: ikona, nazwa, opis, status (Dostępne wkrótce / Połącz).
 * Docelowo: przycisk „Połącz" uruchamia OAuth danego dostawcy i zapisuje token.
 */
const CONNECTORS = [
  { key: "google_drive", name: "Google Dysk", icon: HardDrive, desc: "Pliki, dokumenty, zestawienia", status: "soon" },
  { key: "gmail", name: "Gmail", icon: Mail, desc: "Czytanie i wysyłka poczty przez RidoAI", status: "soon" },
  { key: "calendar", name: "Kalendarz Google", icon: Calendar, desc: "Synchronizacja wydarzeń i planu dnia", status: "soon" },
  { key: "slack", name: "Slack", icon: MessageSquare, desc: "Powiadomienia i komunikacja zespołu", status: "soon" },
] as const;

export function IntegrationsSettings() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plug className="h-5 w-5" /> Integracje (konektory)
          </CardTitle>
          <CardDescription className="text-xs">
            Podłącz programy, z których korzystasz — RidoAI będzie działać na tym, co połączysz. Wkrótce.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {CONNECTORS.map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.key} className="flex items-center gap-3 p-3 border rounded-lg">
                <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center shrink-0">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{c.desc}</p>
                </div>
                {c.status === "soon" ? (
                  <Badge variant="outline" className="text-[10px]">Wkrótce</Badge>
                ) : (
                  <Button size="sm" variant="outline">Połącz</Button>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Bot, Key, Phone, AlertCircle } from "lucide-react";

export function AIVoiceAgentSettings() {
  return (
    <div className="space-y-6">
      {/* Status Banner */}
      <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
          <div>
            <p className="font-medium text-amber-800 dark:text-amber-200">
              Moduł w przygotowaniu
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
              API ElevenLabs i Twilio zostaną podłączone w następnej wersji. 
              Handlowcy mogą już teraz konfigurować dane firmy i kalendarz.
            </p>
          </div>
        </div>
      </div>

      {/* ElevenLabs API */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            ElevenLabs API
          </CardTitle>
          <CardDescription>
            Klucz API do syntezy mowy - wysokiej jakości głosy AI
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="elevenlabs-key">ELEVENLABS_API_KEY</Label>
            <div className="flex gap-2">
              <Input
                id="elevenlabs-key"
                type="password"
                placeholder="xi-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                disabled
                className="flex-1"
              />
              <Badge variant="outline" className="shrink-0">
                Wkrótce
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Uzyskaj klucz na{" "}
              <a 
                href="https://elevenlabs.io/app/settings/api-keys" 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                elevenlabs.io
              </a>
            </p>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div>
              <Label>Aktywacja ElevenLabs</Label>
              <p className="text-xs text-muted-foreground">
                Włącz syntezę mowy przez ElevenLabs
              </p>
            </div>
            <Switch disabled />
          </div>
        </CardContent>
      </Card>

      {/* Twilio API */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Twilio API
          </CardTitle>
          <CardDescription>
            Połączenia telefoniczne - dzwonienie i odbieranie połączeń
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>TWILIO_ACCOUNT_SID</Label>
              <Input
                type="text"
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                disabled
              />
            </div>
            <div className="space-y-2">
              <Label>TWILIO_AUTH_TOKEN</Label>
              <Input
                type="password"
                placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                disabled
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>TWILIO_PHONE_NUMBER</Label>
            <Input
              type="text"
              placeholder="+48XXXXXXXXX"
              disabled
            />
            <p className="text-xs text-muted-foreground">
              Numer telefonu Twilio, z którego będą wykonywane połączenia
            </p>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div>
              <Label>Aktywacja Twilio</Label>
              <p className="text-xs text-muted-foreground">
                Włącz wykonywanie połączeń telefonicznych
              </p>
            </div>
            <Switch disabled />
          </div>
        </CardContent>
      </Card>

      {/* Global Limits */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            Globalne limity
          </CardTitle>
          <CardDescription>
            Ogólne ograniczenia dla wszystkich użytkowników
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Max minut / użytkownik / miesiąc</Label>
              <Input
                type="number"
                placeholder="120"
                disabled
              />
            </div>
            <div className="space-y-2">
              <Label>Max połączeń / dzień (globalnie)</Label>
              <Input
                type="number"
                placeholder="500"
                disabled
              />
            </div>
            <div className="space-y-2">
              <Label>Godziny dzwonienia</Label>
              <div className="flex gap-2">
                <Input type="time" defaultValue="09:00" disabled className="flex-1" />
                <span className="self-center">-</span>
                <Input type="time" defaultValue="20:00" disabled className="flex-1" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Feature Flags Info */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <h4 className="font-medium">Status modułu AI Agent</h4>
              <p className="text-sm text-muted-foreground mt-1">
                Moduł jest widoczny dla handlowców w Portalu Sprzedaży.
                Włącz/wyłącz w zakładce "Funkcje".
              </p>
            </div>
            <Badge variant="secondary">
              Feature: ai_sales_agent_enabled
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

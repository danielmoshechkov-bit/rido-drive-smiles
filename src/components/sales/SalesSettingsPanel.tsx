import { useSalesUserSettings, useUpdateSalesUserSettings } from "@/hooks/useSalesLeads";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import { Loader2, Mail, Phone, Target, Save } from "lucide-react";

export function SalesSettingsPanel() {
  const { data: settings, isLoading } = useSalesUserSettings();
  const updateSettings = useUpdateSalesUserSettings();
  
  const [workEmail, setWorkEmail] = useState("");
  const [phoneExtension, setPhoneExtension] = useState("");
  const [dailyTarget, setDailyTarget] = useState(20);

  useEffect(() => {
    if (settings) {
      setWorkEmail(settings.work_email || "");
      setPhoneExtension(settings.phone_extension || "");
      setDailyTarget(settings.daily_call_target || 20);
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings.mutate({
      work_email: workEmail || undefined,
      phone_extension: phoneExtension || undefined,
      daily_call_target: dailyTarget,
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Ustawienia konta</CardTitle>
          <CardDescription>
            Skonfiguruj swoje dane do wysyłania zaproszeń i pracy z systemem
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="work_email" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Firmowy adres email
            </Label>
            <Input
              id="work_email"
              type="email"
              value={workEmail}
              onChange={(e) => setWorkEmail(e.target.value)}
              placeholder="twoj.email@getrido.pl"
            />
            <p className="text-xs text-muted-foreground">
              Z tego adresu będą wysyłane zaproszenia do klientów
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone_extension" className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Numer wewnętrzny
            </Label>
            <Input
              id="phone_extension"
              value={phoneExtension}
              onChange={(e) => setPhoneExtension(e.target.value)}
              placeholder="np. 101"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="daily_target" className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              Dzienny cel połączeń
            </Label>
            <Input
              id="daily_target"
              type="number"
              value={dailyTarget}
              onChange={(e) => setDailyTarget(parseInt(e.target.value) || 20)}
              min={1}
              max={100}
            />
          </div>

          <Button onClick={handleSave} disabled={updateSettings.isPending} className="gap-2">
            {updateSettings.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Zapisz ustawienia
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

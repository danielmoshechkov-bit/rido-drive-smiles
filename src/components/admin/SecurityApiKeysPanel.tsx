import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Shield, Key, Save, ExternalLink, AlertTriangle, Info } from "lucide-react";

export function SecurityApiKeysPanel() {
  const [recaptchaSiteKey, setRecaptchaSiteKey] = useState("");
  const [recaptchaEnabled, setRecaptchaEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('feature_toggles')
        .select('feature_key, is_enabled, description')
        .in('feature_key', ['recaptcha_enabled', 'recaptcha_site_key']);

      if (error) throw error;

      data?.forEach((item: any) => {
        if (item.feature_key === 'recaptcha_enabled') {
          setRecaptchaEnabled(item.is_enabled);
        }
        if (item.feature_key === 'recaptcha_site_key') {
          // Store the site key in the description field temporarily
          setRecaptchaSiteKey(item.description || "");
        }
      });
    } catch (error) {
      console.error('Error fetching security settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Save reCAPTCHA enabled status
      await supabase
        .from('feature_toggles')
        .upsert({
          feature_key: 'recaptcha_enabled',
          feature_name: 'reCAPTCHA przy rejestracji',
          is_enabled: recaptchaEnabled,
          description: 'Włącza zabezpieczenie reCAPTCHA dla formularza rejestracji'
        }, { onConflict: 'feature_key' });

      // Save reCAPTCHA site key (stored in description for now)
      await supabase
        .from('feature_toggles')
        .upsert({
          feature_key: 'recaptcha_site_key',
          feature_name: 'Klucz reCAPTCHA Site Key',
          is_enabled: true,
          description: recaptchaSiteKey
        }, { onConflict: 'feature_key' });

      toast.success("Ustawienia zabezpieczeń zapisane");
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error("Błąd zapisywania ustawień");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Ładowanie ustawień...
        </CardContent>
      </Card>
    );
  }

  const hasRecaptchaKey = recaptchaSiteKey.length > 10;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Zabezpieczenia API
        </CardTitle>
        <CardDescription>
          Klucze API dla reCAPTCHA i innych zabezpieczeń
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* reCAPTCHA Section */}
        <div className="space-y-4 p-4 border rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Google reCAPTCHA v2</span>
            </div>
            <Badge variant={hasRecaptchaKey ? "default" : "secondary"}>
              {hasRecaptchaKey ? "Skonfigurowano" : "Nie skonfigurowano"}
            </Badge>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="recaptcha-site-key">Site Key (publiczny)</Label>
              <Input
                id="recaptcha-site-key"
                value={recaptchaSiteKey}
                onChange={(e) => setRecaptchaSiteKey(e.target.value)}
                placeholder="6LcXXXXXXXXXXXXXXXXXXXXX..."
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Uzyskaj klucz na{" "}
                <a 
                  href="https://www.google.com/recaptcha/admin" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  Google reCAPTCHA Console
                  <ExternalLink className="h-3 w-3" />
                </a>
              </p>
            </div>

            <div className="flex items-center justify-between p-3 bg-muted rounded-md">
              <div className="space-y-1">
                <Label htmlFor="recaptcha-enabled" className="font-medium">
                  Włącz reCAPTCHA przy rejestracji
                </Label>
                <p className="text-xs text-muted-foreground">
                  Wymaga rozwiązania obrazkowego CAPTCHA przed rejestracją
                </p>
              </div>
              <Switch
                id="recaptcha-enabled"
                checked={recaptchaEnabled}
                onCheckedChange={setRecaptchaEnabled}
                disabled={!hasRecaptchaKey}
              />
            </div>

            {!hasRecaptchaKey && recaptchaEnabled && (
              <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/30 rounded-md">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <span className="text-sm text-destructive">
                  Dodaj klucz Site Key, aby aktywować reCAPTCHA
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Info box */}
        <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-primary mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium">
                Rejestracja działa bez reCAPTCHA
              </p>
              <p className="text-xs text-muted-foreground">
                Obecnie używamy podstawowego zabezpieczenia (checkbox "Nie jestem robotem"). 
                Po dodaniu klucza reCAPTCHA użytkownicy będą musieli rozwiązywać obrazki.
              </p>
            </div>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? (
            <>Zapisywanie...</>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              Zapisz ustawienia zabezpieczeń
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

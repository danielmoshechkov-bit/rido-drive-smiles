import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Checkbox } from './ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from './ui/use-toast';
import { Mail, Send, Save, Eye, Server } from 'lucide-react';
import { Badge } from './ui/badge';

interface EmailSettingsData {
  id: string;
  smtp_provider: string;
  sender_name: string;
  sender_email: string;
  registration_subject: string;
  registration_template: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_secure: boolean;
}

export function EmailSettings() {
  const [settings, setSettings] = useState<EmailSettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('email_settings')
        .select('*')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .single();

      if (error) throw error;
      setSettings(data as EmailSettingsData);
    } catch (error) {
      console.error('Error fetching email settings:', error);
      toast({
        title: 'Błąd',
        description: 'Nie udało się pobrać ustawień email',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('email_settings')
        .update({
          sender_name: settings.sender_name,
          sender_email: settings.sender_email,
          registration_subject: settings.registration_subject,
          registration_template: settings.registration_template,
          smtp_host: settings.smtp_host,
          smtp_port: settings.smtp_port,
          smtp_user: settings.smtp_user,
          smtp_secure: settings.smtp_secure,
        })
        .eq('id', settings.id);

      if (error) throw error;

      toast({
        title: 'Zapisano',
        description: 'Ustawienia poczty zostały zapisane',
      });
    } catch (error) {
      console.error('Error saving email settings:', error);
      toast({
        title: 'Błąd',
        description: 'Nie udało się zapisać ustawień',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleSendTest = async () => {
    if (!testEmail || !settings) {
      toast({
        title: 'Błąd',
        description: 'Wprowadź adres email do testu',
        variant: 'destructive',
      });
      return;
    }

    setSendingTest(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-registration-email', {
        body: {
          email: testEmail,
          first_name: 'Jan',
          last_name: 'Testowy',
          activation_link: 'https://getrido.pl/auth?test=1',
          is_test: true,
        },
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: 'Wysłano',
          description: `Testowy email został wysłany na ${testEmail}`,
        });
      } else {
        throw new Error(data?.error || 'Błąd wysyłki');
      }
    } catch (error: any) {
      console.error('Error sending test email:', error);
      toast({
        title: 'Błąd wysyłki',
        description: error.message || 'Nie udało się wysłać testowego emaila',
        variant: 'destructive',
      });
    } finally {
      setSendingTest(false);
    }
  };

  const getPreviewHtml = () => {
    if (!settings) return '';
    return settings.registration_template
      .replace(/\{\{first_name\}\}/g, 'Jan')
      .replace(/\{\{last_name\}\}/g, 'Testowy')
      .replace(/\{\{email\}\}/g, 'jan@example.com')
      .replace(/\{\{activation_link\}\}/g, 'https://getrido.pl/auth?token=xyz');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!settings) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Nie znaleziono ustawień email
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Konfiguracja serwera SMTP
          </CardTitle>
          <CardDescription>
            Ustawienia serwera pocztowego do wysyłki maili
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* SMTP Status */}
          <div className="p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="secondary">SMTP</Badge>
              <span className="text-sm text-muted-foreground">Serwer pocztowy getrido.pl</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Emaile są wysyłane bezpośrednio z serwera getrido.pl. 
              Hasło do skrzynki kontakt@getrido.pl jest zapisane w Supabase secrets.
            </p>
          </div>

          {/* SMTP Settings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="smtp_host">Serwer SMTP *</Label>
              <Input
                id="smtp_host"
                value={settings.smtp_host || 'getrido.pl'}
                onChange={(e) => setSettings({ ...settings, smtp_host: e.target.value })}
                placeholder="getrido.pl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp_port">Port SMTP *</Label>
              <Input
                id="smtp_port"
                type="number"
                value={settings.smtp_port || 587}
                onChange={(e) => setSettings({ ...settings, smtp_port: parseInt(e.target.value) || 587 })}
                placeholder="587"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="smtp_user">Login SMTP (email) *</Label>
              <Input
                id="smtp_user"
                value={settings.smtp_user || 'kontakt@getrido.pl'}
                onChange={(e) => setSettings({ ...settings, smtp_user: e.target.value })}
                placeholder="kontakt@getrido.pl"
              />
            </div>
            <div className="space-y-2 flex items-end">
              <label className="flex items-center gap-2 h-10">
                <Checkbox
                  checked={settings.smtp_secure !== false}
                  onCheckedChange={(checked) => setSettings({ ...settings, smtp_secure: Boolean(checked) })}
                />
                <span className="text-sm">Użyj szyfrowania TLS</span>
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Ustawienia nadawcy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="sender_name">Nazwa nadawcy *</Label>
              <Input
                id="sender_name"
                value={settings.sender_name}
                onChange={(e) => setSettings({ ...settings, sender_name: e.target.value })}
                placeholder="RIDO"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sender_email">Email nadawcy *</Label>
              <Input
                id="sender_email"
                type="email"
                value={settings.sender_email}
                onChange={(e) => setSettings({ ...settings, sender_email: e.target.value })}
                placeholder="kontakt@getrido.pl"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Szablon maila rejestracyjnego</CardTitle>
          <CardDescription>
            Ten email zostanie wysłany do kierowcy po rejestracji z linkiem aktywacyjnym
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="registration_subject">Temat wiadomości *</Label>
            <Input
              id="registration_subject"
              value={settings.registration_subject}
              onChange={(e) => setSettings({ ...settings, registration_subject: e.target.value })}
              placeholder="Potwierdź rejestrację w RIDO"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="registration_template">Treść wiadomości (HTML) *</Label>
            <Textarea
              id="registration_template"
              value={settings.registration_template}
              onChange={(e) => setSettings({ ...settings, registration_template: e.target.value })}
              className="min-h-[200px] font-mono text-sm"
              placeholder="<h1>Witaj {{first_name}}!</h1>..."
            />
          </div>

          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-sm font-medium mb-2">Dostępne zmienne:</p>
            <div className="flex flex-wrap gap-2">
              <code className="px-2 py-1 bg-background rounded text-xs">{'{{first_name}}'}</code>
              <code className="px-2 py-1 bg-background rounded text-xs">{'{{last_name}}'}</code>
              <code className="px-2 py-1 bg-background rounded text-xs">{'{{email}}'}</code>
              <code className="px-2 py-1 bg-background rounded text-xs">{'{{activation_link}}'}</code>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setShowPreview(!showPreview)}
              className="gap-2"
            >
              <Eye className="h-4 w-4" />
              {showPreview ? 'Ukryj podgląd' : 'Pokaż podgląd'}
            </Button>
          </div>

          {showPreview && (
            <div className="border rounded-lg p-4 bg-background">
              <p className="text-sm text-muted-foreground mb-2">Podgląd z przykładowymi danymi:</p>
              <div 
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: getPreviewHtml() }}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Test wysyłki</CardTitle>
          <CardDescription>
            Wyślij testowy email, aby sprawdzić konfigurację SMTP
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="twoj-email@test.pl"
              className="max-w-xs"
            />
            <Button
              onClick={handleSendTest}
              disabled={sendingTest || !testEmail}
              variant="outline"
              className="gap-2"
            >
              <Send className="h-4 w-4" />
              {sendingTest ? 'Wysyłanie...' : 'Wyślij test'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? 'Zapisywanie...' : 'Zapisz ustawienia'}
        </Button>
      </div>
    </div>
  );
}

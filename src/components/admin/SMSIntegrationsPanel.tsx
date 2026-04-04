import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MessageSquare, Key, Phone, Send, CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface SMSSettings {
  id: string;
  provider: string;
  api_url: string | null;
  api_key_secret_name: string | null;
  sender_name: string | null;
  is_active: boolean;
}

const SMS_PROVIDERS = [
  { value: 'justsend', label: 'JustSend (Digital Virgo)', apiUrl: 'https://justsend.io/api/sender/bulk/send' },
  { value: 'smsapi', label: 'SMSAPI.pl (legacy)', apiUrl: 'https://api.smsapi.pl/sms.do' },
  { value: 'serwersms', label: 'SerwerSMS.pl', apiUrl: 'https://api2.serwersms.pl/messages/send_sms' },
  { value: 'twilio', label: 'Twilio', apiUrl: 'https://api.twilio.com/2010-04-01/Accounts' },
  { value: 'custom', label: 'Własne API', apiUrl: '' },
];

const DEFAULT_PROVIDER = 'justsend';
const DEFAULT_PROVIDER_CONFIG = SMS_PROVIDERS.find((provider) => provider.value === DEFAULT_PROVIDER)!;
const sanitizeSenderName = (value: string) => value.replace(/[^a-zA-Z0-9.\-]/g, '').slice(0, 11);

export const SMSIntegrationsPanel = () => {
  const [settings, setSettings] = useState<SMSSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [formData, setFormData] = useState({
    provider: DEFAULT_PROVIDER,
    api_url: DEFAULT_PROVIDER_CONFIG.apiUrl,
    sender_name: 'GetRido.pl',
    is_active: false,
  });

  const activeProvider = useMemo(
    () => SMS_PROVIDERS.find((provider) => provider.value === formData.provider) || DEFAULT_PROVIDER_CONFIG,
    [formData.provider]
  );

  useEffect(() => {
    void fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase.from('sms_settings') as any)
        .select('id, provider, api_url, api_key_secret_name, api_key, sender_name, is_active')
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const provider = data.provider || DEFAULT_PROVIDER;
        const providerConfig = SMS_PROVIDERS.find((item) => item.value === provider) || DEFAULT_PROVIDER_CONFIG;

        setSettings(data as SMSSettings);
        setFormData({
          provider,
          api_url: data.api_url || providerConfig.apiUrl || '',
          sender_name: data.sender_name || 'GetRido.pl',
          is_active: Boolean(data.is_active),
        });
      } else {
        setSettings(null);
        setFormData({
          provider: DEFAULT_PROVIDER,
          api_url: DEFAULT_PROVIDER_CONFIG.apiUrl,
          sender_name: 'GetRido.pl',
          is_active: false,
        });
      }
    } catch (error) {
      console.error('Error fetching SMS settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProviderChange = (provider: string) => {
    const providerConfig = SMS_PROVIDERS.find((item) => item.value === provider);
    setFormData((prev) => ({
      ...prev,
      provider,
      api_url: provider === 'custom' ? prev.api_url : providerConfig?.apiUrl || '',
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const providerConfig = SMS_PROVIDERS.find((item) => item.value === formData.provider);
      const senderClean = sanitizeSenderName(formData.sender_name || 'GetRido.pl');
      const updateData: Record<string, any> = {
        provider: formData.provider,
        api_url: formData.provider === 'custom'
          ? formData.api_url.trim()
          : (providerConfig?.apiUrl || formData.api_url.trim()),
        sender_name: senderClean,
        is_active: formData.is_active,
        api_key_secret_name: 'SMSAPI_TOKEN',
        updated_at: new Date().toISOString(),
      };

      // Jeśli admin wpisał klucz API — zapisz go w bazie
      if (apiKey.trim()) {
        updateData.api_key = apiKey.trim();
      }

      // Use .from() with type assertion to handle columns not in generated types
      const { data: existing } = await (supabase.from('sms_settings') as any)
        .select('id')
        .limit(1)
        .maybeSingle();

      let error: any;
      if (existing?.id) {
        const res = await (supabase.from('sms_settings') as any)
          .update(updateData)
          .eq('id', existing.id);
        error = res.error;
      } else {
        const res = await (supabase.from('sms_settings') as any)
          .insert(updateData);
        error = res.error;
      }

      if (error) throw error;

      setApiKey('');
      setSettings((prev) => ({
        id: prev?.id || '',
        provider: updateData.provider,
        api_url: updateData.api_url,
        api_key_secret_name: updateData.api_key_secret_name,
        sender_name: updateData.sender_name,
        is_active: Boolean(updateData.is_active),
      }));
      setFormData((prev) => ({
        ...prev,
        provider: updateData.provider,
        api_url: updateData.api_url,
        sender_name: senderClean,
        is_active: Boolean(updateData.is_active),
      }));
      toast({
        title: 'Zapisano',
        description: 'Ustawienia SMS zostały zapisane w portalu i działają globalnie.',
      });
    } catch (error: any) {
      console.error('Error saving SMS settings:', error);
      toast({
        title: 'Błąd',
        description: error?.message || 'Nie udało się zapisać ustawień SMS',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestSMS = async () => {
    if (!testPhone.trim()) {
      toast({
        title: 'Błąd',
        description: 'Podaj numer telefonu do testu',
        variant: 'destructive',
      });
      return;
    }

    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-sms', {
        body: {
          phone: testPhone,
          message: `Test SMS z portalu GetRido — ${new Date().toLocaleTimeString('pl-PL')}.`,
          type: 'test',
          sender: formData.sender_name || 'GetRido.pl',
        },
      });

      if (error) throw error;
      if (data && !data.success) throw new Error(data.error || 'SMS nie został wysłany');

      toast({
        title: 'SMS wysłany ✓',
        description: `Wiadomość testowa została wysłana na ${testPhone}`,
      });
    } catch (error) {
      console.error('Test SMS error:', error);
      toast({
        title: 'Błąd',
        description: error instanceof Error ? error.message : 'Nie udało się wysłać testowego SMS',
        variant: 'destructive',
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-6 w-6 text-primary" />
              <div>
                <CardTitle>Integracja SMS</CardTitle>
                <CardDescription>
                  Konfiguracja bramki SMS do wysyłania powiadomień
                  <br />
                  <span className="text-xs font-normal text-muted-foreground">
                    Aktualny dostawca: {activeProvider.label} — nadawca: <strong>{formData.sender_name || 'GetRido.pl'}</strong>
                  </span>
                </CardDescription>
              </div>
            </div>
            <Badge variant={formData.is_active ? 'default' : 'secondary'}>
              {formData.is_active ? (
                <>
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Aktywne
                </>
              ) : (
                <>
                  <XCircle className="h-3 w-3 mr-1" />
                  Nieaktywne
                </>
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="provider">Dostawca SMS</Label>
            <Select value={formData.provider} onValueChange={handleProviderChange}>
              <SelectTrigger id="provider">
                <SelectValue placeholder="Wybierz dostawcę" />
              </SelectTrigger>
              <SelectContent>
                {SMS_PROVIDERS.map((provider) => (
                  <SelectItem key={provider.value} value={provider.value}>
                    {provider.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="api_url">URL API</Label>
            <Input
              id="api_url"
              value={formData.api_url}
              onChange={(e) => setFormData((prev) => ({ ...prev, api_url: e.target.value }))}
              placeholder="https://justsend.io/api/sender/bulk/send"
              disabled={formData.provider !== 'custom'}
            />
            <p className="text-xs text-muted-foreground">
              {formData.provider === 'custom'
                ? 'Dla własnego API możesz podać własny adres endpointu.'
                : 'Dla gotowych dostawców adres ustawia się automatycznie.'}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="api_key">
              <Key className="h-4 w-4 inline mr-2" />
              Klucz API
            </Label>
            <Input
              id="api_key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={((settings as any)?.api_key) ? '••••••••• (klucz zapisany)' : 'Klucz API'}
            />
            <p className="text-xs text-muted-foreground">
              {settings?.api_key_secret_name
                ? 'Klucz API jest już zapisany. Wpisz nowy, aby go zaktualizować.'
                : 'Wprowadź klucz API (App-Key) z panelu JustSend → Ustawienia → API.'}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sender_name">Nazwa nadawcy (max 11 znaków)</Label>
            <Input
              id="sender_name"
              value={formData.sender_name}
              onChange={(e) => setFormData((prev) => ({ ...prev, sender_name: e.target.value.slice(0, 11) }))}
              placeholder="GetRido.pl"
              maxLength={11}
            />
            <p className="text-xs text-muted-foreground">
              Alias nadawcy musi być wcześniej dodany w panelu JustSend. Maksymalnie 11 znaków, bez polskich znaków.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Aktywuj integrację SMS</Label>
              <p className="text-sm text-muted-foreground">
                Po aktywacji ustawienia będą używane globalnie we wszystkich wysyłkach SMS.
              </p>
            </div>
            <Switch
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, is_active: checked }))}
            />
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Zapisywanie...
              </>
            ) : (
              'Zapisz ustawienia'
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Send className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">Test SMS</CardTitle>
              <CardDescription>
                Wyślij testową wiadomość SMS, aby sprawdzić bieżącą konfigurację portalu
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="test_phone">
              <Phone className="h-4 w-4 inline mr-2" />
              Numer telefonu
            </Label>
            <Input
              id="test_phone"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="+48 123 456 789"
            />
          </div>
          <Button
            onClick={handleTestSMS}
            disabled={testing || !formData.is_active}
            variant="outline"
            className="w-full"
          >
            {testing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Wysyłanie...
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Wyślij testowy SMS
              </>
            )}
          </Button>
          {!formData.is_active && (
            <p className="text-xs text-muted-foreground text-center">
              Aktywuj integrację SMS, aby wysłać wiadomość testową.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

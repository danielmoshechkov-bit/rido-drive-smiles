import { useState, useEffect } from 'react';
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

export const SMSIntegrationsPanel = () => {
  const [settings, setSettings] = useState<SMSSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [formData, setFormData] = useState({
    provider: 'justsend',
    api_url: '',
    sender_name: 'GetRido.pl',
    is_active: false,
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('sms_settings')
        .select('*')
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (data) {
        setSettings(data);
        setFormData({
          provider: data.provider || 'smsapi',
          api_url: data.api_url || '',
          sender_name: data.sender_name || 'RIDO',
          is_active: data.is_active || false,
        });
      }
    } catch (error) {
      console.error('Error fetching SMS settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleProviderChange = (provider: string) => {
    const providerConfig = SMS_PROVIDERS.find(p => p.value === provider);
    setFormData({
      ...formData,
      provider,
      api_url: providerConfig?.apiUrl || '',
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updateData = {
        provider: formData.provider,
        api_url: formData.api_url,
        sender_name: formData.sender_name,
        is_active: formData.is_active,
        api_key_secret_name: apiKey ? 'SMS_API_KEY' : settings?.api_key_secret_name,
        updated_at: new Date().toISOString(),
      };

      if (settings?.id) {
        const { error } = await supabase
          .from('sms_settings')
          .update(updateData)
          .eq('id', settings.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('sms_settings')
          .insert(updateData);

        if (error) throw error;
      }

      toast({
        title: 'Zapisano',
        description: 'Ustawienia SMS zostały zaktualizowane',
      });

      if (apiKey) {
        toast({
          title: 'Uwaga',
          description: 'Klucz API należy dodać jako sekret w Supabase Edge Functions',
          variant: 'default',
        });
      }

      fetchSettings();
    } catch (error) {
      console.error('Error saving SMS settings:', error);
      toast({
        title: 'Błąd',
        description: 'Nie udało się zapisać ustawień',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestSMS = async () => {
    if (!testPhone) {
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
          message: `Test SMS z portalu GetRido — ${new Date().toLocaleTimeString('pl-PL')}. Integracja JustSend dziala poprawnie.`,
          type: 'test',
          sender: formData.sender_name || 'GetRido.pl',
        },
      });

      if (error) throw error;
      if (data && !data.success) throw new Error(data.error || 'SMS nie został wysłany');

      toast({
        title: 'SMS wysłany ✓',
        description: `Wiadomość testowa wysłana na ${testPhone} z nadawcą ${formData.sender_name}`,
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
                  Aktualny dostawca: JustSend (Digital Virgo) — nadawca: <strong>{formData.sender_name}</strong>
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
          {/* Provider Selection */}
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

          {/* API URL */}
          <div className="space-y-2">
            <Label htmlFor="api_url">URL API</Label>
            <Input
              id="api_url"
              value={formData.api_url}
              onChange={(e) => setFormData({ ...formData, api_url: e.target.value })}
              placeholder="https://api.smsapi.pl/sms.do"
              disabled={formData.provider !== 'custom'}
            />
          </div>

          {/* API Key */}
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
              placeholder={settings?.api_key_secret_name ? '••••••••••••••••' : 'Wprowadź klucz API'}
            />
            {settings?.api_key_secret_name && (
              <p className="text-xs text-muted-foreground">
                Klucz jest już skonfigurowany jako sekret: {settings.api_key_secret_name}
              </p>
            )}
          </div>

          {/* Sender Name */}
          <div className="space-y-2">
            <Label htmlFor="sender_name">Nazwa nadawcy (max 11 znaków)</Label>
            <Input
              id="sender_name"
              value={formData.sender_name}
              onChange={(e) => setFormData({ ...formData, sender_name: e.target.value.slice(0, 11) })}
              placeholder="GetRido.pl"
              maxLength={11}
            />
            <p className="text-xs text-muted-foreground">
              Alias nadawcy musi być wcześniej dodany w panelu JustSend (new.justsend.pl). Max 11 znaków, bez polskich znaków.
            </p>
          </div>

          {/* Active Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <Label>Aktywuj integrację SMS</Label>
              <p className="text-sm text-muted-foreground">
                Po aktywacji powiadomienia SMS będą wysyłane automatycznie
              </p>
            </div>
            <Switch
              checked={formData.is_active}
              onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
            />
          </div>

          {/* Save Button */}
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

      {/* Test SMS Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Send className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">Test SMS</CardTitle>
              <CardDescription>
                Wyślij testową wiadomość SMS aby sprawdzić konfigurację
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
              Aktywuj integrację SMS aby wysłać wiadomość testową
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

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

const SINGLETON_ID = 'f5b6a6bd-ab3c-4bfb-bdcd-98dd545908ff';

const SMS_PROVIDERS = [
  { value: 'justsend', label: 'JustSend (Digital Virgo)', apiUrl: 'https://justsend.io/api/sender/bulk/send' },
  { value: 'smsapi', label: 'SMSAPI.pl (legacy)', apiUrl: 'https://api.smsapi.pl/sms.do' },
  { value: 'serwersms', label: 'SerwerSMS.pl', apiUrl: 'https://api2.serwersms.pl/messages/send_sms' },
];

const DEFAULT_PROVIDER = 'justsend';
const sanitizeSenderName = (value: string) => value.replace(/[^a-zA-Z0-9.\-]/g, '').slice(0, 11);

export const SMSIntegrationsPanel = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testPhone, setTestPhone] = useState('');
  const [provider, setProvider] = useState(DEFAULT_PROVIDER);
  const [apiKey, setApiKey] = useState('');
  const [senderName, setSenderName] = useState('GetRido.pl');
  const [isActive, setIsActive] = useState(false);
  const [hasExistingKey, setHasExistingKey] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase.from('sms_settings') as any)
        .select('id, provider, api_key, sender_name, is_active')
        .eq('id', SINGLETON_ID)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setProvider(data.provider || DEFAULT_PROVIDER);
        setSenderName(data.sender_name || 'GetRido.pl');
        setIsActive(Boolean(data.is_active));
        setHasExistingKey(Boolean(data.api_key));
      }
    } catch (err: any) {
      console.error('Fetch SMS settings error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const cleanSender = sanitizeSenderName(senderName || 'GetRido.pl') || 'GetRido.pl';
      const selectedProvider = SMS_PROVIDERS.find(p => p.value === provider);
      
      const payload: Record<string, any> = {
        id: SINGLETON_ID,
        provider,
        api_url: selectedProvider?.apiUrl || '',
        sender_name: cleanSender,
        is_active: isActive,
        updated_at: new Date().toISOString(),
      };

      if (apiKey.trim()) {
        payload.api_key = apiKey.trim();
      }

      // Try upsert first, fallback to check-then-insert/update
      const { error } = await (supabase.from('sms_settings') as any).upsert(payload, {
        onConflict: 'id',
      });

      if (error) throw error;

      setHasExistingKey(Boolean(apiKey.trim()) || hasExistingKey);
      setApiKey('');
      setSenderName(cleanSender);

      toast({
        title: 'Zapisano ✓',
        description: 'Ustawienia SMS zostały zapisane pomyślnie.',
      });
    } catch (err: any) {
      console.error('Save SMS settings error:', err);
      toast({
        title: 'Błąd zapisu',
        description: err.message || 'Nie udało się zapisać ustawień SMS',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestSMS = async () => {
    if (!testPhone.trim()) {
      toast({ title: 'Błąd', description: 'Podaj numer telefonu do testu', variant: 'destructive' });
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-sms', {
        body: {
          phone: testPhone,
          message: `Test SMS z portalu GetRido — ${new Date().toLocaleTimeString('pl-PL')}.`,
          type: 'test',
          sender: senderName || 'GetRido.pl',
        },
      });
      if (error) throw error;
      if (data && !data.success) throw new Error(data.error || 'SMS nie został wysłany');
      toast({ title: 'SMS wysłany ✓', description: `Wiadomość testowa wysłana na ${testPhone}` });
    } catch (err: any) {
      toast({ title: 'Błąd', description: err.message || 'Nie udało się wysłać SMS', variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  const activeProviderLabel = SMS_PROVIDERS.find(p => p.value === provider)?.label || provider;

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
                </CardDescription>
              </div>
            </div>
            <Badge variant={isActive ? 'default' : 'secondary'}>
              {isActive ? (
                <><CheckCircle className="h-3 w-3 mr-1" /> Aktywne</>
              ) : (
                <><XCircle className="h-3 w-3 mr-1" /> Nieaktywne</>
              )}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Dostawca SMS</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger><SelectValue placeholder="Wybierz dostawcę" /></SelectTrigger>
              <SelectContent>
                {SMS_PROVIDERS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label><Key className="h-4 w-4 inline mr-2" />Klucz API</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasExistingKey ? '••••••••• (klucz zapisany — wpisz nowy aby zmienić)' : 'Wklej klucz API'}
            />
          </div>

          <div className="space-y-2">
            <Label>Nazwa nadawcy (max 11 znaków)</Label>
            <Input
              value={senderName}
              onChange={(e) => setSenderName(e.target.value.slice(0, 11))}
              placeholder="GetRido.pl"
              maxLength={11}
            />
            <p className="text-xs text-muted-foreground">
              Bez polskich znaków. Alias musi być dodany w panelu dostawcy.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label>Aktywuj integrację SMS</Label>
              <p className="text-sm text-muted-foreground">
                Używana globalnie we wszystkich wysyłkach SMS portalu.
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Zapisywanie...</> : 'Zapisz ustawienia'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Send className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">Test SMS</CardTitle>
              <CardDescription>Wyślij testową wiadomość aby sprawdzić konfigurację</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label><Phone className="h-4 w-4 inline mr-2" />Numer telefonu</Label>
            <Input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} placeholder="+48 123 456 789" />
          </div>
          <Button onClick={handleTestSMS} disabled={testing || !isActive} variant="outline" className="w-full">
            {testing ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Wysyłanie...</> : <><Send className="h-4 w-4 mr-2" /> Wyślij testowy SMS</>}
          </Button>
          {!isActive && <p className="text-xs text-muted-foreground text-center">Aktywuj integrację, aby wysłać test.</p>}
        </CardContent>
      </Card>
    </div>
  );
};

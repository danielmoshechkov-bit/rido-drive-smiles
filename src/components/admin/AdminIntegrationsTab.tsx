import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plug, TestTube, Save, Car } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function AdminIntegrationsTab() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [integration, setIntegration] = useState<any>(null);
  const [config, setConfig] = useState({
    endpoint_url: 'https://www.regcheck.org.uk/api/reg.asmx/CheckPoland',
    username: '',
    test_mode: false,
  });
  const [isEnabled, setIsEnabled] = useState(false);

  useEffect(() => {
    fetchIntegration();
  }, []);

  const fetchIntegration = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('portal_integrations')
      .select('*')
      .eq('key', 'regcheck_poland')
      .maybeSingle();

    if (data) {
      setIntegration(data);
      setIsEnabled(data.is_enabled || false);
      const cfg = (data.config_json || {}) as Record<string, any>;
      setConfig({
        endpoint_url: cfg.endpoint_url || 'https://www.regcheck.org.uk/api/reg.asmx/CheckPoland',
        username: cfg.username || '',
        test_mode: cfg.test_mode || false,
      });
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('portal_integrations')
        .update({
          is_enabled: isEnabled,
          config_json: config,
          updated_at: new Date().toISOString(),
        })
        .eq('key', 'regcheck_poland');

      if (error) throw error;
      toast.success('Ustawienia integracji zapisane');
      await fetchIntegration();
    } catch (e: any) {
      toast.error('Błąd zapisu: ' + (e?.message || ''));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!config.username) {
      toast.error('Podaj login do API');
      return;
    }
    setTesting(true);
    try {
      // Test with a simple request via edge function
      const { data, error } = await supabase.functions.invoke('vehicle-check', {
        body: { action: 'check-registration', registrationNumber: 'TEST123' },
      });

      const status = error ? 'error' : (data?.error ? 'error' : 'ok');
      const message = error?.message || data?.message || 'Połączenie udane';

      await supabase
        .from('portal_integrations')
        .update({
          last_test_status: status,
          last_test_date: new Date().toISOString(),
        })
        .eq('key', 'regcheck_poland');

      if (status === 'ok') {
        toast.success('Test połączenia udany');
      } else {
        toast.info(`Test: ${message}`);
      }
      await fetchIntegration();
    } catch (e: any) {
      toast.error('Błąd testu: ' + (e?.message || ''));
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plug className="h-5 w-5" />
          Integracje
        </CardTitle>
        <CardDescription>Zewnętrzne integracje portalu</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Car className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-base">Integracja pojazdów – RegCheck Poland</CardTitle>
                  <CardDescription>Pobieranie danych pojazdu po numerze rejestracyjnym</CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {integration?.last_test_status && (
                  <Badge variant={integration.last_test_status === 'ok' ? 'default' : 'secondary'}>
                    {integration.last_test_status === 'ok' ? 'Połączony' : 'Błąd'}
                  </Badge>
                )}
                <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Endpoint URL</Label>
                <Input
                  value={config.endpoint_url}
                  onChange={e => setConfig(p => ({ ...p, endpoint_url: e.target.value }))}
                  placeholder="https://www.regcheck.org.uk/api/reg.asmx/CheckPoland"
                />
              </div>
              <div className="space-y-2">
                <Label>Login / Username do API</Label>
                <Input
                  value={config.username}
                  onChange={e => setConfig(p => ({ ...p, username: e.target.value }))}
                  placeholder="Twój login RegCheck"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={config.test_mode}
                onCheckedChange={v => setConfig(p => ({ ...p, test_mode: v }))}
              />
              <Label>Tryb testowy</Label>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Zapisz
              </Button>
              <Button variant="outline" onClick={handleTest} disabled={testing} className="gap-2">
                {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
                Testuj połączenie
              </Button>
            </div>
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );
}

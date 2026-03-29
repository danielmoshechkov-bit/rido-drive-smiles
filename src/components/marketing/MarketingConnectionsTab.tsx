import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plug, Facebook, Chrome, Loader2, CheckCircle, XCircle } from 'lucide-react';

interface ConnectionFields {
  [key: string]: string;
}

export function MarketingConnectionsTab() {
  const [metaFields, setMetaFields] = useState<ConnectionFields>({
    app_id: '', app_secret: '', access_token: '', ad_account_id: '', business_manager_id: '', pixel_id: '',
  });
  const [googleFields, setGoogleFields] = useState<ConnectionFields>({
    developer_token: '', client_id: '', client_secret: '', refresh_token: '', customer_id: '', ga4_property_id: '',
  });
  const [metaStatus, setMetaStatus] = useState<'connected' | 'disconnected' | 'error'>('disconnected');
  const [googleStatus, setGoogleStatus] = useState<'connected' | 'disconnected' | 'error'>('disconnected');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    const { data } = await supabase.from('agency_api_connections').select('*').eq('account_type', 'getrido');
    if (data) {
      data.forEach((conn: any) => {
        if (conn.connection_type === 'meta') {
          setMetaFields(conn.encrypted_data || {});
          setMetaStatus(conn.status || 'disconnected');
        } else if (conn.connection_type === 'google') {
          setGoogleFields(conn.encrypted_data || {});
          setGoogleStatus(conn.status || 'disconnected');
        }
      });
    }
  };

  const saveConnection = async (type: 'meta' | 'google') => {
    setSaving(true);
    const fields = type === 'meta' ? metaFields : googleFields;
    const { data: existing } = await supabase
      .from('agency_api_connections')
      .select('id')
      .eq('connection_type', type)
      .eq('account_type', 'getrido')
      .maybeSingle();

    if (existing) {
      await supabase.from('agency_api_connections').update({
        encrypted_data: fields,
        status: 'connected',
      }).eq('id', existing.id);
    } else {
      await supabase.from('agency_api_connections').insert({
        connection_type: type,
        account_type: 'getrido',
        encrypted_data: fields,
        status: 'connected',
      });
    }

    if (type === 'meta') setMetaStatus('connected');
    else setGoogleStatus('connected');
    toast.success(`Połączenie ${type === 'meta' ? 'Meta' : 'Google'} zapisane`);
    setSaving(false);
  };

  const StatusBadge = ({ status }: { status: string }) => (
    <Badge variant={status === 'connected' ? 'default' : status === 'error' ? 'destructive' : 'secondary'} className="gap-1">
      {status === 'connected' ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {status === 'connected' ? 'Połączono' : status === 'error' ? 'Błąd' : 'Nie połączono'}
    </Badge>
  );

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Konto GetRido — własne reklamy portalu</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Meta */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Facebook className="h-5 w-5 text-blue-600" />
                Meta Business (Facebook / Instagram)
              </CardTitle>
              <StatusBadge status={metaStatus} />
            </div>
            <CardDescription>Podłącz konto reklamowe Meta Ads</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { key: 'app_id', label: 'Meta App ID' },
              { key: 'app_secret', label: 'Meta App Secret' },
              { key: 'access_token', label: 'Access Token (Long-lived)' },
              { key: 'ad_account_id', label: 'Ad Account ID (act_XXX)' },
              { key: 'business_manager_id', label: 'Business Manager ID' },
              { key: 'pixel_id', label: 'Pixel ID' },
            ].map(f => (
              <div key={f.key}>
                <Label className="text-xs">{f.label}</Label>
                <Input
                  type="password"
                  value={metaFields[f.key] || ''}
                  onChange={(e) => setMetaFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.label}
                  className="mt-1"
                />
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <Button onClick={() => saveConnection('meta')} disabled={saving} className="flex-1">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Zapisz i połącz
              </Button>
              <Button variant="outline" onClick={() => toast.info('Test połączenia — wkrótce')}>
                Testuj
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Google */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Chrome className="h-5 w-5 text-red-500" />
                Google Ads
              </CardTitle>
              <StatusBadge status={googleStatus} />
            </div>
            <CardDescription>Podłącz konto Google Ads</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { key: 'developer_token', label: 'Developer Token' },
              { key: 'client_id', label: 'Client ID' },
              { key: 'client_secret', label: 'Client Secret' },
              { key: 'refresh_token', label: 'Refresh Token' },
              { key: 'customer_id', label: 'Customer ID (XXX-XXX-XXXX)' },
              { key: 'ga4_property_id', label: 'GA4 Property ID' },
            ].map(f => (
              <div key={f.key}>
                <Label className="text-xs">{f.label}</Label>
                <Input
                  type="password"
                  value={googleFields[f.key] || ''}
                  onChange={(e) => setGoogleFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.label}
                  className="mt-1"
                />
              </div>
            ))}
            <div className="flex gap-2 pt-2">
              <Button onClick={() => saveConnection('google')} disabled={saving} className="flex-1">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Zapisz i połącz
              </Button>
              <Button variant="outline" onClick={() => toast.info('Test połączenia — wkrótce')}>
                Testuj
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
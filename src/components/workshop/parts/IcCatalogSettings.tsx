import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, TestTube, Info, RefreshCw, Save } from 'lucide-react';
import { useIcCatalogIntegration, useUpsertIcCatalogIntegration, useIcCatalogSync } from '@/hooks/useWorkshopParts';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { pl } from 'date-fns/locale';

interface Props {
  providerId: string;
}

export function IcCatalogSettings({ providerId }: Props) {
  const { data: integration, isLoading } = useIcCatalogIntegration(providerId);
  const upsert = useUpsertIcCatalogIntegration();
  const icSync = useIcCatalogSync();

  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    if (integration) {
      setClientId(integration.ic_client_id || '');
      setClientSecret(integration.ic_client_secret || '');
    }
  }, [integration]);

  const handleSave = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      toast.error('Podaj Client ID i Client Secret');
      return;
    }
    await upsert.mutateAsync({
      provider_id: providerId,
      ic_client_id: clientId.trim(),
      ic_client_secret: clientSecret.trim(),
    });
  };

  const handleTest = async () => {
    if (!clientId.trim() || !clientSecret.trim()) {
      toast.error('Najpierw zapisz dane dostępowe');
      return;
    }
    setIsTesting(true);
    try {
      // Save first
      await upsert.mutateAsync({
        provider_id: providerId,
        ic_client_id: clientId.trim(),
        ic_client_secret: clientSecret.trim(),
      });
      const res = await icSync.mutateAsync({
        action: 'test_connection',
        provider_id: providerId,
      });
      toast.success(res.message || 'Połączenie OK!');
    } catch (err: any) {
      toast.error(err.message || 'Błąd połączenia');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSyncCatalog = async () => {
    setIsSyncing(true);
    try {
      const res = await icSync.mutateAsync({
        action: 'sync_catalog',
        provider_id: providerId,
      });
      toast.success(`Zsynchronizowano ${res.synced || 0} produktów`);
    } catch (err: any) {
      toast.error(err.message || 'Błąd synchronizacji');
    } finally {
      setIsSyncing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm text-muted-foreground">Ładowanie ustawień IC...</span>
      </div>
    );
  }

  const status = integration?.last_sync_status || 'pending';

  return (
    <div className="space-y-4 border rounded-lg p-4">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        🔧 Inter Cars — katalog do wyszukiwania po nazwie
      </h3>

      <div className="flex items-start gap-2 rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/30 dark:border-blue-800 px-3 py-2">
        <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
        <p className="text-xs text-blue-700 dark:text-blue-300">
          Każdy warsztat łączy się własnym kontem Inter Cars. Twoje dane dostępowe są bezpieczne i używane tylko do pobierania katalogu części.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label className="text-xs">Client ID (OAuth2)</Label>
          <Input
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            placeholder="Uzyskasz od opiekuna handlowego IC lub icapi@intercars.eu"
            className="text-xs"
          />
        </div>
        <div>
          <Label className="text-xs">Client Secret (OAuth2)</Label>
          <Input
            type="password"
            value={clientSecret}
            onChange={e => setClientSecret(e.target.value)}
            placeholder="Tajny klucz OAuth2"
            className="text-xs"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={handleTest} disabled={isTesting}>
          {isTesting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <TestTube className="h-3 w-3 mr-1" />}
          Testuj połączenie
        </Button>
        <Button size="sm" onClick={handleSave} disabled={upsert.isPending}>
          {upsert.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
          Zapisz
        </Button>
        {status === 'ok' && (
          <Button variant="outline" size="sm" onClick={handleSyncCatalog} disabled={isSyncing}>
            {isSyncing ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
            Synchronizuj katalog
          </Button>
        )}
      </div>

      {/* Status */}
      <div className="flex items-center gap-2 text-xs">
        {status === 'ok' && (
          <>
            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
              <CheckCircle2 className="h-3 w-3 mr-1" /> Połączono
            </Badge>
            <span className="text-muted-foreground">
              Katalog: {integration?.catalog_size || 0} produktów
              {integration?.last_sync_at && (
                <> · Ostatnia sync: {formatDistanceToNow(new Date(integration.last_sync_at), { addSuffix: true, locale: pl })}</>
              )}
            </span>
          </>
        )}
        {status === 'syncing' && (
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Synchronizacja w toku...
          </Badge>
        )}
        {status === 'error' && (
          <>
            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
              <XCircle className="h-3 w-3 mr-1" /> Błąd
            </Badge>
            {integration?.last_sync_error && (
              <span className="text-red-600 text-[10px]">{integration.last_sync_error}</span>
            )}
          </>
        )}
        {status === 'pending' && (
          <Badge variant="outline" className="bg-muted text-muted-foreground">
            Nie skonfigurowano
          </Badge>
        )}
      </div>
    </div>
  );
}

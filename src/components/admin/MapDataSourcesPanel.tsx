// GetRido Maps - Admin Data Sources Panel
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Database, MapPin, AlertTriangle, Users, Radio, Car, RefreshCw, CheckCircle, XCircle } from 'lucide-react';

interface DataSources {
  osm_poi: boolean;
  partner_poi: boolean;
  overpass_incidents: boolean;
  community_reports: boolean;
  static_hazards: boolean;
  fleet_live: boolean;
}

const DEFAULT_SOURCES: DataSources = {
  osm_poi: true,
  partner_poi: true,
  overpass_incidents: true,
  community_reports: true,
  static_hazards: true,
  fleet_live: false,
};

const SOURCE_INFO = [
  { key: 'osm_poi', label: 'OSM POI', desc: 'Punkty zainteresowań z OpenStreetMap (stacje, sklepy, parkingi)', icon: MapPin },
  { key: 'partner_poi', label: 'Partner POI', desc: 'Własne punkty partnerskie (z tabeli map_poi_partners)', icon: Database },
  { key: 'overpass_incidents', label: 'Overpass Incidents', desc: 'Roboty drogowe i zamknięcia z Overpass API', icon: AlertTriangle },
  { key: 'community_reports', label: 'Community Reports', desc: 'Zgłoszenia użytkowników (policja, wypadki, korki)', icon: Users },
  { key: 'static_hazards', label: 'Static Hazards', desc: 'Fotoradary i kamery (tabela map_static_hazards)', icon: Radio },
  { key: 'fleet_live', label: 'Fleet Live', desc: 'Pozycje kierowców na żywo (lokalizacje floty)', icon: Car },
] as const;

export function MapDataSourcesPanel() {
  const queryClient = useQueryClient();
  const [sources, setSources] = useState<DataSources>(DEFAULT_SOURCES);
  const [testResults, setTestResults] = useState<Record<string, 'ok' | 'error' | 'testing' | null>>({});

  // Fetch current config
  const { data: config, isLoading } = useQuery({
    queryKey: ['maps-config-sources'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maps_config')
        .select('data_sources')
        .limit(1)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      return (data?.data_sources as unknown as DataSources) || null;
    },
  });

  useEffect(() => {
    if (config) {
      setSources({ ...DEFAULT_SOURCES, ...config });
    }
  }, [config]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (newSources: DataSources) => {
      const { data: existing } = await supabase
        .from('maps_config')
        .select('id')
        .limit(1)
        .single();

      if (existing) {
        const { error } = await supabase
          .from('maps_config')
          .update({ data_sources: newSources as unknown as any })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('maps_config')
          .insert([{ config_key: 'main', config_value: 'main', data_sources: newSources as unknown as any }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maps-config-sources'] });
      toast.success('Źródła danych zapisane');
    },
    onError: () => {
      toast.error('Błąd zapisu');
    },
  });

  const handleToggle = (key: keyof DataSources) => {
    setSources(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = () => {
    saveMutation.mutate(sources);
  };

  // Test connectivity
  const testSource = async (key: string) => {
    setTestResults(prev => ({ ...prev, [key]: 'testing' }));
    
    try {
      switch (key) {
        case 'osm_poi':
        case 'overpass_incidents':
          // Test Overpass API
          const resp = await fetch('https://overpass-api.de/api/status');
          setTestResults(prev => ({ ...prev, [key]: resp.ok ? 'ok' : 'error' }));
          break;
        case 'partner_poi':
          const { error: poiErr } = await supabase.from('map_poi_partners').select('id').limit(1);
          setTestResults(prev => ({ ...prev, [key]: poiErr ? 'error' : 'ok' }));
          break;
        case 'community_reports':
          const { error: repErr } = await supabase.from('map_reports').select('id').limit(1);
          setTestResults(prev => ({ ...prev, [key]: repErr ? 'error' : 'ok' }));
          break;
        case 'static_hazards':
          const { error: hazErr } = await supabase.from('map_static_hazards').select('id').limit(1);
          setTestResults(prev => ({ ...prev, [key]: hazErr ? 'error' : 'ok' }));
          break;
        case 'fleet_live':
          const { error: locErr } = await supabase.from('driver_locations').select('id').limit(1);
          setTestResults(prev => ({ ...prev, [key]: locErr ? 'error' : 'ok' }));
          break;
        default:
          setTestResults(prev => ({ ...prev, [key]: 'ok' }));
      }
    } catch {
      setTestResults(prev => ({ ...prev, [key]: 'error' }));
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Źródła danych mapy
          </CardTitle>
          <CardDescription>
            Włącz lub wyłącz poszczególne źródła danych wyświetlanych na mapie GetRido
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {SOURCE_INFO.map(({ key, label, desc, icon: Icon }) => (
            <div key={key} className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <Label htmlFor={key} className="text-sm font-medium">{label}</Label>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {/* Test button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => testSource(key)}
                  disabled={testResults[key] === 'testing'}
                  className="h-8 px-2"
                >
                  {testResults[key] === 'testing' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : testResults[key] === 'ok' ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : testResults[key] === 'error' ? (
                    <XCircle className="h-4 w-4 text-red-500" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
                {/* Toggle */}
                <Switch
                  id={key}
                  checked={sources[key as keyof DataSources]}
                  onCheckedChange={() => handleToggle(key as keyof DataSources)}
                />
              </div>
            </div>
          ))}

          <div className="flex justify-end pt-4">
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Zapisz ustawienia
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Statystyki danych</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard label="Partner POI" table="map_poi_partners" />
            <StatCard label="Community Reports" table="map_reports" />
            <StatCard label="Static Hazards" table="map_static_hazards" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, table }: { label: string; table: string }) {
  const { data: count, isLoading } = useQuery({
    queryKey: ['table-count', table],
    queryFn: async () => {
      const { count, error } = await supabase
        .from(table as any)
        .select('*', { count: 'exact', head: true });
      if (error) return 0;
      return count || 0;
    },
  });

  return (
    <div className="p-3 bg-muted/30 rounded-lg text-center">
      <p className="text-2xl font-bold">{isLoading ? '...' : count}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export default MapDataSourcesPanel;

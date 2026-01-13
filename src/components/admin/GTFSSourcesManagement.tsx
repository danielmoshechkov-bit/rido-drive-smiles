import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  Bus, 
  Plus, 
  RefreshCw, 
  Trash2, 
  Globe, 
  Database,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2
} from "lucide-react";
import { format } from "date-fns";
import { pl } from "date-fns/locale";

interface GTFSSource {
  id: string;
  name: string;
  description: string | null;
  source_type: 'url' | 'api' | 'aggregator';
  source_url: string | null;
  api_endpoint: string | null;
  region: string | null;
  country: string | null;
  is_enabled: boolean;
  supports_realtime: boolean;
  last_sync_at: string | null;
  sync_interval_hours: number;
  config: Record<string, unknown>;
  created_at: string;
}

const SOURCE_TYPE_LABELS: Record<string, { label: string; icon: typeof Globe }> = {
  url: { label: 'URL (GTFS Static)', icon: Globe },
  api: { label: 'API', icon: Database },
  aggregator: { label: 'Agregator', icon: Database },
};

export function GTFSSourcesManagement() {
  const [sources, setSources] = useState<GTFSSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newSource, setNewSource] = useState<{
    name: string;
    description: string;
    source_type: 'url' | 'api' | 'aggregator';
    source_url: string;
    region: string;
    country: string;
  }>({
    name: '',
    description: '',
    source_type: 'url',
    source_url: '',
    region: '',
    country: 'PL',
  });

  useEffect(() => {
    fetchSources();
  }, []);

  const fetchSources = async () => {
    try {
      const { data, error } = await supabase
        .from('gtfs_data_sources')
        .select('*')
        .order('name');

      if (error) throw error;
      setSources((data as GTFSSource[]) || []);
    } catch (error) {
      console.error('Error fetching GTFS sources:', error);
      toast.error('Błąd pobierania źródeł GTFS');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleEnabled = async (source: GTFSSource) => {
    try {
      const { error } = await supabase
        .from('gtfs_data_sources')
        .update({ is_enabled: !source.is_enabled })
        .eq('id', source.id);

      if (error) throw error;

      setSources(prev =>
        prev.map(s => s.id === source.id ? { ...s, is_enabled: !s.is_enabled } : s)
      );
      
      toast.success(source.is_enabled ? 'Źródło wyłączone' : 'Źródło włączone');
    } catch (error) {
      console.error('Error toggling source:', error);
      toast.error('Błąd aktualizacji źródła');
    }
  };

  const handleSync = async (source: GTFSSource) => {
    setSyncing(source.id);
    try {
      // TODO: Implement actual GTFS sync logic
      // For now, just update the last_sync_at timestamp
      const { error } = await supabase
        .from('gtfs_data_sources')
        .update({ last_sync_at: new Date().toISOString() })
        .eq('id', source.id);

      if (error) throw error;

      setSources(prev =>
        prev.map(s => s.id === source.id ? { ...s, last_sync_at: new Date().toISOString() } : s)
      );
      
      toast.success(`Synchronizacja ${source.name} zakończona`);
    } catch (error) {
      console.error('Error syncing source:', error);
      toast.error('Błąd synchronizacji');
    } finally {
      setSyncing(null);
    }
  };

  const handleAddSource = async () => {
    if (!newSource.name) {
      toast.error('Nazwa jest wymagana');
      return;
    }

    try {
      const { error } = await supabase
        .from('gtfs_data_sources')
        .insert({
          name: newSource.name,
          description: newSource.description || null,
          source_type: newSource.source_type,
          source_url: newSource.source_url || null,
          region: newSource.region || null,
          country: newSource.country || 'PL',
          is_enabled: false,
        });

      if (error) throw error;

      toast.success('Źródło GTFS dodane');
      setShowAddDialog(false);
      setNewSource({
        name: '',
        description: '',
        source_type: 'url',
        source_url: '',
        region: '',
        country: 'PL',
      });
      fetchSources();
    } catch (error) {
      console.error('Error adding source:', error);
      toast.error('Błąd dodawania źródła');
    }
  };

  const handleDeleteSource = async (source: GTFSSource) => {
    if (!confirm(`Czy na pewno chcesz usunąć źródło "${source.name}"?`)) return;

    try {
      const { error } = await supabase
        .from('gtfs_data_sources')
        .delete()
        .eq('id', source.id);

      if (error) throw error;

      setSources(prev => prev.filter(s => s.id !== source.id));
      toast.success('Źródło usunięte');
    } catch (error) {
      console.error('Error deleting source:', error);
      toast.error('Błąd usuwania źródła');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Bus className="h-6 w-6" />
            Źródła danych GTFS
          </h2>
          <p className="text-muted-foreground">
            Zarządzaj źródłami danych o komunikacji miejskiej (format GTFS)
          </p>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Dodaj źródło
        </Button>
      </div>

      {/* Sources Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Skonfigurowane źródła</CardTitle>
          <CardDescription>
            Lista źródeł danych GTFS z różnych miast i regionów
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sources.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bus className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>Brak skonfigurowanych źródeł GTFS</p>
              <Button variant="outline" className="mt-4" onClick={() => setShowAddDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Dodaj pierwsze źródło
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nazwa</TableHead>
                  <TableHead>Typ</TableHead>
                  <TableHead>Region</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Ostatnia sync.</TableHead>
                  <TableHead className="text-right">Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.map(source => {
                  const typeInfo = SOURCE_TYPE_LABELS[source.source_type];
                  const TypeIcon = typeInfo?.icon || Globe;
                  
                  return (
                    <TableRow key={source.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{source.name}</p>
                          {source.description && (
                            <p className="text-xs text-muted-foreground">{source.description}</p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1">
                          <TypeIcon className="h-3 w-3" />
                          {typeInfo?.label || source.source_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {source.region || '-'}
                          {source.country && ` (${source.country})`}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={source.is_enabled}
                            onCheckedChange={() => handleToggleEnabled(source)}
                          />
                          {source.is_enabled ? (
                            <Badge className="bg-green-500 text-white gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Aktywne
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1">
                              <XCircle className="h-3 w-3" />
                              Wyłączone
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {source.last_sync_at ? (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {format(new Date(source.last_sync_at), 'dd.MM.yyyy HH:mm', { locale: pl })}
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">Nigdy</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSync(source)}
                            disabled={syncing === source.id || !source.is_enabled}
                          >
                            {syncing === source.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteSource(source)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="p-2 rounded-lg bg-primary/10">
              <Bus className="h-5 w-5 text-primary" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-medium">O formacie GTFS</h4>
              <p className="text-sm text-muted-foreground">
                GTFS (General Transit Feed Specification) to standardowy format danych o transporcie 
                publicznym. Dane zawierają informacje o przystankach, liniach, rozkładach jazdy 
                i częstotliwości kursów. System automatycznie agreguje te dane do oceny lokalizacji 
                nieruchomości i generowania wskaźników komunikacyjnych dla AI.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add Source Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dodaj źródło GTFS</DialogTitle>
            <DialogDescription>
              Skonfiguruj nowe źródło danych o komunikacji miejskiej
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nazwa *</Label>
              <Input
                id="name"
                placeholder="np. ZTM Gdańsk"
                value={newSource.name}
                onChange={e => setNewSource(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Opis</Label>
              <Input
                id="description"
                placeholder="Krótki opis źródła"
                value={newSource.description}
                onChange={e => setNewSource(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="source_type">Typ źródła</Label>
              <Select
                value={newSource.source_type}
                onValueChange={(value: 'url' | 'api' | 'aggregator') => 
                  setNewSource(prev => ({ ...prev, source_type: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="url">URL (GTFS Static)</SelectItem>
                  <SelectItem value="api">API</SelectItem>
                  <SelectItem value="aggregator">Agregator</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="source_url">URL źródła</Label>
              <Input
                id="source_url"
                placeholder="https://example.com/gtfs.zip"
                value={newSource.source_url}
                onChange={e => setNewSource(prev => ({ ...prev, source_url: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="region">Region</Label>
                <Input
                  id="region"
                  placeholder="np. Gdańsk"
                  value={newSource.region}
                  onChange={e => setNewSource(prev => ({ ...prev, region: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">Kraj</Label>
                <Input
                  id="country"
                  placeholder="PL"
                  value={newSource.country}
                  onChange={e => setNewSource(prev => ({ ...prev, country: e.target.value }))}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Anuluj
            </Button>
            <Button onClick={handleAddSource}>
              <Plus className="h-4 w-4 mr-2" />
              Dodaj źródło
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

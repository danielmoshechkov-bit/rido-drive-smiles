import { useState } from 'react';
import { Search, Plus, FileText, Upload, Download, Users, Car, Send, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

interface DocumentsManagementProps {
  cityId: string;
  cityName: string;
}

// Built-in templates that are always available
const BUILT_IN_TEMPLATES = [
  {
    id: 'builtin-umowa-najmu',
    name: 'Umowa najmu pojazdu',
    code: 'RENTAL_CONTRACT',
    version: '1.0',
    enabled: true,
    created_at: '2026-01-01T00:00:00Z',
    description: 'Umowa najmu pojazdu §1-§7 z polami: dane Najemcy (partner flotowy), Wynajmujący (kierowca/właściciel auta), przedmiot umowy, cel, okres, czynsz, obowiązki, odpowiedzialność podatkowa, postanowienia końcowe.',
    required_fields: ['driver_data', 'vehicle_data', 'fleet_data', 'contract_date'],
    builtin: true,
  },
];

interface DriverOption {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
}

export const DocumentsManagement = ({ cityId, cityName }: DocumentsManagementProps) => {
  const [activeTab, setActiveTab] = useState('templates');
  const [searchTerm, setSearchTerm] = useState('');
  const [sendDialog, setSendDialog] = useState<{ templateCode: string; templateName: string } | null>(null);
  const [selectedDriverIds, setSelectedDriverIds] = useState<string[]>([]);
  const [sendToAll, setSendToAll] = useState(false);
  const [driverSearch, setDriverSearch] = useState('');

  // Fetch drivers for the fleet
  const { data: drivers = [] } = useQuery({
    queryKey: ['fleet-drivers-docs', cityId],
    queryFn: async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.user) return [] as DriverOption[];
      
      const { data: fleetData } = await (supabase as any)
        .from('fleets')
        .select('id')
        .eq('owner_id', session.session.user.id)
        .maybeSingle();

      if (!fleetData) return [] as DriverOption[];

      const { data } = await (supabase as any)
        .from('drivers')
        .select('id, first_name, last_name')
        .eq('fleet_id', fleetData.id)
        .order('last_name');

      return (data || []) as DriverOption[];
    },
  });

  // Fetch sent document requests
  const { data: sentRequests = [], refetch: refetchRequests } = useQuery({
    queryKey: ['document-requests', cityId],
    queryFn: async () => {
      const { data } = await supabase
        .from('driver_document_requests' as any)
        .select('*')
        .order('created_at', { ascending: false });
      return (data || []) as any[];
    },
  });

  const allTemplates = [...BUILT_IN_TEMPLATES];

  const filteredTemplates = allTemplates.filter(template =>
    template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    template.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredDrivers = drivers.filter(d =>
    `${d.first_name} ${d.last_name}`.toLowerCase().includes(driverSearch.toLowerCase())
  );

  const handleSendToDrivers = async () => {
    if (!sendDialog) return;
    const targetDrivers = sendToAll ? drivers.map(d => d.id) : selectedDriverIds;

    if (targetDrivers.length === 0) {
      toast.error('Wybierz co najmniej jednego kierowcę');
      return;
    }

    try {
      // Create document requests for each driver
      const requests = targetDrivers.map(driverId => ({
        driver_id: driverId,
        template_code: sendDialog.templateCode,
        template_name: sendDialog.templateName,
        status: 'pending',
        fleet_id: cityId, // using cityId as fleet context
      }));

      const { error } = await supabase
        .from('driver_document_requests' as any)
        .insert(requests);

      if (error) throw error;

      toast.success(`Wysłano ${targetDrivers.length} zaproszeń do wypełnienia dokumentów`);
      setSendDialog(null);
      setSelectedDriverIds([]);
      setSendToAll(false);
      refetchRequests();
    } catch (error: any) {
      // Table might not exist yet - show info
      toast.info('Funkcja wysyłania dokumentów zostanie uruchomiona po utworzeniu tabeli w bazie danych');
      setSendDialog(null);
    }
  };

  const toggleDriverSelection = (driverId: string) => {
    setSelectedDriverIds(prev =>
      prev.includes(driverId)
        ? prev.filter(id => id !== driverId)
        : [...prev, driverId]
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Dokumenty - {cityName}
            </CardTitle>
          </div>
        </CardHeader>

        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="templates">Szablony dokumentów</TabsTrigger>
              <TabsTrigger value="sent">Wysłane do kierowców</TabsTrigger>
              <TabsTrigger value="completed">Podpisane dokumenty</TabsTrigger>
            </TabsList>

            {/* Templates Tab */}
            <TabsContent value="templates" className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="relative flex-1 min-w-[300px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder="Szukaj szablonów..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-3">
                {filteredTemplates.map((template) => (
                  <div key={template.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h3 className="font-semibold">{template.name}</h3>
                          <Badge variant="default">Aktywny</Badge>
                          <Badge variant="outline" className="text-xs">v{template.version}</Badge>
                          {template.builtin && (
                            <Badge variant="secondary" className="text-xs">Wbudowany</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {template.description}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Kod: {template.code}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="default"
                          size="sm"
                          className="gap-1"
                          onClick={() => setSendDialog({ templateCode: template.code, templateName: template.name })}
                        >
                          <Send className="h-4 w-4" />
                          Wyślij do kierowcy
                        </Button>
                        <Button variant="outline" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            {/* Sent Tab */}
            <TabsContent value="sent" className="space-y-4">
              {sentRequests.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-muted-foreground">Brak wysłanych dokumentów do wypełnienia</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Przejdź do zakładki "Szablony" i wyślij dokument do kierowcy
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {sentRequests.map((req: any) => {
                    const driver = drivers.find(d => d.id === req.driver_id);
                    return (
                      <div key={req.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-sm">{req.template_name}</h3>
                              <Badge variant={req.status === 'completed' ? 'default' : req.status === 'in_progress' ? 'secondary' : 'outline'}>
                                {req.status === 'completed' ? 'Wypełniony' : req.status === 'in_progress' ? 'W trakcie' : 'Oczekujący'}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">
                              Kierowca: {driver ? `${driver.first_name} ${driver.last_name}` : req.driver_id}
                            </p>
                            {req.created_at && (
                              <p className="text-xs text-muted-foreground">
                                Wysłano: {format(new Date(req.created_at), 'dd.MM.yyyy HH:mm', { locale: pl })}
                              </p>
                            )}
                          </div>
                          {req.status === 'completed' && (
                            <Button variant="outline" size="sm" className="gap-1">
                              <Download className="h-4 w-4" />
                              Pobierz PDF
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Completed Documents Tab */}
            <TabsContent value="completed" className="space-y-4">
              <div className="text-center py-8">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <p className="text-muted-foreground">Brak podpisanych dokumentów</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Podpisane dokumenty pojawią się tutaj po wypełnieniu ich przez kierowców
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Send to Drivers Dialog */}
      <Dialog open={!!sendDialog} onOpenChange={(open) => !open && setSendDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">
              Wyślij "{sendDialog?.templateName}" do kierowców
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Kierowca po zalogowaniu zobaczy powiadomienie o konieczności wypełnienia dokumentu. 
              System przeprowadzi go przez uzupełnianie danych krok po kroku, a na końcu wygeneruje gotową umowę do podpisu.
            </p>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="send-to-all"
                checked={sendToAll}
                onCheckedChange={(checked) => {
                  setSendToAll(checked as boolean);
                  if (checked) setSelectedDriverIds(drivers.map(d => d.id));
                  else setSelectedDriverIds([]);
                }}
              />
              <Label htmlFor="send-to-all" className="font-medium">Wyślij do wszystkich kierowców ({drivers.length})</Label>
            </div>

            {!sendToAll && (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder="Szukaj kierowcy..."
                    value={driverSearch}
                    onChange={(e) => setDriverSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="max-h-[250px] overflow-y-auto space-y-1 border rounded-lg p-2">
                  {filteredDrivers.map(driver => (
                    <label
                      key={driver.id}
                      className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedDriverIds.includes(driver.id)}
                        onCheckedChange={() => toggleDriverSelection(driver.id)}
                      />
                      <span className="text-sm">{driver.first_name} {driver.last_name}</span>
                    </label>
                  ))}
                  {filteredDrivers.length === 0 && (
                    <p className="text-center text-sm text-muted-foreground py-4">Brak kierowców</p>
                  )}
                </div>
              </>
            )}

            {(sendToAll || selectedDriverIds.length > 0) && (
              <p className="text-xs text-muted-foreground">
                Wybrano: {sendToAll ? drivers.length : selectedDriverIds.length} kierowców
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendDialog(null)}>Anuluj</Button>
            <Button onClick={handleSendToDrivers} className="gap-1">
              <Send className="h-4 w-4" />
              Wyślij ({sendToAll ? drivers.length : selectedDriverIds.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

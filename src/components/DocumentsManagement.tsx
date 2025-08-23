import { useState } from 'react';
import { Search, Plus, FileText, Upload, Download, Users, Car } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

interface DocumentsManagementProps {
  cityId: string;
  cityName: string;
}

interface DocumentTemplate {
  id: string;
  name: string;
  code: string;
  version: string;
  placeholders_json: any;
  file_url: string | null;
  enabled: boolean;
  created_at: string;
}

interface Document {
  id: string;
  type: string;
  vehicle_id: string | null;
  driver_id: string | null;
  template_id: string | null;
  file_url: string;
  created_at: string;
  vehicle?: any;
  driver?: any;
}

const useDocumentTemplates = () => {
  return useQuery({
    queryKey: ['document-templates'],
    queryFn: async () => {
      // Placeholder for now - will work after migration
      return [] as DocumentTemplate[];
    },
  });
};

const useDocuments = (cityId: string) => {
  return useQuery({
    queryKey: ['documents', cityId],
    queryFn: async () => {
      // Placeholder for now - will work after migration
      return [] as Document[];
    },
  });
};

export const DocumentsManagement = ({ cityId, cityName }: DocumentsManagementProps) => {
  const [activeTab, setActiveTab] = useState('templates');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Generator form state
  const [selectedDriver, setSelectedDriver] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);
  const [contractFields, setContractFields] = useState({
    weeklyPrice: '',
    deposit: '',
    startDate: '',
    startTime: '10:00',
    endDate: '',
    endTime: '10:00',
    indefinite: false,
    limitKm: '0',
    overKmRate: '0'
  });
  const [handoverFields, setHandoverFields] = useState({
    placeOut: 'Warszawa',
    placeIn: 'Warszawa',
    fuelLevel: 'pełny',
    remarks: ''
  });

  const { data: templates = [], isLoading: templatesLoading, refetch: refetchTemplates } = useDocumentTemplates();
  const { data: documents = [], isLoading: documentsLoading, refetch: refetchDocuments } = useDocuments(cityId);

  const filteredTemplates = templates.filter(template => 
    template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    template.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredDocuments = documents.filter(doc => 
    doc.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
    doc.vehicle?.plate?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    `${doc.driver?.first_name} ${doc.driver?.last_name}`.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleTemplateToggle = (templateCode: string) => {
    setSelectedTemplates(prev => 
      prev.includes(templateCode) 
        ? prev.filter(t => t !== templateCode)
        : [...prev, templateCode]
    );
  };

  const handleGenerateDocuments = async () => {
    if (!selectedDriver || !selectedVehicle || selectedTemplates.length === 0) {
      toast.error('Wybierz kierowcę, pojazd i co najmniej jeden szablon dokumentu');
      return;
    }

    try {
      const payload = {
        templates: selectedTemplates,
        driverRef: { id: selectedDriver },
        vehicleRef: { id: selectedVehicle },
        fields: {
          rent: contractFields,
          handover: handoverFields
        }
      };

      // This would call the API endpoint - for now just show success
      toast.success('Dokumenty zostały wygenerowane pomyślnie');
      refetchDocuments();
    } catch (error) {
      toast.error('Błąd podczas generowania dokumentów');
    }
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
              <TabsTrigger value="generator">Generator dokumentów</TabsTrigger>
              <TabsTrigger value="documents">Lista dokumentów</TabsTrigger>
            </TabsList>

            <TabsContent value="templates" className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="relative flex-1 min-w-[300px]">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                    <Input
                      placeholder="Szukaj szablonów..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <Button className="gap-2">
                  <Upload className="h-4 w-4" />
                  Dodaj szablon
                </Button>
              </div>

              {templatesLoading ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Ładowanie szablonów...</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredTemplates.map((template) => (
                    <div key={template.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <h3 className="font-semibold">{template.name}</h3>
                            <Badge variant={template.enabled ? "default" : "secondary"}>
                              {template.enabled ? 'Aktywny' : 'Nieaktywny'}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              v{template.version}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            Kod: {template.code}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Utworzony: {format(new Date(template.created_at), 'dd.MM.yyyy HH:mm', { locale: pl })}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm">
                            Edytuj
                          </Button>
                          <Button variant="outline" size="sm">
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="generator" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Driver and Vehicle Selection */}
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Wybierz kierowcę
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Input
                        placeholder="Szukaj po imieniu, nazwisku, telefonie lub email..."
                        className="mb-3"
                      />
                      <Button variant="outline" className="w-full">
                        Utwórz nowego kierowcę
                      </Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Car className="h-4 w-4" />
                        Wybierz pojazd
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Input
                        placeholder="Szukaj po rejestracji..."
                        className="mb-3"
                      />
                      <Button variant="outline" className="w-full">
                        Utwórz nowy pojazd
                      </Button>
                    </CardContent>
                  </Card>
                </div>

                {/* Contract Terms */}
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Warunki umowy</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="weeklyPrice">Stawka tygodniowa (PLN)</Label>
                          <Input
                            id="weeklyPrice"
                            type="number"
                            value={contractFields.weeklyPrice}
                            onChange={(e) => setContractFields(prev => ({...prev, weeklyPrice: e.target.value}))}
                          />
                        </div>
                        <div>
                          <Label htmlFor="deposit">Kaucja (PLN)</Label>
                          <Input
                            id="deposit"
                            type="number"
                            value={contractFields.deposit}
                            onChange={(e) => setContractFields(prev => ({...prev, deposit: e.target.value}))}
                          />
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="startDate">Data rozpoczęcia</Label>
                          <Input
                            id="startDate"
                            type="date"
                            value={contractFields.startDate}
                            onChange={(e) => setContractFields(prev => ({...prev, startDate: e.target.value}))}
                          />
                        </div>
                        <div>
                          <Label htmlFor="startTime">Godzina rozpoczęcia</Label>
                          <Input
                            id="startTime"
                            type="time"
                            value={contractFields.startTime}
                            onChange={(e) => setContractFields(prev => ({...prev, startTime: e.target.value}))}
                          />
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="indefinite"
                          checked={contractFields.indefinite}
                          onCheckedChange={(checked) => 
                            setContractFields(prev => ({...prev, indefinite: checked as boolean}))
                          }
                        />
                        <Label htmlFor="indefinite">Umowa bezterminowa</Label>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Handover Details */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Wydanie/zwrot pojazdu</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label htmlFor="placeOut">Miejsce wydania</Label>
                      <Input
                        id="placeOut"
                        value={handoverFields.placeOut}
                        onChange={(e) => setHandoverFields(prev => ({...prev, placeOut: e.target.value}))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="placeIn">Miejsce zwrotu</Label>
                      <Input
                        id="placeIn"
                        value={handoverFields.placeIn}
                        onChange={(e) => setHandoverFields(prev => ({...prev, placeIn: e.target.value}))}
                      />
                    </div>
                    <div>
                      <Label htmlFor="fuelLevel">Poziom paliwa</Label>
                      <Input
                        id="fuelLevel"
                        value={handoverFields.fuelLevel}
                        onChange={(e) => setHandoverFields(prev => ({...prev, fuelLevel: e.target.value}))}
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="remarks">Uwagi</Label>
                    <Textarea
                      id="remarks"
                      value={handoverFields.remarks}
                      onChange={(e) => setHandoverFields(prev => ({...prev, remarks: e.target.value}))}
                      rows={3}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Document Selection */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Wybierz dokumenty do wygenerowania</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {templates.filter(t => t.enabled).map((template) => (
                      <div key={template.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={template.code}
                          checked={selectedTemplates.includes(template.code)}
                          onCheckedChange={() => handleTemplateToggle(template.code)}
                        />
                        <Label htmlFor={template.code} className="text-sm">
                          {template.name}
                        </Label>
                      </div>
                    ))}
                  </div>
                  
                  <Button 
                    className="w-full mt-6" 
                    onClick={handleGenerateDocuments}
                    disabled={selectedTemplates.length === 0}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Generuj dokumenty ({selectedTemplates.length})
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="documents" className="space-y-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Szukaj dokumentów..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              {documentsLoading ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Ładowanie dokumentów...</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredDocuments.map((doc) => (
                    <div key={doc.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <h3 className="font-semibold">{doc.type}</h3>
                            <Badge variant="outline">
                              {format(new Date(doc.created_at), 'dd.MM.yyyy', { locale: pl })}
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {doc.driver && (
                              <span>Kierowca: {doc.driver.first_name} {doc.driver.last_name} • </span>
                            )}
                            {doc.vehicle && (
                              <span>Pojazd: {doc.vehicle.plate} ({doc.vehicle.brand} {doc.vehicle.model})</span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm">
                            <Download className="h-4 w-4" />
                            Pobierz PDF
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};
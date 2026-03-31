import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Send, Download, X, Users, Car, Loader2, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

interface FillAndSendPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: { id: string; name: string; content: string; code: string } | null;
  fleetId: string;
  onSent: () => void;
}

function extractFields(content: string): string[] {
  const matches = content.match(/\{\{([A-Z0-9_]+)\}\}/g);
  if (!matches) return [];
  return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))];
}

const FIELD_LABELS: Record<string, string> = {
  IMIE_NAZWISKO_KIEROWCY: 'Imię i nazwisko kierowcy',
  PESEL: 'PESEL',
  ADRES: 'Adres zamieszkania',
  ADRES_ZAMELDOWANIA: 'Adres zameldowania',
  NR_PRAWA_JAZDY: 'Nr prawa jazdy',
  NR_TELEFONU: 'Nr telefonu',
  EMAIL: 'E-mail',
  MARKA_POJAZDU: 'Marka pojazdu',
  MODEL_POJAZDU: 'Model pojazdu',
  NR_REJESTRACYJNY: 'Nr rejestracyjny',
  NR_VIN: 'Numer VIN',
  DATA_UMOWY: 'Data umowy',
  OKRES_NAJMU: 'Okres najmu',
  KWOTA_MIESIECZNA: 'Kwota miesięczna',
  KWOTA_TYGODNIOWA: 'Kwota tygodniowa',
  KWOTA_WYNAJMU: 'Kwota wynajmu',
  DATA_ROZPOCZECIA: 'Data rozpoczęcia',
  DATA_ZAKONCZENIA: 'Data zakończenia',
  NAZWA_FIRMY: 'Nazwa firmy',
  NIP_FIRMY: 'NIP firmy',
  ADRES_FIRMY: 'Adres firmy',
  REPREZENTANT: 'Reprezentant firmy',
};

export const FillAndSendPanel = ({ open, onOpenChange, template, fleetId, onSent }: FillAndSendPanelProps) => {
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>('');
  const [rentalPrice, setRentalPrice] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [mobileTab, setMobileTab] = useState<'form' | 'preview'>('form');

  const fields = useMemo(() => template ? extractFields(template.content) : [], [template?.content]);

  const { data: drivers = [] } = useQuery({
    queryKey: ['fleet-drivers-fill', fleetId],
    queryFn: async () => {
      const { data } = await supabase.from('drivers').select('id, first_name, last_name, pesel, address_street, address_city, address_postal_code, phone, email, license_number').eq('fleet_id', fleetId).order('last_name');
      return (data || []) as any[];
    },
    enabled: !!fleetId && open,
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ['fleet-vehicles-fill', fleetId],
    queryFn: async () => {
      const { data } = await supabase.from('vehicles').select('id, plate, brand, model, vin, year').eq('fleet_id', fleetId).order('plate');
      return data || [];
    },
    enabled: !!fleetId && open,
  });

  const handleDriverSelect = (driverId: string) => {
    setSelectedDriverId(driverId);
    const driver = drivers.find((d: any) => d.id === driverId);
    if (driver) {
      const updates: Record<string, string> = {};
      const fullAddr = [driver.address_street, driver.address_postal_code, driver.address_city].filter(Boolean).join(', ');
      if (fields.includes('IMIE_NAZWISKO_KIEROWCY')) updates['IMIE_NAZWISKO_KIEROWCY'] = `${driver.first_name} ${driver.last_name}`;
      if (fields.includes('PESEL')) updates['PESEL'] = driver.pesel || '';
      if (fields.includes('ADRES')) updates['ADRES'] = fullAddr;
      if (fields.includes('ADRES_ZAMELDOWANIA')) updates['ADRES_ZAMELDOWANIA'] = fullAddr;
      if (fields.includes('NR_PRAWA_JAZDY')) updates['NR_PRAWA_JAZDY'] = driver.license_number || '';
      if (fields.includes('NR_TELEFONU')) updates['NR_TELEFONU'] = driver.phone || '';
      if (fields.includes('EMAIL')) updates['EMAIL'] = driver.email || '';
      setFieldValues(prev => ({ ...prev, ...updates }));
    }
  };

  const handleVehicleSelect = (vehicleId: string) => {
    setSelectedVehicleId(vehicleId);
    const vehicle = vehicles.find((v: any) => v.id === vehicleId);
    if (vehicle) {
      const updates: Record<string, string> = {};
      if (fields.includes('MARKA_POJAZDU')) updates['MARKA_POJAZDU'] = vehicle.brand || '';
      if (fields.includes('MODEL_POJAZDU')) updates['MODEL_POJAZDU'] = vehicle.model || '';
      if (fields.includes('NR_REJESTRACYJNY')) updates['NR_REJESTRACYJNY'] = vehicle.plate || '';
      if (fields.includes('NR_VIN')) updates['NR_VIN'] = vehicle.vin || '';
      setFieldValues(prev => ({ ...prev, ...updates }));
    }
  };

  const filledContent = useMemo(() => {
    if (!template) return '';
    let content = template.content;
    for (const [key, value] of Object.entries(fieldValues)) {
      content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || `{{${key}}}`);
    }
    return content;
  }, [template?.content, fieldValues]);

  const highlightedPreview = useMemo(() => {
    return filledContent.replace(
      /\{\{([A-Z0-9_]+)\}\}/g,
      '<span style="background-color: #6C5CE730; color: #6C5CE7; padding: 2px 6px; border-radius: 4px; font-weight: 600;">{{$1}}</span>'
    );
  }, [filledContent]);

  const missingFields = fields.filter(f => !fieldValues[f]?.trim());

  const handleSend = async () => {
    if (missingFields.length > 0) {
      toast.error(`Uzupełnij brakujące pola: ${missingFields.map(f => FIELD_LABELS[f] || f).join(', ')}`);
      return;
    }
    if (!selectedDriverId) {
      toast.error('Wybierz kierowcę');
      return;
    }
    setIsSending(true);
    try {
      const { error } = await (supabase as any)
        .from('fleet_document_instances')
        .insert({
          template_id: template?.id || null,
          template_name: template?.name || '',
          fleet_id: fleetId,
          driver_id: selectedDriverId,
          vehicle_id: selectedVehicleId || null,
          filled_data: fieldValues,
          filled_content: filledContent,
          status: 'sent',
          sent_at: new Date().toISOString(),
          rental_price: rentalPrice ? parseFloat(rentalPrice) : null,
        });
      if (error) throw error;

      const driver = drivers.find((d: any) => d.id === selectedDriverId);
      try {
        await supabase.from('driver_document_requests' as any).insert({
          driver_id: selectedDriverId,
          template_code: template?.code || 'CUSTOM',
          template_name: template?.name || '',
          status: 'pending',
          fleet_id: fleetId,
          contract_date: fieldValues['DATA_UMOWY'] || new Date().toISOString().split('T')[0],
        });
      } catch {}

      toast.success(`Dokument wysłany do ${driver?.first_name || ''} ${driver?.last_name || ''}`);
      onSent();
      onOpenChange(false);
      resetState();
    } catch (err: any) {
      toast.error('Błąd wysyłki: ' + (err.message || ''));
    } finally {
      setIsSending(false);
    }
  };

  const handleDownloadPdf = () => {
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(`<html><head><title>${template?.name || 'Dokument'}</title><style>body{font-family:'Times New Roman',serif;max-width:700px;margin:40px auto;padding:20px;line-height:1.8;white-space:pre-wrap;}</style></head><body>${filledContent}</body></html>`);
      w.document.close();
      w.print();
    }
  };

  const resetState = () => {
    setFieldValues({});
    setSelectedDriverId('');
    setSelectedVehicleId('');
    setRentalPrice('');
  };

  if (!template) return null;

  const driverFields = fields.filter(f => ['IMIE_NAZWISKO_KIEROWCY', 'PESEL', 'ADRES', 'ADRES_ZAMELDOWANIA', 'NR_PRAWA_JAZDY', 'NR_TELEFONU', 'EMAIL'].includes(f));
  const vehicleFields = fields.filter(f => ['MARKA_POJAZDU', 'MODEL_POJAZDU', 'NR_REJESTRACYJNY', 'NR_VIN'].includes(f));
  const otherFields = fields.filter(f => !driverFields.includes(f) && !vehicleFields.includes(f));

  const FormContent = () => (
    <div className="space-y-6 p-4">
      <h3 className="font-semibold text-lg">Uzupełnij dane do dokumentu</h3>

      {driverFields.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="font-semibold text-sm flex items-center gap-2"><Users className="h-4 w-4" /> Dane kierowcy</Label>
          </div>
          <Select value={selectedDriverId} onValueChange={handleDriverSelect}>
            <SelectTrigger>
              <SelectValue placeholder="+ Wybierz kierowcę z listy" />
            </SelectTrigger>
            <SelectContent>
              {drivers.map((d: any) => (
                <SelectItem key={d.id} value={d.id}>{d.first_name} {d.last_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {driverFields.map(field => (
            <div key={field}>
              <Label className="text-xs text-muted-foreground">{FIELD_LABELS[field] || field}</Label>
              <Input
                value={fieldValues[field] || ''}
                onChange={(e) => setFieldValues(prev => ({ ...prev, [field]: e.target.value }))}
                placeholder={FIELD_LABELS[field] || field}
              />
            </div>
          ))}
        </div>
      )}

      {vehicleFields.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="font-semibold text-sm flex items-center gap-2"><Car className="h-4 w-4" /> Dane pojazdu</Label>
          </div>
          <Select value={selectedVehicleId} onValueChange={handleVehicleSelect}>
            <SelectTrigger>
              <SelectValue placeholder="+ Wybierz pojazd z listy" />
            </SelectTrigger>
            <SelectContent>
              {vehicles.map((v: any) => (
                <SelectItem key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {vehicleFields.map(field => (
            <div key={field}>
              <Label className="text-xs text-muted-foreground">{FIELD_LABELS[field] || field}</Label>
              <Input
                value={fieldValues[field] || ''}
                onChange={(e) => setFieldValues(prev => ({ ...prev, [field]: e.target.value }))}
                placeholder={FIELD_LABELS[field] || field}
              />
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-sm font-semibold">Kwota wynajmu (opcjonalnie)</Label>
        <Input
          type="number"
          placeholder="np. 500"
          value={rentalPrice}
          onChange={(e) => {
            setRentalPrice(e.target.value);
            if (fields.includes('KWOTA_WYNAJMU')) {
              setFieldValues(prev => ({ ...prev, KWOTA_WYNAJMU: e.target.value }));
            }
            if (fields.includes('KWOTA_MIESIECZNA')) {
              setFieldValues(prev => ({ ...prev, KWOTA_MIESIECZNA: e.target.value }));
            }
            if (fields.includes('KWOTA_TYGODNIOWA')) {
              setFieldValues(prev => ({ ...prev, KWOTA_TYGODNIOWA: e.target.value }));
            }
          }}
        />
        <p className="text-xs text-muted-foreground">Ta kwota zostanie przypisana do kierowcy po podpisaniu</p>
      </div>

      {otherFields.length > 0 && (
        <div className="space-y-3">
          <Label className="font-semibold text-sm">Pozostałe dane</Label>
          {otherFields.map(field => (
            <div key={field}>
              <Label className="text-xs text-muted-foreground">{FIELD_LABELS[field] || field.replace(/_/g, ' ')}</Label>
              <Input
                value={fieldValues[field] || ''}
                onChange={(e) => setFieldValues(prev => ({ ...prev, [field]: e.target.value }))}
                placeholder={FIELD_LABELS[field] || field}
                type={field.includes('DATA') ? 'date' : 'text'}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const PreviewContent = () => (
    <div className="p-4">
      <h3 className="font-semibold text-sm mb-3">Podgląd dokumentu</h3>
      <div
        className="border rounded-lg p-4 bg-white dark:bg-muted/30 whitespace-pre-wrap text-sm leading-relaxed font-serif min-h-[400px]"
        dangerouslySetInnerHTML={{ __html: highlightedPreview }}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetState(); onOpenChange(v); }}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {template.name}
            {missingFields.length > 0 && (
              <Badge variant="outline" className="text-orange-600 border-orange-300 text-xs">
                {missingFields.length} pól do uzupełnienia
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden hidden md:flex">
          <ScrollArea className="w-1/2 border-r">
            <FormContent />
          </ScrollArea>
          <ScrollArea className="w-1/2">
            <PreviewContent />
          </ScrollArea>
        </div>

        <div className="flex-1 overflow-hidden md:hidden">
          <Tabs value={mobileTab} onValueChange={(v) => setMobileTab(v as any)} className="h-full flex flex-col">
            <TabsList className="mx-4 mt-2 grid grid-cols-2">
              <TabsTrigger value="form">Formularz</TabsTrigger>
              <TabsTrigger value="preview">Podgląd</TabsTrigger>
            </TabsList>
            <TabsContent value="form" className="flex-1 overflow-auto">
              <FormContent />
            </TabsContent>
            <TabsContent value="preview" className="flex-1 overflow-auto">
              <PreviewContent />
            </TabsContent>
          </Tabs>
        </div>

        <div className="border-t px-6 py-3 flex items-center justify-between shrink-0 gap-2 flex-wrap">
          <Button variant="outline" onClick={() => { resetState(); onOpenChange(false); }} className="gap-1">
            <X className="h-4 w-4" /> Anuluj
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleDownloadPdf} className="gap-1">
              <Download className="h-4 w-4" /> Pobierz PDF
            </Button>
            <Button onClick={handleSend} disabled={isSending} style={{ backgroundColor: '#6C5CE7' }} className="gap-1">
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Wyślij do podpisu
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

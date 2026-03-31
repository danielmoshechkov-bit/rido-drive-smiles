import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Car, Users, Loader2, FileUp } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

interface UploadContractModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fleetId: string;
  onUploaded: () => void;
}

export const UploadContractModal = ({ open, onOpenChange, fleetId, onUploaded }: UploadContractModalProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [rentalPrice, setRentalPrice] = useState('');
  const [isUploading, setIsUploading] = useState(false);

  const { data: drivers = [] } = useQuery({
    queryKey: ['fleet-drivers-upload', fleetId],
    queryFn: async () => {
      const { data } = await supabase.from('drivers').select('id, first_name, last_name').eq('fleet_id', fleetId).order('last_name');
      return data || [];
    },
    enabled: !!fleetId && open,
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ['fleet-vehicles-upload', fleetId],
    queryFn: async () => {
      const { data } = await supabase.from('vehicles').select('id, plate, brand, model').eq('fleet_id', fleetId).order('plate');
      return data || [];
    },
    enabled: !!fleetId && open,
  });

  const handleUpload = async () => {
    if (!file) { toast.error('Wybierz plik umowy'); return; }
    if (!selectedDriverId) { toast.error('Wybierz kierowcę'); return; }

    setIsUploading(true);
    try {
      // Upload file to storage
      const ext = file.name.split('.').pop();
      const path = `${fleetId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('document-attachments')
        .upload(path, file);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('document-attachments')
        .getPublicUrl(path);

      const driver = drivers.find((d: any) => d.id === selectedDriverId);
      const vehicle = vehicles.find((v: any) => v.id === selectedVehicleId);

      // Create document instance
      const { error } = await (supabase as any)
        .from('fleet_document_instances')
        .insert({
          template_name: 'Umowa najmu (wgrana)',
          fleet_id: fleetId,
          driver_id: selectedDriverId,
          vehicle_id: selectedVehicleId || null,
          filled_content: `Wgrana umowa: ${file.name}`,
          filled_data: {
            file_url: urlData.publicUrl,
            file_name: file.name,
            driver_name: driver ? `${driver.first_name} ${driver.last_name}` : '',
            vehicle_plate: vehicle?.plate || '',
          },
          attachments: [{ url: urlData.publicUrl, name: file.name }],
          status: 'sent',
          sent_at: new Date().toISOString(),
          rental_price: rentalPrice ? parseFloat(rentalPrice) : null,
        });
      if (error) throw error;

      toast.success('Umowa wgrana i przypisana do kierowcy');
      onUploaded();
      onOpenChange(false);
      resetState();
    } catch (err: any) {
      toast.error('Błąd: ' + (err.message || 'Spróbuj ponownie'));
    } finally {
      setIsUploading(false);
    }
  };

  const resetState = () => {
    setFile(null);
    setSelectedDriverId('');
    setSelectedVehicleId('');
    setRentalPrice('');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetState(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5" /> Wgraj umowę najmu auta
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* File upload */}
          <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
            {file ? (
              <div className="flex items-center gap-2 justify-center">
                <Upload className="h-5 w-5 text-green-600" />
                <span className="text-sm font-medium">{file.name}</span>
                <Button variant="ghost" size="sm" onClick={() => setFile(null)} className="h-6 w-6 p-0 text-destructive">×</Button>
              </div>
            ) : (
              <>
                <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                <label>
                  <input type="file" accept=".pdf,.docx,.doc,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" />
                  <Button variant="outline" asChild className="cursor-pointer"><span>Wybierz plik</span></Button>
                </label>
                <p className="text-xs text-muted-foreground mt-2">PDF, DOCX, JPG (max 10MB)</p>
              </>
            )}
          </div>

          {/* Driver */}
          <div>
            <Label className="text-sm flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Kierowca</Label>
            <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
              <SelectTrigger><SelectValue placeholder="Wybierz kierowcę" /></SelectTrigger>
              <SelectContent>
                {drivers.map((d: any) => (
                  <SelectItem key={d.id} value={d.id}>{d.first_name} {d.last_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Vehicle */}
          <div>
            <Label className="text-sm flex items-center gap-1"><Car className="h-3.5 w-3.5" /> Pojazd</Label>
            <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId}>
              <SelectTrigger><SelectValue placeholder="Wybierz pojazd" /></SelectTrigger>
              <SelectContent>
                {vehicles.map((v: any) => (
                  <SelectItem key={v.id} value={v.id}>{v.plate} — {v.brand} {v.model}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Rental price */}
          <div>
            <Label className="text-sm">Kwota wynajmu (zł/tyg.)</Label>
            <Input type="number" placeholder="np. 500" value={rentalPrice} onChange={(e) => setRentalPrice(e.target.value)} />
            <p className="text-xs text-muted-foreground mt-1">Kwota zostanie przypisana po podpisaniu</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { resetState(); onOpenChange(false); }}>Anuluj</Button>
          <Button onClick={handleUpload} disabled={isUploading} style={{ backgroundColor: '#6C5CE7' }} className="gap-2">
            {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Wgraj i przypisz
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

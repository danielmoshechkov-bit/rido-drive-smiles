import { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { 
  Building2, 
  Search, 
  Loader2,
  Upload,
  CheckCircle,
  Image
} from 'lucide-react';

const ENTITY_TYPES = [
  { value: 'jdg', label: 'Jednoosobowa działalność gospodarcza (JDG)' },
  { value: 'sp_zoo', label: 'Spółka z o.o.' },
  { value: 'sp_jawna', label: 'Spółka jawna' },
  { value: 'sp_komandytowa', label: 'Spółka komandytowa' },
  { value: 'sa', label: 'Spółka akcyjna' },
  { value: 'other', label: 'Inna forma prawna' }
];

// Polish cities by postal code prefix (simplified)
const POSTAL_CODE_CITIES: Record<string, string> = {
  '00': 'Warszawa', '01': 'Warszawa', '02': 'Warszawa', '03': 'Warszawa', '04': 'Warszawa',
  '30': 'Kraków', '31': 'Kraków', '32': 'Kraków',
  '50': 'Wrocław', '51': 'Wrocław', '52': 'Wrocław', '53': 'Wrocław', '54': 'Wrocław',
  '60': 'Poznań', '61': 'Poznań', '62': 'Poznań',
  '80': 'Gdańsk', '81': 'Gdynia', '82': 'Gdańsk',
  '90': 'Łódź', '91': 'Łódź', '92': 'Łódź', '93': 'Łódź', '94': 'Łódź',
  '40': 'Katowice', '41': 'Katowice',
  '70': 'Szczecin', '71': 'Szczecin',
  '20': 'Lublin',
  '15': 'Białystok',
  '35': 'Rzeszów',
  '10': 'Olsztyn',
  '25': 'Kielce',
  '85': 'Bydgoszcz',
  '87': 'Toruń',
  '45': 'Opole',
  '65': 'Zielona Góra',
  '75': 'Koszalin',
};

interface EntityData {
  id?: string;
  name: string;
  type: string;
  nip: string;
  regon: string;
  address_street: string;
  address_building: string;
  address_apartment: string;
  address_city: string;
  address_postal_code: string;
  email: string;
  phone: string;
  bank_name: string;
  bank_account: string;
  logo_url: string;
  vat_payer: boolean;
}

interface CompanySetupWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (entity: { id: string; name: string }) => void;
  editEntity?: EntityData | null;
}

export function CompanySetupWizard({ open, onOpenChange, onCreated, editEntity }: CompanySetupWizardProps) {
  const [nip, setNip] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  const [formData, setFormData] = useState<EntityData>({
    name: '',
    type: 'jdg',
    nip: '',
    regon: '',
    address_street: '',
    address_building: '',
    address_apartment: '',
    address_city: '',
    address_postal_code: '',
    email: '',
    phone: '',
    bank_name: '',
    bank_account: '',
    logo_url: '',
    vat_payer: true
  });
  
  const [gusLoaded, setGusLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load edit data when editEntity changes
  useEffect(() => {
    if (editEntity) {
      // Parse address from combined field if needed
      let street = editEntity.address_street || '';
      let building = editEntity.address_building || '';
      let apartment = editEntity.address_apartment || '';
      
      // If only address_street exists and contains full address, try to parse
      if (street && !building) {
        const match = street.match(/^(.+?)\s+(\d+\w?)(\/(\d+\w?))?$/);
        if (match) {
          street = match[1];
          building = match[2];
          apartment = match[4] || '';
        }
      }
      
      setFormData({
        id: editEntity.id,
        name: editEntity.name || '',
        type: editEntity.type || 'jdg',
        nip: editEntity.nip || '',
        regon: editEntity.regon || '',
        address_street: street,
        address_building: building,
        address_apartment: apartment,
        address_city: editEntity.address_city || '',
        address_postal_code: editEntity.address_postal_code || '',
        email: editEntity.email || '',
        phone: editEntity.phone || '',
        bank_name: editEntity.bank_name || '',
        bank_account: editEntity.bank_account || '',
        logo_url: editEntity.logo_url || '',
        vat_payer: editEntity.vat_payer ?? true
      });
      setNip(editEntity.nip || '');
    } else {
      // Reset form for new entity
      setFormData({
        name: '',
        type: 'jdg',
        nip: '',
        regon: '',
        address_street: '',
        address_building: '',
        address_apartment: '',
        address_city: '',
        address_postal_code: '',
        email: '',
        phone: '',
        bank_name: '',
        bank_account: '',
        logo_url: '',
        vat_payer: true
      });
      setNip('');
      setGusLoaded(false);
    }
  }, [editEntity, open]);

  // Auto-suggest city based on postal code
  const handlePostalCodeChange = (value: string) => {
    // Format postal code: XX-XXX
    let formatted = value.replace(/\D/g, '');
    if (formatted.length > 2) {
      formatted = formatted.slice(0, 2) + '-' + formatted.slice(2, 5);
    }
    
    setFormData(prev => ({ ...prev, address_postal_code: formatted }));
    
    // Auto-suggest city
    if (formatted.length >= 2) {
      const prefix = formatted.slice(0, 2);
      const suggestedCity = POSTAL_CODE_CITIES[prefix];
      if (suggestedCity && !formData.address_city) {
        setFormData(prev => ({ ...prev, address_city: suggestedCity }));
      }
    }
  };

  const searchGUS = async () => {
    if (!nip || nip.length !== 10) {
      toast.error('NIP musi mieć 10 cyfr');
      return;
    }

    setIsSearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('registry-gus', {
        body: { nip }
      });

      if (error) throw error;

      if (data?.success && data?.data) {
        const gus = data.data;
        
        // Parse address from GUS
        let street = gus.address || '';
        let building = '';
        let apartment = '';
        
        const addressMatch = street.match(/^(.+?)\s+(\d+\w?)(\/(\d+\w?))?$/);
        if (addressMatch) {
          street = addressMatch[1];
          building = addressMatch[2];
          apartment = addressMatch[4] || '';
        }
        
        setFormData(prev => ({
          ...prev,
          name: gus.name || '',
          nip: gus.nip || nip,
          regon: gus.regon || '',
          address_street: street,
          address_building: building,
          address_apartment: apartment,
          address_city: gus.city || '',
          address_postal_code: gus.postalCode || ''
        }));
        setGusLoaded(true);
        toast.success('Dane pobrane z GUS');
      } else {
        toast.error(data?.error || 'Nie znaleziono firmy');
      }
    } catch (err) {
      console.error('GUS error:', err);
      toast.error('Błąd pobierania danych z GUS');
    } finally {
      setIsSearching(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Proszę wybrać plik obrazu');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error('Maksymalny rozmiar logo to 2MB');
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `logo-${Date.now()}.${fileExt}`;
      const filePath = `logos/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('entity-logos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('entity-logos')
        .getPublicUrl(filePath);

      setFormData(prev => ({ ...prev, logo_url: publicUrl }));
      toast.success('Logo przesłane');
    } catch (err) {
      console.error('Upload error:', err);
      toast.error('Błąd przesyłania logo');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name) {
      toast.error('Nazwa firmy jest wymagana');
      return;
    }
    
    if (!formData.address_building) {
      toast.error('Numer budynku jest wymagany');
      return;
    }

    setIsSaving(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        toast.error('Błąd autoryzacji. Spróbuj zalogować się ponownie.');
        setIsSaving(false);
        return;
      }

      // Combine address fields
      const fullStreet = formData.address_apartment 
        ? `${formData.address_street} ${formData.address_building}/${formData.address_apartment}`
        : `${formData.address_street} ${formData.address_building}`;

      const entityData = {
        name: formData.name.trim(),
        type: formData.type,
        nip: formData.nip?.trim() || null,
        regon: formData.regon?.trim() || null,
        address_street: fullStreet.trim() || null,
        address_city: formData.address_city?.trim() || null,
        address_postal_code: formData.address_postal_code?.trim() || null,
        email: formData.email?.trim() || null,
        phone: formData.phone?.trim() || null,
        bank_name: formData.bank_name?.trim() || null,
        bank_account: formData.bank_account?.trim() || null,
        logo_url: formData.logo_url || null,
        vat_payer: formData.vat_payer
      };

      let result;
      
      if (editEntity?.id) {
        // Update existing entity
        const { data, error } = await supabase
          .from('entities')
          .update(entityData)
          .eq('id', editEntity.id)
          .select('id, name')
          .single();
          
        if (error) throw error;
        result = data;
        toast.success('Dane firmy zaktualizowane');
      } else {
        // Create new entity
        const { data, error } = await supabase
          .from('entities')
          .insert(entityData)
          .select('id, name')
          .single();

        if (error) throw error;
        result = data;
        toast.success('Firma została dodana');
      }

      onCreated(result);
      onOpenChange(false);
      
      // Reset form
      setFormData({
        name: '',
        type: 'jdg',
        nip: '',
        regon: '',
        address_street: '',
        address_building: '',
        address_apartment: '',
        address_city: '',
        address_postal_code: '',
        email: '',
        phone: '',
        bank_name: '',
        bank_account: '',
        logo_url: '',
        vat_payer: true
      });
      setNip('');
      setGusLoaded(false);
    } catch (error: any) {
      console.error('Save error:', error);
      
      if (error.code === '42501') {
        toast.error('Brak uprawnień. Skontaktuj się z administratorem.');
      } else if (error.code === '23505') {
        toast.error('Firma o takim NIP już istnieje.');
      } else {
        toast.error(`Błąd zapisu: ${error.message}`);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const isEditMode = !!editEntity?.id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            {isEditMode ? 'Edytuj dane firmy' : 'Dodaj nową firmę'}
          </DialogTitle>
          <DialogDescription>
            {isEditMode 
              ? 'Zaktualizuj dane swojej firmy' 
              : 'Wprowadź dane firmy ręcznie lub pobierz automatycznie z GUS po NIP'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* GUS Search - only for new entities */}
          {!isEditMode && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-4">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground">Wpisz NIP, aby pobrać dane z GUS</Label>
                    <Input
                      value={nip}
                      onChange={(e) => setNip(e.target.value.replace(/\D/g, ''))}
                      placeholder="Wprowadź NIP (10 cyfr)"
                      maxLength={10}
                    />
                  </div>
                  <Button 
                    onClick={searchGUS} 
                    disabled={isSearching || nip.length !== 10}
                    className="self-end"
                  >
                    {isSearching ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <Search className="h-4 w-4 mr-2" />
                        Szukaj
                      </>
                    )}
                  </Button>
                </div>
                {gusLoaded && (
                  <p className="text-xs text-green-600 mt-2 flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    Dane pobrane z rejestru GUS
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Logo Upload */}
          <div 
            className="border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading ? (
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            ) : formData.logo_url ? (
              <img src={formData.logo_url} alt="Logo" className="h-16 mx-auto object-contain" />
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <Image className="h-8 w-8" />
                <span className="text-sm">Kliknij, aby przesłać logo</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Pojawi się na fakturach w lewym górnym rogu (max 2MB)
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoUpload}
            />
            {formData.logo_url && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-1"
                onClick={(e) => {
                  e.stopPropagation();
                  setFormData(prev => ({ ...prev, logo_url: '' }));
                }}
              >
                Usuń logo
              </Button>
            )}
          </div>

          {/* Basic Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label>Nazwa firmy *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Nazwa firmy"
              />
            </div>
            <div className="md:col-span-2">
              <Label>Forma prawna</Label>
              <Select 
                value={formData.type} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, type: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz formę prawną" />
                </SelectTrigger>
                <SelectContent>
                  {ENTITY_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>NIP</Label>
              <Input
                value={formData.nip}
                onChange={(e) => setFormData(prev => ({ ...prev, nip: e.target.value.replace(/\D/g, '') }))}
                placeholder="NIP"
                maxLength={10}
              />
            </div>
            <div>
              <Label>REGON</Label>
              <Input
                value={formData.regon}
                onChange={(e) => setFormData(prev => ({ ...prev, regon: e.target.value }))}
                placeholder="REGON"
              />
            </div>
            
            {/* VAT Payer Checkbox */}
            <div className="md:col-span-2 flex items-center gap-2 p-3 border rounded-lg bg-muted/50">
              <Checkbox
                id="vat-payer"
                checked={formData.vat_payer}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, vat_payer: checked as boolean }))}
              />
              <Label htmlFor="vat-payer" className="cursor-pointer">
                Płatnik VAT (czynny podatnik VAT)
              </Label>
            </div>
          </div>

          {/* Address - Split fields */}
          <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 md:col-span-6">
              <Label>Ulica</Label>
              <Input
                value={formData.address_street}
                onChange={(e) => setFormData(prev => ({ ...prev, address_street: e.target.value }))}
                placeholder="np. ul. Przykładowa"
              />
            </div>
            <div className="col-span-6 md:col-span-3">
              <Label>Nr budynku *</Label>
              <Input
                value={formData.address_building}
                onChange={(e) => setFormData(prev => ({ ...prev, address_building: e.target.value }))}
                placeholder="np. 10"
              />
            </div>
            <div className="col-span-6 md:col-span-3">
              <Label>Nr lokalu</Label>
              <Input
                value={formData.address_apartment}
                onChange={(e) => setFormData(prev => ({ ...prev, address_apartment: e.target.value }))}
                placeholder="np. 5"
              />
            </div>
            <div className="col-span-6 md:col-span-4">
              <Label>Kod pocztowy</Label>
              <Input
                value={formData.address_postal_code}
                onChange={(e) => handlePostalCodeChange(e.target.value)}
                placeholder="00-000"
                maxLength={6}
              />
            </div>
            <div className="col-span-6 md:col-span-8">
              <Label>Miasto</Label>
              <Input
                value={formData.address_city}
                onChange={(e) => setFormData(prev => ({ ...prev, address_city: e.target.value }))}
                placeholder="Miasto"
              />
            </div>
          </div>

          {/* Contact */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="firma@email.pl"
              />
            </div>
            <div>
              <Label>Telefon</Label>
              <Input
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="+48 123 456 789"
              />
            </div>
          </div>

          {/* Bank */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Nazwa banku</Label>
              <Input
                value={formData.bank_name}
                onChange={(e) => setFormData(prev => ({ ...prev, bank_name: e.target.value }))}
                placeholder="Wpisz nazwę banku"
              />
            </div>
            <div>
              <Label>Numer konta</Label>
              <Input
                value={formData.bank_account}
                onChange={(e) => setFormData(prev => ({ ...prev, bank_account: e.target.value }))}
                placeholder="00 0000 0000 0000 0000 0000 0000"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Anuluj
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !formData.name || !formData.address_building}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {isEditMode ? 'Zapisz zmiany' : 'Zapisz firmę'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

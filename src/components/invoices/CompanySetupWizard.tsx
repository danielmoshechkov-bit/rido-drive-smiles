import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
  { value: 'sp_akcyjna', label: 'Spółka akcyjna' },
  { value: 'other', label: 'Inna forma prawna' }
];

interface CompanySetupWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (entity: { id: string; name: string }) => void;
}

export function CompanySetupWizard({ open, onOpenChange, onCreated }: CompanySetupWizardProps) {
  const [nip, setNip] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    type: 'jdg',
    nip: '',
    regon: '',
    address_street: '',
    address_city: '',
    address_postal_code: '',
    email: '',
    phone: '',
    bank_name: '',
    bank_account: '',
    logo_url: ''
  });
  
  const [gusLoaded, setGusLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        setFormData(prev => ({
          ...prev,
          name: gus.name || '',
          nip: gus.nip || nip,
          regon: gus.regon || '',
          address_street: gus.address || '',
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

    setIsSaving(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError) {
        console.error('Auth error in handleSave:', authError);
        toast.error('Błąd autoryzacji. Spróbuj zalogować się ponownie.');
        setIsSaving(false);
        return;
      }
      
      if (!user) {
        console.error('No user found in handleSave');
        toast.error('Sesja wygasła. Zaloguj się ponownie.');
        setIsSaving(false);
        return;
      }

      console.log('Creating entity with owner_user_id:', user.id, 'email:', user.email);

      // Don't pass owner_user_id - let DB default (auth.uid()) handle it
      // This is more reliable with RLS policies
      const insertData = {
        name: formData.name.trim(),
        type: formData.type,
        nip: formData.nip?.trim() || null,
        regon: formData.regon?.trim() || null,
        address_street: formData.address_street?.trim() || null,
        address_city: formData.address_city?.trim() || null,
        address_postal_code: formData.address_postal_code?.trim() || null,
        email: formData.email?.trim() || null,
        phone: formData.phone?.trim() || null,
        bank_name: formData.bank_name?.trim() || null,
        bank_account: formData.bank_account?.trim() || null,
        logo_url: formData.logo_url || null
        // owner_user_id uses DB default: auth.uid()
      };

      console.log('Insert data:', insertData);

      const { data, error } = await supabase
        .from('entities')
        .insert(insertData)
        .select('id, name')
        .single();

      if (error) {
        console.error('Supabase error:', error);
        
        if (error.code === '42501') {
          toast.error('Brak uprawnień do tworzenia firm. Skontaktuj się z administratorem.');
        } else if (error.code === '23505') {
          toast.error('Firma o takim NIP już istnieje.');
        } else if (error.message?.includes('row-level security')) {
          toast.error('Błąd uprawnień RLS. Sprawdź konfigurację bazy danych.');
        } else {
          toast.error(`Błąd zapisu: ${error.message}`);
        }
        return;
      }

      toast.success('Firma utworzona');
      onCreated(data);
      onOpenChange(false);
      
      // Reset form
      setFormData({
        name: '',
        type: 'jdg',
        nip: '',
        regon: '',
        address_street: '',
        address_city: '',
        address_postal_code: '',
        email: '',
        phone: '',
        bank_name: '',
        bank_account: '',
        logo_url: ''
      });
      setNip('');
      setGusLoaded(false);
    } catch (err) {
      console.error('Save error:', err);
      toast.error('Nieoczekiwany błąd zapisu firmy');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Konfiguracja firmy (sprzedawcy)
          </DialogTitle>
          <DialogDescription>
            Wprowadź dane swojej firmy, które będą widoczne na fakturach jako sprzedawca.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* GUS Search */}
          <Card className="border-dashed">
            <CardContent className="p-4">
              <Label className="text-sm font-medium mb-2 block">Pobierz dane z GUS</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Wpisz NIP firmy..."
                  value={nip}
                  onChange={(e) => setNip(e.target.value.replace(/\D/g, ''))}
                  maxLength={10}
                />
                <Button onClick={searchGUS} disabled={isSearching}>
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
              {gusLoaded && (
                <div className="flex items-center gap-2 mt-2 text-sm text-green-600">
                  <CheckCircle className="h-4 w-4" />
                  Dane pobrane z GUS
                </div>
              )}
            </CardContent>
          </Card>

          {/* Logo Upload */}
          <div className="flex items-center gap-4">
            <div 
              className="w-24 h-24 border-2 border-dashed rounded-lg flex items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors overflow-hidden"
              onClick={() => fileInputRef.current?.click()}
            >
              {formData.logo_url ? (
                <img src={formData.logo_url} alt="Logo" className="w-full h-full object-contain" />
              ) : isUploading ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                <div className="text-center">
                  <Image className="h-6 w-6 mx-auto text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Logo</span>
                </div>
              )}
            </div>
            <div className="flex-1">
              <Label>Logo firmy</Label>
              <p className="text-sm text-muted-foreground">
                Kliknij, aby przesłać logo. Pojawi się na fakturach w lewym górnym rogu.
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
                  onClick={() => setFormData(prev => ({ ...prev, logo_url: '' }))}
                >
                  Usuń logo
                </Button>
              )}
            </div>
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
          </div>

          {/* Address */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-3">
              <Label>Adres (ulica)</Label>
              <Input
                value={formData.address_street}
                onChange={(e) => setFormData(prev => ({ ...prev, address_street: e.target.value }))}
                placeholder="ul. Przykładowa 1"
              />
            </div>
            <div>
              <Label>Kod pocztowy</Label>
              <Input
                value={formData.address_postal_code}
                onChange={(e) => setFormData(prev => ({ ...prev, address_postal_code: e.target.value }))}
                placeholder="00-000"
              />
            </div>
            <div className="md:col-span-2">
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
                placeholder="PKO BP"
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
            <Button onClick={handleSave} disabled={isSaving || !formData.name}>
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Zapisz firmę
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

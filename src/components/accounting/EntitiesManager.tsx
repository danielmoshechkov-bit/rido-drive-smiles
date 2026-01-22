import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { 
  Building2, 
  Plus, 
  Edit, 
  Loader2,
  MapPin,
  Phone,
  Mail,
  CreditCard
} from 'lucide-react';
import { toast } from 'sonner';

interface Entity {
  id: string;
  name: string;
  short_name: string | null;
  nip: string | null;
  regon: string | null;
  krs: string | null;
  type: string;
  vat_payer: boolean;
  address_street: string | null;
  address_city: string | null;
  address_postal_code: string | null;
  address_country: string | null;
  email: string | null;
  phone: string | null;
  bank_account: string | null;
  bank_name: string | null;
  logo_url: string | null;
  created_at: string;
}

interface EntitiesManagerProps {
  entities: Entity[];
  loading: boolean;
  onRefresh: () => void;
}

const ENTITY_TYPES = [
  { value: 'jdg', label: 'Jednoosobowa działalność gospodarcza (JDG)' },
  { value: 'sp_zoo', label: 'Spółka z o.o.' },
  { value: 'sp_jawna', label: 'Spółka jawna' },
  { value: 'sp_komandytowa', label: 'Spółka komandytowa' },
  { value: 'sp_akcyjna', label: 'Spółka akcyjna' },
  { value: 'fundacja', label: 'Fundacja' },
  { value: 'stowarzyszenie', label: 'Stowarzyszenie' },
  { value: 'other', label: 'Inna forma prawna' },
];

const getTypeLabel = (type: string) => {
  return ENTITY_TYPES.find(t => t.value === type)?.label || type;
};

export function EntitiesManager({ entities, loading, onRefresh }: EntitiesManagerProps) {
  const [showEditor, setShowEditor] = useState(false);
  const [editingEntity, setEditingEntity] = useState<Entity | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    short_name: '',
    nip: '',
    regon: '',
    krs: '',
    type: 'jdg',
    vat_payer: true,
    address_street: '',
    address_city: '',
    address_postal_code: '',
    address_country: 'Polska',
    email: '',
    phone: '',
    bank_account: '',
    bank_name: '',
  });

  const resetForm = () => {
    setFormData({
      name: '',
      short_name: '',
      nip: '',
      regon: '',
      krs: '',
      type: 'jdg',
      vat_payer: true,
      address_street: '',
      address_city: '',
      address_postal_code: '',
      address_country: 'Polska',
      email: '',
      phone: '',
      bank_account: '',
      bank_name: '',
    });
  };

  const handleOpenEditor = (entity?: Entity) => {
    if (entity) {
      setEditingEntity(entity);
      setFormData({
        name: entity.name,
        short_name: entity.short_name || '',
        nip: entity.nip || '',
        regon: entity.regon || '',
        krs: entity.krs || '',
        type: entity.type,
        vat_payer: entity.vat_payer,
        address_street: entity.address_street || '',
        address_city: entity.address_city || '',
        address_postal_code: entity.address_postal_code || '',
        address_country: entity.address_country || 'Polska',
        email: entity.email || '',
        phone: entity.phone || '',
        bank_account: entity.bank_account || '',
        bank_name: entity.bank_name || '',
      });
    } else {
      setEditingEntity(null);
      resetForm();
    }
    setShowEditor(true);
  };

  const handleCloseEditor = () => {
    setShowEditor(false);
    setEditingEntity(null);
    resetForm();
  };

  const handleSave = async () => {
    if (!formData.name) {
      toast.error('Podaj nazwę firmy');
      return;
    }

    setSaving(true);
    try {
      const entityData = {
        name: formData.name,
        short_name: formData.short_name || null,
        nip: formData.nip || null,
        regon: formData.regon || null,
        krs: formData.krs || null,
        type: formData.type,
        vat_payer: formData.vat_payer,
        address_street: formData.address_street || null,
        address_city: formData.address_city || null,
        address_postal_code: formData.address_postal_code || null,
        address_country: formData.address_country || null,
        email: formData.email || null,
        phone: formData.phone || null,
        bank_account: formData.bank_account || null,
        bank_name: formData.bank_name || null,
      };

      if (editingEntity) {
        const { error } = await supabase
          .from('entities')
          .update(entityData)
          .eq('id', editingEntity.id);
        if (error) throw error;
        toast.success('Firma zaktualizowana');
      } else {
        const { error } = await supabase
          .from('entities')
          .insert(entityData);
        if (error) throw error;
        toast.success('Firma dodana');
      }

      handleCloseEditor();
      onRefresh();
    } catch (error: any) {
      console.error('Error saving entity:', error);
      toast.error('Błąd zapisu');
    } finally {
      setSaving(false);
    }
  };

  const updateForm = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Firmy / Podmioty</h2>
          <Button onClick={() => handleOpenEditor()} className="gap-2">
            <Plus className="h-4 w-4" />
            Dodaj firmę
          </Button>
        </div>

        {/* Entities Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : entities.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Building2 className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg">Brak firm</p>
              <p className="text-sm mb-4">Dodaj pierwszą firmę, aby rozpocząć fakturowanie</p>
              <Button onClick={() => handleOpenEditor()}>
                <Plus className="h-4 w-4 mr-2" />
                Dodaj firmę
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {entities.map((entity) => (
              <Card key={entity.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{entity.short_name || entity.name}</CardTitle>
                        {entity.short_name && (
                          <CardDescription className="text-xs">{entity.name}</CardDescription>
                        )}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => handleOpenEditor(entity)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {getTypeLabel(entity.type)}
                    </Badge>
                    {entity.vat_payer && (
                      <Badge variant="secondary" className="text-xs">VAT</Badge>
                    )}
                  </div>
                  
                  {entity.nip && (
                    <p className="text-muted-foreground">NIP: {entity.nip}</p>
                  )}
                  
                  {entity.address_city && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      <span>{entity.address_city}</span>
                    </div>
                  )}
                  
                  {entity.email && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Mail className="h-3 w-3" />
                      <span className="truncate">{entity.email}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Entity Editor Dialog */}
      <Dialog open={showEditor} onOpenChange={handleCloseEditor}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              {editingEntity ? 'Edycja firmy' : 'Nowa firma'}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-6 py-4">
            {/* Basic Info */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Dane podstawowe</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Label>Pełna nazwa firmy *</Label>
                  <Input
                    value={formData.name}
                    onChange={(e) => updateForm('name', e.target.value)}
                    placeholder="Przykładowa Firma Sp. z o.o."
                  />
                </div>
                <div>
                  <Label>Nazwa skrócona</Label>
                  <Input
                    value={formData.short_name}
                    onChange={(e) => updateForm('short_name', e.target.value)}
                    placeholder="Przykładowa Firma"
                  />
                </div>
                <div>
                  <Label>Forma prawna</Label>
                  <Select value={formData.type} onValueChange={(v) => updateForm('type', v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ENTITY_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Tax Info */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Dane podatkowe</h3>
              <div className="grid md:grid-cols-3 gap-4">
                <div>
                  <Label>NIP</Label>
                  <Input
                    value={formData.nip}
                    onChange={(e) => updateForm('nip', e.target.value)}
                    placeholder="0000000000"
                  />
                </div>
                <div>
                  <Label>REGON</Label>
                  <Input
                    value={formData.regon}
                    onChange={(e) => updateForm('regon', e.target.value)}
                    placeholder="000000000"
                  />
                </div>
                <div>
                  <Label>KRS</Label>
                  <Input
                    value={formData.krs}
                    onChange={(e) => updateForm('krs', e.target.value)}
                    placeholder="0000000000"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={formData.vat_payer}
                  onCheckedChange={(v) => updateForm('vat_payer', v)}
                />
                <Label>Czynny podatnik VAT</Label>
              </div>
            </div>

            {/* Address */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Adres</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Label>Ulica i numer</Label>
                  <Input
                    value={formData.address_street}
                    onChange={(e) => updateForm('address_street', e.target.value)}
                    placeholder="ul. Przykładowa 1/2"
                  />
                </div>
                <div>
                  <Label>Kod pocztowy</Label>
                  <Input
                    value={formData.address_postal_code}
                    onChange={(e) => updateForm('address_postal_code', e.target.value)}
                    placeholder="00-000"
                  />
                </div>
                <div>
                  <Label>Miasto</Label>
                  <Input
                    value={formData.address_city}
                    onChange={(e) => updateForm('address_city', e.target.value)}
                    placeholder="Warszawa"
                  />
                </div>
              </div>
            </div>

            {/* Contact */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Kontakt</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => updateForm('email', e.target.value)}
                    placeholder="kontakt@firma.pl"
                  />
                </div>
                <div>
                  <Label>Telefon</Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => updateForm('phone', e.target.value)}
                    placeholder="+48 123 456 789"
                  />
                </div>
              </div>
            </div>

            {/* Bank */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">Dane bankowe</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <Label>Nazwa banku</Label>
                  <Input
                    value={formData.bank_name}
                    onChange={(e) => updateForm('bank_name', e.target.value)}
                    placeholder="mBank"
                  />
                </div>
                <div>
                  <Label>Numer konta</Label>
                  <Input
                    value={formData.bank_account}
                    onChange={(e) => updateForm('bank_account', e.target.value)}
                    placeholder="PL00 0000 0000 0000 0000 0000 0000"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseEditor} disabled={saving}>
              Anuluj
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingEntity ? 'Zapisz zmiany' : 'Dodaj firmę'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

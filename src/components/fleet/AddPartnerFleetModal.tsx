import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Building, Search, Plus } from 'lucide-react';

interface AddPartnerFleetModalProps {
  isOpen: boolean;
  onClose: () => void;
  driverId: string;
  managingFleetId: string;
  onAdded: () => void;
}

interface FleetOption {
  id: string;
  name: string;
  nip: string | null;
  city: string | null;
}

export function AddPartnerFleetModal({ isOpen, onClose, driverId, managingFleetId, onAdded }: AddPartnerFleetModalProps) {
  const [tab, setTab] = useState<string>('existing');
  const [existingFleets, setExistingFleets] = useState<FleetOption[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFleetId, setSelectedFleetId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Partnership settings
  const [settledBy, setSettledBy] = useState<string>('managing');
  const [isB2b, setIsB2b] = useState(false);
  const [invoiceFrequency, setInvoiceFrequency] = useState<string>('weekly');
  const [transferTitle, setTransferTitle] = useState('Zaliczka na fakturę - rozliczenie kierowcy');

  // New fleet form
  const [newFleet, setNewFleet] = useState({
    name: '', nip: '', address: '', city: '', postal_code: '',
    contact_name: '', email: '', phone: ''
  });

  useEffect(() => {
    if (isOpen) {
      loadFleets();
    }
  }, [isOpen]);

  const loadFleets = async () => {
    const { data } = await supabase
      .from('fleets')
      .select('id, name, nip, city')
      .neq('id', managingFleetId)
      .order('name');
    if (data) setExistingFleets(data);
  };

  const filteredFleets = existingFleets.filter(f =>
    f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (f.nip && f.nip.includes(searchTerm))
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      let partnerFleetId = selectedFleetId;

      // If creating new fleet
      if (tab === 'new') {
        if (!newFleet.name.trim()) {
          toast.error('Podaj nazwę firmy');
          setSaving(false);
          return;
        }

        const { data: created, error: createErr } = await supabase
          .from('fleets')
          .insert({
            name: newFleet.name,
            nip: newFleet.nip || null,
            address: newFleet.address || null,
            city: newFleet.city || null,
            postal_code: newFleet.postal_code || null,
            contact_name: newFleet.contact_name || null,
            email: newFleet.email || null,
            phone: newFleet.phone || null,
          })
          .select('id')
          .single();

        if (createErr) {
          toast.error('Błąd tworzenia floty: ' + createErr.message);
          setSaving(false);
          return;
        }
        partnerFleetId = created.id;
      }

      if (!partnerFleetId) {
        toast.error('Wybierz flotę partnerską');
        setSaving(false);
        return;
      }

      // Create partnership
      const { error } = await supabase
        .from('driver_fleet_partnerships')
        .insert({
          driver_id: driverId,
          partner_fleet_id: partnerFleetId,
          managing_fleet_id: managingFleetId,
          settled_by: settledBy,
          is_b2b: isB2b,
          invoice_frequency: invoiceFrequency,
          transfer_title_template: transferTitle,
        });

      if (error) {
        if (error.message.includes('duplicate') || error.message.includes('unique')) {
          toast.error('Ten kierowca już ma przypisaną tę flotę partnerską');
        } else {
          toast.error('Błąd: ' + error.message);
        }
        setSaving(false);
        return;
      }

      toast.success('Flota partnerska dodana');
      onAdded();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Wystąpił błąd');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building className="h-5 w-5" />
            Dodaj flotę partnerską
          </DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="existing" className="flex-1">
              <Search className="h-4 w-4 mr-1" />
              Istniejąca flota
            </TabsTrigger>
            <TabsTrigger value="new" className="flex-1">
              <Plus className="h-4 w-4 mr-1" />
              Nowa flota
            </TabsTrigger>
          </TabsList>

          <TabsContent value="existing" className="space-y-3 mt-3">
            <Input
              placeholder="Szukaj po nazwie lub NIP..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <div className="max-h-48 overflow-y-auto space-y-1 border rounded-lg p-2">
              {filteredFleets.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Brak flot. Przejdź do zakładki "Nowa flota".
                </p>
              ) : (
                filteredFleets.map(fleet => (
                  <div
                    key={fleet.id}
                    onClick={() => setSelectedFleetId(fleet.id)}
                    className={`p-3 rounded-lg cursor-pointer transition-colors text-sm ${
                      selectedFleetId === fleet.id
                        ? 'bg-primary/10 border border-primary/30'
                        : 'hover:bg-muted'
                    }`}
                  >
                    <p className="font-medium">{fleet.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {fleet.nip && `NIP: ${fleet.nip}`}
                      {fleet.city && ` • ${fleet.city}`}
                    </p>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="new" className="space-y-3 mt-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs">Nazwa firmy *</Label>
                <Input value={newFleet.name} onChange={(e) => setNewFleet(p => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">NIP</Label>
                <Input value={newFleet.nip} onChange={(e) => setNewFleet(p => ({ ...p, nip: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Miasto</Label>
                <Input value={newFleet.city} onChange={(e) => setNewFleet(p => ({ ...p, city: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Adres</Label>
                <Input value={newFleet.address} onChange={(e) => setNewFleet(p => ({ ...p, address: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Kod pocztowy</Label>
                <Input value={newFleet.postal_code} onChange={(e) => setNewFleet(p => ({ ...p, postal_code: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Osoba kontaktowa</Label>
                <Input value={newFleet.contact_name} onChange={(e) => setNewFleet(p => ({ ...p, contact_name: e.target.value }))} />
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input value={newFleet.email} onChange={(e) => setNewFleet(p => ({ ...p, email: e.target.value }))} type="email" />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Telefon</Label>
                <Input value={newFleet.phone} onChange={(e) => setNewFleet(p => ({ ...p, phone: e.target.value }))} />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {/* Partnership Settings */}
        <div className="border-t pt-4 space-y-4 mt-2">
          <h4 className="font-medium text-sm">Ustawienia współpracy</h4>

          <div className="space-y-2">
            <Label className="text-xs">Kto rozlicza kierowcę?</Label>
            <Select value={settledBy} onValueChange={setSettledBy}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="managing">My (nasza flota)</SelectItem>
                <SelectItem value="partner">Partner (flota zewnętrzna)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm">Faktura B2B</Label>
              <p className="text-xs text-muted-foreground">Płatność z VAT, auto-fakturowanie</p>
            </div>
            <Switch checked={isB2b} onCheckedChange={setIsB2b} />
          </div>

          {isB2b && (
            <>
              <div className="space-y-2">
                <Label className="text-xs">Częstotliwość fakturowania</Label>
                <Select value={invoiceFrequency} onValueChange={setInvoiceFrequency}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Co tydzień</SelectItem>
                    <SelectItem value="biweekly">Co 2 tygodnie</SelectItem>
                    <SelectItem value="monthly">Co miesiąc</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Tytuł przelewu</Label>
                <Input
                  value={transferTitle}
                  onChange={(e) => setTransferTitle(e.target.value)}
                  placeholder="Zaliczka na fakturę..."
                />
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>Anuluj</Button>
          <Button onClick={handleSave} disabled={saving || (tab === 'existing' && !selectedFleetId)}>
            {saving ? 'Zapisuję...' : 'Dodaj partnera'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

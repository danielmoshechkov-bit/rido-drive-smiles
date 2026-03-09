import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Building,
  Plus,
  Trash2,
  Edit,
  Users,
  Search,
  CreditCard,
  FileText,
  Settings,
  ChevronDown,
  ChevronUp,
  UserPlus,
  X,
} from 'lucide-react';

interface PartnerFleet {
  id: string;
  name: string;
  nip: string | null;
  city: string | null;
  address: string | null;
  street: string | null;
  house_number: string | null;
  postal_code: string | null;
  email: string | null;
  phone: string | null;
  contact_name: string | null;
  sender_bank_account: string | null;
}

interface Partnership {
  id: string;
  partner_fleet_id: string;
  driver_id: string;
  settled_by: string;
  is_b2b: boolean;
  invoice_frequency: string;
  transfer_title_template: string | null;
  is_active: boolean;
  driver_name?: string;
}

interface DriverOption {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

interface PartnerFleetsManagementProps {
  fleetId: string;
}

export function PartnerFleetsManagement({ fleetId }: PartnerFleetsManagementProps) {
  const [partnerFleets, setPartnerFleets] = useState<PartnerFleet[]>([]);
  const [partnerships, setPartnerships] = useState<Partnership[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [expandedFleet, setExpandedFleet] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editFleet, setEditFleet] = useState<PartnerFleet | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showAddDriverModal, setShowAddDriverModal] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Add modal state
  const [addTab, setAddTab] = useState<string>('new');
  const [nipSearch, setNipSearch] = useState('');
  const [nipResult, setNipResult] = useState<PartnerFleet | null>(null);
  const [nipSearching, setNipSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newFleet, setNewFleet] = useState({
    name: '', nip: '', city: '', address: '', postal_code: '',
    contact_name: '', email: '', phone: '', sender_bank_account: '',
  });

  // Partnership settings for new assignment
  const [assignSettledBy, setAssignSettledBy] = useState('managing');
  const [assignIsB2b, setAssignIsB2b] = useState(false);
  const [assignInvoiceFreq, setAssignInvoiceFreq] = useState('weekly');
  const [assignDriverId, setAssignDriverId] = useState('');
  const [driverSearch, setDriverSearch] = useState('');

  useEffect(() => {
    loadData();
  }, [fleetId]);

  const loadData = async () => {
    // Load partner fleets via partnerships
    const { data: partnershipData } = await supabase
      .from('driver_fleet_partnerships')
      .select(`
        id, partner_fleet_id, driver_id, settled_by, is_b2b, invoice_frequency,
        transfer_title_template, is_active
      `)
      .eq('managing_fleet_id', fleetId)
      .eq('is_active', true);

    const partnerIds = [...new Set((partnershipData || []).map(p => p.partner_fleet_id))];

    if (partnerIds.length > 0) {
      const { data: fleetsData } = await supabase
        .from('fleets')
        .select('id, name, nip, city, address, postal_code, email, phone, contact_name, sender_bank_account')
        .in('id', partnerIds);
      setPartnerFleets(fleetsData || []);
    } else {
      setPartnerFleets([]);
    }

    // Load drivers for this fleet
    const { data: driversData } = await supabase
      .from('drivers')
      .select('id, first_name, last_name')
      .eq('fleet_id', fleetId)
      .order('first_name');
    setDrivers(driversData || []);

    // Enrich partnerships with driver names
    const enriched = (partnershipData || []).map(p => {
      const d = (driversData || []).find(dr => dr.id === p.driver_id);
      return {
        ...p,
        driver_name: d ? `${d.first_name || ''} ${d.last_name || ''}`.trim() : 'Nieznany',
      };
    });
    setPartnerships(enriched);
  };

  const searchByNip = async () => {
    if (!nipSearch.trim()) return;
    setNipSearching(true);
    const { data } = await supabase
      .from('fleets')
      .select('id, name, nip, city, address, postal_code, email, phone, contact_name, sender_bank_account')
      .eq('nip', nipSearch.trim())
      .neq('id', fleetId)
      .maybeSingle();

    if (data) {
      setNipResult(data);
      toast.success(`Znaleziono: ${data.name}`);
    } else {
      setNipResult(null);
      toast.info('Nie znaleziono floty z tym NIP. Możesz dodać nową.');
    }
    setNipSearching(false);
  };

  const handleAddFleet = async () => {
    setSaving(true);
    try {
      let partnerFleetId: string;

      if (addTab === 'nip' && nipResult) {
        partnerFleetId = nipResult.id;
      } else {
        if (!newFleet.name.trim()) {
          toast.error('Podaj nazwę firmy');
          setSaving(false);
          return;
        }
        const { data: created, error } = await supabase
          .from('fleets')
          .insert({
            name: newFleet.name,
            nip: newFleet.nip || null,
            city: newFleet.city || null,
            address: newFleet.address || null,
            postal_code: newFleet.postal_code || null,
            contact_name: newFleet.contact_name || null,
            email: newFleet.email || null,
            phone: newFleet.phone || null,
            sender_bank_account: newFleet.sender_bank_account || null,
          })
          .select('id')
          .single();

        if (error) {
          toast.error('Błąd tworzenia floty: ' + error.message);
          setSaving(false);
          return;
        }
        partnerFleetId = created.id;
      }

      // Check if partnership already exists (for any driver - we create a placeholder)
      // Just add to the list, driver assignments are separate
      const exists = partnerFleets.some(f => f.id === partnerFleetId);
      if (exists) {
        toast.info('Ta flota jest już dodana jako partner');
        setSaving(false);
        setShowAddModal(false);
        return;
      }

      // Create a placeholder partnership to establish the relationship
      // Use the first driver or create without driver for now
      toast.success('Flota partnerska dodana');
      setShowAddModal(false);
      resetAddForm();
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Wystąpił błąd');
    } finally {
      setSaving(false);
    }
  };

  const handleAssignDriver = async (partnerFleetId: string) => {
    if (!assignDriverId) {
      toast.error('Wybierz kierowcę');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('driver_fleet_partnerships')
        .insert({
          driver_id: assignDriverId,
          partner_fleet_id: partnerFleetId,
          managing_fleet_id: fleetId,
          settled_by: assignSettledBy,
          is_b2b: assignIsB2b,
          invoice_frequency: assignInvoiceFreq,
        });

      if (error) {
        if (error.message.includes('duplicate') || error.message.includes('unique')) {
          toast.error('Ten kierowca już jest przypisany do tej floty');
        } else {
          toast.error('Błąd: ' + error.message);
        }
        setSaving(false);
        return;
      }

      toast.success('Kierowca przypisany do floty partnerskiej');
      setShowAddDriverModal(null);
      setAssignDriverId('');
      setDriverSearch('');
      loadData();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleRemovePartnership = async (partnershipId: string) => {
    const { error } = await supabase
      .from('driver_fleet_partnerships')
      .update({ is_active: false })
      .eq('id', partnershipId);

    if (error) {
      toast.error('Błąd usuwania');
    } else {
      toast.success('Kierowca odłączony od floty');
      loadData();
    }
  };

  const handleDeleteFleet = async () => {
    if (!deleteId) return;
    // Deactivate all partnerships with this fleet
    await supabase
      .from('driver_fleet_partnerships')
      .update({ is_active: false })
      .eq('partner_fleet_id', deleteId)
      .eq('managing_fleet_id', fleetId);

    toast.success('Flota partnerska usunięta');
    setDeleteId(null);
    loadData();
  };

  const handleUpdateFleet = async () => {
    if (!editFleet) return;
    const { error } = await supabase
      .from('fleets')
      .update({
        name: editFleet.name,
        nip: editFleet.nip,
        city: editFleet.city,
        address: editFleet.address,
        postal_code: editFleet.postal_code,
        email: editFleet.email,
        phone: editFleet.phone,
        contact_name: editFleet.contact_name,
        sender_bank_account: editFleet.sender_bank_account,
      })
      .eq('id', editFleet.id);

    if (error) {
      toast.error('Błąd zapisu: ' + error.message);
    } else {
      toast.success('Dane floty zaktualizowane');
      setEditFleet(null);
      loadData();
    }
  };

  const resetAddForm = () => {
    setNewFleet({ name: '', nip: '', city: '', address: '', postal_code: '', contact_name: '', email: '', phone: '', sender_bank_account: '' });
    setNipSearch('');
    setNipResult(null);
    setAddTab('new');
  };

  const filteredPartnerFleets = partnerFleets.filter(f =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (f.nip && f.nip.includes(searchQuery))
  );

  const getDriversForFleet = (fleetId: string) =>
    partnerships.filter(p => p.partner_fleet_id === fleetId);

  const filteredDriversForAssign = drivers.filter(d => {
    const name = `${d.first_name || ''} ${d.last_name || ''}`.toLowerCase();
    return name.includes(driverSearch.toLowerCase());
  });

  const frequencyLabel = (f: string) => {
    switch (f) {
      case 'weekly': return 'Co tydzień';
      case 'biweekly': return 'Co 2 tyg.';
      case 'monthly': return 'Co miesiąc';
      default: return f;
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Building className="h-5 w-5" />
            Floty partnerskie
          </CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Zarządzaj flotami partnerskimi, przypisuj kierowców i konta bankowe
          </p>
        </div>
        <Button onClick={() => { resetAddForm(); setShowAddModal(true); }} className="gap-1">
          <Plus className="h-4 w-4" />
          Dodaj flotę
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Search */}
        {partnerFleets.length > 3 && (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Szukaj po nazwie lub NIP..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
          </div>
        )}

        {filteredPartnerFleets.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Building className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Brak flot partnerskich</p>
            <p className="text-xs mt-1">Dodaj flotę partnerską, aby zarządzać zbiorczymi rozliczeniami</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredPartnerFleets.map(fleet => {
              const fleetDrivers = getDriversForFleet(fleet.id);
              const isExpanded = expandedFleet === fleet.id;

              return (
                <div key={fleet.id} className="border rounded-lg overflow-hidden">
                  {/* Fleet header */}
                  <div
                    className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => setExpandedFleet(isExpanded ? null : fleet.id)}
                  >
                    <div className="flex items-center gap-3">
                      <Building className="h-4 w-4 text-primary" />
                      <div>
                        <span className="font-semibold text-sm">{fleet.name}</span>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {fleet.nip && <span>NIP: {fleet.nip}</span>}
                          {fleet.city && <span>• {fleet.city}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        <Users className="h-3 w-3 mr-1" />
                        {fleetDrivers.length} kierowców
                      </Badge>
                      {fleet.sender_bank_account && (
                        <Badge variant="secondary" className="text-xs">
                          <CreditCard className="h-3 w-3 mr-1" />
                          Konto
                        </Badge>
                      )}
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </div>
                  </div>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="border-t p-3 space-y-3 bg-muted/10">
                      {/* Fleet info */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {fleet.contact_name && (
                          <div><span className="text-muted-foreground">Kontakt:</span> {fleet.contact_name}</div>
                        )}
                        {fleet.email && (
                          <div><span className="text-muted-foreground">Email:</span> {fleet.email}</div>
                        )}
                        {fleet.phone && (
                          <div><span className="text-muted-foreground">Telefon:</span> {fleet.phone}</div>
                        )}
                        {fleet.sender_bank_account && (
                          <div className="col-span-2">
                            <span className="text-muted-foreground">Nr konta:</span>{' '}
                            <span className="font-mono">{fleet.sender_bank_account}</span>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs gap-1"
                          onClick={e => { e.stopPropagation(); setEditFleet({ ...fleet }); }}
                        >
                          <Edit className="h-3 w-3" />
                          Edytuj dane
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs gap-1"
                          onClick={e => {
                            e.stopPropagation();
                            setShowAddDriverModal(fleet.id);
                            setAssignDriverId('');
                            setDriverSearch('');
                            setAssignSettledBy('managing');
                            setAssignIsB2b(false);
                          }}
                        >
                          <UserPlus className="h-3 w-3" />
                          Przypisz kierowcę
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs gap-1 text-destructive hover:text-destructive/80"
                          onClick={e => { e.stopPropagation(); setDeleteId(fleet.id); }}
                        >
                          <Trash2 className="h-3 w-3" />
                          Usuń
                        </Button>
                      </div>

                      {/* Drivers list */}
                      {fleetDrivers.length > 0 && (
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Przypisani kierowcy:</Label>
                          <div className="space-y-1">
                            {fleetDrivers.map(p => (
                              <div key={p.id} className="flex items-center justify-between p-2 rounded border bg-background text-xs">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium">{p.driver_name}</span>
                                  <Badge variant="outline" className="text-[10px]">
                                    {p.settled_by === 'managing' ? 'Rozlicza: my' : 'Rozlicza: partner'}
                                  </Badge>
                                  {p.is_b2b && (
                                    <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]" variant="outline">
                                      <FileText className="h-2.5 w-2.5 mr-0.5" />
                                      B2B
                                    </Badge>
                                  )}
                                  {p.is_b2b && (
                                    <Badge variant="secondary" className="text-[10px]">
                                      <Settings className="h-2.5 w-2.5 mr-0.5" />
                                      {frequencyLabel(p.invoice_frequency)}
                                    </Badge>
                                  )}
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemovePartnership(p.id)}
                                  className="h-6 w-6 p-0 text-destructive hover:text-destructive/80"
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {/* ── ADD FLEET MODAL ── */}
      <Dialog open={showAddModal} onOpenChange={v => { if (!v) setShowAddModal(false); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              Dodaj flotę partnerską
            </DialogTitle>
          </DialogHeader>

          <Tabs value={addTab} onValueChange={setAddTab}>
            <TabsList className="w-full">
              <TabsTrigger value="new" className="flex-1">
                <Plus className="h-4 w-4 mr-1" />
                Nowa flota
              </TabsTrigger>
              <TabsTrigger value="nip" className="flex-1">
                <Search className="h-4 w-4 mr-1" />
                Szukaj po NIP
              </TabsTrigger>
            </TabsList>

            <TabsContent value="new" className="space-y-3 mt-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs">Nazwa firmy *</Label>
                  <Input value={newFleet.name} onChange={e => setNewFleet(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">NIP</Label>
                  <Input value={newFleet.nip} onChange={e => setNewFleet(p => ({ ...p, nip: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Miasto</Label>
                  <Input value={newFleet.city} onChange={e => setNewFleet(p => ({ ...p, city: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Adres</Label>
                  <Input value={newFleet.address} onChange={e => setNewFleet(p => ({ ...p, address: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Kod pocztowy</Label>
                  <Input value={newFleet.postal_code} onChange={e => setNewFleet(p => ({ ...p, postal_code: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Osoba kontaktowa</Label>
                  <Input value={newFleet.contact_name} onChange={e => setNewFleet(p => ({ ...p, contact_name: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Email</Label>
                  <Input value={newFleet.email} onChange={e => setNewFleet(p => ({ ...p, email: e.target.value }))} type="email" />
                </div>
                <div>
                  <Label className="text-xs">Telefon</Label>
                  <Input value={newFleet.phone} onChange={e => setNewFleet(p => ({ ...p, phone: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Nr rachunku bankowego</Label>
                  <Input
                    value={newFleet.sender_bank_account}
                    onChange={e => setNewFleet(p => ({ ...p, sender_bank_account: e.target.value }))}
                    placeholder="26 cyfr"
                    className="font-mono"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="nip" className="space-y-3 mt-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Wpisz NIP..."
                  value={nipSearch}
                  onChange={e => setNipSearch(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={searchByNip} disabled={nipSearching}>
                  {nipSearching ? 'Szukam...' : 'Szukaj'}
                </Button>
              </div>

              {nipResult && (
                <div className="p-3 rounded-lg border bg-primary/5 border-primary/20 space-y-1">
                  <p className="font-semibold text-sm">{nipResult.name}</p>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {nipResult.nip && <p>NIP: {nipResult.nip}</p>}
                    {nipResult.city && <p>Miasto: {nipResult.city}</p>}
                    {nipResult.address && <p>Adres: {nipResult.address}</p>}
                    {nipResult.sender_bank_account && <p>Konto: {nipResult.sender_bank_account}</p>}
                  </div>
                  <Badge className="mt-1 bg-primary/10 text-primary border-primary/20" variant="outline">
                    Znaleziono w systemie
                  </Badge>
                </div>
              )}
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowAddModal(false)}>Anuluj</Button>
            <Button
              onClick={handleAddFleet}
              disabled={saving || (addTab === 'nip' && !nipResult) || (addTab === 'new' && !newFleet.name.trim())}
            >
              {saving ? 'Zapisuję...' : 'Dodaj flotę'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── EDIT FLEET MODAL ── */}
      <Dialog open={!!editFleet} onOpenChange={v => { if (!v) setEditFleet(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edytuj dane floty</DialogTitle>
          </DialogHeader>
          {editFleet && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label className="text-xs">Nazwa firmy</Label>
                <Input value={editFleet.name} onChange={e => setEditFleet({ ...editFleet, name: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">NIP</Label>
                <Input value={editFleet.nip || ''} onChange={e => setEditFleet({ ...editFleet, nip: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Miasto</Label>
                <Input value={editFleet.city || ''} onChange={e => setEditFleet({ ...editFleet, city: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Adres</Label>
                <Input value={editFleet.address || ''} onChange={e => setEditFleet({ ...editFleet, address: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Kod pocztowy</Label>
                <Input value={editFleet.postal_code || ''} onChange={e => setEditFleet({ ...editFleet, postal_code: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Kontakt</Label>
                <Input value={editFleet.contact_name || ''} onChange={e => setEditFleet({ ...editFleet, contact_name: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input value={editFleet.email || ''} onChange={e => setEditFleet({ ...editFleet, email: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Telefon</Label>
                <Input value={editFleet.phone || ''} onChange={e => setEditFleet({ ...editFleet, phone: e.target.value })} />
              </div>
              <div className="col-span-2">
                <Label className="text-xs">Nr rachunku bankowego</Label>
                <Input
                  value={editFleet.sender_bank_account || ''}
                  onChange={e => setEditFleet({ ...editFleet, sender_bank_account: e.target.value })}
                  className="font-mono"
                />
              </div>
              <div className="col-span-2 flex justify-end gap-2 mt-2">
                <Button variant="outline" onClick={() => setEditFleet(null)}>Anuluj</Button>
                <Button onClick={handleUpdateFleet}>Zapisz</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── ASSIGN DRIVER MODAL ── */}
      <Dialog open={!!showAddDriverModal} onOpenChange={v => { if (!v) setShowAddDriverModal(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5" />
              Przypisz kierowcę do floty
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-xs">Szukaj kierowcy</Label>
              <Input
                placeholder="Imię lub nazwisko..."
                value={driverSearch}
                onChange={e => setDriverSearch(e.target.value)}
                className="mb-2"
              />
              <div className="max-h-40 overflow-y-auto space-y-1 border rounded-lg p-2">
                {filteredDriversForAssign.map(d => (
                  <div
                    key={d.id}
                    onClick={() => setAssignDriverId(d.id)}
                    className={`p-2 rounded cursor-pointer text-sm transition-colors ${
                      assignDriverId === d.id
                        ? 'bg-primary/10 border border-primary/30'
                        : 'hover:bg-muted'
                    }`}
                  >
                    {d.first_name} {d.last_name}
                  </div>
                ))}
                {filteredDriversForAssign.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">Brak kierowców</p>
                )}
              </div>
            </div>

            <div>
              <Label className="text-xs">Kto rozlicza?</Label>
              <Select value={assignSettledBy} onValueChange={setAssignSettledBy}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="managing">My (nasza flota)</SelectItem>
                  <SelectItem value="partner">Partner</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">B2B</Label>
                <p className="text-xs text-muted-foreground">Faktura VAT</p>
              </div>
              <Switch checked={assignIsB2b} onCheckedChange={setAssignIsB2b} />
            </div>

            {assignIsB2b && (
              <div>
                <Label className="text-xs">Częstotliwość faktur</Label>
                <Select value={assignInvoiceFreq} onValueChange={setAssignInvoiceFreq}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Co tydzień</SelectItem>
                    <SelectItem value="biweekly">Co 2 tygodnie</SelectItem>
                    <SelectItem value="monthly">Co miesiąc</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAddDriverModal(null)}>Anuluj</Button>
              <Button
                onClick={() => showAddDriverModal && handleAssignDriver(showAddDriverModal)}
                disabled={saving || !assignDriverId}
              >
                {saving ? 'Zapisuję...' : 'Przypisz'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── DELETE CONFIRMATION ── */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usunąć flotę partnerską?</AlertDialogTitle>
          </AlertDialogHeader>
          <p className="text-sm text-muted-foreground">
            Wszystkie przypisania kierowców do tej floty zostaną dezaktywowane.
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>Anuluj</AlertDialogCancel>
            <Button variant="destructive" onClick={handleDeleteFleet}>Usuń</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

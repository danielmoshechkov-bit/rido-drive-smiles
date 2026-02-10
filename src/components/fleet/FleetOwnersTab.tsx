import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { User, Plus, ChevronDown, ChevronUp, Car, Phone, Mail, Building, Edit } from "lucide-react";

interface VehicleOwner {
  id: string;
  name: string;
  company_name: string | null;
  phone: string | null;
  email: string | null;
  nip: string | null;
  bank_account: string | null;
}

interface OwnerVehicle {
  id: string;
  plate: string;
  brand: string;
  model: string;
  owner_rental_fee: number | null;
}

interface FleetOwnersTabProps {
  fleetId: string;
}

export function FleetOwnersTab({ fleetId }: FleetOwnersTabProps) {
  const [owners, setOwners] = useState<(VehicleOwner & { vehicles: OwnerVehicle[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOwners, setExpandedOwners] = useState<Set<string>>(new Set());
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingOwner, setEditingOwner] = useState<VehicleOwner | null>(null);

  // Form state
  const [newName, setNewName] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [newNip, setNewNip] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newBankAccount, setNewBankAccount] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, [fleetId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: ownersData } = await supabase
        .from("vehicle_owners" as any)
        .select("id, name, company_name, phone, email, nip, bank_account")
        .eq("fleet_id", fleetId)
        .order("name");

      if (!ownersData || ownersData.length === 0) {
        setOwners([]);
        setLoading(false);
        return;
      }

      const ownerIds = (ownersData as any[]).map(o => o.id);

      const { data: vehiclesData } = await (supabase
        .from("vehicles")
        .select("id, plate, brand, model, weekly_rental_fee, owner_rental_fee, owner_id") as any)
        .in("owner_id", ownerIds);

      const result = (ownersData as any[]).map(owner => ({
        ...owner,
        vehicles: ((vehiclesData as any[]) || []).filter(v => v.owner_id === owner.id),
      }));

      setOwners(result);
    } catch (error) {
      console.error("Error loading owners:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpanded = (ownerId: string) => {
    const next = new Set(expandedOwners);
    if (next.has(ownerId)) next.delete(ownerId);
    else next.add(ownerId);
    setExpandedOwners(next);
  };

  const handleSaveOwner = async () => {
    if (!newName.trim()) {
      toast.error("Podaj imię i nazwisko lub nazwę");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        fleet_id: fleetId,
        name: newName.trim(),
        company_name: newCompany.trim() || null,
        nip: newNip.trim() || null,
        phone: newPhone.trim() || null,
        email: newEmail.trim() || null,
        bank_account: newBankAccount.trim() || null,
      };

      if (editingOwner) {
        const { error } = await supabase
          .from("vehicle_owners" as any)
          .update(payload)
          .eq("id", editingOwner.id);
        if (error) throw error;
        toast.success("Właściciel zaktualizowany");
      } else {
        const { error } = await supabase
          .from("vehicle_owners" as any)
          .insert([payload]);
        if (error) throw error;
        toast.success("Właściciel dodany");
      }

      closeDialog();
      loadData();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const openEditDialog = (owner: VehicleOwner) => {
    setEditingOwner(owner);
    setNewName(owner.name);
    setNewCompany(owner.company_name || "");
    setNewNip(owner.nip || "");
    setNewPhone(owner.phone || "");
    setNewEmail(owner.email || "");
    setNewBankAccount(owner.bank_account || "");
    setShowAddDialog(true);
  };

  const closeDialog = () => {
    setShowAddDialog(false);
    setEditingOwner(null);
    setNewName("");
    setNewCompany("");
    setNewNip("");
    setNewPhone("");
    setNewEmail("");
    setNewBankAccount("");
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("pl-PL", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount) + " zł";
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Ładowanie...</div>;
  }

  return (
    <Card className="rounded-lg">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">Właściciele pojazdów</h3>
          <Button onClick={() => setShowAddDialog(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Dodaj właściciela
          </Button>
        </div>

        {owners.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <User className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Brak właścicieli. Dodaj właściciela, a następnie przypisz mu pojazdy w zakładce "Auta".</p>
          </div>
        ) : (
          <div className="space-y-3">
            {owners.map(owner => {
              const totalWeekly = owner.vehicles.reduce(
                (sum, v) => sum + (parseFloat(v.owner_rental_fee?.toString() || "0")), 0
              );

              return (
                <Card key={owner.id} className="border">
                  <Collapsible open={expandedOwners.has(owner.id)} onOpenChange={() => toggleExpanded(owner.id)}>
                    <CollapsibleTrigger asChild>
                      <div className="p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <User className="h-5 w-5 text-muted-foreground" />
                            <div>
                              <div className="font-semibold">
                                {owner.company_name || owner.name}
                              </div>
                              {owner.company_name && (
                                <div className="text-xs text-muted-foreground">{owner.name}</div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <Badge variant="secondary" className="gap-1">
                              <Car className="h-3 w-3" />
                              {owner.vehicles.length} aut
                            </Badge>
                            <div className="text-right">
                              <div className="text-xs text-muted-foreground">Stawka/tydz.</div>
                              <div className="font-bold text-primary">{formatCurrency(totalWeekly)}</div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditDialog(owner);
                              }}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            {expandedOwners.has(owner.id) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </div>
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="px-4 pb-4 space-y-3 border-t pt-3">
                        {/* Contact info */}
                        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                          {owner.phone && (
                            <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {owner.phone}</span>
                          )}
                          {owner.email && (
                            <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {owner.email}</span>
                          )}
                          {owner.nip && (
                            <span className="flex items-center gap-1"><Building className="h-3 w-3" /> NIP: {owner.nip}</span>
                          )}
                          {owner.bank_account && (
                            <span>Konto: {owner.bank_account}</span>
                          )}
                        </div>

                        {/* Vehicles */}
                        {owner.vehicles.length > 0 ? (
                          <div className="space-y-2">
                            <h4 className="text-sm font-medium">Przypisane pojazdy:</h4>
                            {owner.vehicles.map(v => (
                              <div key={v.id} className="flex items-center justify-between border rounded-lg p-3 bg-muted/30">
                                <div>
                                  <span className="font-medium text-sm">{v.brand} {v.model}</span>
                                  <span className="ml-2 font-mono text-sm text-muted-foreground">{v.plate}</span>
                                </div>
                                <div className="text-sm font-semibold">
                                  {formatCurrency(parseFloat(v.owner_rental_fee?.toString() || "0"))}/tydz.
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Brak przypisanych pojazdów. Przypisz auto w zakładce "Auta".
                          </p>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </Card>
              );
            })}
          </div>
        )}

        {/* Add/Edit Dialog */}
        <Dialog open={showAddDialog} onOpenChange={(open) => !open && closeDialog()}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingOwner ? "Edytuj właściciela" : "Dodaj właściciela pojazdu"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Imię i nazwisko *</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Jan Kowalski" />
              </div>
              <div>
                <Label className="text-xs">Nazwa firmy</Label>
                <Input value={newCompany} onChange={(e) => setNewCompany(e.target.value)} placeholder="Firma sp. z o.o." />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">NIP</Label>
                  <Input value={newNip} onChange={(e) => setNewNip(e.target.value)} placeholder="1234567890" />
                </div>
                <div>
                  <Label className="text-xs">Telefon</Label>
                  <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+48..." />
                </div>
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="jan@firma.pl" />
              </div>
              <div>
                <Label className="text-xs">Nr konta bankowego</Label>
                <Input value={newBankAccount} onChange={(e) => setNewBankAccount(e.target.value)} placeholder="PL..." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closeDialog}>Anuluj</Button>
              <Button onClick={handleSaveOwner} disabled={saving}>
                {saving ? "Zapisywanie..." : editingOwner ? "Zapisz" : "Dodaj"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

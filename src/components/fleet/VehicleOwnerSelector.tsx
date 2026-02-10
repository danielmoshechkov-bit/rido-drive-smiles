import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { User, Plus, X } from "lucide-react";

interface VehicleOwner {
  id: string;
  name: string;
  company_name: string | null;
  phone: string | null;
}

interface VehicleOwnerSelectorProps {
  vehicleId: string;
  fleetId: string;
  currentOwnerId?: string | null;
  onOwnerChange?: () => void;
}

export function VehicleOwnerSelector({ vehicleId, fleetId, currentOwnerId, onOwnerChange }: VehicleOwnerSelectorProps) {
  const [owners, setOwners] = useState<VehicleOwner[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentOwner, setCurrentOwner] = useState<VehicleOwner | null>(null);

  // New owner form
  const [newName, setNewName] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [newNip, setNewNip] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newBankAccount, setNewBankAccount] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadOwners();
  }, [fleetId]);

  useEffect(() => {
    if (currentOwnerId && owners.length > 0) {
      setCurrentOwner(owners.find(o => o.id === currentOwnerId) || null);
    } else {
      setCurrentOwner(null);
    }
  }, [currentOwnerId, owners]);

  const loadOwners = async () => {
    const { data } = await supabase
      .from("vehicle_owners" as any)
      .select("id, name, company_name, phone")
      .eq("fleet_id", fleetId)
      .order("name");
    setOwners((data as any[]) || []);
  };

  const assignOwner = async (ownerId: string) => {
    const { error } = await supabase
      .from("vehicles")
      .update({ owner_id: ownerId } as any)
      .eq("id", vehicleId);

    if (error) return toast.error(error.message);
    toast.success("Właściciel przypisany");
    setShowDropdown(false);
    onOwnerChange?.();
  };

  const removeOwner = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const { error } = await supabase
      .from("vehicles")
      .update({ owner_id: null } as any)
      .eq("id", vehicleId);

    if (error) return toast.error(error.message);
    toast.success("Właściciel usunięty");
    setCurrentOwner(null);
    onOwnerChange?.();
  };

  const handleAddOwner = async () => {
    if (!newName.trim()) {
      toast.error("Podaj imię i nazwisko lub nazwę");
      return;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("vehicle_owners" as any)
        .insert([{
          fleet_id: fleetId,
          name: newName.trim(),
          company_name: newCompany.trim() || null,
          nip: newNip.trim() || null,
          phone: newPhone.trim() || null,
          email: newEmail.trim() || null,
          bank_account: newBankAccount.trim() || null,
        }])
        .select("id")
        .single();

      if (error) throw error;

      // Auto-assign to vehicle
      await supabase
        .from("vehicles")
        .update({ owner_id: (data as any).id } as any)
        .eq("id", vehicleId);

      toast.success("Właściciel dodany i przypisany");
      setShowAddDialog(false);
      resetForm();
      loadOwners();
      onOwnerChange?.();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setNewName("");
    setNewCompany("");
    setNewNip("");
    setNewPhone("");
    setNewEmail("");
    setNewBankAccount("");
  };

  const filteredOwners = owners.filter(o =>
    `${o.name} ${o.company_name || ""}`.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      {currentOwner ? (
        <Badge
          className="bg-blue-500/10 text-blue-700 border-blue-500/20 cursor-pointer hover:bg-blue-500/20 gap-1"
          onClick={() => setShowDropdown(!showDropdown)}
        >
          <User className="h-3 w-3" />
          {currentOwner.company_name || currentOwner.name}
          <span className="ml-1 hover:text-destructive" onClick={removeOwner}>✕</span>
        </Badge>
      ) : (
        <Badge
          variant="outline"
          className="cursor-pointer hover:bg-muted gap-1"
          onClick={() => setShowDropdown(!showDropdown)}
        >
          <User className="h-3 w-3" />
          Właściciel
        </Badge>
      )}

      {showDropdown && (
        <div className="absolute z-50 mt-2 w-72 bg-background border rounded-xl shadow-lg max-h-80 flex flex-col">
          <div className="p-3 border-b flex justify-between items-center">
            <h3 className="font-medium text-sm">Wybierz właściciela</h3>
            <Button variant="ghost" size="sm" onClick={() => setShowDropdown(false)} className="h-6 w-6 p-0">✕</Button>
          </div>
          <div className="p-2 border-b">
            <Input
              placeholder="Szukaj..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex-1 p-2 overflow-y-auto space-y-1">
            {filteredOwners.map(owner => (
              <div
                key={owner.id}
                className="border rounded-lg p-2 hover:bg-muted cursor-pointer transition-colors"
                onClick={() => assignOwner(owner.id)}
              >
                <div className="font-medium text-sm">{owner.name}</div>
                {owner.company_name && <div className="text-xs text-muted-foreground">{owner.company_name}</div>}
                {owner.phone && <div className="text-xs text-muted-foreground">{owner.phone}</div>}
              </div>
            ))}
            {filteredOwners.length === 0 && (
              <div className="text-center py-2 text-muted-foreground text-sm">Brak właścicieli</div>
            )}
          </div>
          <div className="p-2 border-t">
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-1 text-xs"
              onClick={() => { setShowDropdown(false); setShowAddDialog(true); }}
            >
              <Plus className="h-3 w-3" /> Dodaj właściciela
            </Button>
          </div>
        </div>
      )}

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Dodaj właściciela pojazdu</DialogTitle>
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
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>Anuluj</Button>
            <Button onClick={handleAddOwner} disabled={saving}>
              {saving ? "Zapisywanie..." : "Dodaj i przypisz"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

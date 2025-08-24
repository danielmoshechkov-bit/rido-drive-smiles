import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Trash2, Edit, Plus, ChevronDown, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export function FleetTabManagement({ cityId }: { cityId: string }) {
  const [fleets, setFleets] = useState<any[]>([]);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [expandedFleets, setExpandedFleets] = useState<Set<string>>(new Set());
  const [newFleet, setNewFleet] = useState({
    name: "",
    nip: "",
    city: "",
    postal_code: "",
    street: "",
    house_number: "",
    contact_name: "",
    phone: "",
    owner_name: "",
    owner_phone: "",
    contact_phone_for_drivers: ""
  });

  const fetchFleets = async () => {
    const { data } = await supabase
      .from("fleets")
      .select("*")
      .order("name");
    setFleets(data || []);
  };

  useEffect(() => {
    fetchFleets();
  }, []);

  const addFleet = async () => {
    if (!newFleet.name.trim()) {
      toast.error("Nazwa floty jest wymagana");
      return;
    }

    const { error } = await supabase
      .from("fleets")
      .insert([newFleet]);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Dodano flotę");
    setNewFleet({ 
      name: "", nip: "", city: "", postal_code: "", street: "", house_number: "",
      contact_name: "", phone: "", owner_name: "", owner_phone: "", contact_phone_for_drivers: ""
    });
    fetchFleets();
  };

  const updateFleet = async (id: string, updates: any) => {
    const { error } = await supabase
      .from("fleets")
      .update(updates)
      .eq("id", id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Zaktualizowano flotę");
    setIsEditing(null);
    fetchFleets();
  };

  const deleteFleet = async (id: string) => {
    if (!confirm("Czy na pewno chcesz usunąć tę flotę?")) return;

    const { error } = await supabase
      .from("fleets")
      .delete()
      .eq("id", id);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Usunięto flotę");
    fetchFleets();
  };

  return (
    <div className="space-y-6">
      {/* Dodaj nową flotę */}
      <Card className="rounded-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Dodaj nową flotę
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="fleet-name">Nazwa floty *</Label>
              <Input
                id="fleet-name"
                value={newFleet.name}
                onChange={(e) => setNewFleet({ ...newFleet, name: e.target.value })}
                placeholder="Nazwa floty"
                className="rounded-lg"
              />
            </div>
            <div>
              <Label htmlFor="fleet-nip">NIP</Label>
              <Input
                id="fleet-nip"
                value={newFleet.nip}
                onChange={(e) => setNewFleet({ ...newFleet, nip: e.target.value })}
                placeholder="NIP"
                className="rounded-lg"
              />
            </div>
            <div>
              <Label htmlFor="fleet-city">Miasto</Label>
              <Input
                id="fleet-city"
                value={newFleet.city}
                onChange={(e) => setNewFleet({ ...newFleet, city: e.target.value })}
                placeholder="Miasto"
                className="rounded-lg"
              />
            </div>
            <div>
              <Label htmlFor="fleet-postal">Kod pocztowy</Label>
              <Input
                id="fleet-postal"
                value={newFleet.postal_code}
                onChange={(e) => setNewFleet({ ...newFleet, postal_code: e.target.value })}
                placeholder="00-000"
                className="rounded-lg"
              />
            </div>
            <div>
              <Label htmlFor="fleet-street">Ulica</Label>
              <Input
                id="fleet-street"
                value={newFleet.street}
                onChange={(e) => setNewFleet({ ...newFleet, street: e.target.value })}
                placeholder="Nazwa ulicy"
                className="rounded-lg"
              />
            </div>
            <div>
              <Label htmlFor="fleet-house">Nr domu</Label>
              <Input
                id="fleet-house"
                value={newFleet.house_number}
                onChange={(e) => setNewFleet({ ...newFleet, house_number: e.target.value })}
                placeholder="Nr domu/mieszkania"
                className="rounded-lg"
              />
            </div>
            <div>
              <Label htmlFor="fleet-owner">Właściciel floty</Label>
              <Input
                id="fleet-owner"
                value={newFleet.owner_name}
                onChange={(e) => setNewFleet({ ...newFleet, owner_name: e.target.value })}
                placeholder="Imię i nazwisko właściciela"
                className="rounded-lg"
              />
            </div>
            <div>
              <Label htmlFor="fleet-owner-phone">Tel. właściciela</Label>
              <Input
                id="fleet-owner-phone"
                value={newFleet.owner_phone}
                onChange={(e) => setNewFleet({ ...newFleet, owner_phone: e.target.value })}
                placeholder="Numer telefonu właściciela"
                className="rounded-lg"
              />
            </div>
            <div>
              <Label htmlFor="fleet-contact">Osoba do kontaktu</Label>
              <Input
                id="fleet-contact"
                value={newFleet.contact_name}
                onChange={(e) => setNewFleet({ ...newFleet, contact_name: e.target.value })}
                placeholder="Imię i nazwisko"
                className="rounded-lg"
              />
            </div>
            <div>
              <Label htmlFor="fleet-phone">Telefon biura</Label>
              <Input
                id="fleet-phone"
                value={newFleet.phone}
                onChange={(e) => setNewFleet({ ...newFleet, phone: e.target.value })}
                placeholder="Numer telefonu biura"
                className="rounded-lg"
              />
            </div>
            <div>
              <Label htmlFor="fleet-driver-phone">Tel. dla kierowcy</Label>
              <Input
                id="fleet-driver-phone"
                value={newFleet.contact_phone_for_drivers}
                onChange={(e) => setNewFleet({ ...newFleet, contact_phone_for_drivers: e.target.value })}
                placeholder="Numer telefonu dla kierowców"
                className="rounded-lg"
              />
            </div>
          </div>
          <Button onClick={addFleet} className="rounded-lg">
            Dodaj flotę
          </Button>
        </CardContent>
      </Card>

      {/* Lista flot */}
      <div className="grid gap-4">
        {fleets.map((fleet) => (
          <Card key={fleet.id} className="rounded-lg">
            <Collapsible 
              open={expandedFleets.has(fleet.id)} 
              onOpenChange={(open) => {
                const newExpanded = new Set(expandedFleets);
                if (open) {
                  newExpanded.add(fleet.id);
                } else {
                  newExpanded.delete(fleet.id);
                  setIsEditing(null); // Cancel editing when collapsing
                }
                setExpandedFleets(newExpanded);
              }}
            >
              <CollapsibleTrigger asChild>
                <CardContent className="p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      {expandedFleets.has(fleet.id) ? 
                        <ChevronDown className="h-4 w-4 text-muted-foreground" /> : 
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      }
                      <div>
                        <h3 className="font-semibold text-lg">{fleet.name}</h3>
                        {fleet.nip && <p className="text-sm text-muted-foreground">NIP: {fleet.nip}</p>}
                      </div>
                    </div>
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setExpandedFleets(prev => new Set([...prev, fleet.id]));
                          setIsEditing(fleet.id);
                        }}
                        className="rounded-lg"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteFleet(fleet.id)}
                        className="rounded-lg"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 px-4 pb-4">
                  {isEditing === fleet.id ? (
                    <EditFleetForm
                      fleet={fleet}
                      onSave={(updates) => updateFleet(fleet.id, updates)}
                      onCancel={() => setIsEditing(null)}
                    />
                  ) : (
                    <div className="space-y-3 mt-4 pt-4 border-t">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        {fleet.city && <div><span className="font-medium">Miasto:</span> {fleet.city}</div>}
                        {fleet.postal_code && <div><span className="font-medium">Kod pocztowy:</span> {fleet.postal_code}</div>}
                        {fleet.street && <div><span className="font-medium">Ulica:</span> {fleet.street}</div>}
                        {fleet.house_number && <div><span className="font-medium">Nr domu:</span> {fleet.house_number}</div>}
                        {fleet.owner_name && <div><span className="font-medium">Właściciel:</span> {fleet.owner_name}</div>}
                        {fleet.owner_phone && <div><span className="font-medium">Tel. właściciela:</span> {fleet.owner_phone}</div>}
                        {fleet.contact_name && <div><span className="font-medium">Osoba kontaktowa:</span> {fleet.contact_name}</div>}
                        {fleet.phone && <div><span className="font-medium">Tel. biura:</span> {fleet.phone}</div>}
                        {fleet.contact_phone_for_drivers && <div><span className="font-medium">Tel. dla kierowcy:</span> {fleet.contact_phone_for_drivers}</div>}
                      </div>
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        ))}
      </div>
    </div>
  );
}

function EditFleetForm({ fleet, onSave, onCancel }: { 
  fleet: any; 
  onSave: (updates: any) => void; 
  onCancel: () => void; 
}) {
  const [formData, setFormData] = useState({
    name: fleet.name || "",
    nip: fleet.nip || "",
    city: fleet.city || "",
    postal_code: fleet.postal_code || "",
    street: fleet.street || "",
    house_number: fleet.house_number || "",
    contact_name: fleet.contact_name || "",
    phone: fleet.phone || "",
    owner_name: fleet.owner_name || "",
    owner_phone: fleet.owner_phone || "",
    contact_phone_for_drivers: fleet.contact_phone_for_drivers || ""
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Nazwa floty *</Label>
          <Input
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            className="rounded-lg"
          />
        </div>
        <div>
          <Label>NIP</Label>
          <Input
            value={formData.nip}
            onChange={(e) => setFormData({ ...formData, nip: e.target.value })}
            className="rounded-lg"
          />
        </div>
        <div>
          <Label>Miasto</Label>
          <Input
            value={formData.city}
            onChange={(e) => setFormData({ ...formData, city: e.target.value })}
            className="rounded-lg"
          />
        </div>
        <div>
          <Label>Kod pocztowy</Label>
          <Input
            value={formData.postal_code}
            onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
            className="rounded-lg"
          />
        </div>
        <div>
          <Label>Ulica</Label>
          <Input
            value={formData.street}
            onChange={(e) => setFormData({ ...formData, street: e.target.value })}
            className="rounded-lg"
          />
        </div>
        <div>
          <Label>Nr domu</Label>
          <Input
            value={formData.house_number}
            onChange={(e) => setFormData({ ...formData, house_number: e.target.value })}
            className="rounded-lg"
          />
        </div>
        <div>
          <Label>Właściciel floty</Label>
          <Input
            value={formData.owner_name}
            onChange={(e) => setFormData({ ...formData, owner_name: e.target.value })}
            className="rounded-lg"
          />
        </div>
        <div>
          <Label>Tel. właściciela</Label>
          <Input
            value={formData.owner_phone}
            onChange={(e) => setFormData({ ...formData, owner_phone: e.target.value })}
            className="rounded-lg"
          />
        </div>
        <div>
          <Label>Osoba kontaktowa</Label>
          <Input
            value={formData.contact_name}
            onChange={(e) => setFormData({ ...formData, contact_name: e.target.value })}
            className="rounded-lg"
          />
        </div>
        <div>
          <Label>Tel. biura</Label>
          <Input
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            className="rounded-lg"
          />
        </div>
        <div>
          <Label>Tel. dla kierowcy</Label>
          <Input
            value={formData.contact_phone_for_drivers}
            onChange={(e) => setFormData({ ...formData, contact_phone_for_drivers: e.target.value })}
            className="rounded-lg"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => onSave(formData)} className="rounded-lg">
          Zapisz
        </Button>
        <Button variant="outline" onClick={onCancel} className="rounded-lg">
          Anuluj
        </Button>
      </div>
    </div>
  );
}
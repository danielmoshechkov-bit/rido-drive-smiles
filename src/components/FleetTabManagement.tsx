import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Trash2, Edit, Plus } from "lucide-react";

export function FleetTabManagement({ cityId }: { cityId: string }) {
  const [fleets, setFleets] = useState<any[]>([]);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const [newFleet, setNewFleet] = useState({
    name: "",
    nip: "",
    address: "",
    contact_person: "",
    phone: ""
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
    setNewFleet({ name: "", nip: "", address: "", contact_person: "", phone: "" });
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
              <Label htmlFor="fleet-address">Adres</Label>
              <Input
                id="fleet-address"
                value={newFleet.address}
                onChange={(e) => setNewFleet({ ...newFleet, address: e.target.value })}
                placeholder="Adres"
                className="rounded-lg"
              />
            </div>
            <div>
              <Label htmlFor="fleet-contact">Osoba kontaktowa</Label>
              <Input
                id="fleet-contact"
                value={newFleet.contact_person}
                onChange={(e) => setNewFleet({ ...newFleet, contact_person: e.target.value })}
                placeholder="Imię i nazwisko"
                className="rounded-lg"
              />
            </div>
            <div>
              <Label htmlFor="fleet-phone">Telefon</Label>
              <Input
                id="fleet-phone"
                value={newFleet.phone}
                onChange={(e) => setNewFleet({ ...newFleet, phone: e.target.value })}
                placeholder="Numer telefonu"
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
            <CardContent className="p-4">
              {isEditing === fleet.id ? (
                <EditFleetForm
                  fleet={fleet}
                  onSave={(updates) => updateFleet(fleet.id, updates)}
                  onCancel={() => setIsEditing(null)}
                />
              ) : (
                <div className="flex justify-between items-start">
                  <div className="space-y-2 flex-1">
                    <h3 className="font-semibold text-lg">{fleet.name}</h3>
                    {fleet.nip && <p className="text-sm text-muted-foreground">NIP: {fleet.nip}</p>}
                    {fleet.address && <p className="text-sm text-muted-foreground">Adres: {fleet.address}</p>}
                    {fleet.contact_person && <p className="text-sm text-muted-foreground">Kontakt: {fleet.contact_person}</p>}
                    {fleet.phone && <p className="text-sm text-muted-foreground">Telefon: {fleet.phone}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditing(fleet.id)}
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
              )}
            </CardContent>
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
    address: fleet.address || "",
    contact_person: fleet.contact_person || "",
    phone: fleet.phone || ""
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
          <Label>Adres</Label>
          <Input
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            className="rounded-lg"
          />
        </div>
        <div>
          <Label>Osoba kontaktowa</Label>
          <Input
            value={formData.contact_person}
            onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
            className="rounded-lg"
          />
        </div>
        <div>
          <Label>Telefon</Label>
          <Input
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
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
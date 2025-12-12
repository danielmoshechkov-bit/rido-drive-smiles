import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Trash2, Plus, ChevronDown, ChevronUp, Building, X, Search } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { InlineEdit } from "./InlineEdit";

interface Fleet {
  id: string;
  name: string;
  nip: string | null;
  city: string | null;
  postal_code: string | null;
  street: string | null;
  house_number: string | null;
  contact_name: string | null;
  phone: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  contact_phone_for_drivers: string | null;
  email: string | null;
}

export function FleetTabManagement({ cityId }: { cityId: string }) {
  const [fleets, setFleets] = useState<Fleet[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expandedFleets, setExpandedFleets] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [newFleet, setNewFleet] = useState({
    name: "",
    nip: "",
    city: "",
    postal_code: "",
    address: "",
    contact_name: "",
    phone: "",
    owner_name: "",
    owner_phone: "",
    contact_phone_for_drivers: "",
    email: ""
  });

  const fetchFleets = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("fleets")
      .select("*")
      .order("name");
    setFleets(data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchFleets();
  }, []);

  const addFleet = async () => {
    if (!newFleet.name.trim()) {
      toast.error("Nazwa floty jest wymagana");
      return;
    }

    // Split address into street and house_number for database
    const fleetData = {
      ...newFleet,
      street: newFleet.address.split(' ').slice(0, -1).join(' ') || newFleet.address,
      house_number: newFleet.address.split(' ').slice(-1)[0] || null
    };
    delete (fleetData as any).address;

    const { error } = await supabase
      .from("fleets")
      .insert([fleetData]);

    if (error) {
      toast.error(error.message);
      return;
    }

    toast.success("Dodano flotę");
    setNewFleet({ 
      name: "", nip: "", city: "", postal_code: "", address: "",
      contact_name: "", phone: "", owner_name: "", owner_phone: "", contact_phone_for_drivers: "", email: ""
    });
    setShowAddForm(false);
    fetchFleets();
  };

  const updateFleetField = async (fleetId: string, field: string, value: string) => {
    try {
      let updateData: any = {};
      
      if (field === 'address') {
        // Split address into street and house_number
        const addressParts = value.split(' ');
        updateData = {
          street: addressParts.slice(0, -1).join(' ') || value,
          house_number: addressParts.slice(-1)[0] || null
        };
      } else {
        updateData = { [field]: value };
      }

      const { error } = await supabase
        .from("fleets")
        .update(updateData)
        .eq("id", fleetId);

      if (error) throw error;
      
      toast.success("Zaktualizowano flotę");
      fetchFleets();
    } catch (error) {
      toast.error("Błąd podczas aktualizacji floty");
    }
  };

  const deleteFleet = async (id: string) => {
    if (!confirm("Czy na pewno chcesz usunąć tę flotę? Wszyscy kierowcy i pojazdy zostaną od niej odłączeni.")) return;

    try {
      // 1. Odpnij kierowców od floty
      await supabase
        .from("drivers")
        .update({ fleet_id: null })
        .eq("fleet_id", id);

      // 2. Odpnij pojazdy od floty
      await supabase
        .from("vehicles")
        .update({ fleet_id: null })
        .eq("fleet_id", id);

      // 3. Usuń przypisania kierowców do pojazdów w tej flocie
      await supabase
        .from("driver_vehicle_assignments")
        .delete()
        .eq("fleet_id", id);

      // 4. Usuń zaproszenia flotowe
      await supabase
        .from("fleet_invitations")
        .delete()
        .eq("fleet_id", id);

      // 5. Usuń delegowane role
      await supabase
        .from("fleet_delegated_roles")
        .delete()
        .eq("fleet_id", id);

      // 6. Usuń konta użytkowników flotowych
      await supabase
        .from("user_roles")
        .delete()
        .eq("fleet_id", id);

      // 7. Teraz usuń flotę
      const { error } = await supabase
        .from("fleets")
        .delete()
        .eq("id", id);

      if (error) throw error;

      toast.success("Usunięto flotę");
      fetchFleets();
    } catch (error: any) {
      console.error("Error deleting fleet:", error);
      toast.error("Błąd podczas usuwania floty: " + (error.message || "Nieznany błąd"));
    }
  };

  const toggleExpanded = (fleetId: string) => {
    const newExpanded = new Set(expandedFleets);
    if (newExpanded.has(fleetId)) {
      newExpanded.delete(fleetId);
    } else {
      newExpanded.add(fleetId);
    }
    setExpandedFleets(newExpanded);
  };

  const handleFleetAdded = () => {
    setShowAddForm(false);
    fetchFleets();
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Ładowanie...</p>
      </div>
    );
  }

  if (showAddForm) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Dodaj nową flotę</h3>
          <Button 
            variant="outline" 
            onClick={() => setShowAddForm(false)}
            className="text-sm"
          >
            Anuluj
          </Button>
        </div>
        <Card className="p-6">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="fleet-name">Nazwa floty *</Label>
                <Input
                  id="fleet-name"
                  value={newFleet.name}
                  onChange={(e) => setNewFleet({ ...newFleet, name: e.target.value })}
                  placeholder="Nazwa floty"
                />
              </div>
              <div>
                <Label htmlFor="fleet-nip">NIP</Label>
                <Input
                  id="fleet-nip"
                  value={newFleet.nip}
                  onChange={(e) => setNewFleet({ ...newFleet, nip: e.target.value })}
                  placeholder="NIP"
                />
              </div>
              <div>
                <Label htmlFor="fleet-email">Adres email</Label>
                <Input
                  id="fleet-email"
                  type="email"
                  value={newFleet.email}
                  onChange={(e) => setNewFleet({ ...newFleet, email: e.target.value })}
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <Label htmlFor="fleet-city">Miasto</Label>
                <Input
                  id="fleet-city"
                  value={newFleet.city}
                  onChange={(e) => setNewFleet({ ...newFleet, city: e.target.value })}
                  placeholder="Miasto"
                />
              </div>
              <div>
                <Label htmlFor="fleet-postal">Kod pocztowy</Label>
                <Input
                  id="fleet-postal"
                  value={newFleet.postal_code}
                  onChange={(e) => setNewFleet({ ...newFleet, postal_code: e.target.value })}
                  placeholder="00-000"
                />
              </div>
              <div>
                <Label htmlFor="fleet-address">Adres (ulica i nr)</Label>
                <Input
                  id="fleet-address"
                  value={newFleet.address}
                  onChange={(e) => setNewFleet({ ...newFleet, address: e.target.value })}
                  placeholder="ul. Przykładowa 123"
                />
              </div>
              <div>
                <Label htmlFor="fleet-owner">Właściciel floty</Label>
                <Input
                  id="fleet-owner"
                  value={newFleet.owner_name}
                  onChange={(e) => setNewFleet({ ...newFleet, owner_name: e.target.value })}
                  placeholder="Imię i nazwisko właściciela"
                />
              </div>
              <div>
                <Label htmlFor="fleet-owner-phone">Tel. właściciela</Label>
                <Input
                  id="fleet-owner-phone"
                  value={newFleet.owner_phone}
                  onChange={(e) => setNewFleet({ ...newFleet, owner_phone: e.target.value })}
                  placeholder="Numer telefonu właściciela"
                />
              </div>
              <div>
                <Label htmlFor="fleet-contact">Osoba do kontaktu dla kierowcy</Label>
                <Input
                  id="fleet-contact"
                  value={newFleet.contact_name}
                  onChange={(e) => setNewFleet({ ...newFleet, contact_name: e.target.value })}
                  placeholder="Imię i nazwisko"
                />
              </div>
              <div>
                <Label htmlFor="fleet-driver-phone">Tel. dla kontaktu kierowcy</Label>
                <Input
                  id="fleet-driver-phone"
                  value={newFleet.contact_phone_for_drivers}
                  onChange={(e) => setNewFleet({ ...newFleet, contact_phone_for_drivers: e.target.value })}
                  placeholder="Numer telefonu dla kierowców"
                />
              </div>
            </div>
            <Button onClick={addFleet}>
              Dodaj flotę
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (fleets.length === 0) {
    return (
      <div className="text-center py-12">
        <Building className="w-16 h-16 mx-auto mb-4 text-muted-foreground/50" />
        <h3 className="text-lg font-medium mb-2">Brak flot</h3>
        <p className="text-muted-foreground mb-6">
          Nie masz jeszcze dodanych flot
        </p>
        <Button 
          onClick={() => setShowAddForm(true)}
          className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
        >
          <Plus className="w-4 h-4" />
          Dodaj nową flotę
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="relative w-full max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          placeholder="Szukaj floty..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10 h-10 rounded-lg"
        />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Floty ({fleets.filter(f => f.name.toLowerCase().includes(searchTerm.toLowerCase())).length})</h3>
        <Button 
          onClick={() => setShowAddForm(true)}
          className="bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
        >
          <Plus className="w-4 h-4" />
          Dodaj nową flotę
        </Button>
      </div>

      {/* Fleet List */}
      <div className="space-y-4">
        {fleets.filter(f => f.name.toLowerCase().includes(searchTerm.toLowerCase())).map((fleet) => {
          return (
            <Collapsible
              key={fleet.id}
              open={expandedFleets.has(fleet.id)}
              onOpenChange={() => toggleExpanded(fleet.id)}
            >
              <Card className="border rounded-lg">
                <CollapsibleTrigger asChild>
                  <div className="p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between">
                      {/* Main content */}
                      <div className="flex-1 space-y-3">
                         <div className="flex items-center gap-6">
                           <div className="min-w-[150px]">
                             <span className="font-medium text-sm text-muted-foreground">Nazwa skrócona:</span>
                             <div className="font-semibold">{fleet.name}</div>
                           </div>
                           <div className="min-w-[200px]">
                             <span className="font-medium text-sm text-muted-foreground">Osoba do kontaktu dla kierowcy:</span>
                             <div className="font-semibold">{fleet.contact_name || "Brak"}</div>
                           </div>
                           <div className="min-w-[180px]">
                             <span className="font-medium text-sm text-muted-foreground">Tel. dla kontaktu kierowcy:</span>
                             <div className="font-semibold">{fleet.contact_phone_for_drivers || "Brak"}</div>
                           </div>
                         </div>
                        
                        {/* Second row - NIP */}
                        {fleet.nip && (
                          <div className="flex items-center gap-6 pt-2 border-t border-muted/30">
                            <div className="min-w-[200px]">
                              <span className="font-medium text-sm text-muted-foreground">NIP:</span>
                              <div className="font-semibold">{fleet.nip}</div>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {/* Expand button */}
                      <div className="ml-4">
                        {expandedFleets.has(fleet.id) ? 
                          <ChevronUp className="h-5 w-5" /> : 
                          <ChevronDown className="h-5 w-5" />
                        }
                      </div>
                    </div>
                  </div>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="border-t p-4">
                    {/* Delete button */}
                    <div className="flex justify-end mb-4">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteFleet(fleet.id)}
                        className="gap-2"
                      >
                        <Trash2 className="h-4 w-4" />
                        Usuń
                      </Button>
                    </div>

                    {/* Editable fields */}
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">Nazwa floty</Label>
                          <div onClick={(e) => e.stopPropagation()}>
                            <InlineEdit
                              value={fleet.name || ""}
                              onSave={(value) => updateFleetField(fleet.id, "name", value)}
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">NIP</Label>
                          <div onClick={(e) => e.stopPropagation()}>
                            <InlineEdit
                              value={fleet.nip || ""}
                              onSave={(value) => updateFleetField(fleet.id, "nip", value)}
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">Adres email</Label>
                          <div onClick={(e) => e.stopPropagation()}>
                            <InlineEdit
                              value={fleet.email || ""}
                              onSave={(value) => updateFleetField(fleet.id, "email", value)}
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">Miasto</Label>
                          <div onClick={(e) => e.stopPropagation()}>
                            <InlineEdit
                              value={fleet.city || ""}
                              onSave={(value) => updateFleetField(fleet.id, "city", value)}
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">Kod pocztowy</Label>
                          <div onClick={(e) => e.stopPropagation()}>
                            <InlineEdit
                              value={fleet.postal_code || ""}
                              onSave={(value) => updateFleetField(fleet.id, "postal_code", value)}
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">Adres (ulica i nr)</Label>
                          <div onClick={(e) => e.stopPropagation()}>
                            <InlineEdit
                              value={`${fleet.street || ""}${fleet.house_number ? " " + fleet.house_number : ""}`.trim()}
                              onSave={(value) => updateFleetField(fleet.id, "address", value)}
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">Właściciel floty</Label>
                          <div onClick={(e) => e.stopPropagation()}>
                            <InlineEdit
                              value={fleet.owner_name || ""}
                              onSave={(value) => updateFleetField(fleet.id, "owner_name", value)}
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">Tel. właściciela</Label>
                          <div onClick={(e) => e.stopPropagation()}>
                            <InlineEdit
                              value={fleet.owner_phone || ""}
                              onSave={(value) => updateFleetField(fleet.id, "owner_phone", value)}
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-sm font-medium text-muted-foreground">Osoba do kontaktu dla kierowcy</Label>
                          <div onClick={(e) => e.stopPropagation()}>
                            <InlineEdit
                              value={fleet.contact_name || ""}
                              onSave={(value) => updateFleetField(fleet.id, "contact_name", value)}
                            />
                          </div>
                        </div>
                         <div>
                           <Label className="text-sm font-medium text-muted-foreground">Tel. dla kontaktu kierowcy</Label>
                           <div onClick={(e) => e.stopPropagation()}>
                             <InlineEdit
                               value={fleet.contact_phone_for_drivers || ""}
                               onSave={(value) => updateFleetField(fleet.id, "contact_phone_for_drivers", value)}
                             />
                           </div>
                         </div>
                      </div>
                    </div>
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
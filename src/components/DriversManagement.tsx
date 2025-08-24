// ===================================================================
// File: src/components/DriversManagement.tsx   (PODMIANA CAŁEGO PLIKU)
// Lista kierowców z: węższym polem "Szukaj", filtrem obok,
// oraz przyciskiem "+ Dodaj kierowcę" w prawym górnym rogu.
// Floty do filtra są pobierane z tabeli `fleets` (name,id,...).
// ===================================================================

import { useEffect, useMemo, useState } from "react";
import { Search, Plus, Edit2, Copy, Phone, Mail, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useDrivers } from "@/hooks/useDrivers";
import { AddDriverModal } from "./AddDriverModal";
import { EditDriverModal } from "./EditDriverModal";
import { InlineEdit } from "./InlineEdit";
import { supabase } from "@/integrations/supabase/client";

interface DriversManagementProps {
  cityId: string;
  cityName: string;
  onDriverUpdate: () => void;
}

/** pomocniczo: heurystyka "nowy kierowca" */
const isNewDriver = (created_at?: string | null) => {
  if (!created_at) return false;
  const created = new Date(created_at).getTime();
  const days14 = 14 * 24 * 60 * 60 * 1000;
  return Date.now() - created < days14;
};

export const DriversManagement = ({ cityId, cityName, onDriverUpdate }: DriversManagementProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingDriver, setEditingDriver] = useState<string | null>(null);

  // FILTRY
  const [fleets, setFleets] = useState<{ id: string; name: string }[]>([]);
  const [selectedFleets, setSelectedFleets] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<{ active: boolean; inactive: boolean; fresh: boolean }>({
    active: false, inactive: false, fresh: false
  });

  const { drivers, loading } = useDrivers(cityId);

  // pobranie flot do filtra (z zakładki Floty)
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("fleets")
        .select("id,name")
        .order("name", { ascending: true });
      if (!error && data) setFleets(data as any);
    })();
  }, []);

  // kolorystyka plakietek platform (zostawiona jak było)
  const getServiceColor = (service: string) => {
    switch (service.toLowerCase()) {
      case "uber": return "bg-black text-white hover:bg-gray-800";
      case "bolt": return "bg-green-500 text-white hover:bg-green-600";
      case "freenow": return "bg-red-500 text-white hover:bg-red-600";
      default: return "bg-gray-500 text-white hover:bg-gray-600";
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`Skopiowano ${label}: ${text}`);
  };

  const handleAddDriver = () => {
    onDriverUpdate();
    setShowAddModal(false);
  };

  const handleEditDriver = () => {
    onDriverUpdate();
    setEditingDriver(null);
  };

  const updateDriverField = async (driverId: string, field: string, value: string) => {
    const { error } = await supabase
      .from("drivers")
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq("id", driverId);

    if (error) throw error;
    onDriverUpdate();
  };

  const updatePlatformId = async (oldPlatformId: string, newValue: string) => {
    const { data: platformRecord, error: findError } = await supabase
      .from("driver_platform_ids")
      .select("id")
      .eq("platform_id", oldPlatformId)
      .single();

    if (findError || !platformRecord) throw new Error("Platform not found");

    const { error } = await supabase
      .from("driver_platform_ids")
      .update({ platform_id: newValue })
      .eq("id", platformRecord.id);

    if (error) throw error;
    onDriverUpdate();
  };

  // zastosowanie filtrów i wyszukiwarki
  const filteredDrivers = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    return drivers.filter((d: any) => {
      // wyszukiwarka
      const hay =
        `${d.first_name ?? ""} ${d.last_name ?? ""}`.toLowerCase() +
        ` ${d.email ?? ""}`.toLowerCase() +
        ` ${d.phone ?? ""}` +
        ` ${d.fleet_name ?? ""}`.toLowerCase();
      if (term && !hay.includes(term)) return false;

      // filtr: floty (jeśli coś zaznaczono)
      if (selectedFleets.size > 0) {
        const name = (d.fleet_name ?? "").toString();
        // UWAGA: oczekujemy, że backend/usługa listy kierowców podaje 'fleet_name'
        // (np. bieżąca flota z aktywnego przypisania). Jeśli brak – kierowca "odpada"
        if (!name || !selectedFleets.has(name)) return false;
      }

      // filtr: status
      if (status.active || status.inactive || status.fresh) {
        const isActive = d.is_active ?? true; // domyślnie traktujemy jako aktywnego
        const fresh = isNewDriver(d.created_at);

        let pass = false;
        if (status.active && isActive) pass = true;
        if (status.inactive && !isActive) pass = true;
        if (status.fresh && fresh) pass = true;
        if (!pass) return false;
      }

      return true;
    });
  }, [drivers, searchTerm, selectedFleets, status]);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-muted-foreground">Ładowanie kierowców...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-4">
          {/* Nagłówek: tytuł po lewej, +Dodaj po prawej */}
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Lista kierowców - {cityName}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Znaleziono {filteredDrivers.length} z {drivers.length} kierowców
              </p>
            </div>

            <Button onClick={() => setShowAddModal(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Dodaj kierowcę
            </Button>
          </div>

          {/* Pasek: mniejszy search + Filtry zaraz obok po prawej */}
          <div className="mt-4 flex items-center gap-2">
            <div className="relative flex-1 max-w-[520px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Szukaj kierowców…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-10"
              />
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-10 gap-2">
                  <Filter className="h-4 w-4" />
                  Filtry
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[280px]">
                <DropdownMenuLabel>Floty</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {fleets.length === 0 && (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    Brak zdefiniowanych flot
                  </div>
                )}
                {fleets.map((f) => (
                  <DropdownMenuCheckboxItem
                    key={f.id}
                    checked={selectedFleets.has(f.name)}
                    onCheckedChange={(checked) => {
                      const next = new Set(selectedFleets);
                      if (checked) next.add(f.name);
                      else next.delete(f.name);
                      setSelectedFleets(next);
                    }}
                  >
                    {f.name}
                  </DropdownMenuCheckboxItem>
                ))}

                <DropdownMenuSeparator />
                <DropdownMenuLabel>Status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={status.active}
                  onCheckedChange={(c) => setStatus((s) => ({ ...s, active: !!c }))}
                >
                  Aktywni
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={status.inactive}
                  onCheckedChange={(c) => setStatus((s) => ({ ...s, inactive: !!c }))}
                >
                  Nieaktywni
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={status.fresh}
                  onCheckedChange={(c) => setStatus((s) => ({ ...s, fresh: !!c }))}
                >
                  Nowi kierowcy
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>

        <CardContent>
          {filteredDrivers.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">
                {drivers.length === 0
                  ? "Brak kierowców w tym mieście. Zaimportuj dane CSV lub dodaj kierowcę ręcznie."
                  : "Nie znaleziono kierowców pasujących do filtrów/wyszukiwania."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredDrivers.map((driver: any) => (
                <div key={driver.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-3">
                      {/* Imię + przycisk edycji */}
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold">
                          {driver.first_name} {driver.last_name}
                        </h3>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingDriver(driver.id)}
                          className="h-8 w-8 p-0"
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        {/* Jeśli mamy nazwę floty dla kierowcy – pokaż jako plakietkę */}
                        {driver.fleet_name && (
                          <Badge variant="outline" className="rounded-full px-3 py-1">
                            {driver.fleet_name}
                          </Badge>
                        )}
                        {isNewDriver(driver.created_at) && (
                          <Badge className="bg-emerald-100 text-emerald-700 rounded-full px-3 py-1">
                            NOWY
                          </Badge>
                        )}
                      </div>

                      {/* Plakietki platform (same nazwy) */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {driver.platform_ids && driver.platform_ids.length > 0 ? (
                          driver.platform_ids.map((platform: any) => (
                            <Badge
                              key={platform.platform}
                              className={`${getServiceColor(platform.platform)} rounded-full px-4 py-2 text-sm font-medium`}
                            >
                              {platform.platform.toUpperCase()}
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="outline" className="rounded-full px-4 py-2">
                            Brak platform
                          </Badge>
                        )}
                      </div>

                      {/* Kontakt + ID platformowe w jednej linii */}
                      <div className="flex items-center gap-6 flex-wrap text-sm">
                        {/* Telefon */}
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          {driver.phone ? (
                            <InlineEdit
                              value={driver.phone}
                              onSave={(value) => updateDriverField(driver.id, "phone", value)}
                              placeholder="Brak telefonu"
                            />
                          ) : (
                            <InlineEdit
                              value=""
                              onSave={(value) => updateDriverField(driver.id, "phone", value)}
                              placeholder="Dodaj telefon"
                              className="text-muted-foreground"
                            />
                          )}
                        </div>

                        {/* Email */}
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          {driver.email ? (
                            <InlineEdit
                              value={driver.email}
                              onSave={(value) => updateDriverField(driver.id, "email", value)}
                              placeholder="Brak email"
                            />
                          ) : (
                            <InlineEdit
                              value=""
                              onSave={(value) => updateDriverField(driver.id, "email", value)}
                              placeholder="Dodaj email"
                              className="text-muted-foreground"
                            />
                          )}
                        </div>

                        {/* Platform IDs */}
                        {driver.platform_ids && driver.platform_ids.map((platform: any) => (
                          <div key={platform.platform} className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className={`text-xs px-2 py-1 ${getServiceColor(platform.platform).replace("bg-", "border-").replace("text-white", "text-primary")}`}
                            >
                              {platform.platform.toUpperCase()}
                            </Badge>
                            <InlineEdit
                              value={platform.platform_id}
                              onSave={(value) => updatePlatformId(platform.platform_id, value)}
                              truncateLength={8}
                              className="font-mono"
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(platform.platform_id, platform.platform.toUpperCase())}
                              className="h-6 w-6 p-0"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>

                      {/* brakujące dane – sygnalizacje */}
                      <div className="flex gap-2 text-xs">
                        {!driver.phone && (
                          <Badge variant="outline" className="text-orange-600 border-orange-200">
                            Brak telefonu
                          </Badge>
                        )}
                        {!driver.email && (
                          <Badge variant="outline" className="text-orange-600 border-orange-200">
                            Brak email
                          </Badge>
                        )}
                        {(!driver.platform_ids || driver.platform_ids.length === 0) && (
                          <Badge variant="outline" className="text-red-600 border-red-200">
                            Brak platform
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modale */}
      <AddDriverModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        cityId={cityId}
        onSuccess={handleAddDriver}
      />

      {editingDriver && (
        <EditDriverModal
          isOpen={true}
          onClose={() => setEditingDriver(null)}
          driverId={editingDriver}
          onSuccess={handleEditDriver}
        />
      )}
    </>
  );
};
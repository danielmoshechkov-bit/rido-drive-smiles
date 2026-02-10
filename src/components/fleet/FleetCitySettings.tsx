import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Edit, Trash2, MapPin } from "lucide-react";
import { useCities } from "@/hooks/useCities";

interface CitySettings {
  id: string;
  city_name: string;
  platform: string;
  settlement_mode: string;
  vat_rate: number;
  base_fee: number;
  additional_percent_rate: number;
  secondary_vat_rate: number;
  invoice_email: string | null;
  uber_calculation_mode: string | null;
  is_active: boolean;
}

interface FleetCitySettingsProps {
  fleetId: string;
}

interface CityGroup {
  city_name: string;
  bolt: CitySettings | null;
  uber: CitySettings | null;
}

export function FleetCitySettings({ fleetId }: FleetCitySettingsProps) {
  const [cities, setCities] = useState<CitySettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCity, setEditingCity] = useState<string | null>(null); // city_name being edited
  const [saving, setSaving] = useState(false);
  const { cities: availableCities, addCity: addCityToSystem } = useCities();

  // Form state
  const [cityName, setCityName] = useState("");
  const [newCityName, setNewCityName] = useState("");

  // Bolt settings
  const [boltMode, setBoltMode] = useState<"single_tax" | "dual_tax">("single_tax");
  const [boltVat, setBoltVat] = useState("8");
  const [boltBaseFee, setBoltBaseFee] = useState("0");
  const [boltAdditional, setBoltAdditional] = useState("0");
  const [boltSecondaryVat, setBoltSecondaryVat] = useState("23");
  const [boltEmail, setBoltEmail] = useState("");

  // Uber settings
  const [uberMode, setUberMode] = useState<"single_tax" | "dual_tax">("single_tax");
  const [uberVat, setUberVat] = useState("8");
  const [uberBaseFee, setUberBaseFee] = useState("0");
  const [uberAdditional, setUberAdditional] = useState("0");
  const [uberSecondaryVat, setUberSecondaryVat] = useState("23");
  const [uberCalcMode, setUberCalcMode] = useState<"netto" | "brutto">("netto");

  useEffect(() => {
    fetchCities();
  }, [fleetId]);

  const fetchCities = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("fleet_city_settings" as any)
        .select("*")
        .eq("fleet_id", fleetId)
        .order("city_name");
      if (error) throw error;
      setCities((data as unknown as CitySettings[]) || []);
    } catch (error) {
      console.error("Error fetching city settings:", error);
    } finally {
      setLoading(false);
    }
  };

  // Group cities by city_name
  const cityGroups: CityGroup[] = (() => {
    const map: Record<string, CityGroup> = {};
    for (const c of cities) {
      if (!map[c.city_name]) map[c.city_name] = { city_name: c.city_name, bolt: null, uber: null };
      if (c.platform === "uber") map[c.city_name].uber = c;
      else map[c.city_name].bolt = c;
    }
    return Object.values(map).sort((a, b) => a.city_name.localeCompare(b.city_name));
  })();

  const openAdd = () => {
    setEditingCity(null);
    setCityName("");
    setNewCityName("");
    resetForm();
    setDialogOpen(true);
  };

  const resetForm = () => {
    setBoltMode("single_tax");
    setBoltVat("8");
    setBoltBaseFee("0");
    setBoltAdditional("0");
    setBoltSecondaryVat("23");
    setBoltEmail("");
    setUberMode("single_tax");
    setUberVat("8");
    setUberBaseFee("0");
    setUberAdditional("0");
    setUberSecondaryVat("23");
    setUberCalcMode("netto");
  };

  const openEdit = (group: CityGroup) => {
    setEditingCity(group.city_name);
    setCityName(group.city_name);
    // Bolt
    const b = group.bolt;
    setBoltMode((b?.settlement_mode || "single_tax") as "single_tax" | "dual_tax");
    setBoltVat((b?.vat_rate ?? 8).toString());
    setBoltBaseFee((b?.base_fee ?? 0).toString());
    setBoltAdditional((b?.additional_percent_rate ?? 0).toString());
    setBoltSecondaryVat((b?.secondary_vat_rate ?? 23).toString());
    setBoltEmail(b?.invoice_email || "");
    // Uber
    const u = group.uber;
    setUberMode((u?.settlement_mode || "single_tax") as "single_tax" | "dual_tax");
    setUberVat((u?.vat_rate ?? 8).toString());
    setUberBaseFee((u?.base_fee ?? 0).toString());
    setUberAdditional((u?.additional_percent_rate ?? 0).toString());
    setUberSecondaryVat((u?.secondary_vat_rate ?? 23).toString());
    setUberCalcMode((u?.uber_calculation_mode || "netto") as "netto" | "brutto");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    let finalCityName = cityName;
    if (cityName === "__new__") {
      if (!newCityName.trim()) { toast.error("Podaj nazwę nowego miasta"); return; }
      finalCityName = newCityName.trim();
      try { await addCityToSystem(finalCityName); } catch (err: any) {
        if (!err.message?.includes("duplicate")) { toast.error("Błąd: " + err.message); return; }
      }
    }
    if (!finalCityName || finalCityName === "__new__") { toast.error("Wybierz miasto"); return; }

    setSaving(true);
    try {
      const existingGroup = cityGroups.find(g => g.city_name === finalCityName);

      // Save Bolt
      const boltPayload = {
        fleet_id: fleetId,
        city_name: finalCityName,
        platform: "bolt",
        settlement_mode: boltMode,
        vat_rate: parseFloat(boltVat) || 0,
        base_fee: parseFloat(boltBaseFee) || 0,
        additional_percent_rate: parseFloat(boltAdditional) || 0,
        secondary_vat_rate: parseFloat(boltSecondaryVat) || 23,
        invoice_email: boltEmail.trim() || null,
        uber_calculation_mode: null,
      };

      if (existingGroup?.bolt) {
        const { error } = await supabase.from("fleet_city_settings" as any).update(boltPayload).eq("id", existingGroup.bolt.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("fleet_city_settings" as any).insert([boltPayload]);
        if (error) throw error;
      }

      // Save Uber
      const uberPayload = {
        fleet_id: fleetId,
        city_name: finalCityName,
        platform: "uber",
        settlement_mode: uberMode,
        vat_rate: parseFloat(uberVat) || 0,
        base_fee: parseFloat(uberBaseFee) || 0,
        additional_percent_rate: parseFloat(uberAdditional) || 0,
        secondary_vat_rate: parseFloat(uberSecondaryVat) || 23,
        invoice_email: null,
        uber_calculation_mode: uberCalcMode,
      };

      if (existingGroup?.uber) {
        const { error } = await supabase.from("fleet_city_settings" as any).update(uberPayload).eq("id", existingGroup.uber.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("fleet_city_settings" as any).insert([uberPayload]);
        if (error) throw error;
      }

      toast.success(editingCity ? "Ustawienia zaktualizowane" : "Ustawienia dodane");
      setDialogOpen(false);
      fetchCities();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (group: CityGroup) => {
    if (!confirm(`Usunąć ustawienia dla ${group.city_name}?`)) return;
    try {
      const ids = [group.bolt?.id, group.uber?.id].filter(Boolean);
      for (const id of ids) {
        const { error } = await supabase.from("fleet_city_settings" as any).delete().eq("id", id);
        if (error) throw error;
      }
      toast.success("Usunięto");
      fetchCities();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const PlatformPanel = ({ platform, mode, setMode, vat, setVat, baseFee, setBaseFee, additional, setAdditional, secondaryVat, setSecondaryVat, email, setEmail, calcMode, setCalcMode }: {
    platform: "bolt" | "uber";
    mode: string; setMode: (v: "single_tax" | "dual_tax") => void;
    vat: string; setVat: (v: string) => void;
    baseFee: string; setBaseFee: (v: string) => void;
    additional: string; setAdditional: (v: string) => void;
    secondaryVat: string; setSecondaryVat: (v: string) => void;
    email?: string; setEmail?: (v: string) => void;
    calcMode?: string; setCalcMode?: (v: "netto" | "brutto") => void;
  }) => (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {platform === "bolt" ? (
          <Badge className="bg-green-600 text-white">Bolt</Badge>
        ) : (
          <Badge className="bg-black text-white">Uber</Badge>
        )}
      </div>

      <div>
        <Label className="text-xs">Tryb rozliczeń</Label>
        <div className="grid grid-cols-2 gap-2 mt-1">
          <label className={`flex flex-col items-center p-2 border rounded-lg cursor-pointer transition-colors text-center ${mode === "single_tax" ? "border-primary bg-primary/10" : "hover:bg-muted"}`}>
            <input type="radio" className="sr-only" checked={mode === "single_tax"} onChange={() => setMode("single_tax")} />
            <span className="text-xs font-medium">Jeden podatek</span>
            <span className="text-[10px] text-muted-foreground">{platform === "bolt" ? "VAT od brutto" : "VAT od netto"}</span>
          </label>
          <label className={`flex flex-col items-center p-2 border rounded-lg cursor-pointer transition-colors text-center ${mode === "dual_tax" ? "border-primary bg-primary/10" : "hover:bg-muted"}`}>
            <input type="radio" className="sr-only" checked={mode === "dual_tax"} onChange={() => setMode("dual_tax")} />
            <span className="text-xs font-medium">Dwa podatki</span>
            <span className="text-[10px] text-muted-foreground">{platform === "bolt" ? "8% + 23%" : "netto/brutto + kampanie"}</span>
          </label>
        </div>
      </div>

      {platform === "uber" && mode === "dual_tax" && calcMode !== undefined && setCalcMode && (
        <div>
          <Label className="text-xs">Sposób obliczania</Label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <label className={`flex flex-col items-center p-2 border rounded-lg cursor-pointer transition-colors text-center ${calcMode === "netto" ? "border-primary bg-primary/10" : "hover:bg-muted"}`}>
              <input type="radio" className="sr-only" checked={calcMode === "netto"} onChange={() => setCalcMode("netto")} />
              <span className="text-xs font-medium">Od netto</span>
              <span className="text-[10px] text-muted-foreground">netto + 25%</span>
            </label>
            <label className={`flex flex-col items-center p-2 border rounded-lg cursor-pointer transition-colors text-center ${calcMode === "brutto" ? "border-primary bg-primary/10" : "hover:bg-muted"}`}>
              <input type="radio" className="sr-only" checked={calcMode === "brutto"} onChange={() => setCalcMode("brutto")} />
              <span className="text-xs font-medium">Od brutto</span>
              <span className="text-[10px] text-muted-foreground">kol. G z CSV</span>
            </label>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">VAT (%)</Label>
          <Input type="number" value={vat} onChange={(e) => setVat(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Opłata stała (zł)</Label>
          <Input type="number" value={baseFee} onChange={(e) => setBaseFee(e.target.value)} />
        </div>
      </div>

      {mode === "dual_tax" && (
        <div className="grid grid-cols-2 gap-2 border-t pt-2">
          <div>
            <Label className="text-xs">Dod. % od brutto</Label>
            <Input type="number" value={additional} onChange={(e) => setAdditional(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">VAT kampanie (%)</Label>
            <Input type="number" value={secondaryVat} onChange={(e) => setSecondaryVat(e.target.value)} />
          </div>
        </div>
      )}

      {platform === "bolt" && email !== undefined && setEmail && (
        <div>
          <Label className="text-xs">Mail do faktur (B2B)</Label>
          <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="faktury@firma.pl" />
        </div>
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <MapPin className="h-4 w-4" />
              Ustawienia rozliczeń per miasto
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Oddzielne stawki Bolt i Uber dla każdego miasta.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openAdd} className="gap-1">
            <Plus className="h-3 w-3" /> Dodaj
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-4 text-muted-foreground text-sm">Ładowanie...</div>
        ) : cityGroups.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            Brak ustawień per miasto. Używane są globalne ustawienia floty.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Miasto</TableHead>
                  <TableHead className="text-xs">Bolt</TableHead>
                  <TableHead className="text-xs">Uber</TableHead>
                  <TableHead className="text-xs">Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cityGroups.map(group => (
                  <TableRow key={group.city_name} className="hover:bg-primary/10">
                    <TableCell className="font-medium text-sm">{group.city_name}</TableCell>
                    <TableCell className="text-xs">
                      {group.bolt ? (
                        <div className="space-y-0.5">
                          <Badge variant={group.bolt.settlement_mode === "dual_tax" ? "default" : "secondary"} className="text-[10px]">
                            {group.bolt.settlement_mode === "dual_tax" ? "Dwa podatki" : "Jeden podatek"}
                          </Badge>
                          <div className="text-muted-foreground">VAT {group.bolt.vat_rate}%</div>
                        </div>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-xs">
                      {group.uber ? (
                        <div className="space-y-0.5">
                          <Badge variant={group.uber.settlement_mode === "dual_tax" ? "default" : "secondary"} className="text-[10px]">
                            {group.uber.settlement_mode === "dual_tax" ? "Dwa podatki" : "Jeden podatek"}
                          </Badge>
                          {group.uber.uber_calculation_mode === "brutto" && (
                            <Badge variant="outline" className="text-[9px] ml-1">od brutto</Badge>
                          )}
                          <div className="text-muted-foreground">VAT {group.uber.vat_rate}%</div>
                        </div>
                      ) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(group)}>
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(group)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCity ? `Edytuj ustawienia – ${editingCity}` : "Dodaj ustawienia miasta"}</DialogTitle>
          </DialogHeader>

          {/* City selector */}
          {!editingCity && (
            <div>
              <Label className="text-xs">Miasto *</Label>
              <div className="space-y-2">
                <Select value={cityName} onValueChange={setCityName}>
                  <SelectTrigger>
                    <SelectValue placeholder="Wybierz miasto" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableCities.map(c => (
                      <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
                    ))}
                    <SelectItem value="__new__">+ Dodaj nowe miasto...</SelectItem>
                  </SelectContent>
                </Select>
                {cityName === "__new__" && (
                  <Input value={newCityName} onChange={(e) => setNewCityName(e.target.value)} placeholder="Wpisz nazwę nowego miasta" />
                )}
              </div>
            </div>
          )}

          {/* Two panels side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
            <Card className="border-green-500/30">
              <CardContent className="pt-4 pb-3">
                <PlatformPanel
                  platform="bolt"
                  mode={boltMode} setMode={setBoltMode}
                  vat={boltVat} setVat={setBoltVat}
                  baseFee={boltBaseFee} setBaseFee={setBoltBaseFee}
                  additional={boltAdditional} setAdditional={setBoltAdditional}
                  secondaryVat={boltSecondaryVat} setSecondaryVat={setBoltSecondaryVat}
                  email={boltEmail} setEmail={setBoltEmail}
                />
              </CardContent>
            </Card>
            <Card className="border-black/20">
              <CardContent className="pt-4 pb-3">
                <PlatformPanel
                  platform="uber"
                  mode={uberMode} setMode={setUberMode}
                  vat={uberVat} setVat={setUberVat}
                  baseFee={uberBaseFee} setBaseFee={setUberBaseFee}
                  additional={uberAdditional} setAdditional={setUberAdditional}
                  secondaryVat={uberSecondaryVat} setSecondaryVat={setUberSecondaryVat}
                  calcMode={uberCalcMode} setCalcMode={setUberCalcMode}
                />
              </CardContent>
            </Card>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Anuluj</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Zapisywanie..." : editingCity ? "Zapisz" : "Dodaj"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

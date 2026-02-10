import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Edit, Trash2, MapPin } from "lucide-react";

interface CitySettings {
  id: string;
  city_name: string;
  settlement_mode: string;
  vat_rate: number;
  base_fee: number;
  additional_percent_rate: number;
  secondary_vat_rate: number;
  invoice_email: string | null;
  is_active: boolean;
}

interface FleetCitySettingsProps {
  fleetId: string;
}

export function FleetCitySettings({ fleetId }: FleetCitySettingsProps) {
  const [cities, setCities] = useState<CitySettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CitySettings | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [cityName, setCityName] = useState("");
  const [settlementMode, setSettlementMode] = useState<"single_tax" | "dual_tax">("single_tax");
  const [vatRate, setVatRate] = useState("8");
  const [baseFee, setBaseFee] = useState("0");
  const [additionalPercent, setAdditionalPercent] = useState("0");
  const [secondaryVat, setSecondaryVat] = useState("23");
  const [invoiceEmail, setInvoiceEmail] = useState("");

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

  const openAdd = () => {
    setEditing(null);
    setCityName("");
    setSettlementMode("single_tax");
    setVatRate("8");
    setBaseFee("0");
    setAdditionalPercent("0");
    setSecondaryVat("23");
    setInvoiceEmail("");
    setDialogOpen(true);
  };

  const openEdit = (city: CitySettings) => {
    setEditing(city);
    setCityName(city.city_name);
    setSettlementMode(city.settlement_mode as "single_tax" | "dual_tax");
    setVatRate(city.vat_rate.toString());
    setBaseFee(city.base_fee.toString());
    setAdditionalPercent(city.additional_percent_rate.toString());
    setSecondaryVat(city.secondary_vat_rate.toString());
    setInvoiceEmail(city.invoice_email || "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!cityName.trim()) {
      toast.error("Podaj nazwę miasta");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        fleet_id: fleetId,
        city_name: cityName.trim(),
        settlement_mode: settlementMode,
        vat_rate: parseFloat(vatRate) || 0,
        base_fee: parseFloat(baseFee) || 0,
        additional_percent_rate: parseFloat(additionalPercent) || 0,
        secondary_vat_rate: parseFloat(secondaryVat) || 23,
        invoice_email: invoiceEmail.trim() || null,
      };

      if (editing) {
        const { error } = await supabase
          .from("fleet_city_settings" as any)
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("Ustawienia miasta zaktualizowane");
      } else {
        const { error } = await supabase
          .from("fleet_city_settings" as any)
          .insert([payload]);
        if (error) throw error;
        toast.success("Miasto dodane");
      }
      setDialogOpen(false);
      fetchCities();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Usunąć ustawienia tego miasta?")) return;
    try {
      const { error } = await supabase
        .from("fleet_city_settings" as any)
        .delete()
        .eq("id", id);
      if (error) throw error;
      toast.success("Usunięto");
      fetchCities();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

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
              Różne stawki VAT i opłaty dla różnych miast. Kierowcy przypisani do danego miasta dostaną te ustawienia.
            </CardDescription>
          </div>
          <Button size="sm" onClick={openAdd} className="gap-1">
            <Plus className="h-3 w-3" /> Dodaj miasto
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-4 text-muted-foreground text-sm">Ładowanie...</div>
        ) : cities.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            Brak ustawień per miasto. Używane są globalne ustawienia floty.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Miasto</TableHead>
                  <TableHead className="text-xs">Tryb</TableHead>
                  <TableHead className="text-xs">VAT</TableHead>
                  <TableHead className="text-xs">Opłata</TableHead>
                  <TableHead className="text-xs">Dod. %</TableHead>
                  <TableHead className="text-xs">Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cities.map(city => (
                  <TableRow key={city.id} className="hover:bg-primary/10">
                    <TableCell className="font-medium text-sm">{city.city_name}</TableCell>
                    <TableCell>
                      <Badge variant={city.settlement_mode === "dual_tax" ? "default" : "secondary"} className="text-[10px]">
                        {city.settlement_mode === "dual_tax" ? "Dwa podatki" : "Jeden podatek"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{city.vat_rate}%</TableCell>
                    <TableCell className="text-sm">{city.base_fee} zł</TableCell>
                    <TableCell className="text-sm">{city.additional_percent_rate}%</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(city)}>
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(city.id)}>
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edytuj ustawienia miasta" : "Dodaj miasto"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nazwa miasta *</Label>
              <Input value={cityName} onChange={(e) => setCityName(e.target.value)} placeholder="np. Warszawa" disabled={!!editing} />
            </div>

            <div>
              <Label className="text-xs">Tryb rozliczeń</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <label className={`flex flex-col items-center p-2 border rounded-lg cursor-pointer transition-colors text-center ${settlementMode === "single_tax" ? "border-primary bg-primary/10" : "hover:bg-muted"}`}>
                  <input type="radio" className="sr-only" checked={settlementMode === "single_tax"} onChange={() => setSettlementMode("single_tax")} />
                  <span className="text-xs font-medium">Jeden podatek</span>
                  <span className="text-[10px] text-muted-foreground">VAT od brutto</span>
                </label>
                <label className={`flex flex-col items-center p-2 border rounded-lg cursor-pointer transition-colors text-center ${settlementMode === "dual_tax" ? "border-primary bg-primary/10" : "hover:bg-muted"}`}>
                  <input type="radio" className="sr-only" checked={settlementMode === "dual_tax"} onChange={() => setSettlementMode("dual_tax")} />
                  <span className="text-xs font-medium">Dwa podatki</span>
                  <span className="text-[10px] text-muted-foreground">np. 8% + 23%</span>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">VAT (%)</Label>
                <Input type="number" value={vatRate} onChange={(e) => setVatRate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">Opłata stała (zł)</Label>
                <Input type="number" value={baseFee} onChange={(e) => setBaseFee(e.target.value)} />
              </div>
            </div>

            {settlementMode === "dual_tax" && (
              <div className="grid grid-cols-2 gap-3 border-t pt-3">
                <div>
                  <Label className="text-xs">Dodatkowy % od brutto</Label>
                  <Input type="number" value={additionalPercent} onChange={(e) => setAdditionalPercent(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">VAT kampanie (%)</Label>
                  <Input type="number" value={secondaryVat} onChange={(e) => setSecondaryVat(e.target.value)} />
                </div>
              </div>
            )}

            <div>
              <Label className="text-xs">Mail do faktur (B2B)</Label>
              <Input value={invoiceEmail} onChange={(e) => setInvoiceEmail(e.target.value)} placeholder="faktury@firma.pl" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Anuluj</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Zapisywanie..." : editing ? "Zapisz" : "Dodaj"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

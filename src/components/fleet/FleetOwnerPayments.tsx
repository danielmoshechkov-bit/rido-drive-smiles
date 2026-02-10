import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, CheckCircle, Plus, Minus, AlertTriangle, User } from "lucide-react";
import { getAvailableWeeks, getCurrentWeekNumber } from "@/lib/utils";

interface VehicleDriver {
  driver_id: string;
  driver_name: string;
  week_start: string;
  earned: number;
  shortfall: number; // positive means driver didn't cover the fee
}

interface OwnerSummary {
  owner_id: string;
  owner_name: string;
  company_name: string | null;
  phone: string | null;
  bank_account: string | null;
  vehicles: {
    id: string;
    plate: string;
    brand: string;
    model: string;
    weekly_rental_fee: number;
    assigned_driver?: { id: string; name: string };
    driver_shortfalls: VehicleDriver[];
  }[];
  total_weekly: number;
  total_owed: number; // accumulated unsettled amount
  adjustments: { note: string; amount: number; date: string }[];
}

interface FleetOwnerPaymentsProps {
  fleetId: string;
}

export function FleetOwnerPayments({ fleetId }: FleetOwnerPaymentsProps) {
  const [owners, setOwners] = useState<OwnerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOwners, setExpandedOwners] = useState<Set<string>>(new Set());
  const [adjustmentDialog, setAdjustmentDialog] = useState<{ ownerId: string; vehicleId: string } | null>(null);
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [adjustmentType, setAdjustmentType] = useState<"minus" | "plus">("minus");

  useEffect(() => {
    fetchOwnerData();
  }, [fleetId]);

  const fetchOwnerData = async () => {
    setLoading(true);
    try {
      // Get all owners for this fleet
      const { data: ownersData } = await supabase
        .from("vehicle_owners" as any)
        .select("id, name, company_name, phone, bank_account")
        .eq("fleet_id", fleetId)
        .order("name");

      if (!ownersData || ownersData.length === 0) {
        setOwners([]);
        setLoading(false);
        return;
      }

      const ownerIds = (ownersData as any[]).map(o => o.id);

      // Get vehicles assigned to these owners
      const { data: vehiclesData } = await (supabase
        .from("vehicles")
        .select("id, plate, brand, model, weekly_rental_fee, owner_rental_fee, owner_id") as any)
        .in("owner_id" as any, ownerIds)
        .eq("status", "aktywne");

      const vehicleIds = (vehiclesData || []).map((v: any) => v.id);

      // Get active driver assignments for these vehicles
      const { data: assignmentsData } = await supabase
        .from("driver_vehicle_assignments" as any)
        .select("vehicle_id, driver_id, status")
        .in("vehicle_id", vehicleIds)
        .eq("status", "active");

      // Get driver names
      const driverIds = [...new Set(((assignmentsData as any[]) || []).map((a: any) => a.driver_id))];
      let driversMap: Record<string, string> = {};
      if (driverIds.length > 0) {
        const { data: driversData } = await supabase
          .from("drivers")
          .select("id, first_name, last_name")
          .in("id", driverIds);
        driversMap = ((driversData as any[]) || []).reduce((acc: any, d: any) => {
          acc[d.id] = `${d.first_name} ${d.last_name}`;
          return acc;
        }, {});
      }

      // Get unsettled charges (includes shortfall info)
      const { data: chargesData } = await supabase
        .from("vehicle_owner_charges" as any)
        .select("*")
        .in("owner_id", ownerIds)
        .eq("is_settled", false);

      // Build summary
      const summaries: OwnerSummary[] = (ownersData as any[]).map(owner => {
        const ownerVehicles = (vehiclesData || []).filter((v: any) => v.owner_id === owner.id);
        const ownerCharges = ((chargesData as any[]) || []).filter(c => c.owner_id === owner.id);
        const totalWeekly = ownerVehicles.reduce((sum: number, v: any) => sum + (parseFloat(v.owner_rental_fee?.toString() || v.weekly_rental_fee?.toString() || "0")), 0);
        const totalOwed = ownerCharges.reduce((sum: number, c: any) => sum + parseFloat(c.amount?.toString() || "0") + parseFloat(c.adjustment?.toString() || "0"), 0);

        return {
          owner_id: owner.id,
          owner_name: owner.name,
          company_name: owner.company_name,
          phone: owner.phone,
          bank_account: owner.bank_account,
          vehicles: ownerVehicles.map((v: any) => {
            const assignment = ((assignmentsData as any[]) || []).find((a: any) => a.vehicle_id === v.id);
            const vehicleCharges = ownerCharges.filter((c: any) => c.vehicle_id === v.id);
            
            // Build shortfall records from charges where amount < rental fee
            const shortfalls: VehicleDriver[] = vehicleCharges
              .filter((c: any) => {
                const amt = parseFloat(c.amount?.toString() || "0");
                const rentalFee = parseFloat(v.owner_rental_fee?.toString() || v.weekly_rental_fee?.toString() || "0");
                return amt > 0 && amt < rentalFee;
              })
              .map((c: any) => {
                const amt = parseFloat(c.amount?.toString() || "0");
                const rentalFee = parseFloat(v.owner_rental_fee?.toString() || v.weekly_rental_fee?.toString() || "0");
                return {
                  driver_id: assignment?.driver_id || "",
                  driver_name: assignment?.driver_id ? (driversMap[assignment.driver_id] || "Nieznany") : "Brak kierowcy",
                  week_start: c.week_start,
                  earned: amt,
                  shortfall: rentalFee - amt,
                };
              });

            return {
              id: v.id,
              plate: v.plate,
              brand: v.brand,
              model: v.model,
              weekly_rental_fee: parseFloat(v.owner_rental_fee?.toString() || v.weekly_rental_fee?.toString() || "0"),
              assigned_driver: assignment?.driver_id ? {
                id: assignment.driver_id,
                name: driversMap[assignment.driver_id] || "Nieznany",
              } : undefined,
              driver_shortfalls: shortfalls,
            };
          }),
          total_weekly: totalWeekly,
          total_owed: totalOwed,
          adjustments: ownerCharges
            .filter((c: any) => c.adjustment_note)
            .map((c: any) => ({
              note: c.adjustment_note,
              amount: parseFloat(c.adjustment?.toString() || "0"),
              date: c.week_start,
            })),
        };
      }).filter(o => o.vehicles.length > 0); // Only show owners with vehicles

      setOwners(summaries);
    } catch (error) {
      console.error("Error fetching owner data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSettle = async (ownerId: string) => {
    if (!confirm("Czy na pewno chcesz oznaczyć jako rozliczone? Suma się wyzeruje.")) return;

    try {
      const { error } = await supabase
        .from("vehicle_owner_charges" as any)
        .update({ is_settled: true, settled_at: new Date().toISOString() })
        .eq("owner_id", ownerId)
        .eq("fleet_id", fleetId)
        .eq("is_settled", false);

      if (error) throw error;
      toast.success("Rozliczone!");
      fetchOwnerData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleAddAdjustment = async () => {
    if (!adjustmentDialog || !adjustmentAmount) return;

    const amount = parseFloat(adjustmentAmount.replace(",", "."));
    if (isNaN(amount)) {
      toast.error("Podaj prawidłową kwotę");
      return;
    }

    const finalAmount = adjustmentType === "minus" ? -Math.abs(amount) : Math.abs(amount);
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + 1); // Monday
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    try {
      const { error } = await supabase
        .from("vehicle_owner_charges" as any)
        .insert([{
          fleet_id: fleetId,
          owner_id: adjustmentDialog.ownerId,
          vehicle_id: adjustmentDialog.vehicleId,
          week_start: weekStart.toISOString().split("T")[0],
          week_end: weekEnd.toISOString().split("T")[0],
          amount: 0,
          adjustment: finalAmount,
          adjustment_note: adjustmentNote || (adjustmentType === "minus" ? "Odliczenie" : "Dopłata"),
          is_settled: false,
        }]);

      if (error) throw error;
      toast.success("Korekta dodana");
      setAdjustmentDialog(null);
      setAdjustmentAmount("");
      setAdjustmentNote("");
      fetchOwnerData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat("pl-PL", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount) + " zł";
  };

  const toggleExpanded = (ownerId: string) => {
    const next = new Set(expandedOwners);
    if (next.has(ownerId)) next.delete(ownerId);
    else next.add(ownerId);
    setExpandedOwners(next);
  };

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Ładowanie...</div>;
  }

  if (owners.length === 0) {
    return (
      <Card>
        <CardContent className="text-center py-8 text-muted-foreground">
          Brak właścicieli pojazdów. Przypisz właścicieli do samochodów w zakładce "Auta".
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {owners.map(owner => (
        <Card key={owner.owner_id}>
          <Collapsible open={expandedOwners.has(owner.owner_id)} onOpenChange={() => toggleExpanded(owner.owner_id)}>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div>
                      <CardTitle className="text-base">{owner.company_name || owner.owner_name}</CardTitle>
                      {owner.company_name && (
                        <p className="text-xs text-muted-foreground">{owner.owner_name}</p>
                      )}
                      <p className="text-xs text-muted-foreground">{owner.vehicles.length} aut • stawka tyg.: {formatCurrency(owner.total_weekly)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Do zapłaty:</div>
                      <div className={`text-lg font-bold ${owner.total_owed > 0 ? "text-destructive" : "text-green-600"}`}>
                        {formatCurrency(owner.total_owed)}
                      </div>
                    </div>
                    <Button
                      variant="default"
                      size="sm"
                      className="gap-1"
                      onClick={(e) => { e.stopPropagation(); handleSettle(owner.owner_id); }}
                      disabled={false}
                    >
                      <CheckCircle className="h-3 w-3" />
                      Rozliczone
                    </Button>
                    {expandedOwners.has(owner.owner_id) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </div>
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Pojazd</TableHead>
                      <TableHead className="text-xs">Nr rej.</TableHead>
                      <TableHead className="text-xs">Kierowca</TableHead>
                      <TableHead className="text-right text-xs">Stawka/tydz.</TableHead>
                      <TableHead className="text-xs">Akcje</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {owner.vehicles.map(v => (
                      <React.Fragment key={v.id}>
                        <TableRow className="hover:bg-primary/10">
                          <TableCell className="text-sm">{v.brand} {v.model}</TableCell>
                          <TableCell className="text-sm font-mono">{v.plate}</TableCell>
                          <TableCell className="text-sm">
                            {v.assigned_driver ? (
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3 text-muted-foreground" />
                                {v.assigned_driver.name}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">Brak</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-sm">{formatCurrency(v.weekly_rental_fee)}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs gap-1"
                              onClick={() => setAdjustmentDialog({ ownerId: owner.owner_id, vehicleId: v.id })}
                            >
                              <Plus className="h-3 w-3" /> Korekta
                            </Button>
                          </TableCell>
                        </TableRow>
                        {v.driver_shortfalls.length > 0 && v.driver_shortfalls.map((sf, idx) => (
                          <TableRow key={`${v.id}-sf-${idx}`} className="bg-destructive/5">
                            <TableCell colSpan={2} className="text-xs py-1 pl-8">
                              <span className="flex items-center gap-1 text-destructive">
                                <AlertTriangle className="h-3 w-3" />
                                Tyg. {sf.week_start}
                              </span>
                            </TableCell>
                            <TableCell className="text-xs py-1">{sf.driver_name}</TableCell>
                            <TableCell className="text-right text-xs py-1">
                              <span className="text-muted-foreground">wyjezdził: {formatCurrency(sf.earned)}</span>
                              {" "}
                              <span className="text-destructive font-medium">brak: {formatCurrency(sf.shortfall)}</span>
                            </TableCell>
                            <TableCell className="py-1" />
                          </TableRow>
                        ))}
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>

                {owner.adjustments.length > 0 && (
                  <div className="mt-3 border-t pt-3">
                    <h4 className="text-xs font-medium text-muted-foreground mb-2">Korekty:</h4>
                    <div className="space-y-1">
                      {owner.adjustments.map((adj, i) => (
                        <div key={i} className="flex justify-between text-xs">
                          <span className="text-muted-foreground">{adj.note} ({adj.date})</span>
                          <span className={adj.amount < 0 ? "text-green-600" : "text-destructive"}>
                            {adj.amount > 0 ? "+" : ""}{formatCurrency(adj.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {owner.phone && (
                  <p className="text-xs text-muted-foreground mt-3">Tel: {owner.phone}</p>
                )}
                {owner.bank_account && (
                  <p className="text-xs text-muted-foreground">Konto: {owner.bank_account}</p>
                )}
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      ))}

      {/* Adjustment Dialog */}
      <Dialog open={!!adjustmentDialog} onOpenChange={(open) => !open && setAdjustmentDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Dodaj korektę</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <label className={`flex flex-col items-center p-2 border rounded-lg cursor-pointer transition-colors text-center ${adjustmentType === "minus" ? "border-primary bg-primary/10" : "hover:bg-muted"}`}>
                <input type="radio" className="sr-only" checked={adjustmentType === "minus"} onChange={() => setAdjustmentType("minus")} />
                <Minus className="h-4 w-4 text-green-600 mb-1" />
                <span className="text-xs">Odliczenie</span>
                <span className="text-[10px] text-muted-foreground">np. auto w serwisie</span>
              </label>
              <label className={`flex flex-col items-center p-2 border rounded-lg cursor-pointer transition-colors text-center ${adjustmentType === "plus" ? "border-primary bg-primary/10" : "hover:bg-muted"}`}>
                <input type="radio" className="sr-only" checked={adjustmentType === "plus"} onChange={() => setAdjustmentType("plus")} />
                <Plus className="h-4 w-4 text-destructive mb-1" />
                <span className="text-xs">Dopłata</span>
                <span className="text-[10px] text-muted-foreground">dodatkowa opłata</span>
              </label>
            </div>
            <div>
              <Label className="text-xs">Kwota (zł)</Label>
              <Input
                type="number"
                value={adjustmentAmount}
                onChange={(e) => setAdjustmentAmount(e.target.value)}
                placeholder="np. 100"
              />
            </div>
            <div>
              <Label className="text-xs">Uwaga</Label>
              <Input
                value={adjustmentNote}
                onChange={(e) => setAdjustmentNote(e.target.value)}
                placeholder="np. Auto w serwisie 2 dni"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustmentDialog(null)}>Anuluj</Button>
            <Button onClick={handleAddAdjustment}>Dodaj</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

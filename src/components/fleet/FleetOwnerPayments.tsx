import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, CheckCircle, Plus, Minus, AlertTriangle, User } from "lucide-react";
import { getAvailableWeeks } from "@/lib/utils";

interface VehicleDriver {
  driver_id: string;
  driver_name: string;
  week_start: string;
  earned: number;
  shortfall: number;
}

interface OwnerSummary {
  owner_id: string;
  owner_name: string;
  company_name: string | null;
  phone: string | null;
  email: string | null;
  bank_account: string | null;
  payment_method: string | null;
  is_settled: boolean;
  vehicles: {
    id: string;
    plate: string;
    brand: string;
    model: string;
    weekly_rental_fee: number;
    assigned_driver?: { id: string; name: string };
    driver_earned: number; // how much driver earned for this vehicle
    driver_payout: number; // actual payout (what was deducted from driver)
    driver_shortfalls: VehicleDriver[];
  }[];
  total_weekly: number;
  total_owed: number;
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
  
  // Period selector
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const weeks = getAvailableWeeks(selectedYear);

  useEffect(() => {
    if (weeks.length) {
      setSelectedWeek(weeks[0].number.toString());
    }
  }, [selectedYear]);

  useEffect(() => {
    if (selectedWeek) {
      fetchOwnerData();
    }
  }, [fleetId, selectedWeek]);

  const fetchOwnerData = async () => {
    setLoading(true);
    try {
      const weekData = weeks.find(w => w.number.toString() === selectedWeek);
      if (!weekData) { setLoading(false); return; }

      // Get all owners for this fleet
      const { data: ownersData } = await supabase
        .from("vehicle_owners" as any)
        .select("id, name, company_name, phone, email, bank_account, payment_method")
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

      // Get charges for selected week
      const { data: chargesData } = await supabase
        .from("vehicle_owner_charges" as any)
        .select("*")
        .in("owner_id", ownerIds)
        .gte("week_start", weekData.start)
        .lte("week_end", weekData.end);

      // Get settlements for drivers in selected week - to know how much each driver earned
      const { data: settlementsData } = await supabase
        .from("settlements")
        .select("driver_id, rental_fee, actual_payout, total_earnings, period_from, period_to")
        .in("driver_id", driverIds.length > 0 ? driverIds : ['__none__'])
        .gte("period_from", weekData.start)
        .lte("period_to", weekData.end);

      // Map driver → vehicle
      const assignmentDriverVehicle = new Map<string, string>();
      ((assignmentsData as any[]) || []).forEach((a: any) => {
        assignmentDriverVehicle.set(a.driver_id, a.vehicle_id);
      });

      // Map driver → actual payout (how much was deducted from their earnings for rent)
      const vehicleDriverPayout = new Map<string, number>();
      (settlementsData || []).forEach((s: any) => {
        const vehicleId = assignmentDriverVehicle.get(s.driver_id);
        if (vehicleId) {
          const payout = parseFloat(s.actual_payout?.toString() || "0");
          vehicleDriverPayout.set(vehicleId, (vehicleDriverPayout.get(vehicleId) || 0) + Math.abs(payout));
        }
      });

      // Map vehicle → owner
      const vehicleOwnerMap = new Map<string, string>();
      (vehiclesData || []).forEach((v: any) => {
        vehicleOwnerMap.set(v.id, v.owner_id);
      });

      // Calculate driver earnings per vehicle for the week
      const vehicleDriverEarnings = new Map<string, number>();
      (settlementsData || []).forEach((s: any) => {
        const vehicleId = assignmentDriverVehicle.get(s.driver_id);
        if (vehicleId) {
          const rentalFee = parseFloat(s.rental_fee?.toString() || "0");
          vehicleDriverEarnings.set(vehicleId, (vehicleDriverEarnings.get(vehicleId) || 0) + rentalFee);
        }
      });

      // Build summary
      const summaries: OwnerSummary[] = (ownersData as any[]).map(owner => {
        const ownerVehicles = (vehiclesData || []).filter((v: any) => v.owner_id === owner.id);
        const ownerCharges = ((chargesData as any[]) || []).filter((c: any) => c.owner_id === owner.id);
        const totalWeekly = ownerVehicles.reduce((sum: number, v: any) => sum + (parseFloat(v.owner_rental_fee?.toString() || v.weekly_rental_fee?.toString() || "0")), 0);
        
        // Calculate total from charges (adjustments) for this week
        const chargesTotal = ownerCharges.reduce((sum: number, c: any) => sum + parseFloat(c.amount?.toString() || "0") + parseFloat(c.adjustment?.toString() || "0"), 0);
        
        // Calculate total from driver rental deductions for this week
        let settlementTotal = 0;
        ownerVehicles.forEach((v: any) => {
          const earned = vehicleDriverEarnings.get(v.id) || 0;
          settlementTotal += earned;
        });

        // If charges exist for this week, use charges; otherwise use settlement-based
        const hasChargesThisWeek = ownerCharges.length > 0;
        const isSettled = ownerCharges.some((c: any) => c.is_settled && c.amount === 0 && c.adjustment_note?.includes("Rozliczenie"));
        const totalOwed = isSettled ? chargesTotal : (hasChargesThisWeek ? chargesTotal : settlementTotal || totalWeekly);

        return {
          owner_id: owner.id,
          owner_name: owner.name,
          company_name: owner.company_name,
          phone: owner.phone,
          email: owner.email,
          bank_account: owner.bank_account,
          payment_method: owner.payment_method,
          is_settled: isSettled,
          vehicles: ownerVehicles.map((v: any) => {
            const assignment = ((assignmentsData as any[]) || []).find((a: any) => a.vehicle_id === v.id);
            const rentalFee = parseFloat(v.owner_rental_fee?.toString() || v.weekly_rental_fee?.toString() || "0");
            const driverEarned = vehicleDriverEarnings.get(v.id) || 0;
            const driverPayout = vehicleDriverPayout.get(v.id) || 0;

            // Shortfall: driver didn't cover the full rental
            const shortfalls: VehicleDriver[] = [];
            if (assignment?.driver_id && driverEarned > 0 && driverEarned < rentalFee) {
              shortfalls.push({
                driver_id: assignment.driver_id,
                driver_name: driversMap[assignment.driver_id] || "Nieznany",
                week_start: weekData.start,
                earned: driverEarned,
                shortfall: rentalFee - driverEarned,
              });
            }

            return {
              id: v.id,
              plate: v.plate,
              brand: v.brand,
              model: v.model,
              weekly_rental_fee: rentalFee,
              assigned_driver: assignment?.driver_id ? {
                id: assignment.driver_id,
                name: driversMap[assignment.driver_id] || "Nieznany",
              } : undefined,
              driver_earned: driverEarned,
              driver_payout: driverPayout,
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
      }).filter(o => o.vehicles.length > 0);

      setOwners(summaries);
    } catch (error) {
      console.error("Error fetching owner data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSettle = async (ownerId: string, currentlySettled: boolean) => {
    const weekData = weeks.find(w => w.number.toString() === selectedWeek);
    if (!weekData) return;

    try {
      if (currentlySettled) {
        // Un-settle: remove the settled marker
        await supabase
          .from("vehicle_owner_charges" as any)
          .delete()
          .eq("owner_id", ownerId)
          .eq("fleet_id", fleetId)
          .eq("is_settled", true)
          .gte("week_start", weekData.start)
          .lte("week_end", weekData.end);

        toast.success("Status zmieniony na: Nie rozliczone");
      } else {
        // Settle: mark as settled
        await supabase
          .from("vehicle_owner_charges" as any)
          .update({ is_settled: true, settled_at: new Date().toISOString() })
          .eq("owner_id", ownerId)
          .eq("fleet_id", fleetId)
          .eq("is_settled", false)
          .gte("week_start", weekData.start)
          .lte("week_end", weekData.end);

        await supabase
          .from("vehicle_owner_charges" as any)
          .insert([{
            fleet_id: fleetId,
            owner_id: ownerId,
            vehicle_id: null,
            week_start: weekData.start,
            week_end: weekData.end,
            amount: 0,
            adjustment: 0,
            adjustment_note: "Rozliczenie - wyzerowano saldo",
            is_settled: true,
            settled_at: new Date().toISOString(),
          }]);

        toast.success(`✅ Tydzień ${weekData.label} rozliczony!`);
      }
      fetchOwnerData();
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleAddAdjustment = async () => {
    if (!adjustmentDialog || !adjustmentAmount) return;
    const weekData = weeks.find(w => w.number.toString() === selectedWeek);
    if (!weekData) return;

    const amount = parseFloat(adjustmentAmount.replace(",", "."));
    if (isNaN(amount)) {
      toast.error("Podaj prawidłową kwotę");
      return;
    }

    const finalAmount = adjustmentType === "minus" ? -Math.abs(amount) : Math.abs(amount);

    try {
      const { error } = await supabase
        .from("vehicle_owner_charges" as any)
        .insert([{
          fleet_id: fleetId,
          owner_id: adjustmentDialog.ownerId,
          vehicle_id: adjustmentDialog.vehicleId,
          week_start: weekData.start,
          week_end: weekData.end,
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

  return (
    <div className="space-y-4">
      {/* Period selector */}
      <Card>
        <CardContent className="py-3">
          <div className="flex gap-3 items-center flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Rok</label>
              <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                <SelectTrigger className="h-9 px-3 w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2024, 2025, 2026].map(year => (
                    <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium">Okres</label>
              <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                <SelectTrigger className="h-9 px-3 w-[280px]">
                  <SelectValue placeholder="Wybierz tydzień" />
                </SelectTrigger>
                <SelectContent>
                  {weeks.map(week => (
                    <SelectItem key={week.number} value={week.number.toString()}>
                      {week.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">Ładowanie...</div>
      ) : owners.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8 text-muted-foreground">
            Brak właścicieli pojazdów. Przypisz właścicieli do samochodów w zakładce "Auta".
          </CardContent>
        </Card>
      ) : (
        owners.map(owner => (
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
                        variant={owner.is_settled ? "default" : "destructive"}
                        size="sm"
                        className="gap-1"
                        onClick={(e) => { e.stopPropagation(); handleToggleSettle(owner.owner_id, owner.is_settled); }}
                      >
                        <CheckCircle className="h-3 w-3" />
                        {owner.is_settled ? "Rozliczone" : "Nie rozliczone"}
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
                        <TableHead className="text-right text-xs">Wyjezdzone</TableHead>
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
                            <TableCell className="text-right text-sm">
                              {v.driver_earned > 0 ? (
                                <div>
                                  <span className={`font-medium ${v.driver_earned >= v.weekly_rental_fee ? 'text-green-600' : 'text-destructive'}`}>
                                    {formatCurrency(Math.min(v.driver_earned, v.weekly_rental_fee))}
                                  </span>
                                  {v.driver_earned < v.weekly_rental_fee && (
                                    <div className="text-[10px] text-muted-foreground">
                                      z {formatCurrency(v.weekly_rental_fee)}
                                    </div>
                                  )}
                                </div>
                              ) : v.assigned_driver ? (
                                <span className="text-destructive text-xs font-medium">0,00 zł</span>
                              ) : (
                                <span className="text-muted-foreground text-xs">-</span>
                              )}
                            </TableCell>
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
                                  Niedopłata
                                </span>
                              </TableCell>
                              <TableCell className="text-xs py-1">{sf.driver_name}</TableCell>
                              <TableCell className="text-right text-xs py-1" colSpan={2}>
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

                  {(owner.phone || owner.email || owner.bank_account || owner.payment_method) && (
                    <div className="mt-3 border-t pt-3 space-y-0.5">
                      {owner.phone && <p className="text-xs text-muted-foreground">📱 Tel: {owner.phone}</p>}
                      {owner.email && <p className="text-xs text-muted-foreground">📧 Email: {owner.email}</p>}
                      {owner.bank_account && <p className="text-xs text-muted-foreground">🏦 Konto: {owner.bank_account}</p>}
                      {owner.payment_method && <p className="text-xs text-muted-foreground">💳 Rozliczenie: {owner.payment_method === 'przelew' ? 'Przelew' : 'Gotówka'}</p>}
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        ))
      )}

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

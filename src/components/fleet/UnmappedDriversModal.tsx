import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Link2, Loader2, UserPlus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UnmappedDriver {
  id: string;
  full_name: string;
  uber_id?: string;
  bolt_id?: string;
  freenow_id?: string;
  phone?: string;
}

interface ExistingDriver {
  id: string;
  first_name: string;
  last_name: string;
  phone?: string;
}

interface UnmappedDriversModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unmappedDrivers: UnmappedDriver[];
  fleetId: string;
  onComplete: () => void;
}

export function UnmappedDriversModal({
  open,
  onOpenChange,
  unmappedDrivers,
  fleetId,
  onComplete,
}: UnmappedDriversModalProps) {
  const [existingDrivers, setExistingDrivers] = useState<ExistingDriver[]>([]);
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && fleetId) {
      fetchExistingDrivers();
    }
  }, [open, fleetId]);

  const fetchExistingDrivers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("drivers")
        .select("id, first_name, last_name, phone")
        .eq("fleet_id", fleetId)
        .order("last_name");

      if (error) throw error;
      setExistingDrivers(data || []);
    } catch (err) {
      console.error("Error fetching drivers:", err);
      toast.error("Błąd pobierania listy kierowców");
    } finally {
      setLoading(false);
    }
  };

  const handleMapping = (unmappedId: string, existingDriverId: string) => {
    setMappings((prev) => ({
      ...prev,
      [unmappedId]: existingDriverId,
    }));
  };

  const handleSave = async () => {
    if (Object.keys(mappings).length === 0) {
      toast.info("Nie wybrano żadnych powiązań");
      onComplete();
      onOpenChange(false);
      return;
    }

    setSaving(true);
    try {
      for (const [unmappedId, existingDriverId] of Object.entries(mappings)) {
        const unmapped = unmappedDrivers.find((d) => d.id === unmappedId);
        if (!unmapped) continue;

        // Add platform IDs to the existing driver
        const platformIds = [];
        if (unmapped.uber_id) {
          platformIds.push({ driver_id: existingDriverId, platform: "uber", platform_id: unmapped.uber_id });
        }
        if (unmapped.bolt_id) {
          platformIds.push({ driver_id: existingDriverId, platform: "bolt", platform_id: unmapped.bolt_id });
        }
        if (unmapped.freenow_id) {
          platformIds.push({ driver_id: existingDriverId, platform: "freenow", platform_id: unmapped.freenow_id });
        }

        if (platformIds.length > 0) {
          const { error: pidError } = await supabase
            .from("driver_platform_ids")
            .upsert(platformIds, { onConflict: "driver_id,platform" });

          if (pidError) {
            console.error("Error upserting platform IDs:", pidError);
          }
        }

        // Mark unmapped driver as resolved
        await supabase
          .from("unmapped_settlement_drivers")
          .update({ 
            linked_driver_id: existingDriverId, 
            status: "resolved",
            resolved_at: new Date().toISOString() 
          })
          .eq("id", unmappedId);

        // Optionally delete the auto-created driver record if it exists
        // This would need additional logic to identify auto-created drivers
      }

      toast.success(`Powiązano ${Object.keys(mappings).length} kierowców`);
      onComplete();
      onOpenChange(false);
    } catch (err) {
      console.error("Error saving mappings:", err);
      toast.error("Błąd zapisu powiązań");
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    toast.info("Pominięto mapowanie nowych kierowców");
    onComplete();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Nowi kierowcy w rozliczeniu
          </DialogTitle>
          <DialogDescription>
            System wykrył {unmappedDrivers.length} kierowców, których ID platform nie zostało 
            rozpoznane. Możesz je powiązać z istniejącymi kierowcami lub pozostawić jako nowe konta.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nazwa</TableHead>
                <TableHead>Uber ID</TableHead>
                <TableHead>Bolt ID</TableHead>
                <TableHead>FreeNow ID</TableHead>
                <TableHead>Powiąż z kierowcą</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {unmappedDrivers.map((driver) => (
                <TableRow key={driver.id}>
                  <TableCell className="font-medium">{driver.full_name || "Nieznany"}</TableCell>
                  <TableCell>
                    {driver.uber_id ? (
                      <Badge variant="outline" className="font-mono text-xs text-foreground">
                        {driver.uber_id.slice(0, 12)}...
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {driver.bolt_id ? (
                      <Badge variant="outline" className="font-mono text-xs">
                        {driver.bolt_id}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {driver.freenow_id ? (
                      <Badge variant="outline" className="font-mono text-xs">
                        {driver.freenow_id}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Select
                      value={mappings[driver.id] || ""}
                      onValueChange={(value) => handleMapping(driver.id, value)}
                    >
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Wybierz kierowcę" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_new">
                          <div className="flex items-center gap-2">
                            <UserPlus className="h-4 w-4" />
                            Zostaw jako nowy
                          </div>
                        </SelectItem>
                        {existingDrivers.map((ed) => (
                          <SelectItem key={ed.id} value={ed.id}>
                            {ed.first_name} {ed.last_name}
                            {ed.phone && <span className="text-muted-foreground ml-2">({ed.phone})</span>}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleSkip}>
            Pomiń
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Zapisuję...
              </>
            ) : (
              <>
                <Link2 className="h-4 w-4 mr-2" />
                Zapisz powiązania
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

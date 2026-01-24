import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Car, Send } from "lucide-react";

interface Notification {
  id: string;
  vehicle_id: string;
  policy_id: string | null;
  fleet_id: string | null;
  policy_type: string | null;
  current_premium: number | null;
  expiry_date: string;
  vehicle_plate: string | null;
  vehicle_vin: string | null;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  fleet_name: string | null;
}

interface InsuranceOfferModalProps {
  open: boolean;
  onClose: () => void;
  notification: Notification | null;
  agentId: string;
  onSuccess: () => void;
}

export function InsuranceOfferModal({
  open,
  onClose,
  notification,
  agentId,
  onSuccess
}: InsuranceOfferModalProps) {
  const [loading, setLoading] = useState(false);
  const [policyType, setPolicyType] = useState(notification?.policy_type || "OC");
  const [offerPremium, setOfferPremium] = useState<number | "">("");
  const [validUntil, setValidUntil] = useState("");
  const [offerDetails, setOfferDetails] = useState("");

  // Reset form when notification changes
  useState(() => {
    if (notification) {
      setPolicyType(notification.policy_type || "OC");
      setOfferPremium("");
      setValidUntil("");
      setOfferDetails("");
    }
  });

  const handleSubmit = async () => {
    if (!notification || !agentId) return;
    
    if (!offerPremium || offerPremium <= 0) {
      toast.error("Podaj proponowaną składkę");
      return;
    }
    if (!validUntil) {
      toast.error("Podaj datę ważności oferty");
      return;
    }

    setLoading(true);
    try {
      // 1. Create the offer
      const { error: offerError } = await supabase
        .from("insurance_offers")
        .insert({
          agent_id: agentId,
          vehicle_id: notification.vehicle_id,
          fleet_id: notification.fleet_id,
          policy_type: policyType,
          current_premium: notification.current_premium,
          offer_premium: Number(offerPremium),
          offer_details: offerDetails || null,
          valid_until: validUntil,
          status: "pending"
        });

      if (offerError) throw offerError;

      // 2. Update notification status
      await supabase
        .from("insurance_notifications")
        .update({ status: "offer_sent" })
        .eq("id", notification.id);

      toast.success("Oferta została wysłana!");
      onSuccess();
    } catch (error: any) {
      console.error("Error sending offer:", error);
      toast.error(error?.message || "Błąd wysyłania oferty");
    } finally {
      setLoading(false);
    }
  };

  if (!notification) return null;

  const savingsPercent = notification.current_premium && offerPremium
    ? Math.round(((notification.current_premium - Number(offerPremium)) / notification.current_premium) * 100)
    : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Przygotuj ofertę ubezpieczenia
          </DialogTitle>
        </DialogHeader>

        {/* Vehicle summary */}
        <div className="p-4 bg-muted rounded-lg mb-4">
          <div className="flex items-center gap-3">
            <Car className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-semibold">
                {notification.vehicle_plate} - {notification.vehicle_brand} {notification.vehicle_model}
              </p>
              <p className="text-sm text-muted-foreground">
                VIN: {notification.vehicle_vin || "—"}
              </p>
              {notification.current_premium && (
                <p className="text-sm">
                  Aktualna składka: <span className="font-medium">{notification.current_premium} PLN</span>
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label>Typ polisy</Label>
            <Select value={policyType} onValueChange={setPolicyType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OC">OC</SelectItem>
                <SelectItem value="AC">AC</SelectItem>
                <SelectItem value="OC+AC">OC + AC</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Proponowana składka (PLN/rok) *</Label>
            <Input
              type="number"
              value={offerPremium}
              onChange={(e) => setOfferPremium(e.target.value === "" ? "" : Number(e.target.value))}
              placeholder="np. 1200"
              min="1"
            />
            {savingsPercent !== null && savingsPercent > 0 && (
              <p className="text-sm text-green-600 mt-1">
                Oszczędność: {savingsPercent}% ({notification.current_premium! - Number(offerPremium)} PLN)
              </p>
            )}
          </div>

          <div>
            <Label>Oferta ważna do *</Label>
            <Input
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              min={new Date().toISOString().split("T")[0]}
            />
          </div>

          <div>
            <Label>Szczegóły oferty</Label>
            <Textarea
              value={offerDetails}
              onChange={(e) => setOfferDetails(e.target.value)}
              placeholder="Opisz zakres ochrony, dodatkowe korzyści, warunki..."
              rows={4}
            />
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>
            Anuluj
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Wysyłanie..." : "Wyślij ofertę"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { pl } from "date-fns/locale";

interface PriceChangeNotification {
  id: string;
  vehicle_id: string;
  old_price: number;
  new_price: number;
  created_at: string;
  vehicle?: {
    brand: string;
    model: string;
    plate: string;
  };
}

interface PriceChangeModalProps {
  notification: PriceChangeNotification;
  onAccepted: () => void;
}

export function PriceChangeModal({ notification, onAccepted }: PriceChangeModalProps) {
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleAccept = async () => {
    if (!accepted) {
      toast.error("Musisz zaznaczyć, że zapoznałeś się ze zmianą");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("price_change_notifications")
        .update({
          is_read: true,
          is_accepted: true,
          accepted_at: new Date().toISOString()
        })
        .eq("id", notification.id);

      if (error) throw error;

      toast.success("Zmiana zaakceptowana");
      onAccepted();
    } catch (error: any) {
      console.error("Error accepting notification:", error);
      toast.error("Błąd akceptacji: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const vehicleName = notification.vehicle 
    ? `${notification.vehicle.brand} ${notification.vehicle.model} (${notification.vehicle.plate})`
    : "Twój pojazd";

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent 
        className="max-w-md" 
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            Zmiana stawki wynajmu
          </DialogTitle>
          <DialogDescription>
            Stawka za wynajem została zmieniona. Musisz zaakceptować tę zmianę, aby kontynuować korzystanie z portalu.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-muted rounded-lg p-4">
            <p className="text-sm font-medium mb-2">{vehicleName}</p>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs text-muted-foreground">Stara stawka:</span>
                <p className="text-lg font-bold line-through text-muted-foreground">
                  {notification.old_price} zł/tydzień
                </p>
              </div>
              <div className="text-2xl text-muted-foreground">→</div>
              <div>
                <span className="text-xs text-muted-foreground">Nowa stawka:</span>
                <p className="text-lg font-bold text-primary">
                  {notification.new_price} zł/tydzień
                </p>
              </div>
            </div>
          </div>

          <p className="text-sm text-muted-foreground">
            Data zmiany: {format(new Date(notification.created_at), "d MMMM yyyy, HH:mm", { locale: pl })}
          </p>

          <div className="flex items-start gap-3 pt-2">
            <Checkbox
              id="accept-change"
              checked={accepted}
              onCheckedChange={(checked) => setAccepted(checked === true)}
            />
            <Label htmlFor="accept-change" className="text-sm leading-relaxed cursor-pointer">
              Zapoznałem się ze zmianą stawki za wynajem i akceptuję nowe warunki
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button 
            onClick={handleAccept} 
            disabled={!accepted || saving}
            className="w-full"
          >
            {saving ? "Akceptowanie..." : "Akceptuję zmianę"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

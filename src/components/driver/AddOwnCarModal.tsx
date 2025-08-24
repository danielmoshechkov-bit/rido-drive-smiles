import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// AddOwnCarModal — kierowca dodaje swoje auto (bez pola Flota)
export function AddOwnCarModal({
  open,
  onClose,
  driverId,
}: {
  open: boolean;
  onClose: () => void;
  driverId: string;
}) {
  const [plate, setPlate] = useState("");
  const [vin, setVin] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState<number | "">("");
  const [color, setColor] = useState("");

  const save = async () => {
    if (!plate || !brand || !model) {
      toast.error("Uzupełnij: nr rejestracyjny, marka, model");
      return;
    }
    const payload: any = {
      plate: plate.toUpperCase().trim(),
      vin: vin.toUpperCase().trim() || null,
      brand: brand.trim(),
      model: model.trim(),
      year: year || null,
      color: color || null,
      status: "aktywne",
    };
    
    const { data: veh, error: e1 } = await supabase
      .from("vehicles")
      .insert(payload)
      .select("id")
      .single();
      
    if (e1) {
      console.error("Error adding vehicle:", e1);
      toast.error("Błąd dodawania pojazdu");
      return;
    }

    // automatyczne przypisanie do kierowcy od dziś (bez floty)
    const today = new Date().toISOString().slice(0, 10);
    const { error: assignError } = await supabase
      .from("driver_vehicle_assignments")
      .insert({ 
        driver_id: driverId, 
        vehicle_id: veh!.id, 
        assigned_at: today + "T00:00:00Z",
        status: "active"
      });
      
    if (assignError) {
      console.error("Error creating assignment:", assignError);
      toast.error("Błąd przypisywania pojazdu");
      return;
    }
    
    toast.success("Pojazd dodany i przypisany");
    onClose();
  };

  if (!open) return null;
  
  return (
    <div className="fixed inset-0 bg-black/30 z-[70] flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Dodaj pojazd</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-sm text-muted-foreground">
              Nr rejestracyjny *
            </label>
            <Input
              value={plate}
              onChange={(e) => setPlate(e.target.value.toUpperCase())}
              placeholder="np. WX1234A"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">VIN</label>
            <Input
              value={vin}
              onChange={(e) => setVin(e.target.value.toUpperCase())}
              placeholder="17 znaków"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Marka *</label>
            <Input
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              placeholder="np. Toyota"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Model *</label>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="np. Auris"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Rok</label>
            <Input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value ? parseInt(e.target.value) : "")}
              placeholder="np. 2018"
            />
          </div>
          <div>
            <label className="text-sm text-muted-foreground">Kolor</label>
            <Input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="np. Biały"
            />
          </div>
          <div className="md:col-span-2 flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={onClose}>
              Anuluj
            </Button>
            <Button onClick={save}>Zapisz pojazd</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
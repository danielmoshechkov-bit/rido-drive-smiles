import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UniversalCard } from "@/components/UniversalCard";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AddCarFormProps {
  driverId: string;
  onCarAdded?: () => void;
}

export const AddCarForm = ({ driverId, onCarAdded }: AddCarFormProps) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    license_plate: "",
    brand: "",
    model: "",
    year: "",
    color: "",
    vin: "",
    inspection_due: "",
    oc_policy_due: "",
  });

  const handleAddCar = async () => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('vehicles')
        .insert([
          {
            plate: formData.license_plate.toUpperCase(),
            brand: formData.brand,
            model: formData.model,
            year: parseInt(formData.year) || null,
            color: formData.color || null,
            vin: formData.vin || null,
            weekly_rental_fee: null, // Prywatny pojazd, brak wynajmu
            status: "aktywne",
            owner_name: "Prywatne",
            city_id: null // TODO: Get from driver's city
          }
        ]);

      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      toast.success("Pojazd został dodany pomyślnie!");
      setFormData({
        license_plate: "",
        brand: "",
        model: "",
        year: "",
        color: "",
        vin: "",
        inspection_due: "",
        oc_policy_due: "",
      });
      onCarAdded?.();
    } catch (error) {
      console.error('Error adding vehicle:', error);
      toast.error("Błąd podczas dodawania pojazdu");
    } finally {
      setLoading(false);
    }
  };

  return (
    <UniversalCard title="Dodaj samochód">
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="license_plate" className="text-sm font-medium text-foreground">
              Numer rejestracyjny *
            </Label>
            <Input
              id="license_plate"
              value={formData.license_plate}
              onChange={(e) => setFormData({...formData, license_plate: e.target.value})}
              placeholder="np. WA12345"
              className="mt-1"
              required
            />
          </div>
          
          <div>
            <Label htmlFor="vin" className="text-sm font-medium text-foreground">VIN</Label>
            <Input
              id="vin"
              value={formData.vin}
              onChange={(e) => setFormData({...formData, vin: e.target.value})}
              placeholder="np. WBA12345678901234"
              className="mt-1"
            />
          </div>
          
          <div>
            <Label htmlFor="brand" className="text-sm font-medium text-foreground">
              Marka *
            </Label>
            <Input
              id="brand"
              value={formData.brand}
              onChange={(e) => setFormData({...formData, brand: e.target.value})}
              placeholder="np. Toyota"
              className="mt-1"
              required
            />
          </div>
          
          <div>
            <Label htmlFor="model" className="text-sm font-medium text-foreground">
              Model *
            </Label>
            <Input
              id="model"
              value={formData.model}
              onChange={(e) => setFormData({...formData, model: e.target.value})}
              placeholder="np. Corolla"
              className="mt-1"
              required
            />
          </div>
          
          <div>
            <Label htmlFor="year" className="text-sm font-medium text-foreground">
              Rok produkcji
            </Label>
            <Input
              id="year"
              type="number"
              value={formData.year}
              onChange={(e) => setFormData({...formData, year: e.target.value})}
              placeholder="np. 2020"
              className="mt-1"
              min="1900"
              max="2030"
            />
          </div>
          
          <div>
            <Label htmlFor="color" className="text-sm font-medium text-foreground">Kolor</Label>
            <Input
              id="color"
              type="text"
              placeholder="np. srebrny"
              value={formData.color}
              onChange={(e) => setFormData({...formData, color: e.target.value})}
              className="mt-1"
            />
          </div>
          
          <div>
            <Label htmlFor="inspection_due" className="text-sm font-medium text-foreground">Przegląd ważny do</Label>
            <Input
              id="inspection_due"
              type="date"
              value={formData.inspection_due}
              onChange={(e) => setFormData({...formData, inspection_due: e.target.value})}
              className="mt-1"
            />
          </div>
          
          <div>
            <Label htmlFor="oc_policy_due" className="text-sm font-medium text-foreground">Polisa OC ważna do</Label>
            <Input
              id="oc_policy_due"
              type="date"
              value={formData.oc_policy_due}
              onChange={(e) => setFormData({...formData, oc_policy_due: e.target.value})}
              className="mt-1"
            />
          </div>
        </div>
        
        <Button 
          onClick={handleAddCar}
          disabled={loading || !formData.license_plate || !formData.brand || !formData.model}
          className="w-full bg-primary hover:bg-primary-hover text-primary-foreground font-medium py-2.5"
        >
          {loading ? "Dodawanie..." : "Dodaj samochód"}
        </Button>
      </div>
    </UniversalCard>
  );
};
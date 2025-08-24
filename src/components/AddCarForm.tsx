import { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AddCarFormProps {
  driverId: string;
  onCarAdded?: () => void;
}

export const AddCarForm = ({ driverId, onCarAdded }: AddCarFormProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    license_plate: "",
    brand: "",
    model: "",
    year: "",
    color: "",
    vin: "",
    weekly_rental_fee: ""
  });

  const handleSearch = () => {
    // TODO: Implement search functionality
    toast.info("Funkcja wyszukiwania zostanie wkrótce dodana");
  };

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
            weekly_rental_fee: parseFloat(formData.weekly_rental_fee) || null,
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
        weekly_rental_fee: ""
      });
      setShowAddForm(false);
      onCarAdded?.();
    } catch (error) {
      console.error('Error adding vehicle:', error);
      toast.error("Błąd podczas dodawania pojazdu");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search Section */}
      <Card className="border-2 border-primary/20 hover:border-primary/40 transition-colors">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            Wyszukaj pojazd
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Input
              placeholder="Wprowadź numer rejestracyjny lub VIN..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1"
            />
            <Button onClick={handleSearch} className="bg-primary hover:bg-primary-hover">
              <Search className="h-4 w-4 mr-2" />
              Szukaj
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Wyszukaj pojazd w bazie danych floty lub dodaj nowy pojazd poniżej
          </p>
        </CardContent>
      </Card>

      {/* Add New Car Section */}
      <Card className="border-2 border-accent/20 hover:border-accent/40 transition-colors">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-accent" />
              Dodaj nowy pojazd
            </CardTitle>
            <Button 
              variant="outline" 
              onClick={() => setShowAddForm(!showAddForm)}
              className="border-accent text-accent hover:bg-accent hover:text-accent-foreground"
            >
              {showAddForm ? "Ukryj formularz" : "Pokaż formularz"}
            </Button>
          </div>
        </CardHeader>
        
        {showAddForm && (
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="license_plate">Numer rejestracyjny *</Label>
                <Input
                  id="license_plate"
                  value={formData.license_plate}
                  onChange={(e) => setFormData({...formData, license_plate: e.target.value})}
                  placeholder="np. WA12345"
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="vin">VIN</Label>
                <Input
                  id="vin"
                  value={formData.vin}
                  onChange={(e) => setFormData({...formData, vin: e.target.value})}
                  placeholder="np. WBA12345678901234"
                />
              </div>
              
              <div>
                <Label htmlFor="brand">Marka *</Label>
                <Input
                  id="brand"
                  value={formData.brand}
                  onChange={(e) => setFormData({...formData, brand: e.target.value})}
                  placeholder="np. Toyota"
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="model">Model *</Label>
                <Input
                  id="model"
                  value={formData.model}
                  onChange={(e) => setFormData({...formData, model: e.target.value})}
                  placeholder="np. Corolla"
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="year">Rok produkcji</Label>
                <Input
                  id="year"
                  type="number"
                  value={formData.year}
                  onChange={(e) => setFormData({...formData, year: e.target.value})}
                  placeholder="np. 2020"
                  min="1900"
                  max="2030"
                />
              </div>
              
              <div>
                <Label htmlFor="color">Kolor</Label>
                <Select onValueChange={(value) => setFormData({...formData, color: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Wybierz kolor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="biały">Biały</SelectItem>
                    <SelectItem value="czarny">Czarny</SelectItem>
                    <SelectItem value="srebrny">Srebrny</SelectItem>
                    <SelectItem value="szary">Szary</SelectItem>
                    <SelectItem value="niebieski">Niebieski</SelectItem>
                    <SelectItem value="czerwony">Czerwony</SelectItem>
                    <SelectItem value="zielony">Zielony</SelectItem>
                    <SelectItem value="żółty">Żółty</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="md:col-span-2">
                <Label htmlFor="weekly_rental_fee">Tygodniowa opłata za wynajem (PLN)</Label>
                <Input
                  id="weekly_rental_fee"
                  type="number"
                  step="0.01"
                  value={formData.weekly_rental_fee}
                  onChange={(e) => setFormData({...formData, weekly_rental_fee: e.target.value})}
                  placeholder="np. 350.00"
                />
              </div>
            </div>
            
            <Button 
              onClick={handleAddCar}
              disabled={loading || !formData.license_plate || !formData.brand || !formData.model}
              className="w-full bg-accent hover:bg-accent-hover text-accent-foreground"
            >
              {loading ? "Dodawanie..." : "Dodaj pojazd"}
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
};
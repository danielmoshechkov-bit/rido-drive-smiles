import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { useCities, City } from '@/hooks/useCities';

interface CitySelectorProps {
  selectedCity: City | null;
  onCitySelect: (city: City) => void;
}

export const CitySelector = ({ selectedCity, onCitySelect }: CitySelectorProps) => {
  const { cities, loading, addCity } = useCities();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newCityName, setNewCityName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleAddCity = async () => {
    if (!newCityName.trim()) return;

    try {
      setIsAdding(true);
      const newCity = await addCity(newCityName.trim());
      toast.success(`Miasto "${newCity.name}" zostało dodane!`);
      setNewCityName('');
      setIsDialogOpen(false);
      onCitySelect(newCity);
    } catch (error) {
      toast.error('Błąd podczas dodawania miasta');
    } finally {
      setIsAdding(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-4">
        <div className="w-48 h-10 bg-muted animate-pulse rounded-md"></div>
        <div className="w-10 h-10 bg-muted animate-pulse rounded-md"></div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <div className="w-48">
        <Select
          value={selectedCity?.id || ''}
          onValueChange={(value) => {
            const city = cities.find(c => c.id === value);
            if (city) onCitySelect(city);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Wybierz miasto" />
          </SelectTrigger>
          <SelectContent>
            {cities.map((city) => (
              <SelectItem key={city.id} value={city.id}>
                {city.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button size="icon" variant="outline">
            <Plus className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dodaj nowe miasto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="cityName">Nazwa miasta</Label>
              <Input
                id="cityName"
                value={newCityName}
                onChange={(e) => setNewCityName(e.target.value)}
                placeholder="Wprowadź nazwę miasta"
              />
            </div>
            <Button 
              onClick={handleAddCity} 
              disabled={!newCityName.trim() || isAdding}
              className="w-full"
            >
              {isAdding ? 'Dodawanie...' : 'Dodaj miasto'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
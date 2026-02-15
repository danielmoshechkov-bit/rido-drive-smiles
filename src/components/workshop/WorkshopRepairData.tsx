import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Car, Truck, Search, AlertTriangle, ShoppingCart, Eye
} from 'lucide-react';

interface Props {
  providerId: string;
  onBack: () => void;
}

const carBrands = [
  'Audi', 'BMW', 'Citroen', 'Dacia', 'Fiat', 'Ford', 'Honda', 'Hyundai',
  'Kia', 'Mazda', 'Mercedes-Benz', 'Nissan', 'Opel', 'Peugeot', 'Renault',
  'Seat', 'Skoda', 'Suzuki', 'Toyota', 'Volkswagen', 'Volvo'
];

export function WorkshopRepairData({ providerId, onBack }: Props) {
  const [vehicleType, setVehicleType] = useState('osobowe');
  const [vin, setVin] = useState('');
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');

  const handleVinDecode = () => {
    if (!vin || vin.length < 17) return;
    // Placeholder - will connect to VIN API later
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-primary hover:underline text-sm">🏠</button>
        <span className="text-muted-foreground">/</span>
        <h2 className="text-xl font-bold">Dane naprawcze</h2>
      </div>

      {/* Vehicle type tabs */}
      <div className="flex justify-center">
        <div className="inline-flex rounded-lg border overflow-hidden">
          <button
            className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
              vehicleType === 'osobowe' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
            }`}
            onClick={() => setVehicleType('osobowe')}
          >
            <Car className="h-5 w-5" /> Samochody osobowe i dostawcze
          </button>
          <button
            className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
              vehicleType === 'ciezarowe' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
            }`}
            onClick={() => setVehicleType('ciezarowe')}
          >
            <Truck className="h-5 w-5" /> Samochody ciężarowe
          </button>
        </div>
      </div>

      {/* Info banner */}
      <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
            <div>
              <p className="text-sm">
                Twój dostęp do modułu danych naprawczych <strong>dla samochodów {vehicleType === 'osobowe' ? 'osobowych i dostawczych' : 'ciężarowych'}</strong> jest w <span className="text-primary font-medium underline cursor-pointer">wersji demo</span>.
                Oznacza to, że <span className="text-primary font-medium underline cursor-pointer">masz dostęp do ograniczonej liczby typów pojazdów</span> z całej bazy.
              </p>
              <div className="flex gap-3 mt-3">
                <Button className="gap-2"><ShoppingCart className="h-4 w-4" /> Wykup pełny dostęp</Button>
                <Button variant="outline" className="gap-2"><Eye className="h-4 w-4" /> Przetestuj przez 3 dni</Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardContent className="py-6">
            <h3 className="font-semibold text-sm uppercase tracking-wide mb-4">Rozkoduj numer VIN</h3>
            <div className="space-y-3">
              <Input
                value={vin}
                onChange={e => setVin(e.target.value.toUpperCase())}
                placeholder="Wprowadź VIN"
                maxLength={17}
                className="font-mono"
              />
              <Button onClick={handleVinDecode} className="w-full" disabled={vin.length < 17}>
                Rozkoduj VIN
              </Button>
              {vin.length > 0 && vin.length < 17 && (
                <p className="text-xs text-muted-foreground">VIN musi mieć 17 znaków ({vin.length}/17)</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-6">
            <h3 className="font-semibold text-sm uppercase tracking-wide mb-4">Wyszukaj po marce i modelu</h3>
            <div className="space-y-3">
              <Select value={brand} onValueChange={setBrand}>
                <SelectTrigger><SelectValue placeholder="Wybierz markę" /></SelectTrigger>
                <SelectContent>
                  {carBrands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger><SelectValue placeholder="Wybierz model" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Wszystkie modele</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" className="w-full gap-2" disabled={!brand}>
                <Search className="h-4 w-4" /> Szukaj
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Features list */}
      <Card>
        <CardContent className="py-6">
          <h3 className="font-semibold mb-4">Dostępne dane naprawcze</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              'Momenty dokręcania', 'Schemat pasków', 'Pojemności płynów',
              'Układy hamulcowe', 'Rozrząd', 'Klimatyzacja',
              'Geometria zawieszenia', 'Kody usterek OBD'
            ].map(feature => (
              <div key={feature} className="flex items-center gap-2 text-sm">
                <Badge variant="secondary" className="text-xs">{feature}</Badge>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Dane naprawcze będą dostępne po aktywacji pełnego dostępu lub sprawdzeniu VIN pojazdu.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

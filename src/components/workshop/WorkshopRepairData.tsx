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
import { useTranslation } from 'react-i18next';

interface Props {
  providerId: string;
  onBack: () => void;
}

const carBrands = [
  'Audi', 'BMW', 'Citroen', 'Dacia', 'Fiat', 'Ford', 'Honda', 'Hyundai',
  'Kia', 'Mazda', 'Mercedes-Benz', 'Nissan', 'Opel', 'Peugeot', 'Renault',
  'Seat', 'Skoda', 'Suzuki', 'Toyota', 'Volkswagen', 'Volvo'
];

const featureKeys = [
  'workshop.repairData.features.torque',
  'workshop.repairData.features.beltSchema',
  'workshop.repairData.features.fluidCapacities',
  'workshop.repairData.features.brakeSystems',
  'workshop.repairData.features.timing',
  'workshop.repairData.features.airConditioning',
  'workshop.repairData.features.suspensionGeometry',
  'workshop.repairData.features.obdCodes',
];

export function WorkshopRepairData({ providerId, onBack }: Props) {
  const { t } = useTranslation();
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
        <h2 className="text-xl font-bold">{t('workshop.repairData.title')}</h2>
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
            <Car className="h-5 w-5" /> {t('workshop.repairData.passengerVans')}
          </button>
          <button
            className={`flex items-center gap-2 px-6 py-3 text-sm font-medium transition-colors ${
              vehicleType === 'ciezarowe' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
            }`}
            onClick={() => setVehicleType('ciezarowe')}
          >
            <Truck className="h-5 w-5" /> {t('workshop.repairData.trucks')}
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
                {t('workshop.repairData.demoBanner.prefix')} <strong>{t('workshop.repairData.demoBanner.forCars', { type: vehicleType === 'osobowe' ? t('workshop.repairData.demoBanner.typePassenger') : t('workshop.repairData.demoBanner.typeTruck') })}</strong> {t('workshop.repairData.demoBanner.isIn')} <span className="text-primary font-medium underline cursor-pointer">{t('workshop.repairData.demoBanner.demoVersion')}</span>.
                {' '}{t('workshop.repairData.demoBanner.meansThat')} <span className="text-primary font-medium underline cursor-pointer">{t('workshop.repairData.demoBanner.limitedTypes')}</span> {t('workshop.repairData.demoBanner.fromWholeBase')}
              </p>
              <div className="flex gap-3 mt-3">
                <Button className="gap-2"><ShoppingCart className="h-4 w-4" /> {t('workshop.repairData.buyFullAccess')}</Button>
                <Button variant="outline" className="gap-2"><Eye className="h-4 w-4" /> {t('workshop.repairData.test3Days')}</Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Search sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardContent className="py-6">
            <h3 className="font-semibold text-sm uppercase tracking-wide mb-4">{t('workshop.repairData.decodeVin')}</h3>
            <div className="space-y-3">
              <Input
                onFocus={e => e.currentTarget.select()}
                value={vin}
                onChange={e => setVin(e.target.value.toUpperCase())}
                placeholder={t('workshop.repairData.enterVin')}
                maxLength={17}
                className="font-mono"
              />
              <Button onClick={handleVinDecode} className="w-full" disabled={vin.length < 17}>
                {t('workshop.repairData.decodeVinBtn')}
              </Button>
              {vin.length > 0 && vin.length < 17 && (
                <p className="text-xs text-muted-foreground">{t('workshop.repairData.vinLengthHint', { count: vin.length })}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="py-6">
            <h3 className="font-semibold text-sm uppercase tracking-wide mb-4">{t('workshop.repairData.searchByBrandModel')}</h3>
            <div className="space-y-3">
              <Select value={brand} onValueChange={setBrand}>
                <SelectTrigger><SelectValue placeholder={t('workshop.repairData.selectBrand')} /></SelectTrigger>
                <SelectContent>
                  {carBrands.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger><SelectValue placeholder={t('workshop.repairData.selectModel')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">{t('workshop.repairData.allModels')}</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" className="w-full gap-2" disabled={!brand}>
                <Search className="h-4 w-4" /> {t('common.search')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Features list */}
      <Card>
        <CardContent className="py-6">
          <h3 className="font-semibold mb-4">{t('workshop.repairData.availableData')}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {featureKeys.map(featureKey => (
              <div key={featureKey} className="flex items-center gap-2 text-sm">
                <Badge variant="secondary" className="text-xs">{t(featureKey)}</Badge>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            {t('workshop.repairData.dataAvailableHint')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

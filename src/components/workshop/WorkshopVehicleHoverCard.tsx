import { useState } from 'react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Button } from '@/components/ui/button';
import { Car, Copy, ExternalLink, Fuel, Gauge, Calendar, Hash } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  vehicle: any;
  children: React.ReactNode;
  onEdit?: () => void;
}

export function WorkshopVehicleHoverCard({ vehicle, children, onEdit }: Props) {
  if (!vehicle) return <>{children}</>;

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} skopiowany`);
  };

  const name = `${vehicle.brand || ''} ${vehicle.model || ''}`.trim();

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <span className="cursor-pointer hover:text-primary transition-colors">{children}</span>
      </HoverCardTrigger>
      <HoverCardContent className="w-80 p-0" align="start">
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm flex items-center gap-1.5">
              <Car className="h-4 w-4 text-primary" />
              {name || 'Pojazd'}
            </h4>
            {onEdit && (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={onEdit}>
                <ExternalLink className="h-3 w-3" /> Edytuj
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            {vehicle.plate && (
              <div className="flex items-center justify-between col-span-2 bg-muted/50 rounded px-2 py-1.5">
                <span className="flex items-center gap-1.5">
                  <Hash className="h-3 w-3 text-muted-foreground" />
                  <span className="text-muted-foreground">Nr rej</span>
                  <span className="font-semibold">{vehicle.plate}</span>
                </span>
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => copy(vehicle.plate, 'Nr rejestracyjny')}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            )}
            {vehicle.vin && (
              <div className="flex items-center justify-between col-span-2 bg-muted/50 rounded px-2 py-1.5">
                <span className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">VIN</span>
                  <span className="font-mono text-[11px] font-semibold">{vehicle.vin}</span>
                </span>
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => copy(vehicle.vin, 'VIN')}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            )}
            {vehicle.year && (
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">Rok prod</span>
                <span className="font-medium">{vehicle.year}</span>
              </div>
            )}
            {vehicle.engine_capacity_cm3 && (
              <div className="flex items-center gap-1.5">
                <Gauge className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">Pojemność</span>
                <span className="font-medium">{vehicle.engine_capacity_cm3}</span>
              </div>
            )}
            {vehicle.fuel_type && (
              <div className="flex items-center gap-1.5">
                <Fuel className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">Silnik</span>
                <span className="font-medium">{vehicle.fuel_type}</span>
              </div>
            )}
            {vehicle.engine_power_kw && (
              <div className="flex items-center gap-1.5">
                <Gauge className="h-3 w-3 text-muted-foreground" />
                <span className="text-muted-foreground">Moc</span>
                <span className="font-medium">{vehicle.engine_power_kw} kW</span>
              </div>
            )}
            {vehicle.color && (
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground">Kolor</span>
                <span className="font-medium">{vehicle.color}</span>
              </div>
            )}
          </div>

          {!vehicle.vin && !vehicle.plate && (
            <p className="text-xs text-muted-foreground italic">Brak opisu pojazdu</p>
          )}
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

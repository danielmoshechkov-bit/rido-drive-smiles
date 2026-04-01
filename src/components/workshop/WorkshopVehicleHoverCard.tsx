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
      <HoverCardContent className="w-64 p-3" align="start">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-xs flex items-center gap-1">
              <Car className="h-3.5 w-3.5 text-primary" />
              {name || 'Pojazd'}
            </h4>
            {onEdit && (
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onEdit}>
                <ExternalLink className="h-3 w-3" />
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-y-1.5 text-xs">
            {vehicle.plate && (
              <>
                <span className="text-muted-foreground flex items-center gap-1">
                  <Hash className="h-2.5 w-2.5" /> Nr rej
                </span>
                <button className="text-left font-medium hover:text-primary flex items-center gap-1" onClick={() => copy(vehicle.plate, 'Nr rejestracyjny')}>
                  {vehicle.plate} <Copy className="h-2.5 w-2.5 opacity-50" />
                </button>
              </>
            )}
            {vehicle.vin && (
              <>
                <span className="text-muted-foreground">VIN</span>
                <button className="text-left text-[11px] font-medium hover:text-primary flex items-center gap-1 truncate" onClick={() => copy(vehicle.vin, 'VIN')}>
                  {vehicle.vin} <Copy className="h-2.5 w-2.5 opacity-50 shrink-0" />
                </button>
              </>
            )}
            {vehicle.year && (
              <>
                <span className="text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-2.5 w-2.5" /> Rok prod
                </span>
                <span className="font-medium">{vehicle.year}</span>
              </>
            )}
            {(vehicle.engine_capacity_cm3 || vehicle.engine_capacity) && (
              <>
                <span className="text-muted-foreground flex items-center gap-1">
                  <Gauge className="h-2.5 w-2.5" /> Pojemność
                </span>
                <span className="font-medium">{vehicle.engine_capacity_cm3 || vehicle.engine_capacity}</span>
              </>
            )}
            {vehicle.fuel_type && (
              <>
                <span className="text-muted-foreground flex items-center gap-1">
                  <Fuel className="h-2.5 w-2.5" /> Silnik
                </span>
                <span className="font-medium">{vehicle.fuel_type}</span>
              </>
            )}
            {(vehicle.engine_power_kw || vehicle.engine_power) && (
              <>
                <span className="text-muted-foreground flex items-center gap-1">
                  <Gauge className="h-2.5 w-2.5" /> Moc
                </span>
                <span className="font-medium">{vehicle.engine_power_kw || vehicle.engine_power} kW</span>
              </>
            )}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

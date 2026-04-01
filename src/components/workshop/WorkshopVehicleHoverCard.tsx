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
      <HoverCardContent className="w-[22rem] max-w-[calc(100vw-2rem)] p-4" align="start">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="flex items-center gap-1.5 text-sm font-semibold">
              <Car className="h-3.5 w-3.5 text-primary" />
              {name || 'Pojazd'}
            </h4>
            {onEdit && (
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onEdit}>
                <ExternalLink className="h-3 w-3" />
              </Button>
            )}
          </div>

          <div className="grid grid-cols-[auto,minmax(0,1fr)] gap-x-3 gap-y-2 text-xs">
            {vehicle.plate && (
              <>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Hash className="h-2.5 w-2.5" /> Nr rej
                </span>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left font-medium transition-colors hover:bg-accent/50 hover:text-primary"
                  onClick={() => copy(vehicle.plate, 'Nr rejestracyjny')}
                >
                  <span className="truncate">{vehicle.plate}</span>
                  <Copy className="h-2.5 w-2.5 shrink-0 opacity-60" />
                </button>
              </>
            )}
            {vehicle.vin && (
              <>
                <span className="text-[11px] text-muted-foreground">VIN</span>
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-2 rounded-md px-2 py-1 text-left font-medium transition-colors hover:bg-accent/50 hover:text-primary"
                  onClick={() => copy(vehicle.vin, 'VIN')}
                >
                  <span className="min-w-0 break-all text-primary">{vehicle.vin}</span>
                  <Copy className="mt-0.5 h-2.5 w-2.5 shrink-0 opacity-60" />
                </button>
              </>
            )}
            {vehicle.year && (
              <>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Calendar className="h-2.5 w-2.5" /> Rok prod
                </span>
                <span className="px-2 py-1 font-medium">{vehicle.year}</span>
              </>
            )}
            {(vehicle.engine_capacity_cm3 || vehicle.engine_capacity) && (
              <>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Gauge className="h-2.5 w-2.5" /> Pojemność
                </span>
                <span className="px-2 py-1 font-medium">{vehicle.engine_capacity_cm3 || vehicle.engine_capacity}</span>
              </>
            )}
            {vehicle.fuel_type && (
              <>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Fuel className="h-2.5 w-2.5" /> Silnik
                </span>
                <span className="px-2 py-1 font-medium">{vehicle.fuel_type}</span>
              </>
            )}
            {(vehicle.engine_power_kw || vehicle.engine_power) && (
              <>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Gauge className="h-2.5 w-2.5" /> Moc
                </span>
                <span className="px-2 py-1 font-medium">{vehicle.engine_power_kw || vehicle.engine_power} kW</span>
              </>
            )}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

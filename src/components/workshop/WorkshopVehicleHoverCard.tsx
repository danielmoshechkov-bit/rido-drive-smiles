import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Button } from '@/components/ui/button';
import { Car, Copy, ExternalLink, Fuel, Gauge, Calendar, Hash } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

/**
 * Karta pojazdu — JEDNA na cały warsztat.
 *
 * Używają jej: karta zlecenia, tabela zleceń na komputerze i lista zleceń
 * na telefonie. Do 13.09.2026 lista zleceń miała WŁASNĄ kopię wklejoną
 * w JSX tabeli — i właśnie dlatego na telefonie nie było jej wcale:
 * kopia siedziała w gałęzi `hidden md:block`, a widok mobilny to osobny
 * blok `md:hidden`, do którego nikt jej nie przeniósł.
 *
 * Dotknięcie na telefonie otwiera tę kartę zamiast najeżdżania —
 * przełącza to sam prymityw `ui/hover-card`, bez zmian tutaj.
 */
interface Props {
  vehicle: any;
  children: React.ReactNode;
  onEdit?: () => void;
}

/**
 * Pole, które da się skopiować dotknięciem.
 *
 * Mechanik stoi przy aucie i przepisuje VIN do systemu dostawcy części —
 * kopiowanie ma działać na KAŻDEJ pozycji, nie tylko na tablicy i VIN-ie.
 * Cel dotyku ma co najmniej 32 px wysokości, bo palec to nie kursor.
 */
function PoleDoSkopiowania({
  wartosc,
  komunikat,
  copy,
}: {
  wartosc: string;
  komunikat: string;
  copy: (text: string, message: string) => void;
}) {
  return (
    <button
      type="button"
      className="flex min-h-[32px] w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left font-medium transition-colors hover:bg-accent/50 hover:text-primary"
      onClick={() => copy(wartosc, komunikat)}
    >
      <span className="truncate">{wartosc}</span>
      <Copy className="h-3 w-3 shrink-0 opacity-60" />
    </button>
  );
}

export function WorkshopVehicleHoverCard({ vehicle, children, onEdit }: Props) {
  const { t } = useTranslation();
  if (!vehicle) return <>{children}</>;

  const copy = (text: string, message: string) => {
    navigator.clipboard.writeText(text);
    toast.success(message);
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
              {name || t('workshop.newOrder.vehicle')}
            </h4>
            {onEdit && (
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={onEdit}>
                <ExternalLink className="h-3 w-3" /> {t('workshop.vehicles.edit')}
              </Button>
            )}
          </div>

          <div className="grid grid-cols-[auto,minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
            {vehicle.plate && (
              <>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Hash className="h-2.5 w-2.5" /> {t('workshop.orders.plate')}
                </span>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left font-medium transition-colors hover:bg-accent/50 hover:text-primary"
                  onClick={() => copy(vehicle.plate, t('workshop.orders.copiedPlate'))}
                >
                  <span className="truncate">{vehicle.plate}</span>
                  <Copy className="h-3 w-3 shrink-0 opacity-60" />
                </button>
              </>
            )}
            {vehicle.vin && (
              <>
                <span className="text-muted-foreground">{t('workshop.orders.vin')}</span>
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-2 rounded-md px-2 py-1 text-left font-medium transition-colors hover:bg-accent/50 hover:text-primary"
                  onClick={() => copy(vehicle.vin, t('workshop.orders.copiedVin'))}
                >
                  <span className="min-w-0 break-all text-primary">{vehicle.vin}</span>
                  <Copy className="mt-0.5 h-2.5 w-2.5 shrink-0 opacity-60" />
                </button>
              </>
            )}
            {vehicle.year && (
              <>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Calendar className="h-2.5 w-2.5" /> {t('workshop.orders.yearOfProd')}
                </span>
                <PoleDoSkopiowania
                  wartosc={String(vehicle.year)}
                  komunikat={t('workshop.orders.yearOfProd')}
                  copy={copy}
                />
              </>
            )}
            {(vehicle.engine_capacity_cm3 || vehicle.engine_capacity) && (
              <>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Gauge className="h-2.5 w-2.5" /> {t('workshop.orders.capacity')}
                </span>
                <PoleDoSkopiowania
                  wartosc={String(vehicle.engine_capacity_cm3 || vehicle.engine_capacity)}
                  komunikat={t('workshop.orders.capacity')}
                  copy={copy}
                />
              </>
            )}
            {vehicle.fuel_type && (
              <>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Fuel className="h-2.5 w-2.5" /> {t('workshop.vehicles.engine')}
                </span>
                <PoleDoSkopiowania
                  wartosc={String(vehicle.fuel_type)}
                  komunikat={t('workshop.vehicles.engine')}
                  copy={copy}
                />
              </>
            )}
            {(vehicle.engine_power_kw || vehicle.engine_power) && (
              <>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Gauge className="h-2.5 w-2.5" /> {t('workshop.orders.power')}
                </span>
                <PoleDoSkopiowania
                  wartosc={`${vehicle.engine_power_kw || vehicle.engine_power} kW`}
                  komunikat={t('workshop.orders.power')}
                  copy={copy}
                />
              </>
            )}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

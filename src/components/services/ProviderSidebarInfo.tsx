// Karta usługodawcy — boczne moduły w stylu Booksy: godziny otwarcia, mapa dojazdu, zespół.
// Wszystko pochodzi z tego, co usługodawca ustawi w panelu „Moje usługi”.
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, MapPin, Navigation, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import {
  DAY_ORDER, DAY_LABELS, hasWorkingHours, normalizeWorkingHours, getOpenStatus,
} from '@/lib/provider-hours';

export interface StaffMember {
  id: string;
  name: string;
  role: string | null;
  photo_url: string | null;
  bio: string | null;
}

interface Props {
  providerId: string;
  workingHours: any;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  city: string | null;
  companyName: string;
}

export function ProviderSidebarInfo({
  providerId, workingHours, latitude, longitude, address, city, companyName,
}: Props) {
  const [staff, setStaff] = useState<StaffMember[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await (supabase as any)
        .from('provider_staff')
        .select('id, name, role, photo_url, bio')
        .eq('provider_id', providerId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      if (!cancelled) setStaff((data || []) as StaffMember[]);
    })();
    return () => { cancelled = true; };
  }, [providerId]);

  const showHours = hasWorkingHours(workingHours);
  const hours = showHours ? normalizeWorkingHours(workingHours) : null;
  const status = getOpenStatus(workingHours);
  const todayKey = (['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const)[new Date().getDay()];

  const hasGeo = typeof latitude === 'number' && typeof longitude === 'number';
  const bbox = hasGeo
    ? [longitude! - 0.006, latitude! - 0.003, longitude! + 0.006, latitude! + 0.003].join('%2C')
    : '';
  const fullAddress = [address, city].filter(Boolean).join(', ');

  return (
    <>
      {showHours && hours && (
        <Card className="p-5 rounded-2xl shadow-md border border-primary/15">
          <h3 className="font-extrabold text-lg mb-3 flex items-center gap-2 text-primary">
            <Clock className="h-5 w-5" /> Godziny otwarcia
          </h3>
          {status.label && (
            <div className={cn(
              'inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold mb-3',
              status.open ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600',
            )}>
              {status.label}
            </div>
          )}
          <ul className="space-y-1.5 text-sm">
            {DAY_ORDER.map(d => (
              <li
                key={d}
                className={cn(
                  'flex items-center justify-between rounded-lg px-2 py-1',
                  d === todayKey && 'bg-primary/10 font-extrabold text-primary',
                )}
              >
                <span className={cn('text-slate-700', d === todayKey && 'text-primary')}>{DAY_LABELS[d]}</span>
                <span className={cn('font-semibold text-slate-900', d === todayKey && 'text-primary')}>
                  {hours[d].closed ? 'Zamknięte' : `${hours[d].open} – ${hours[d].close}`}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {hasGeo && (
        <Card className="rounded-2xl shadow-md overflow-hidden border border-primary/15">
          <div className="p-5 pb-3">
            <h3 className="font-extrabold text-lg flex items-center gap-2 text-primary">
              <MapPin className="h-5 w-5" /> Lokalizacja
            </h3>
            {fullAddress && (
              <p className="text-sm font-semibold text-slate-700 mt-1">{fullAddress}</p>
            )}
          </div>
          <iframe
            title={`Mapa — ${companyName}`}
            className="w-full h-56 border-0"
            loading="lazy"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${latitude}%2C${longitude}`}
          />
          <div className="p-4 grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => window.open('/mapy', '_blank')}
            >
              <MapPin className="h-4 w-4" /> Mapa GetRido
            </Button>
            <Button
              className="gap-2"
              onClick={() =>
                window.open(
                  `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
                  '_blank',
                )
              }
            >
              <Navigation className="h-4 w-4" /> Dojazd
            </Button>
          </div>
        </Card>
      )}

      {staff.length > 0 && (
        <Card className="p-5 rounded-2xl shadow-md border border-primary/15">
          <h3 className="font-extrabold text-lg mb-4 flex items-center gap-2 text-primary">
            <Users className="h-5 w-5" /> Zespół
          </h3>
          <div className="space-y-3">
            {staff.map(m => (
              <div key={m.id} className="flex items-center gap-3">
                {m.photo_url ? (
                  <img src={m.photo_url} alt={m.name} className="h-12 w-12 rounded-full object-cover" />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-primary/15 flex items-center justify-center font-extrabold text-primary">
                    {m.name.charAt(0)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="font-bold text-slate-900 truncate">{m.name}</p>
                  {m.role && <p className="text-xs font-semibold text-slate-600 truncate">{m.role}</p>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

import { UniversalSubTabBar } from '@/components/UniversalSubTabBar';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import { usePendingBookingsCount } from '@/hooks/usePendingBookingsCount';

interface Props {
  providerId: string | null;
  activeTab: string;
  onTabChange: (v: string) => void;
  labelCalendar: string;
  labelBookings: string;
}

export function CalendarBookingsSubTabs({ providerId, activeTab, onTabChange, labelCalendar, labelBookings }: Props) {
  const pending = usePendingBookingsCount(providerId);
  const bookingsLabel = (
    <span className="inline-flex items-center gap-1.5">
      {labelBookings}
      {pending > 0 && (
        <Badge variant="destructive" className="h-5 px-1.5 gap-0.5">
          <AlertTriangle className="h-3 w-3" />
          {pending}
        </Badge>
      )}
    </span>
  );

  return (
    <UniversalSubTabBar
      activeTab={activeTab}
      onTabChange={onTabChange}
      tabs={[
        { value: 'calendar', label: labelCalendar },
        { value: 'bookings', label: bookingsLabel as any },
      ]}
    />
  );
}

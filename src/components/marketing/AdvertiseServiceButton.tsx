import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Megaphone } from 'lucide-react';
import { AdvertiseServiceWizard } from './AdvertiseServiceWizard';

interface AdvertiseServiceButtonProps {
  service: {
    id: string;
    name: string;
    description?: string | null;
    price?: number | null;
    image_url?: string | null;
  };
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg' | 'icon';
  className?: string;
  fullWidth?: boolean;
}

export function AdvertiseServiceButton({
  service,
  variant = 'default',
  size = 'sm',
  className,
  fullWidth,
}: AdvertiseServiceButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={`${className || ''} ${fullWidth ? 'w-full' : ''} gap-1.5`}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setOpen(true);
        }}
      >
        <Megaphone className="h-4 w-4" />
        Reklamuj tę usługę
      </Button>
      {open && (
        <AdvertiseServiceWizard
          service={service}
          open={open}
          onOpenChange={setOpen}
        />
      )}
    </>
  );
}

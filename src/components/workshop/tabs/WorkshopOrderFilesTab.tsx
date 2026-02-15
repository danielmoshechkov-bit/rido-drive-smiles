import { Button } from '@/components/ui/button';
import { Upload } from 'lucide-react';

interface Props {
  order: any;
}

export function WorkshopOrderFilesTab({ order }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed rounded-lg">
      <Upload className="h-8 w-8 text-muted-foreground mb-3" />
      <p className="text-primary font-medium cursor-pointer hover:underline">
        Brak plików, kliknij aby dodać
      </p>
      <p className="text-xs text-muted-foreground mt-1">Przeciągnij i upuść pliki lub kliknij</p>
    </div>
  );
}

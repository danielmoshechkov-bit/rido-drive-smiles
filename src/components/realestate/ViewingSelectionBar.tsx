import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Calendar, Eye, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ViewingRequestForm } from './ViewingRequestForm';

interface ViewingSelectionBarProps {
  selectedIds: string[];
  selectedTitles: string[];
  onClear: () => void;
  isLoggedIn: boolean;
}

export function ViewingSelectionBar({ selectedIds, selectedTitles, onClear, isLoggedIn }: ViewingSelectionBarProps) {
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);

  if (selectedIds.length === 0) return null;

  const handleOpenForm = () => {
    if (!isLoggedIn) {
      navigate('/auth?redirect=/nieruchomosci');
      return;
    }
    setShowForm(true);
  };

  return (
    <>
      <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-40 bg-primary text-primary-foreground rounded-full px-6 py-3 shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom-4">
        <Calendar className="h-5 w-5" />
        <span className="text-sm font-medium">
          {selectedIds.length} {selectedIds.length === 1 ? 'nieruchomość' : selectedIds.length < 5 ? 'nieruchomości' : 'nieruchomości'} do oglądania
        </span>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleOpenForm}
          className="gap-1 rounded-full"
        >
          <Eye className="h-4 w-4" />
          Umów oglądanie
        </Button>
        <button onClick={onClear} className="ml-1 p-1 rounded-full hover:bg-primary-foreground/20 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Umów oglądanie nieruchomości
            </DialogTitle>
          </DialogHeader>
          <ViewingRequestForm
            listingIds={selectedIds}
            listingTitles={selectedTitles}
            onSuccess={() => {
              setShowForm(false);
              onClear();
              navigate('/moje-ogladania');
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

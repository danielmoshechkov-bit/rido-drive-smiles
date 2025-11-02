import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { getAvailableWeeks, getCurrentWeekNumber } from '@/lib/utils';

interface CSVImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cityId: string;
  onSuccess?: () => void;
}

export function CSVImportModal({ open, onOpenChange, cityId, onSuccess }: CSVImportModalProps) {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedWeek, setSelectedWeek] = useState<number>(getCurrentWeekNumber(new Date().getFullYear()));
  const [platform, setPlatform] = useState<'uber' | 'bolt' | 'freenow'>('uber');
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  const weeks = getAvailableWeeks(selectedYear);

  const handleImport = async () => {
    if (!file || !selectedWeek) {
      toast.error('Wybierz tydzień i plik CSV');
      return;
    }

    setImporting(true);
    try {
      const weekData = weeks.find(w => w.number === selectedWeek);
      if (!weekData) throw new Error('Nieprawidłowy tydzień');

      const text = await file.text();

      const { data, error } = await supabase.functions.invoke('csv-import', {
        body: {
          csv_text: text,
          city_id: cityId,
          week_start: weekData.start,
          week_end: weekData.end,
          platform: platform,
        },
      });

      if (error) throw error;

      toast.success(`Import zakończony! Zaimportowano ${data.summary?.successful || 0} rekordów`);
      onSuccess?.();
      onOpenChange(false);
      
      // Reset form
      setFile(null);
      setSelectedWeek(getCurrentWeekNumber(selectedYear));
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Błąd podczas importu CSV');
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Import rozliczenia CSV</DialogTitle>
          <DialogDescription>
            Wybierz okres tygodniowy, platformę i plik CSV do zaimportowania
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Rok</Label>
            <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
              <SelectTrigger className="h-9 px-2 w-auto min-w-[70px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2024, 2025, 2026].map(year => (
                  <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Tydzień</Label>
            <Select value={selectedWeek.toString()} onValueChange={(v) => setSelectedWeek(parseInt(v))}>
              <SelectTrigger className="h-9 px-3 w-auto max-w-[320px]">
                <SelectValue placeholder="Wybierz tydzień" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {weeks.map(week => (
                  <SelectItem key={week.number} value={week.number.toString()}>
                    {week.displayLabel}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Platforma</Label>
            <Select value={platform} onValueChange={(v: any) => setPlatform(v)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="uber">Uber</SelectItem>
                <SelectItem value="bolt">Bolt</SelectItem>
                <SelectItem value="freenow">Freenow</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Plik CSV</Label>
            <Input
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
            Anuluj
          </Button>
          <Button onClick={handleImport} disabled={importing || !file || !selectedWeek}>
            {importing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importowanie...
              </>
            ) : (
              'Importuj'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

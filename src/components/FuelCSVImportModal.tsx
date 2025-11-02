import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Upload, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getAvailableWeeks, getCurrentWeekNumber } from "@/lib/utils";

interface FuelCSVImportModalProps {
  onUploadComplete?: () => void;
}

export const FuelCSVImportModal = ({ onUploadComplete }: FuelCSVImportModalProps) => {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [selectedWeek, setSelectedWeek] = useState(() => {
    const currentYear = new Date().getFullYear();
    return getCurrentWeekNumber(currentYear);
  });
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  const weeks = getAvailableWeeks(year);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleImport = async () => {
    if (!selectedWeek || !file) {
      toast.error("Wybierz tydzień i plik CSV");
      return;
    }

    const week = weeks.find(w => w.number === selectedWeek);
    if (!week) return;

    setImporting(true);

    try {
      const csvText = await file.text();

      const { data, error } = await supabase.functions.invoke('fuel-import', {
        body: {
          csv_text: csvText,
          period_from: week.start,
          period_to: week.end,
        },
      });

      if (error) throw error;

      if (data.success) {
        toast.success(`Zaimportowano ${data.stats.imported} transakcji z ${data.stats.unique_cards} kart`);
        
        // Reset form
        setFile(null);
        setOpen(false);
        onUploadComplete?.();
      } else {
        throw new Error(data.error || 'Import failed');
      }
    } catch (error: any) {
      console.error('Import error:', error);
      toast.error(error.message || "Nie udało się zaimportować pliku");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Dodaj rozliczenie paliwa
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import danych paliwowych z CSV</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Year and Week Selectors */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Rok</label>
              <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
                <SelectTrigger className="h-9 px-2 w-auto min-w-[70px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2024, 2025, 2026].map((y) => (
                    <SelectItem key={y} value={y.toString()}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Tydzień</label>
              <Select value={selectedWeek.toString()} onValueChange={(v) => setSelectedWeek(parseInt(v))}>
                <SelectTrigger className="h-9 px-3 w-auto max-w-[280px]">
                  <SelectValue placeholder="Wybierz tydzień" />
                </SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {weeks.map((week) => {
                    const isCurrentWeek = week.number === getCurrentWeekNumber(year);

                    return (
                      <SelectItem 
                        key={week.number} 
                        value={week.number.toString()}
                        className={isCurrentWeek ? "bg-yellow-100 dark:bg-yellow-900/30" : ""}
                      >
                        {week.displayLabel}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* File Upload Area */}
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              file ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
            }`}
          >
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              className="hidden"
              id="fuel-csv-upload"
            />
            <label htmlFor="fuel-csv-upload" className="cursor-pointer">
              <div className="flex flex-col items-center gap-2">
                {file ? (
                  <>
                    <FileText className="h-12 w-12 text-primary" />
                    <p className="text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">Kliknij lub przeciągnij, aby zmienić</p>
                  </>
                ) : (
                  <>
                    <Upload className="h-12 w-12 text-muted-foreground" />
                    <p className="text-sm font-medium">Przeciągnij plik CSV lub kliknij, aby wybrać</p>
                    <p className="text-xs text-muted-foreground">Format: separator ";", encoding UTF-8</p>
                  </>
                )}
              </div>
            </label>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={importing}>
              Anuluj
            </Button>
            <Button
              onClick={handleImport}
              disabled={!selectedWeek || !file || importing}
            >
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importowanie...
                </>
              ) : (
                'Importuj dane paliwowe'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
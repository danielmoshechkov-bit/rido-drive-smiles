import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { getAvailableWeeks } from "@/lib/utils";

interface FuelCSVUploadProps {
  onUploadComplete?: () => void;
}

export const FuelCSVUpload = ({ onUploadComplete }: FuelCSVUploadProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const { toast } = useToast();

  const weeks = getAvailableWeeks(selectedYear);

  // Auto-select newest week on year change
  useState(() => {
    if (weeks.length && !selectedWeek) {
      setSelectedWeek(weeks[0].number.toString());
    }
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setStats(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
      setStats(null);
    }
  };

  const handleImport = async () => {
    const weekData = weeks.find(w => w.number.toString() === selectedWeek);
    if (!file || !weekData) {
      toast({
        title: "Błąd",
        description: "Wybierz plik CSV i okres rozliczeniowy",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setStats(null);

    try {
      const csvText = await file.text();

      const { data, error } = await supabase.functions.invoke('fuel-import', {
        body: {
          csv_text: csvText,
          period_from: weekData.start,
          period_to: weekData.end,
        },
      });

      if (error) throw error;

      if (data.success) {
        setStats(data.stats);
        toast({
          title: "Import zakończony",
          description: `Zaimportowano ${data.stats.imported} transakcji z ${data.stats.unique_cards} kart`,
        });
        onUploadComplete?.();
      } else {
        throw new Error(data.error || 'Import failed');
      }
    } catch (error: any) {
      console.error('Import error:', error);
      toast({
        title: "Błąd importu",
        description: error.message || "Nie udało się zaimportować pliku",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
          file ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
        )}
      >
        <input
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          className="hidden"
          id="csv-upload"
        />
        <label htmlFor="csv-upload" className="cursor-pointer">
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

      <div className="flex gap-3 items-end">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Rok</label>
          <Select value={selectedYear.toString()} onValueChange={(v) => {
            setSelectedYear(parseInt(v));
            setSelectedWeek('');
          }}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[2024, 2025, 2026].map(year => (
                <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 flex-1">
          <label className="text-sm font-medium">Okres rozliczeniowy (tydzień)</label>
          <Select value={selectedWeek} onValueChange={setSelectedWeek}>
            <SelectTrigger>
              <SelectValue placeholder="Wybierz tydzień" />
            </SelectTrigger>
            <SelectContent>
              {weeks.map(week => (
                <SelectItem key={week.number} value={week.number.toString()}>
                  {week.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Button
        onClick={handleImport}
        disabled={!file || !selectedWeek || isUploading}
        className="w-full"
      >
        {isUploading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Importowanie...
          </>
        ) : (
          'Importuj dane paliwowe'
        )}
      </Button>

      {stats && (
        <Card className="p-4 bg-success/10 border-success">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold">{stats.imported}</p>
              <p className="text-xs text-muted-foreground">Transakcji</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.unique_cards}</p>
              <p className="text-xs text-muted-foreground">Kart</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.total_liters.toFixed(2)} L</p>
              <p className="text-xs text-muted-foreground">Litrów</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.total_amount.toFixed(2)} zł</p>
              <p className="text-xs text-muted-foreground">Kwota</p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Loader2, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { getWeekDates } from "@/lib/utils";

interface FuelCSVUploadCardProps {
  onUploadComplete?: () => void;
}

export const FuelCSVUploadCard = ({ onUploadComplete }: FuelCSVUploadCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [selectedWeek, setSelectedWeek] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const { toast } = useToast();

  const weeks = getWeekDates(parseInt(year));

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
      toast({
        title: "Błąd",
        description: "Wybierz tydzień i plik CSV",
        variant: "destructive",
      });
      return;
    }

    const week = weeks.find(w => w.number.toString() === selectedWeek);
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
        toast({
          title: "Import zakończony",
          description: `Zaimportowano ${data.stats.imported} transakcji z ${data.stats.unique_cards} kart`,
        });
        
        // Reset form
        setFile(null);
        setShowUpload(false);
        setIsExpanded(false);
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
      setImporting(false);
    }
  };

  if (!isExpanded) {
    return (
      <div className="mb-4">
        <Button 
          onClick={() => setIsExpanded(true)}
          variant="outline"
          className="w-full justify-center"
        >
          <Plus className="mr-2 h-4 w-4" />
          Dodaj rozliczenie paliwa
        </Button>
      </div>
    );
  }

  return (
    <Card className="mb-4">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Import danych paliwowych z CSV</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setIsExpanded(false);
              setShowUpload(false);
              setFile(null);
            }}
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Rok</label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger>
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
            <Select value={selectedWeek} onValueChange={setSelectedWeek}>
              <SelectTrigger>
                <SelectValue placeholder="Wybierz tydzień" />
              </SelectTrigger>
              <SelectContent>
                {weeks.map((week) => (
                  <SelectItem key={week.number} value={week.number.toString()}>
                    {week.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!showUpload ? (
          <Button
            onClick={() => setShowUpload(true)}
            variant="outline"
            className="w-full"
          >
            <Upload className="mr-2 h-4 w-4" />
            Dodaj CSV
          </Button>
        ) : (
          <>
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

            <Button
              onClick={handleImport}
              disabled={!selectedWeek || !file || importing}
              className="w-full"
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
          </>
        )}
      </CardContent>
    </Card>
  );
};

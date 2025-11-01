import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Upload, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { getWeekDates } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface SettlementCSVUploadCardProps {
  cityId: string;
  onSuccess?: () => void;
}

export function SettlementCSVUploadCard({ cityId, onSuccess }: SettlementCSVUploadCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [platform, setPlatform] = useState<'uber' | 'bolt' | 'freenow'>('uber');
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);

  const weeks = getWeekDates(selectedYear);

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
    if (!file || !selectedWeek) {
      toast.error('Wybierz tydzień i plik CSV');
      return;
    }

    setImporting(true);
    try {
      const weekData = weeks.find(w => w.number.toString() === selectedWeek);
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
      
      // Reset form
      setFile(null);
      setSelectedWeek('');
      setShowUpload(false);
      setIsExpanded(false);
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Błąd podczas importu CSV');
    } finally {
      setImporting(false);
    }
  };

  if (!isExpanded) {
    return (
      <Button 
        onClick={() => setIsExpanded(true)}
        className="mb-4"
      >
        Dodaj rozliczenie
        <ChevronDown className="ml-2 h-4 w-4" />
      </Button>
    );
  }

  return (
    <Card className="mb-4">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Dodaj rozliczenie CSV</CardTitle>
            <CardDescription>Wybierz tydzień i zaimportuj dane rozliczeniowe</CardDescription>
          </div>
          <Button 
            variant="ghost" 
            size="icon"
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
          <div className="space-y-2">
            <Label>Rok</Label>
            <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
              <SelectTrigger>
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
            <Label>Tydzień (pon.-ndz.)</Label>
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

        {!showUpload ? (
          <Button 
            onClick={() => setShowUpload(true)} 
            variant="outline" 
            className="w-full"
            disabled={!selectedWeek}
          >
            Dodaj CSV
          </Button>
        ) : (
          <>
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
                id="settlement-csv-upload"
              />
              <label htmlFor="settlement-csv-upload" className="cursor-pointer">
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

            <div className="space-y-2">
              <Label>Platforma</Label>
              <Select value={platform} onValueChange={(v: any) => setPlatform(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="uber">Uber</SelectItem>
                  <SelectItem value="bolt">Bolt</SelectItem>
                  <SelectItem value="freenow">FreeNow</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button 
              onClick={handleImport} 
              disabled={importing || !file || !selectedWeek}
              className="w-full"
            >
              {importing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Importowanie...
                </>
              ) : (
                'Importuj'
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Plus, CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { pl } from "date-fns/locale";

interface SettlementCSVImportModalProps {
  cityId: string;
  onSuccess?: () => void;
}

export const SettlementCSVImportModal = ({ cityId, onSuccess }: SettlementCSVImportModalProps) => {
  const [open, setOpen] = useState(false);
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date } | undefined>(() => {
    // Default to current week (Monday to Sunday)
    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    monday.setHours(0, 0, 0, 0);
    
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    
    return { from: monday, to: sunday };
  });
  const [ridoFile, setRidoFile] = useState<File | null>(null);
  const [uberFile, setUberFile] = useState<File | null>(null);
  const [boltFile, setBoltFile] = useState<File | null>(null);
  const [freenowFile, setFreenowFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [activeTab, setActiveTab] = useState("rido");

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    
    // Always select full week (Monday to Sunday)
    const dayOfWeek = date.getDay();
    const monday = new Date(date);
    monday.setDate(date.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    monday.setHours(0, 0, 0, 0);
    
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    
    setDateRange({ from: monday, to: sunday });
  };

  const handleImport = async () => {
    if (!dateRange) {
      toast.error("Wybierz zakres dat");
      return;
    }

    if (activeTab === "rido" && !ridoFile) {
      toast.error("Wybierz plik CSV RIDO");
      return;
    }

    if (activeTab === "separate" && !uberFile && !boltFile && !freenowFile) {
      toast.error("Wybierz przynajmniej jeden plik CSV");
      return;
    }

    setImporting(true);

    try {
      // Create settlement period
      const { data: period, error: periodError } = await supabase
        .from('settlement_periods')
        .insert({
          city_id: cityId,
          week_start: dateRange.from.toISOString(),
          week_end: dateRange.to.toISOString(),
          status: 'draft'
        })
        .select()
        .single();

      if (periodError) throw periodError;

      // Import files based on active tab
      if (activeTab === "rido" && ridoFile) {
        const formData = new FormData();
        formData.append('file', ridoFile);
        formData.append('periodId', period.id);
        formData.append('cityId', cityId);

        const { error: importError } = await supabase.functions.invoke('csv-import', {
          body: formData
        });

        if (importError) throw importError;
      } else {
        // Import separate files
        const files = [
          { file: uberFile, platform: 'uber' },
          { file: boltFile, platform: 'bolt' },
          { file: freenowFile, platform: 'freenow' }
        ].filter(f => f.file);

        for (const { file, platform } of files) {
          const formData = new FormData();
          formData.append('file', file!);
          formData.append('periodId', period.id);
          formData.append('cityId', cityId);
          formData.append('platform', platform);

          const { error: importError } = await supabase.functions.invoke('csv-import', {
            body: formData
          });

          if (importError) throw importError;
        }
      }

      toast.success("Rozliczenie zostało utworzone");
      setOpen(false);
      onSuccess?.();
    } catch (error) {
      console.error('Import error:', error);
      toast.error("Błąd podczas importu: " + (error as Error).message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Dodaj rozliczenie
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Utwórz nowe rozliczenie</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Date Range Selector */}
          <div>
            <Label className="mb-2 block">Wybierz zakres dat (automatycznie zaznacza pełny tydzień)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-auto min-w-[300px] justify-start text-left font-normal",
                    !dateRange && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.from && dateRange?.to ? (
                    `${format(dateRange.from, "dd.MM.yyyy", { locale: pl })} - ${format(dateRange.to, "dd.MM.yyyy", { locale: pl })}`
                  ) : (
                    <span>Wybierz zakres dat</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateRange?.from}
                  onSelect={handleDateSelect}
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            {dateRange && (
              <p className="text-sm text-muted-foreground mt-2">
                Wybrany okres: {format(dateRange.from, "dd.MM.yyyy", { locale: pl })} - {format(dateRange.to, "dd.MM.yyyy", { locale: pl })}
              </p>
            )}
          </div>

          {/* File Upload Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="rido">1 Szablon RIDO</TabsTrigger>
              <TabsTrigger value="separate">3 Osobne CSV-y</TabsTrigger>
            </TabsList>

            <TabsContent value="rido" className="space-y-4">
              <div>
                <Label htmlFor="rido-file">Wgraj plik CSV RIDO</Label>
                <Input
                  id="rido-file"
                  type="file"
                  accept=".csv"
                  onChange={(e) => setRidoFile(e.target.files?.[0] || null)}
                />
              </div>
            </TabsContent>

            <TabsContent value="separate" className="space-y-4">
              <div>
                <Label htmlFor="uber-file">Uber CSV (opcjonalnie)</Label>
                <Input
                  id="uber-file"
                  type="file"
                  accept=".csv"
                  onChange={(e) => setUberFile(e.target.files?.[0] || null)}
                />
              </div>
              <div>
                <Label htmlFor="bolt-file">Bolt CSV (opcjonalnie)</Label>
                <Input
                  id="bolt-file"
                  type="file"
                  accept=".csv"
                  onChange={(e) => setBoltFile(e.target.files?.[0] || null)}
                />
              </div>
              <div>
                <Label htmlFor="freenow-file">FreeNow CSV (opcjonalnie)</Label>
                <Input
                  id="freenow-file"
                  type="file"
                  accept=".csv"
                  onChange={(e) => setFreenowFile(e.target.files?.[0] || null)}
                />
              </div>
            </TabsContent>
          </Tabs>

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={importing}>
              Anuluj
            </Button>
            <Button onClick={handleImport} disabled={importing}>
              {importing ? "Importowanie..." : "Utwórz i otwórz arkusz"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

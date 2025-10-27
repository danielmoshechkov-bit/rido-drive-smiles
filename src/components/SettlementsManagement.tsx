import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Download, Upload, FileText, AlertCircle, Eye, Trash2, Plus, File, MoreVertical, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format, addDays, startOfWeek, endOfWeek, isMonday, differenceInDays } from 'date-fns';
import { pl } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface SettlementsManagementProps {
  cityId: string;
  cityName: string;
}

interface Settlement {
  id: number;
  driver_id: string;
  platform: string;
  week_start: string;
  week_end: string;
  trips_count: number;
  gross_sum: number;
  commission_sum: number;
  cash_sum: number;
  adjustments_sum: number;
  net_result: number;
  driver_name: string;
}

interface ImportJob {
  id: string;
  platform: string;
  week_start: string;
  week_end: string;
  filename: string;
  status: string;
  created_at: string;
}

interface ImportError {
  id: number;
  row_no: number | null;
  code: string;
  message: string;
  raw: any;
}

interface SettlementPeriod {
  id: string;
  week_start: string;
  week_end: string;
  status: string;
  google_sheet_url: string;
  created_at: string;
}

// Helper function to get Monday of week
const getMonday = (date: Date): Date => {
  return startOfWeek(date, { weekStartsOn: 1 });
};

// Helper function to get Sunday of week
const getSunday = (date: Date): Date => {
  return endOfWeek(date, { weekStartsOn: 1 });
};

export const SettlementsManagement = ({ cityId, cityName }: SettlementsManagementProps) => {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [weekStart, setWeekStart] = useState<Date>(getMonday(new Date()));
  const [weekEnd, setWeekEnd] = useState<Date>(getSunday(new Date()));
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [importJobs, setImportJobs] = useState<ImportJob[]>([]);
  const [importErrors, setImportErrors] = useState<ImportError[]>([]);
  const [uploading, setUploading] = useState<{[key: string]: boolean}>({});
  const [computing, setComputing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('all');
  const [settlementPeriods, setSettlementPeriods] = useState<SettlementPeriod[]>([]);
  const [newSettlementOpen, setNewSettlementOpen] = useState(false);
  const [updateSettlementOpen, setUpdateSettlementOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [creatingSettlement, setCreatingSettlement] = useState(false);
  const [uberFile, setUberFile] = useState<File | null>(null);
  const [boltFile, setBoltFile] = useState<File | null>(null);
  const [freenowFile, setFreenowFile] = useState<File | null>(null);
  const [mainFile, setMainFile] = useState<File | null>(null);

  const platforms = [
    { id: 'uber', name: 'Uber', color: 'bg-black text-white' },
    { id: 'bolt', name: 'Bolt', color: 'bg-green-500 text-white' },
    { id: 'freenow', name: 'FreeNow', color: 'bg-red-500 text-white' },
  ];

  // Update week when date changes
  useEffect(() => {
    const monday = getMonday(selectedDate);
    const sunday = getSunday(selectedDate);
    setWeekStart(monday);
    setWeekEnd(sunday);
  }, [selectedDate]);

  // Load data when week changes
  useEffect(() => {
    loadSettlements();
    loadImportJobs();
    loadSettlementPeriods();
  }, [weekStart, weekEnd, cityId]);

  const loadSettlements = async () => {
    if (!cityId) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('settlements_weekly')
        .select(`
          *,
          drivers(first_name, last_name, email)
        `)
        .eq('week_start', format(weekStart, 'yyyy-MM-dd'))
        .eq('week_end', format(weekEnd, 'yyyy-MM-dd'))
        .order('net_result', { ascending: false });

      if (error) throw error;

      const formattedSettlements: Settlement[] = (data || []).map(item => ({
        ...item,
        id: item.id,
        gross_sum: item.gross_sum || 0,
        commission_sum: item.commission_sum || 0,
        cash_sum: item.cash_sum || 0,
        adjustments_sum: item.adjustments_sum || 0,
        net_result: item.net_result || 0,
        driver_name: `${item.drivers?.first_name || ''} ${item.drivers?.last_name || ''}`.trim() || 'Nieznany kierowca'
      }));

      setSettlements(formattedSettlements);
    } catch (error) {
      console.error('Error loading settlements:', error);
      toast.error('Błąd ładowania rozliczeń');
    } finally {
      setLoading(false);
    }
  };

  const loadImportJobs = async () => {
    if (!cityId) return;
    
    try {
      const { data, error } = await supabase
        .from('import_jobs')
        .select('*')
        .eq('week_start', format(weekStart, 'yyyy-MM-dd'))
        .eq('week_end', format(weekEnd, 'yyyy-MM-dd'))
        .order('created_at', { ascending: false });

      if (error) throw error;
      setImportJobs(data || []);
    } catch (error) {
      console.error('Error loading import jobs:', error);
    }
  };

  const loadImportErrors = async (jobId: string) => {
    try {
      const { data, error } = await supabase
        .from('import_errors')
        .select('*')
        .eq('job_id', jobId)
        .order('row_no', { ascending: true });

      if (error) throw error;
      setImportErrors(data || []);
    } catch (error) {
      console.error('Error loading import errors:', error);
      toast.error('Błąd ładowania błędów importu');
    }
  };

  const loadSettlementPeriods = async () => {
    if (!cityId) return;

    try {
      const { data, error } = await supabase
        .from('settlement_periods')
        .select('*')
        .eq('city_id', cityId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSettlementPeriods(data || []);
    } catch (error) {
      console.error('Error loading settlement periods:', error);
      toast.error('Błąd ładowania okresów rozliczeniowych');
    }
  };

  const handleViewSettlement = (settlementId: string) => {
    navigate(`/admin/settlement/${settlementId}`);
  };

  const handleDeleteSettlement = async (settlementId: string) => {
    const confirmed = confirm('❌ Czy na pewno chcesz usunąć to rozliczenie?\n\nTa operacja jest nieodwracalna.');
    if (!confirmed) return;
    
    try {
      const { error } = await supabase
        .from('settlement_periods')
        .delete()
        .eq('id', settlementId);
      
      if (error) throw error;
      
      toast.success('✅ Rozliczenie usunięte');
      loadSettlementPeriods();
    } catch (error) {
      console.error('Error deleting settlement:', error);
      toast.error('❌ Błąd podczas usuwania rozliczenia');
    }
  };

  const handleDeleteDriverPortalData = async (period: SettlementPeriod) => {
    const confirmed = confirm('🗑️ Czy na pewno chcesz usunąć dane portalu kierowcy dla tego okresu?\n\nUsunięte zostaną wszystkie rozliczenia z tabeli settlements dla tego okresu.\nTa operacja jest nieodwracalna.');
    if (!confirmed) return;
    
    try {
      const { error } = await supabase
        .from('settlements')
        .delete()
        .eq('period_from', period.week_start)
        .eq('period_to', period.week_end)
        .eq('city_id', cityId);
      
      if (error) throw error;
      
      toast.success('✅ Dane portalu kierowcy usunięte');
    } catch (error) {
      console.error('Error deleting driver portal data:', error);
      toast.error('❌ Błąd podczas usuwania danych portalu kierowcy');
    }
  };

  const handleExportSettlement = async (period: SettlementPeriod) => {
    try {
      // Fetch all settlements for this period
      const { data, error } = await supabase
        .from('settlements')
        .select('*, drivers(*)')
        .eq('period_from', period.week_start)
        .eq('period_to', period.week_end)
        .order('drivers(last_name)', { ascending: true });
      
      if (error) throw error;
      
      if (!data || data.length === 0) {
        toast.error('Brak danych do eksportu');
        return;
      }

      // Create CSV
      const headers = ['Kierowca', 'Email', 'Okres od', 'Okres do', 'Platforma', 'Kwoty'];
      const rows = data.map(settlement => [
        `${settlement.drivers?.first_name || ''} ${settlement.drivers?.last_name || ''}`.trim(),
        settlement.drivers?.email || '',
        settlement.period_from,
        settlement.period_to,
        settlement.platform,
        JSON.stringify(settlement.amounts)
      ]);
      
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');
      
      // Download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `rozliczenie_${period.week_start}_${period.week_end}.csv`;
      link.click();
      window.URL.revokeObjectURL(url);
      
      toast.success('✅ Wyeksportowano rozliczenie do CSV');
    } catch (error) {
      console.error('Error exporting settlement:', error);
      toast.error('❌ Błąd podczas eksportu');
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]); // Remove data:*/*;base64, prefix
      };
      reader.onerror = error => reject(error);
    });
  };

  const createNewSettlement = async () => {
    if (!dateRange?.from || !dateRange?.to) {
      toast.error('Wybierz zakres dat rozliczenia');
      return;
    }

    // Validate max 7 days
    const daysDiff = differenceInDays(dateRange.to, dateRange.from);
    if (daysDiff > 6) {
      toast.error('Maksymalny zakres to 7 dni');
      return;
    }

    if (!uberFile && !boltFile && !freenowFile && !mainFile) {
      toast.error('Wybierz przynajmniej jeden plik CSV');
      return;
    }

    setCreatingSettlement(true);
    try {
      console.log('🚀 Starting settlement creation...');
      
      // Convert files to base64
      const uberCsv = uberFile ? await fileToBase64(uberFile) : "";
      const boltCsv = boltFile ? await fileToBase64(boltFile) : "";
      const freenowCsv = freenowFile ? await fileToBase64(freenowFile) : "";
      const mainCsv = mainFile ? await fileToBase64(mainFile) : "";

      console.log('📄 Files converted to base64');

      // Calculate payload size
      const payloadSize = {
        uber: uberCsv.length,
        bolt: boltCsv.length,
        freenow: freenowCsv.length,
        main: mainCsv.length,
        total: uberCsv.length + boltCsv.length + freenowCsv.length + mainCsv.length
      };

      console.log('📦 Rozmiar payloadu (base64):', payloadSize);
      console.log('📦 Łączny rozmiar:', (payloadSize.total / 1024 / 1024).toFixed(2), 'MB');

      if (payloadSize.total > 6 * 1024 * 1024) { // 6MB limit
        toast.error('❌ Pliki są zbyt duże. Maksymalny rozmiar: 6MB (łącznie)');
        setCreatingSettlement(false);
        return;
      }

      // Call with timeout (60 seconds)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      let data, error;
      try {
        const response = await supabase.functions.invoke('settlements', {
          body: {
            period_from: format(dateRange.from, "yyyy-MM-dd"),
            period_to: format(dateRange.to, "yyyy-MM-dd"),
            city_id: cityId,
            uber_csv: uberCsv,
            bolt_csv: boltCsv,
            freenow_csv: freenowCsv,
            main_csv: mainCsv,
          },
          // @ts-ignore - AbortSignal not in types but works
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        data = response.data;
        error = response.error;
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          toast.error('⏱️ Timeout - przetwarzanie trwa zbyt długo. Spróbuj z mniejszymi plikami.');
          setCreatingSettlement(false);
          return;
        }
        throw err;
      }

      console.log('📥 Edge function response:', { data, error });

      if (error) {
        console.error('❌ Edge function error:', error);
        throw error;
      }

      if (!data?.success) {
        throw new Error(data?.error || "Błąd podczas importu");
      }

      toast.success(`✅ Rozliczenie utworzone! Przetworzono: ${data.stats.processed} kierowców (${data.stats.new_drivers || 0} nowych, ${data.stats.matched_drivers || 0} dopasowanych)`);
      
      // Auto-sync driver IDs
      try {
        const { data: syncData } = await supabase.functions.invoke('sync-driver-ids', {
          body: {
            city_id: cityId,
            period_from: format(dateRange.from, 'yyyy-MM-dd'),
            period_to: format(dateRange.to, 'yyyy-MM-dd')
          }
        });
        
        if (syncData?.success) {
          toast.success(`🔄 Zsynchronizowano ID: ${syncData.stats.updatedDrivers} kierowców, ${syncData.stats.upsertedPlatformIds} platform IDs`);
        }
      } catch (syncError) {
        console.error('Sync error:', syncError);
      }
      
      setNewSettlementOpen(false);
      setDateRange(undefined);
      setUberFile(null);
      setBoltFile(null);
      setFreenowFile(null);
      setMainFile(null);
      loadSettlementPeriods();
      
      // Navigate to the new settlement sheet
      navigate(`/settlement/${data.settlement_period_id}`);
    } catch (error) {
      console.error('Error creating settlement:', error);
      toast.error(error instanceof Error ? error.message : 'Błąd tworzenia rozliczenia');
    } finally {
      setCreatingSettlement(false);
    }
  };

  const handleCSVUpload = async (file: File, platform: string) => {
    setUploading(prev => ({ ...prev, [platform]: true }));
    
    try {
      const formData = new FormData();
      formData.append('platform', platform);
      formData.append('week_start', format(weekStart, 'yyyy-MM-dd'));
      formData.append('week_end', format(weekEnd, 'yyyy-MM-dd'));
      formData.append('city_id', cityId);
      formData.append('file', file);

      const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbHJyeXRtcnNjcXZzeXh5dm5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4NzcxNjAsImV4cCI6MjA3MTQ1MzE2MH0.AUBGgRgUfLkb2X5DXWat2uCa52ptLzQkEigUnNUXtqk";
      
      const response = await fetch(`https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/settlements?action=import`, {
        method: 'POST',
        body: formData,
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        }
      });

      if (!response.ok) {
        throw new Error('Import failed');
      }

      const result = await response.json();
      if (result.ok) {
        toast.success(`Zaimportowano ${result.inserted} wierszy z ${platform}${result.errors > 0 ? ` (${result.errors} błędów)` : ''}`);
        loadImportJobs();
      } else {
        toast.error('Błąd podczas importu CSV');
      }
    } catch (error) {
      console.error('CSV import error:', error);
      toast.error('Błąd podczas importu pliku CSV');
    } finally {
      setUploading(prev => ({ ...prev, [platform]: false }));
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>, platform: string) => {
    const file = e.target.files?.[0];
    if (file) {
      const fileName = file.name.toLowerCase();
      if (!fileName.endsWith('.csv') && !fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
        toast.error('Wybierz plik CSV lub Excel (.xlsx, .xls)');
        return;
      }
      handleCSVUpload(file, platform);
    }
  };

  const generateReport = async () => {
    const jobs = importJobs.filter(job => job.status === 'done');
    if (jobs.length === 0) {
      toast.error('Najpierw zaimportuj pliki CSV dla wybranego tygodnia');
      return;
    }

    setComputing(true);
    try {
      const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndjbHJyeXRtcnNjcXZzeXh5dm5uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU4NzcxNjAsImV4cCI6MjA3MTQ1MzE2MH0.AUBGgRgUfLkb2X5DXWat2uCa52ptLzQkEigUnNUXtqk";
      
      // Generate reports for all completed jobs
      for (const job of jobs) {
        const response = await fetch(`https://wclrrytmrscqvsyxyvnn.supabase.co/functions/v1/settlements?action=compute`, {
          method: 'POST',
          body: JSON.stringify({ job_id: job.id }),
          headers: {
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error('Compute failed');
        }
      }

      toast.success('Raport wygenerowany pomyślnie');
      loadSettlements();
    } catch (error) {
      console.error('Error generating report:', error);
      toast.error('Błąd podczas generowania raportu');
    } finally {
      setComputing(false);
    }
  };

  // Filter settlements
  const filteredSettlements = settlements.filter(settlement => {
    const matchesSearch = settlement.driver_name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesPlatform = selectedPlatform === 'all' || settlement.platform === selectedPlatform;
    return matchesSearch && matchesPlatform;
  });

  // Calculate totals
  const totals = filteredSettlements.reduce(
    (acc, settlement) => ({
      trips: acc.trips + settlement.trips_count,
      gross: acc.gross + settlement.gross_sum,
      commission: acc.commission + settlement.commission_sum,
      cash: acc.cash + settlement.cash_sum,
      adjustments: acc.adjustments + settlement.adjustments_sum,
      net: acc.net + settlement.net_result,
    }),
    { trips: 0, gross: 0, commission: 0, cash: 0, adjustments: 0, net: 0 }
  );

  return (
    <div className="space-y-6">
      {/* New Settlement Button */}
      <div className="flex justify-center gap-3">
        <Dialog open={newSettlementOpen} onOpenChange={setNewSettlementOpen}>
          <DialogTrigger asChild>
            <Button size="lg" className="gap-2 bg-gradient-hero hover:opacity-90 text-white shadow-elegant">
              <Plus className="h-5 w-5" />
              + Nowe rozliczenie
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Utwórz nowe rozliczenie</DialogTitle>
              <DialogDescription>
                Wybierz zakres dat (max 7 dni) i zaimportuj pliki CSV
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              {/* Date Range Picker */}
              <div className="space-y-2">
                <Label>Zakres dat rozliczenia</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !dateRange?.from && "text-muted-foreground"
                      )}
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      {dateRange?.from ? (
                        dateRange?.to ? (
                          <>
                            {format(dateRange.from, 'dd.MM.yyyy', { locale: pl })} -{' '}
                            {format(dateRange.to, 'dd.MM.yyyy', { locale: pl })}
                          </>
                        ) : (
                          format(dateRange.from, 'dd.MM.yyyy', { locale: pl })
                        )
                      ) : (
                        "Wybierz zakres dat"
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="range"
                      selected={dateRange}
                      onSelect={(range) => {
                        if (range?.from && range?.to) {
                          const daysDiff = differenceInDays(range.to, range.from);
                          if (daysDiff > 6) {
                            toast.error('Maksymalny zakres to 7 dni');
                            return;
                          }
                        }
                        setDateRange(range);
                      }}
                      numberOfMonths={1}
                      locale={pl}
                      weekStartsOn={1}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* CSV Import Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-lg font-semibold">
                  <Upload className="h-5 w-5" />
                  Import rozliczeń CSV
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <Card className="border-2 border-dashed">
                    <CardContent className="pt-6">
                      <div className="space-y-4">
                        <div className="flex justify-center">
                          <Badge className="bg-black text-white">Uber</Badge>
                        </div>
                        <div className="flex flex-col items-center gap-3 py-6">
                          <File className="h-12 w-12 text-muted-foreground" />
                          <p className="text-sm text-center text-muted-foreground">
                            Rozliczenia Uber
                          </p>
                          {uberFile && (
                            <p className="text-xs text-primary font-medium">{uberFile.name}</p>
                          )}
                        </div>
                        <label htmlFor="file-uber">
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => document.getElementById('file-uber')?.click()}
                            type="button"
                          >
                            Wybierz plik
                          </Button>
                          <input
                            id="file-uber"
                            type="file"
                            accept=".csv"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) setUberFile(file);
                            }}
                          />
                        </label>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-2 border-dashed">
                    <CardContent className="pt-6">
                      <div className="space-y-4">
                        <div className="flex justify-center">
                          <Badge className="bg-green-500 text-white">Bolt</Badge>
                        </div>
                        <div className="flex flex-col items-center gap-3 py-6">
                          <File className="h-12 w-12 text-muted-foreground" />
                          <p className="text-sm text-center text-muted-foreground">
                            Rozliczenia Bolt
                          </p>
                          {boltFile && (
                            <p className="text-xs text-primary font-medium">{boltFile.name}</p>
                          )}
                        </div>
                        <label htmlFor="file-bolt">
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => document.getElementById('file-bolt')?.click()}
                            type="button"
                          >
                            Wybierz plik
                          </Button>
                          <input
                            id="file-bolt"
                            type="file"
                            accept=".csv"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) setBoltFile(file);
                            }}
                          />
                        </label>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-2 border-dashed">
                    <CardContent className="pt-6">
                      <div className="space-y-4">
                        <div className="flex justify-center">
                          <Badge className="bg-red-500 text-white">FreeNow</Badge>
                        </div>
                        <div className="flex flex-col items-center gap-3 py-6">
                          <File className="h-12 w-12 text-muted-foreground" />
                          <p className="text-sm text-center text-muted-foreground">
                            Rozliczenia FreeNow
                          </p>
                          {freenowFile && (
                            <p className="text-xs text-primary font-medium">{freenowFile.name}</p>
                          )}
                        </div>
                        <label htmlFor="file-freenow">
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => document.getElementById('file-freenow')?.click()}
                            type="button"
                          >
                            Wybierz plik
                          </Button>
                          <input
                            id="file-freenow"
                            type="file"
                            accept=".csv"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) setFreenowFile(file);
                            }}
                          />
                        </label>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-2 border-dashed">
                    <CardContent className="pt-6">
                      <div className="space-y-4">
                        <div className="flex justify-center">
                          <Badge className="bg-purple-500 text-white">Główny CSV</Badge>
                        </div>
                        <div className="flex flex-col items-center gap-3 py-6">
                          <File className="h-12 w-12 text-muted-foreground" />
                          <p className="text-sm text-center text-muted-foreground">
                            Arkusz rozliczeń (główny)
                          </p>
                          <p className="text-xs text-center text-muted-foreground">
                            Główny CSV z systemu — zawiera pełne wiersze rozliczeń
                          </p>
                          {mainFile && (
                            <p className="text-xs text-primary font-medium">{mainFile.name}</p>
                          )}
                        </div>
                        <label htmlFor="file-main">
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => document.getElementById('file-main')?.click()}
                            type="button"
                          >
                            Wybierz plik
                          </Button>
                          <input
                            id="file-main"
                            type="file"
                            accept=".csv"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) setMainFile(file);
                            }}
                          />
                        </label>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setNewSettlementOpen(false)}>
                Anuluj
              </Button>
              <Button onClick={createNewSettlement} disabled={creatingSettlement || !dateRange?.from || !dateRange?.to}>
                {creatingSettlement ? 'Tworzenie...' : 'Utwórz i otwórz arkusz'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        
        {/* Update Settlement Button */}
        <Dialog open={updateSettlementOpen} onOpenChange={setUpdateSettlementOpen}>
          <DialogTrigger asChild>
            <Button size="lg" variant="outline" className="gap-2">
              <Upload className="h-5 w-5" />
              Aktualizuj rozliczenie
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Aktualizuj istniejące rozliczenie</DialogTitle>
              <DialogDescription>
                Wybierz okres i prześlij nowe pliki CSV. Stare dane zostaną zastąpione, a kierowcy zobaczą zaktualizowane rozliczenia.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              {/* Date Range Picker */}
              <div className="space-y-2">
                <Label>Zakres dat rozliczenia (max 7 dni)</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !dateRange?.from && "text-muted-foreground"
                      )}
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      {dateRange?.from ? (
                        dateRange?.to ? (
                          <>
                            {format(dateRange.from, 'dd.MM.yyyy', { locale: pl })} -{' '}
                            {format(dateRange.to, 'dd.MM.yyyy', { locale: pl })}
                          </>
                        ) : (
                          format(dateRange.from, 'dd.MM.yyyy', { locale: pl })
                        )
                      ) : (
                        "Wybierz zakres dat"
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="range"
                      selected={dateRange}
                      onSelect={(range) => {
                        if (range?.from && range?.to) {
                          const daysDiff = differenceInDays(range.to, range.from);
                          if (daysDiff > 6) {
                            toast.error('Maksymalny zakres to 7 dni');
                            return;
                          }
                        }
                        setDateRange(range);
                      }}
                      numberOfMonths={1}
                      locale={pl}
                      weekStartsOn={1}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* CSV Import Section */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-lg font-semibold">
                  <Upload className="h-5 w-5" />
                  Import rozliczeń CSV
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="border-2 border-dashed">
                    <CardContent className="pt-6">
                      <div className="space-y-4">
                        <div className="flex justify-center">
                          <Badge className="bg-black text-white">Uber</Badge>
                        </div>
                        <div className="flex flex-col items-center gap-3 py-6">
                          <File className="h-12 w-12 text-muted-foreground" />
                          <p className="text-sm text-center text-muted-foreground">
                            Rozliczenia Uber
                          </p>
                          {uberFile && (
                            <p className="text-xs text-primary font-medium">{uberFile.name}</p>
                          )}
                        </div>
                        <label htmlFor="file-uber-update">
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => document.getElementById('file-uber-update')?.click()}
                            type="button"
                          >
                            Wybierz plik
                          </Button>
                          <input
                            id="file-uber-update"
                            type="file"
                            accept=".csv"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) setUberFile(file);
                            }}
                          />
                        </label>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-2 border-dashed">
                    <CardContent className="pt-6">
                      <div className="space-y-4">
                        <div className="flex justify-center">
                          <Badge className="bg-green-500 text-white">Bolt</Badge>
                        </div>
                        <div className="flex flex-col items-center gap-3 py-6">
                          <File className="h-12 w-12 text-muted-foreground" />
                          <p className="text-sm text-center text-muted-foreground">
                            Rozliczenia Bolt
                          </p>
                          {boltFile && (
                            <p className="text-xs text-primary font-medium">{boltFile.name}</p>
                          )}
                        </div>
                        <label htmlFor="file-bolt-update">
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => document.getElementById('file-bolt-update')?.click()}
                            type="button"
                          >
                            Wybierz plik
                          </Button>
                          <input
                            id="file-bolt-update"
                            type="file"
                            accept=".csv"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) setBoltFile(file);
                            }}
                          />
                        </label>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-2 border-dashed">
                    <CardContent className="pt-6">
                      <div className="space-y-4">
                        <div className="flex justify-center">
                          <Badge className="bg-red-500 text-white">FreeNow</Badge>
                        </div>
                        <div className="flex flex-col items-center gap-3 py-6">
                          <File className="h-12 w-12 text-muted-foreground" />
                          <p className="text-sm text-center text-muted-foreground">
                            Rozliczenia FreeNow
                          </p>
                          {freenowFile && (
                            <p className="text-xs text-primary font-medium">{freenowFile.name}</p>
                          )}
                        </div>
                        <label htmlFor="file-freenow-update">
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => document.getElementById('file-freenow-update')?.click()}
                            type="button"
                          >
                            Wybierz plik
                          </Button>
                          <input
                            id="file-freenow-update"
                            type="file"
                            accept=".csv"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) setFreenowFile(file);
                            }}
                          />
                        </label>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-2 border-dashed">
                    <CardContent className="pt-6">
                      <div className="space-y-4">
                        <div className="flex justify-center">
                          <Badge className="bg-purple-500 text-white">Główny CSV</Badge>
                        </div>
                        <div className="flex flex-col items-center gap-3 py-6">
                          <File className="h-12 w-12 text-muted-foreground" />
                          <p className="text-sm text-center text-muted-foreground">
                            Arkusz rozliczeń (główny)
                          </p>
                          <p className="text-xs text-center text-muted-foreground">
                            Główny CSV z systemu — zawiera pełne wiersze rozliczeń
                          </p>
                          {mainFile && (
                            <p className="text-xs text-primary font-medium">{mainFile.name}</p>
                          )}
                        </div>
                        <label htmlFor="file-main-update">
                          <Button
                            variant="outline"
                            className="w-full"
                            onClick={() => document.getElementById('file-main-update')?.click()}
                            type="button"
                          >
                            Wybierz plik
                          </Button>
                          <input
                            id="file-main-update"
                            type="file"
                            accept=".csv"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) setMainFile(file);
                            }}
                          />
                        </label>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setUpdateSettlementOpen(false);
                setDateRange(undefined);
                setUberFile(null);
                setBoltFile(null);
                setFreenowFile(null);
                setMainFile(null);
              }}>
                Anuluj
              </Button>
              <Button 
                onClick={async () => {
                  // First delete old data for this period
                  if (!dateRange?.from || !dateRange?.to) {
                    toast.error('Wybierz zakres dat');
                    return;
                  }
                  
                  const periodFrom = format(dateRange.from, 'yyyy-MM-dd');
                  const periodTo = format(dateRange.to, 'yyyy-MM-dd');
                  
                  // Delete old settlements for this period
                  const { error: deleteError } = await supabase
                    .from('settlements')
                    .delete()
                    .eq('period_from', periodFrom)
                    .eq('period_to', periodTo)
                    .eq('city_id', cityId);
                  
                  if (deleteError) {
                    console.error('Delete error:', deleteError);
                    toast.error('Błąd usuwania starych danych');
                    return;
                  }
                  
                  toast.success('Stare dane usunięte, rozpoczynam import...');
                  
                  // Now call the same import function
                  await createNewSettlement();
                  setUpdateSettlementOpen(false);
                }} 
                disabled={creatingSettlement || !dateRange?.from || !dateRange?.to}
              >
                {creatingSettlement ? 'Aktualizowanie...' : 'Aktualizuj rozliczenie'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Settlement Periods List */}
      {settlementPeriods.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Istniejące rozliczenia</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Okres od</TableHead>
                  <TableHead>Okres do</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data utworzenia</TableHead>
                  <TableHead className="text-right">Akcje</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settlementPeriods.map((period) => (
                  <TableRow key={period.id}>
                    <TableCell>{new Date(period.week_start).toLocaleDateString('pl-PL')}</TableCell>
                    <TableCell>{new Date(period.week_end).toLocaleDateString('pl-PL')}</TableCell>
                    <TableCell>
                      <Badge variant={period.status === 'opublikowane' ? 'default' : 'secondary'}>
                        {period.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(period.created_at).toLocaleDateString('pl-PL')}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleViewSettlement(period.id)}>
                            <Eye className="mr-2 h-4 w-4" />
                            Podgląd
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleExportSettlement(period)}>
                            <FileDown className="mr-2 h-4 w-4" />
                            Eksportuj CSV
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleDeleteDriverPortalData(period)}
                            className="text-orange-600 focus:text-orange-600"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Usuń dane portalu kierowcy
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleDeleteSettlement(period.id)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Usuń okres rozliczeniowy
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Week Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Wybór okresu rozliczeniowego - {cityName}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label htmlFor="week-select">Tydzień rozliczeniowy (Poniedziałek - Niedziela)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {format(weekStart, 'dd.MM.yyyy', { locale: pl })} - {format(weekEnd, 'dd.MM.yyyy', { locale: pl })}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={selectedDate}
                    onSelect={(date) => {
                      if (date) {
                        setSelectedDate(date);
                      }
                    }}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <Button 
              onClick={generateReport} 
              disabled={computing || importJobs.filter(j => j.status === 'done').length === 0}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              {computing ? 'Generowanie...' : 'Generuj raport'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Settlements Results */}
      <Card>
        <CardHeader>
          <CardTitle>Wyniki rozliczeń tygodniowych</CardTitle>
          <div className="flex gap-4">
            <Input
              placeholder="Szukaj po nazwisku kierowcy..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-sm"
            />
            <select
              value={selectedPlatform}
              onChange={(e) => setSelectedPlatform(e.target.value)}
              className="px-3 py-2 border border-input bg-background rounded-md"
            >
              <option value="all">Wszystkie platformy</option>
              {platforms.map(platform => (
                <option key={platform.id} value={platform.id}>
                  {platform.name}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">Ładowanie...</div>
          ) : filteredSettlements.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="mx-auto h-12 w-12 mb-4" />
              <p>Brak rozliczeń do wyświetlenia</p>
              <p className="text-sm">Zaimportuj pliki CSV i wygeneruj raport</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kierowca</TableHead>
                      <TableHead>Platforma</TableHead>
                      <TableHead className="text-right">Kursy</TableHead>
                      <TableHead className="text-right">Przychód</TableHead>
                      <TableHead className="text-right">Prowizje</TableHead>
                      <TableHead className="text-right">Korekty</TableHead>
                      <TableHead className="text-right">Gotówka</TableHead>
                      <TableHead className="text-right">Wynik (netto)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSettlements.map((settlement) => (
                      <TableRow key={settlement.id}>
                        <TableCell className="font-medium">{settlement.driver_name}</TableCell>
                        <TableCell>
                          <Badge className={platforms.find(p => p.id === settlement.platform)?.color}>
                            {platforms.find(p => p.id === settlement.platform)?.name}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">{settlement.trips_count}</TableCell>
                        <TableCell className="text-right">{settlement.gross_sum.toFixed(2)} zł</TableCell>
                        <TableCell className="text-right">{settlement.commission_sum.toFixed(2)} zł</TableCell>
                        <TableCell className="text-right">{settlement.adjustments_sum.toFixed(2)} zł</TableCell>
                        <TableCell className="text-right">{settlement.cash_sum.toFixed(2)} zł</TableCell>
                        <TableCell className="text-right font-bold">
                          <span className={settlement.net_result >= 0 ? 'text-green-600' : 'text-red-600'}>
                            {settlement.net_result.toFixed(2)} zł
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Totals row */}
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell colSpan={2}>SUMA</TableCell>
                      <TableCell className="text-right">{totals.trips}</TableCell>
                      <TableCell className="text-right">{totals.gross.toFixed(2)} zł</TableCell>
                      <TableCell className="text-right">{totals.commission.toFixed(2)} zł</TableCell>
                      <TableCell className="text-right">{totals.adjustments.toFixed(2)} zł</TableCell>
                      <TableCell className="text-right">{totals.cash.toFixed(2)} zł</TableCell>
                      <TableCell className="text-right">
                        <span className={totals.net >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {totals.net.toFixed(2)} zł
                        </span>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
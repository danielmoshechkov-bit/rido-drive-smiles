import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Upload, FileText, AlertCircle, Loader2, Plus, Minus, Trash2 } from 'lucide-react';
import { UnmappedDriversModal } from './UnmappedDriversModal';
import { SettlementImportTabs } from '../SettlementImportTabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { format, differenceInDays, startOfWeek, endOfWeek, isSameWeek } from 'date-fns';
import { pl } from 'date-fns/locale';
import type { DateRange } from 'react-day-picker';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface FleetSettlementImportProps {
  fleetId: string;
  onComplete?: () => void;
}

interface City {
  id: string;
  name: string;
}

export const FleetSettlementImport = ({ fleetId, onComplete }: FleetSettlementImportProps) => {
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [creatingSettlement, setCreatingSettlement] = useState(false);
  const [uberFile, setUberFile] = useState<File | null>(null);
  const [boltFile, setBoltFile] = useState<File | null>(null);
  const [freenowFile, setFreenowFile] = useState<File | null>(null);
  const [mainFile, setMainFile] = useState<File | null>(null);
  const [fuelFile, setFuelFile] = useState<File | null>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [selectedCityId, setSelectedCityId] = useState<string>('all');
  const [addCityDialogOpen, setAddCityDialogOpen] = useState(false);
  const [newCityName, setNewCityName] = useState('');
  const [addingCity, setAddingCity] = useState(false);
  const [unmappedDrivers, setUnmappedDrivers] = useState<any[]>([]);
  const [showUnmappedModal, setShowUnmappedModal] = useState(false);

  // Load cities
  const fetchCities = async () => {
    const { data } = await supabase.from('cities').select('id, name').order('name');
    if (data) setCities(data);
  };

  useEffect(() => {
    fetchCities();
  }, []);

  const handleAddCity = async () => {
    if (!newCityName.trim()) {
      toast.error('Podaj nazwę miasta');
      return;
    }

    setAddingCity(true);
    try {
      const { error } = await supabase.from('cities').insert({ name: newCityName.trim() });
      if (error) throw error;

      toast.success('Miasto dodane');
      setNewCityName('');
      setAddCityDialogOpen(false);
      fetchCities();
    } catch (error: any) {
      toast.error('Błąd dodawania miasta: ' + error.message);
    } finally {
      setAddingCity(false);
    }
  };

  const handleDeleteCity = async (cityId: string, cityName: string) => {
    const confirmed = confirm(`⚠️ Czy na pewno chcesz usunąć miasto "${cityName}"?\n\nTa operacja jest NIEODWRACALNA i usunie wszystkie powiązane dane!`);
    if (!confirmed) return;

    try {
      const { error } = await supabase.from('cities').delete().eq('id', cityId);
      if (error) throw error;

      toast.success('Miasto usunięte');
      if (selectedCityId === cityId) {
        setSelectedCityId('all');
      }
      fetchCities();
    } catch (error: any) {
      toast.error('Błąd usuwania miasta: ' + error.message);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = error => reject(error);
    });
  };

  // Handle week selection - click any day to select entire week (Mon-Sun)
  const handleDayClick = (day: Date | undefined) => {
    if (!day) return;
    const weekStart = startOfWeek(day, { weekStartsOn: 1 }); // Monday
    const weekEnd = endOfWeek(day, { weekStartsOn: 1 }); // Sunday
    setDateRange({ from: weekStart, to: weekEnd });
  };

  const createNewSettlement = async () => {
    if (!dateRange?.from || !dateRange?.to) {
      toast.error('Wybierz zakres dat rozliczenia');
      return;
    }

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
      console.log('🚀 Starting fleet settlement import...');
      
      const uberCsv = uberFile ? await fileToBase64(uberFile) : "";
      const boltCsv = boltFile ? await fileToBase64(boltFile) : "";
      const freenowCsv = freenowFile ? await fileToBase64(freenowFile) : "";
      const mainCsv = mainFile ? await fileToBase64(mainFile) : "";

      const payloadSize = uberCsv.length + boltCsv.length + freenowCsv.length + mainCsv.length;

      if (payloadSize > 6 * 1024 * 1024) {
        toast.error('❌ Pliki są zbyt duże. Maksymalny rozmiar: 6MB (łącznie)');
        setCreatingSettlement(false);
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      let data, error;
      try {
        const response = await supabase.functions.invoke('settlements', {
          body: {
            period_from: format(dateRange.from, "yyyy-MM-dd"),
            period_to: format(dateRange.to, "yyyy-MM-dd"),
            fleet_id: fleetId,
            city_id: selectedCityId && selectedCityId !== 'all' ? selectedCityId : undefined,
            uber_csv: uberCsv,
            bolt_csv: boltCsv,
            freenow_csv: freenowCsv,
            main_csv: mainCsv,
          },
          // @ts-ignore
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

      if (error) {
        console.error('❌ Edge function error:', error);
        throw error;
      }

      if (!data?.success) {
        throw new Error(data?.error || "Błąd podczas importu");
      }

      toast.success(`✅ Rozliczenie utworzone! Przetworzono: ${data.stats.processed} kierowców`);
      
      // Check for unmapped drivers
      if (data.stats?.unmapped_drivers?.length > 0) {
        setUnmappedDrivers(data.stats.unmapped_drivers);
        setShowUnmappedModal(true);
      }
      
      // Import fuel if file provided
      if (fuelFile) {
        try {
          const fuelCsvText = await fuelFile.text();
          
          const { data: fuelData, error: fuelError } = await supabase.functions.invoke('fuel-import', {
            body: {
              csv_text: fuelCsvText,
              period_from: format(dateRange.from, 'yyyy-MM-dd'),
              period_to: format(dateRange.to, 'yyyy-MM-dd'),
            },
          });
          
          if (fuelError) {
            toast.warning('⚠️ Rozliczenia zaimportowane, ale błąd importu paliwa');
          } else if (fuelData?.success) {
            toast.success(`⛽ Import paliwa: ${fuelData.stats?.imported || 0} transakcji`);
          }
        } catch (fuelErr) {
          toast.warning('⚠️ Błąd importu paliwa');
        }
      }
      
      setDateRange(undefined);
      setUberFile(null);
      setBoltFile(null);
      setFreenowFile(null);
      setMainFile(null);
      setFuelFile(null);
      
      onComplete?.();
    } catch (error) {
      console.error('Error creating settlement:', error);
      toast.error(error instanceof Error ? error.message : 'Błąd tworzenia rozliczenia');
    } finally {
      setCreatingSettlement(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Rozlicz kierowców
          </CardTitle>
          <CardDescription>
            Wgraj pliki CSV z rozliczeniami platform i utwórz nowe rozliczenie dla swoich kierowców.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Date Range Picker + City Selector */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Okres rozliczeniowy (tydzień)</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !dateRange && "text-muted-foreground"
                    )}
                  >
                    <Calendar className="mr-2 h-4 w-4" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "dd.MM.yyyy", { locale: pl })} -{" "}
                          {format(dateRange.to, "dd.MM.yyyy", { locale: pl })}
                        </>
                      ) : (
                        format(dateRange.from, "dd.MM.yyyy", { locale: pl })
                      )
                    ) : (
                      <span>Kliknij aby wybrać tydzień (pn-nd)</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={dateRange?.from}
                    onSelect={handleDayClick}
                    numberOfMonths={1}
                    locale={pl}
                    disabled={(date) => date > new Date()}
                    modifiers={{
                      selectedWeek: (day) => dateRange?.from ? isSameWeek(day, dateRange.from, { weekStartsOn: 1 }) : false
                    }}
                    modifiersStyles={{
                      selectedWeek: { 
                        backgroundColor: 'hsl(var(--primary))', 
                        color: 'hsl(var(--primary-foreground))',
                        borderRadius: '0'
                      }
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Miasto</label>
              <Select value={selectedCityId} onValueChange={setSelectedCityId}>
                <SelectTrigger>
                  <SelectValue placeholder="Wszystkie miasta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Wszystkie miasta</SelectItem>
                  {cities.map(city => (
                    <div key={city.id} className="flex items-center justify-between group px-2 py-1.5 hover:bg-muted rounded-sm">
                      <SelectItem value={city.id} className="flex-1 p-0">
                        {city.name}
                      </SelectItem>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity ml-2"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          handleDeleteCity(city.id, city.name);
                        }}
                      >
                        <Minus className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  ))}
                  <Separator className="my-1" />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      setAddCityDialogOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Dodaj miasto
                  </Button>
                </SelectContent>
              </Select>
            </div>

            {/* Add City Dialog */}
            <Dialog open={addCityDialogOpen} onOpenChange={setAddCityDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Dodaj nowe miasto</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="city-name">Nazwa miasta</Label>
                    <Input
                      id="city-name"
                      placeholder="np. Warszawa"
                      value={newCityName}
                      onChange={(e) => setNewCityName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddCity()}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setAddCityDialogOpen(false)}>
                    Anuluj
                  </Button>
                  <Button onClick={handleAddCity} disabled={addingCity}>
                    {addingCity ? 'Dodawanie...' : 'Dodaj miasto'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {/* Import Tabs */}
          <SettlementImportTabs
            onFilesSelected={() => {}}
            uberFile={uberFile}
            boltFile={boltFile}
            freenowFile={freenowFile}
            mainFile={mainFile}
            fuelFile={fuelFile}
            setUberFile={setUberFile}
            setBoltFile={setBoltFile}
            setFreenowFile={setFreenowFile}
            setMainFile={setMainFile}
            setFuelFile={setFuelFile}
          />

          {/* Submit Button */}
          <Button
            onClick={createNewSettlement}
            disabled={creatingSettlement || (!uberFile && !boltFile && !freenowFile && !mainFile)}
            className="w-full"
          >
            {creatingSettlement ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Przetwarzanie...
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" />
                Utwórz rozliczenie
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <UnmappedDriversModal
        open={showUnmappedModal}
        onOpenChange={setShowUnmappedModal}
        unmappedDrivers={unmappedDrivers}
        fleetId={fleetId}
        onComplete={() => {
          setUnmappedDrivers([]);
          onComplete?.();
        }}
      />
    </div>
  );
};
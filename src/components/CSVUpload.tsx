import { useState, useCallback } from 'react';
import { Upload, FileText, Calendar, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface CSVUploadProps {
  cityId: string;
  onUploadComplete: () => void;
}

export const CSVUpload = ({ cityId, onUploadComplete }: CSVUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ filename: string; date: string; stats: any }>>([]);
  const [isFirstImport, setIsFirstImport] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(false);

  const handleFileSelect = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) {
      toast.error('Proszę wybrać plik CSV');
      return;
    }
    setSelectedFile(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    const csvFile = files.find(file => file.name.endsWith('.csv'));
    
    if (csvFile) {
      handleFileSelect(csvFile);
    } else {
      toast.error('Proszę wybrać plik CSV');
    }
  }, [handleFileSelect]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleImport = async () => {
    if (!selectedFile) {
      toast.error('Proszę wybrać plik CSV');
      return;
    }

    if (!periodFrom || !periodTo) {
      toast.error('Proszę podać okres rozliczeniowy');
      return;
    }

    console.log('🚀 Starting CSV import...', {
      filename: selectedFile.name,
      periodFrom,
      periodTo,
      cityId,
      isFirstImport
    });

    try {
      setUploading(true);
      
      // Read CSV file
      const text = await selectedFile.text();
      console.log('📄 CSV file read successfully, length:', text.length);
      
      // Call edge function
      console.log('📤 Calling csv-import edge function...');
      const { data, error } = await supabase.functions.invoke('csv-import', {
        body: {
          csv_text: text,
          period_from: periodFrom,
          period_to: periodTo,
          city_id: cityId,
          force_first_import: isFirstImport
        }
      });

      console.log('📥 Edge function response:', { data, error });

      if (error) {
        console.error('❌ Edge function error:', error);
        throw error;
      }

      if (data?.success) {
        const stats = data.stats;
        console.log('✅ Import successful:', stats);
        
        toast.success(
          `Import zakończony! Dodano: ${stats.added}, Zaktualizowano: ${stats.updated}, Nowi kierowcy: ${stats.newDrivers}, Błędy: ${stats.errors}`
        );
        
        setUploadedFiles(prev => [...prev, {
          filename: selectedFile.name,
          date: new Date().toLocaleString('pl-PL'),
          stats
        }]);
        
        setSelectedFile(null);
        setPeriodFrom('');
        setPeriodTo('');
        setIsFirstImport(false);
        onUploadComplete();
      } else {
        throw new Error(data?.error || 'Import failed');
      }
      
    } catch (error) {
      console.error('💥 Import error:', error);
      toast.error(`Błąd podczas importu: ${error instanceof Error ? error.message : 'Nieznany błąd'}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Import rozliczeń CSV</CardTitle>
          <CardDescription>
            Wgraj plik CSV z Google Sheets (arkusz "SZABLON ROZLICZENIA RIDO")
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* File Drop Zone */}
          <div
            className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center hover:border-muted-foreground/50 transition-colors"
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
          >
            <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground mb-2">
              Przeciągnij i upuść plik CSV lub kliknij aby wybrać
            </p>
            <p className="text-xs text-muted-foreground mb-4">
              Wymagane kolumny: Email, Bolt ID, Uber ID, Imię+nazwisko, FreeNow ID, Kwoty
            </p>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileInput}
              className="hidden"
              id="csv-file-input"
            />
            <Button 
              variant="outline" 
              onClick={() => document.getElementById('csv-file-input')?.click()}
            >
              Wybierz plik CSV
            </Button>
            
            {selectedFile && (
              <div className="mt-4 p-3 bg-muted rounded-lg flex items-center gap-2 justify-center">
                <FileText className="h-4 w-4" />
                <span className="text-sm font-medium">{selectedFile.name}</span>
              </div>
            )}
          </div>

          {/* Period Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="period-from">
                <Calendar className="h-4 w-4 inline mr-2" />
                Okres od
              </Label>
              <Input
                id="period-from"
                type="date"
                value={periodFrom}
                onChange={(e) => setPeriodFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="period-to">
                <Calendar className="h-4 w-4 inline mr-2" />
                Okres do
              </Label>
              <Input
                id="period-to"
                type="date"
                value={periodTo}
                onChange={(e) => setPeriodTo(e.target.value)}
              />
            </div>
          </div>

          {/* First Import Checkbox */}
          <div className="flex items-center gap-3 p-4 border border-destructive/50 rounded-lg bg-destructive/5">
            <Checkbox 
              id="firstImport"
              checked={isFirstImport}
              onCheckedChange={(checked) => {
                if (checked) {
                  setShowWarningModal(true);
                } else {
                  setIsFirstImport(false);
                }
              }}
            />
            <Label 
              htmlFor="firstImport" 
              className="text-sm cursor-pointer flex items-center gap-2"
            >
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Pierwszy import (⚠️ usuń wszystkich kierowców z bazy)
            </Label>
          </div>

          {/* Import Button */}
          <Button 
            className="w-full" 
            onClick={handleImport}
            disabled={uploading || !selectedFile || !periodFrom || !periodTo}
          >
            {uploading ? 'Importowanie...' : 'Importuj rozliczenia'}
          </Button>
        </CardContent>
      </Card>

      {/* Warning Modal */}
      <Dialog open={showWarningModal} onOpenChange={setShowWarningModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              UWAGA! Czy na pewno?
            </DialogTitle>
            <DialogDescription className="space-y-3 pt-4">
              <p className="font-semibold">
                Ta opcja usunie <span className="text-destructive">WSZYSTKICH kierowców</span> z bazy danych przed importem.
              </p>
              <p className="text-sm">
                Użyj tej opcji tylko gdy:
              </p>
              <ul className="text-sm list-disc list-inside space-y-1 ml-2">
                <li>Importujesz dane po raz pierwszy</li>
                <li>Chcesz całkowicie zresetować bazę kierowców</li>
                <li>Jesteś pewien że poprzednie dane nie są potrzebne</li>
              </ul>
              <p className="text-sm font-semibold text-destructive">
                ⚠️ Ta operacja jest nieodwracalna!
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowWarningModal(false);
                setIsFirstImport(false);
              }}
            >
              Anuluj
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => {
                setShowWarningModal(false);
                setIsFirstImport(true);
                toast.success('Pierwszy import włączony - kierowcy zostaną usunięci');
              }}
            >
              Tak, usuń wszystkich i importuj
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload History */}
      {uploadedFiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Historia importów</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {uploadedFiles.map((file, index) => (
              <div key={index} className="p-3 bg-muted rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    <span className="text-sm font-medium">{file.filename}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{file.date}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  Dodano: {file.stats.added} | Zaktualizowano: {file.stats.updated} | 
                  Nowi kierowcy: {file.stats.newDrivers} | Błędy: {file.stats.errors}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

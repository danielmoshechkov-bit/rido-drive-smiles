import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Switch } from './ui/switch';
import { Alert, AlertDescription } from './ui/alert';
import { Card, CardContent } from './ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface RebuildDriversModalProps {
  isOpen: boolean;
  onClose: () => void;
  cityId: string;
  cityName: string;
  onSuccess?: () => void;
}

export const RebuildDriversModal = ({
  isOpen,
  onClose,
  cityId,
  cityName,
  onSuccess,
}: RebuildDriversModalProps) => {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [forceReplaceGetrido, setForceReplaceGetrido] = useState(true);
  const [clearPlatformIds, setClearPlatformIds] = useState(true);
  const [dryRun, setDryRun] = useState(false);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCsvFile(file);
      setReport(null);
    }
  };

  const handleRebuild = async () => {
    if (!csvFile) {
      toast.error('Wybierz plik CSV');
      return;
    }

    setLoading(true);
    setReport(null);

    try {
      // Read file as base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
      });

      reader.readAsDataURL(csvFile);
      const main_csv = await base64Promise;

      // Invoke rebuild function
      const { data, error } = await supabase.functions.invoke('rebuild-drivers', {
        body: {
          city_id: cityId,
          main_csv,
          options: {
            force_replace_getrido: forceReplaceGetrido,
            clear_platform_ids: clearPlatformIds,
            dry_run: dryRun,
          },
        },
      });

      if (error) throw error;

      setReport(data);

      if (dryRun) {
        toast.info('Dry run zakończony - nie wprowadzono zmian');
      } else {
        toast.success(`Rebuild zakończony: ${data.updated_drivers} zaktualizowanych, ${data.created_drivers} nowych`);
        onSuccess?.();
      }
    } catch (error) {
      console.error('Error rebuilding drivers:', error);
      toast.error(error instanceof Error ? error.message : 'Błąd podczas rebuildu');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rebuild kierowców z CSV</DialogTitle>
          <DialogDescription>
            Przebuduj bazę kierowców dla miasta: <strong>{cityName}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Ta operacja zaktualizuje istniejących kierowców i utworzy nowych na podstawie pliku CSV.
              Użyj najpierw "Dry run" aby zobaczyć co zostanie zmienione.
            </AlertDescription>
          </Alert>

          {/* File upload */}
          <div className="space-y-2">
            <Label htmlFor="csv-file">Główny arkusz CSV</Label>
            <Input
              id="csv-file"
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              disabled={loading}
            />
            {csvFile && (
              <p className="text-sm text-muted-foreground">
                Wybrany plik: {csvFile.name}
              </p>
            )}
          </div>

          {/* Options */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="force-replace">Zastąp zawsze GetRido ID z CSV (kolumna X)</Label>
                  <p className="text-sm text-muted-foreground">
                    Zawsze nadpisuj GetRido ID danymi z arkusza
                  </p>
                </div>
                <Switch
                  id="force-replace"
                  checked={forceReplaceGetrido}
                  onCheckedChange={setForceReplaceGetrido}
                  disabled={loading}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="clear-platform">Wyczyść i odtwórz ID platform</Label>
                  <p className="text-sm text-muted-foreground">
                    Usuń stare Uber/Bolt/FreeNow ID i wstaw nowe z CSV
                  </p>
                </div>
                <Switch
                  id="clear-platform"
                  checked={clearPlatformIds}
                  onCheckedChange={setClearPlatformIds}
                  disabled={loading}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="dry-run">Dry run (tylko raport, bez zapisu)</Label>
                  <p className="text-sm text-muted-foreground">
                    Sprawdź co zostanie zmienione bez faktycznych modyfikacji
                  </p>
                </div>
                <Switch
                  id="dry-run"
                  checked={dryRun}
                  onCheckedChange={setDryRun}
                  disabled={loading}
                />
              </div>
            </CardContent>
          </Card>

          {/* Report */}
          {report && (
            <Card className="bg-muted/50">
              <CardContent className="pt-6">
                <h3 className="font-semibold mb-4 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Raport {report.dry_run && '(Dry Run)'}
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Zaktualizowani kierowcy:</span>
                    <span className="ml-2 font-semibold">{report.updated_drivers}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Nowi kierowcy:</span>
                    <span className="ml-2 font-semibold">{report.created_drivers}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Zaktualizowane platform IDs:</span>
                    <span className="ml-2 font-semibold">{report.upserted_platform_ids}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Pominięte wiersze:</span>
                    <span className="ml-2 font-semibold">{report.skipped_rows}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              Zamknij
            </Button>
            <Button onClick={handleRebuild} disabled={loading || !csvFile}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Przetwarzanie...
                </>
              ) : (
                dryRun ? '🔍 Uruchom Dry Run' : '🔧 Wykonaj Rebuild'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

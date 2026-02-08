import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Upload, FileText, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface SettlementImportTabsProps {
  onFilesSelected: (files: {
    uber?: File;
    bolt?: File;
    freenow?: File;
    main?: File;
  }) => void;
  uberFile: File | null;
  boltFile: File | null;
  freenowFile: File | null;
  mainFile: File | null;
  fuelFile: File | null;
  setUberFile: (file: File | null) => void;
  setBoltFile: (file: File | null) => void;
  setFreenowFile: (file: File | null) => void;
  setMainFile: (file: File | null) => void;
  setFuelFile: (file: File | null) => void;
}

export const SettlementImportTabs = ({
  onFilesSelected,
  uberFile,
  boltFile,
  freenowFile,
  mainFile,
  fuelFile,
  setUberFile,
  setBoltFile,
  setFreenowFile,
  setMainFile,
  setFuelFile
}: SettlementImportTabsProps) => {
  const [activeTab, setActiveTab] = useState<'template' | 'platforms'>('platforms');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, setter: (file: File | null) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.csv')) {
        alert('Wybierz plik CSV');
        return;
      }
      setter(file);
    }
  };

  return (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'template' | 'platforms')}>
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="platforms">
          <Upload className="h-4 w-4 mr-2" />
          3 Osobne CSV + Paliwo
        </TabsTrigger>
        <TabsTrigger value="template">
          <FileText className="h-4 w-4 mr-2" />
          1 Szablon RIDO
        </TabsTrigger>
      </TabsList>

      <TabsContent value="template" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Szablon RIDO (połączony CSV)</CardTitle>
            <CardDescription>
              Wgraj jeden plik CSV z danymi ze wszystkich platform (Uber, Bolt, FreeNow) już połączonych w szablonie RIDO.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Format:</strong> Kolumny H (Uber D), I (Uber F), J (Bolt D), K (Bolt S), M (FreeNow F), N (FreeNow S), O (FreeNow T), P (Paliwo), U (Zwrot VAT)
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="main-csv">Plik CSV szablonu RIDO</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="main-csv"
                  type="file"
                  accept=".csv"
                  onChange={(e) => handleFileChange(e, setMainFile)}
                />
                {mainFile && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setMainFile(null)}
                  >
                    Usuń
                  </Button>
                )}
              </div>
              {mainFile && (
                <p className="text-sm text-muted-foreground">
                  ✅ {mainFile.name} ({(mainFile.size / 1024).toFixed(0)} KB)
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="platforms" className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>3 Osobne CSV-y platform</CardTitle>
            <CardDescription>
              Wgraj oryginalne pliki CSV z każdej platformy (Uber, Bolt, FreeNow). System automatycznie je rozpozna i połączy.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                System automatycznie wykryje platformę po nagłówkach CSV i dopasuje kierowców po platform ID lub innych identyfikatorach.
              </AlertDescription>
            </Alert>

            {/* Uber CSV */}
            <div className="space-y-2">
              <Label htmlFor="uber-csv" className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full bg-black"></span>
                Uber CSV
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="uber-csv"
                  type="file"
                  accept=".csv"
                  onChange={(e) => handleFileChange(e, setUberFile)}
                />
                {uberFile && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setUberFile(null)}
                  >
                    Usuń
                  </Button>
                )}
              </div>
              {uberFile && (
                <p className="text-sm text-muted-foreground">
                  ✅ {uberFile.name} ({(uberFile.size / 1024).toFixed(0)} KB)
                </p>
              )}
            </div>

            {/* Bolt CSV */}
            <div className="space-y-2">
              <Label htmlFor="bolt-csv" className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full bg-green-500"></span>
                Bolt CSV
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="bolt-csv"
                  type="file"
                  accept=".csv"
                  onChange={(e) => handleFileChange(e, setBoltFile)}
                />
                {boltFile && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setBoltFile(null)}
                  >
                    Usuń
                  </Button>
                )}
              </div>
              {boltFile && (
                <p className="text-sm text-muted-foreground">
                  ✅ {boltFile.name} ({(boltFile.size / 1024).toFixed(0)} KB)
                </p>
              )}
            </div>

            {/* FreeNow CSV */}
            <div className="space-y-2">
              <Label htmlFor="freenow-csv" className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full bg-red-500"></span>
                FreeNow CSV
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="freenow-csv"
                  type="file"
                  accept=".csv"
                  onChange={(e) => handleFileChange(e, setFreenowFile)}
                />
                {freenowFile && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFreenowFile(null)}
                  >
                    Usuń
                  </Button>
                )}
              </div>
              {freenowFile && (
                <p className="text-sm text-muted-foreground">
                  ✅ {freenowFile.name} ({(freenowFile.size / 1024).toFixed(0)} KB)
                </p>
              )}
            </div>

            {/* Fuel CSV */}
            <div className="space-y-2">
              <Label htmlFor="fuel-csv" className="flex items-center gap-2">
                <span className="inline-block w-3 h-3 rounded-full bg-orange-500"></span>
                Paliwo CSV (opcjonalne)
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="fuel-csv"
                  type="file"
                  accept=".csv"
                  onChange={(e) => handleFileChange(e, setFuelFile)}
                />
                {fuelFile && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFuelFile(null)}
                  >
                    Usuń
                  </Button>
                )}
              </div>
              {fuelFile && (
                <p className="text-sm text-muted-foreground">
                  ✅ {fuelFile.name} ({(fuelFile.size / 1024).toFixed(0)} KB)
                </p>
              )}
            </div>

            <Alert variant="default" className="bg-blue-50 border-blue-200">
              <AlertCircle className="h-4 w-4 text-blue-600" />
              <AlertDescription className="text-blue-900">
                <strong>Tip:</strong> Możesz wgrać 1, 2 lub wszystkie 3 pliki naraz + opcjonalnie paliwo. System obliczy podatek 8% dla każdej platformy.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
};

import { useState, useCallback } from 'react';
import { Upload, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface CSVUploadProps {
  cityId: string;
  onUploadComplete: () => void;
}

type Platform = 'uber' | 'bolt' | 'freenow';

interface CSVData {
  platform: Platform;
  data: any[];
  filename: string;
}

export const CSVUpload = ({ cityId, onUploadComplete }: CSVUploadProps) => {
  const [uploading, setUploading] = useState<Platform | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<CSVData[]>([]);

  const parseCSV = (text: string): string[][] => {
    return text.split('\n').map(row => 
      row.split(',').map(cell => cell.trim().replace(/^"|"$/g, ''))
    ).filter(row => row.some(cell => cell.length > 0));
  };

  const processUberCSV = (rows: string[][]): any[] => {
    // Uber: Kol A = ID, B = Imię, C = Nazwisko (od linii 2)
    return rows.slice(1).map((row, index) => ({
      platform_id: row[0] || '',
      first_name: row[1] || '',
      last_name: row[2] || '',
      email: null,
      phone: null,
      rowIndex: index + 2
    })).filter(driver => driver.platform_id && (driver.first_name || driver.last_name));
  };

  const processBoltCSV = (rows: string[][]): any[] => {
    // Bolt: Kol A = Imię Nazwisko, B = Email, C = Telefon, D = ID (od linii 2)
    return rows.slice(1).map((row, index) => {
      const fullName = row[0] || '';
      const [first_name, ...lastNameParts] = fullName.split(' ');
      const last_name = lastNameParts.join(' ');
      
      return {
        platform_id: row[3] || '',
        first_name: first_name || '',
        last_name: last_name || '',
        email: row[1] || null,
        phone: row[2] || null,
        rowIndex: index + 2
      };
    }).filter(driver => driver.platform_id && driver.first_name);
  };

  const processFreeNowCSV = (rows: string[][]): any[] => {
    // FreeNow: Kol A = ID, B = Imię Nazwisko (od linii 2)
    return rows.slice(1).map((row, index) => {
      const fullName = row[1] || '';
      const [first_name, ...lastNameParts] = fullName.split(' ');
      const last_name = lastNameParts.join(' ');
      
      return {
        platform_id: row[0] || '',
        first_name: first_name || '',
        last_name: last_name || '',
        email: null,
        phone: null,
        rowIndex: index + 2
      };
    }).filter(driver => driver.platform_id && driver.first_name);
  };

  const handleFileUpload = useCallback(async (file: File, platform: Platform) => {
    try {
      setUploading(platform);
      
      const text = await file.text();
      const rows = parseCSV(text);
      
      if (rows.length < 2) {
        throw new Error('Plik CSV musi zawierać nagłówki i przynajmniej jeden wiersz danych');
      }

      let processedData: any[];
      
      switch (platform) {
        case 'uber':
          processedData = processUberCSV(rows);
          break;
        case 'bolt':
          processedData = processBoltCSV(rows);
          break;
        case 'freenow':
          processedData = processFreeNowCSV(rows);
          break;
        default:
          throw new Error('Nieznana platforma');
      }

      if (processedData.length === 0) {
        throw new Error('Nie znaleziono prawidłowych danych w pliku CSV');
      }

      // Save to database
      for (const driverData of processedData) {
        // First, check if driver exists by platform_id
        const { data: existingPlatformId } = await supabase
          .from('driver_platform_ids')
          .select('driver_id')
          .eq('platform', platform)
          .eq('platform_id', driverData.platform_id)
          .single();

        let driverId: string;

        if (existingPlatformId) {
          // Update existing driver
          driverId = existingPlatformId.driver_id;
          await supabase
            .from('drivers')
            .update({
              first_name: driverData.first_name,
              last_name: driverData.last_name,
              email: driverData.email,
              phone: driverData.phone,
              updated_at: new Date().toISOString()
            })
            .eq('id', driverId);
        } else {
          // Create new driver
          const { data: newDriver, error: driverError } = await supabase
            .from('drivers')
            .insert({
              first_name: driverData.first_name,
              last_name: driverData.last_name,
              email: driverData.email,
              phone: driverData.phone,
              city_id: cityId
            })
            .select()
            .single();

          if (driverError) throw driverError;
          driverId = newDriver.id;

          // Create platform ID record
          await supabase
            .from('driver_platform_ids')
            .insert({
              driver_id: driverId,
              platform: platform,
              platform_id: driverData.platform_id
            });
        }
      }

      // Log the import
      await supabase
        .from('csv_imports')
        .insert({
          city_id: cityId,
          platform: platform,
          filename: file.name,
          records_count: processedData.length
        });

      setUploadedFiles(prev => [...prev, { platform, data: processedData, filename: file.name }]);
      toast.success(`Zaimportowano ${processedData.length} kierowców z ${platform.toUpperCase()}`);
      onUploadComplete();
      
    } catch (error) {
      toast.error(`Błąd podczas importu: ${error instanceof Error ? error.message : 'Nieznany błąd'}`);
    } finally {
      setUploading(null);
    }
  }, [cityId, onUploadComplete]);

  const handleDrop = useCallback((e: React.DragEvent, platform: Platform) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    const csvFile = files.find(file => file.name.endsWith('.csv'));
    
    if (csvFile) {
      handleFileUpload(csvFile, platform);
    } else {
      toast.error('Proszę wybrać plik CSV');
    }
  }, [handleFileUpload]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>, platform: Platform) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file, platform);
    }
  };

  const platforms = [
    { id: 'uber' as Platform, name: 'Uber', color: 'bg-black text-white' },
    { id: 'bolt' as Platform, name: 'Bolt', color: 'bg-green-500 text-white' },
    { id: 'freenow' as Platform, name: 'FreeNow', color: 'bg-red-500 text-white' },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {platforms.map((platform) => (
        <Card key={platform.id} className="relative">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              {platform.name}
              <Badge className={platform.color}>
                {uploadedFiles.filter(f => f.platform === platform.id).length} plików
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center hover:border-muted-foreground/50 transition-colors"
              onDrop={(e) => handleDrop(e, platform.id)}
              onDragOver={(e) => e.preventDefault()}
            >
              <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground mb-4">
                Przeciągnij i upuść plik CSV lub kliknij aby wybrać
              </p>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => handleFileInput(e, platform.id)}
                className="hidden"
                id={`file-${platform.id}`}
              />
              <Button 
                variant="outline" 
                onClick={() => document.getElementById(`file-${platform.id}`)?.click()}
                disabled={uploading === platform.id}
              >
                {uploading === platform.id ? 'Importowanie...' : 'Wybierz plik'}
              </Button>
            </div>
            
            {uploadedFiles.filter(f => f.platform === platform.id).map((file, index) => (
              <div key={index} className="mt-4 p-3 bg-muted rounded-lg flex items-center gap-2">
                <FileText className="h-4 w-4" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{file.filename}</p>
                  <p className="text-xs text-muted-foreground">{file.data.length} rekordów</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};
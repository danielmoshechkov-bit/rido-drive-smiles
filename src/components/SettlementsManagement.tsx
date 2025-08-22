import { useState } from 'react';
import { Calendar, Download, Upload, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

interface SettlementsManagementProps {
  cityId: string;
  cityName: string;
}

export const SettlementsManagement = ({ cityId, cityName }: SettlementsManagementProps) => {
  const [selectedWeek, setSelectedWeek] = useState('');
  const [uploading, setUploading] = useState(false);

  // Generate week options for the current year
  const generateWeekOptions = () => {
    const weeks = [];
    const currentYear = new Date().getFullYear();
    const startDate = new Date(currentYear, 0, 1);
    
    // Find first Monday of the year
    const firstMonday = new Date(startDate);
    firstMonday.setDate(startDate.getDate() + (1 - startDate.getDay() + 7) % 7);
    
    for (let i = 0; i < 52; i++) {
      const weekStart = new Date(firstMonday);
      weekStart.setDate(firstMonday.getDate() + (i * 7));
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      
      if (weekStart.getFullYear() === currentYear) {
        weeks.push({
          value: `${weekStart.toISOString().split('T')[0]}_${weekEnd.toISOString().split('T')[0]}`,
          label: `Tydzień ${i + 1}: ${weekStart.toLocaleDateString('pl-PL')} - ${weekEnd.toLocaleDateString('pl-PL')}`
        });
      }
    }
    
    return weeks.reverse(); // Most recent first
  };

  const weekOptions = generateWeekOptions();

  const handleCSVUpload = async (file: File, platform: string) => {
    setUploading(true);
    try {
      // TODO: Implement CSV parsing and settlement import
      toast.success(`Zaimportowano rozliczenia z ${platform}`);
    } catch (error) {
      toast.error('Błąd podczas importu rozliczeń');
    } finally {
      setUploading(false);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>, platform: string) => {
    const file = e.target.files?.[0];
    if (file) {
      handleCSVUpload(file, platform);
    }
  };

  const generateReport = () => {
    if (!selectedWeek) {
      toast.error('Wybierz tydzień do wygenerowania raportu');
      return;
    }
    
    // TODO: Generate and download report
    toast.info('Generowanie raportu...');
  };

  const platforms = [
    { id: 'uber', name: 'Uber', color: 'bg-black text-white' },
    { id: 'bolt', name: 'Bolt', color: 'bg-green-500 text-white' },
    { id: 'freenow', name: 'FreeNow', color: 'bg-red-500 text-white' },
  ];

  return (
    <div className="space-y-6">
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
              <Label htmlFor="week-select">Tydzień rozliczeniowy</Label>
              <Select value={selectedWeek} onValueChange={setSelectedWeek}>
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz tydzień..." />
                </SelectTrigger>
                <SelectContent>
                  {weekOptions.map((week) => (
                    <SelectItem key={week.value} value={week.value}>
                      {week.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button 
              onClick={generateReport} 
              disabled={!selectedWeek}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              Generuj raport
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* CSV Import */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Import rozliczeń CSV
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {platforms.map((platform) => (
              <div key={platform.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <Badge className={platform.color}>
                    {platform.name}
                  </Badge>
                </div>
                
                <div className="space-y-3">
                  <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 text-center">
                    <FileText className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground mb-2">
                      Rozliczenia {platform.name}
                    </p>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={(e) => handleFileInput(e, platform.id)}
                      className="hidden"
                      id={`settlement-${platform.id}`}
                    />
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => document.getElementById(`settlement-${platform.id}`)?.click()}
                      disabled={uploading}
                    >
                      {uploading ? 'Importowanie...' : 'Wybierz plik'}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Recent Settlements */}
      <Card>
        <CardHeader>
          <CardTitle>Ostatnie rozliczenia</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="mx-auto h-12 w-12 mb-4" />
            <p>Brak rozliczeń do wyświetlenia</p>
            <p className="text-sm">Zaimportuj pliki CSV z rozliczeniami platform</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
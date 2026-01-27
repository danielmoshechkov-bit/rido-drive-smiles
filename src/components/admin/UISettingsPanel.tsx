import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import { Palette, Check, RefreshCw } from 'lucide-react';
import { useUISettings, updateNavBarColor } from '@/hooks/useUISettings';

export function UISettingsPanel() {
  const { settings, navBarColor, isLoading, PRESET_COLORS } = useUISettings();
  const [colorType, setColorType] = useState<'preset' | 'custom'>('preset');
  const [preset, setPreset] = useState<'purple' | 'blue'>('purple');
  const [customColor, setCustomColor] = useState('#6C3CF0');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setColorType(settings.type);
      setPreset(settings.preset);
      setCustomColor(settings.custom);
    }
  }, [settings]);

  const handleSave = async () => {
    setIsSaving(true);
    
    const success = await updateNavBarColor({
      type: colorType,
      preset,
      custom: customColor,
    });

    if (success) {
      toast.success('Zapisano ustawienia kolorów');
    } else {
      toast.error('Błąd podczas zapisywania ustawień');
    }

    setIsSaving(false);
  };

  const previewColor = colorType === 'preset' 
    ? PRESET_COLORS[preset] 
    : customColor;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Ustawienia wyglądu
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Palette className="h-5 w-5" />
          Ustawienia wyglądu
        </CardTitle>
        <CardDescription>
          Zmień kolor pasków nawigacji we wszystkich panelach
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Preview */}
        <div>
          <Label className="mb-2 block">Podgląd</Label>
          <div 
            className="h-12 rounded-full shadow-lg flex items-center justify-center text-white font-medium"
            style={{ backgroundColor: previewColor }}
          >
            Przykładowy pasek nawigacji
          </div>
        </div>

        {/* Color type selector */}
        <div>
          <Label className="mb-3 block">Typ koloru</Label>
          <RadioGroup 
            value={colorType} 
            onValueChange={(v) => setColorType(v as 'preset' | 'custom')}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="preset" id="preset" />
              <Label htmlFor="preset" className="cursor-pointer">Predefiniowany</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="custom" id="custom" />
              <Label htmlFor="custom" className="cursor-pointer">Własny kolor</Label>
            </div>
          </RadioGroup>
        </div>

        {/* Preset colors */}
        {colorType === 'preset' && (
          <div>
            <Label className="mb-3 block">Wybierz kolor</Label>
            <div className="flex gap-4">
              {/* Purple */}
              <button
                onClick={() => setPreset('purple')}
                className={`relative w-16 h-16 rounded-xl transition-all ${
                  preset === 'purple' 
                    ? 'ring-4 ring-offset-2 ring-primary scale-110' 
                    : 'hover:scale-105'
                }`}
                style={{ backgroundColor: PRESET_COLORS.purple }}
              >
                {preset === 'purple' && (
                  <Check className="absolute inset-0 m-auto h-6 w-6 text-white" />
                )}
                <span className="sr-only">Fioletowy</span>
              </button>

              {/* Blue */}
              <button
                onClick={() => setPreset('blue')}
                className={`relative w-16 h-16 rounded-xl transition-all ${
                  preset === 'blue' 
                    ? 'ring-4 ring-offset-2 ring-blue-500 scale-110' 
                    : 'hover:scale-105'
                }`}
                style={{ backgroundColor: PRESET_COLORS.blue }}
              >
                {preset === 'blue' && (
                  <Check className="absolute inset-0 m-auto h-6 w-6 text-white" />
                )}
                <span className="sr-only">Niebieski</span>
              </button>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              {preset === 'purple' ? 'Fioletowy (domyślny RIDO)' : 'Niebieski'}
            </p>
          </div>
        )}

        {/* Custom color picker */}
        {colorType === 'custom' && (
          <div>
            <Label className="mb-3 block">Własny kolor (HEX)</Label>
            <div className="flex gap-3 items-center">
              <Input
                type="color"
                value={customColor}
                onChange={(e) => setCustomColor(e.target.value)}
                className="w-16 h-12 p-1 cursor-pointer"
              />
              <Input
                type="text"
                value={customColor}
                onChange={(e) => setCustomColor(e.target.value)}
                placeholder="#6C3CF0"
                className="w-32 font-mono"
              />
              <div 
                className="w-12 h-12 rounded-lg border"
                style={{ backgroundColor: customColor }}
              />
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Wprowadź kolor w formacie HEX (np. #FF5500)
            </p>
          </div>
        )}

        {/* Save button */}
        <Button 
          onClick={handleSave} 
          disabled={isSaving}
          className="w-full"
        >
          {isSaving ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Zapisywanie...
            </>
          ) : (
            <>
              <Check className="h-4 w-4 mr-2" />
              Zapisz ustawienia
            </>
          )}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          Zmiany zostaną zastosowane natychmiast na wszystkich panelach
        </p>
      </CardContent>
    </Card>
  );
}

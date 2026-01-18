// GetRido Maps - Navigation Settings Sheet (Yandex-style)
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useNavigationSettings, NavigationSettings } from './useNavigationSettings';
import { Volume2, VolumeX, Bell, Car, Navigation2, Sun, Moon, Monitor } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavigationSettingsSheetProps {
  open: boolean;
  onClose: () => void;
}

type VoiceMode = 'off' | 'alerts' | 'all';
type VolumeLevel = 'low' | 'medium' | 'high';
type CursorStyle = 'arrow' | 'car';
type ThemePreference = 'light' | 'dark' | 'auto';

export function NavigationSettingsSheet({ open, onClose }: NavigationSettingsSheetProps) {
  const { settings, updateSettings, isUpdating } = useNavigationSettings();

  // Derive voice mode from settings
  const voiceMode: VoiceMode = !settings.voice_enabled ? 'off' : 
    (settings.voice_mode || 'all');
  
  // Derive volume level from voice_volume
  const volumeLevel: VolumeLevel = settings.voice_volume <= 40 ? 'low' : 
    settings.voice_volume <= 70 ? 'medium' : 'high';

  const handleVoiceModeChange = (mode: VoiceMode) => {
    updateSettings({
      voice_enabled: mode !== 'off',
      voice_mode: mode,
    });
  };

  const handleVolumeChange = (level: VolumeLevel) => {
    const volumeMap = { low: 30, medium: 60, high: 100 };
    updateSettings({ voice_volume: volumeMap[level] });
  };

  const handleNavigationStyleChange = (style: 'banner' | 'bubble') => {
    updateSettings({ navigation_style: style });
  };

  const handleCursorStyleChange = (style: CursorStyle) => {
    updateSettings({ cursor_style: style });
  };

  const handleThemeChange = (theme: ThemePreference) => {
    updateSettings({ theme_preference: theme });
  };

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[85vh] overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="text-center text-lg font-bold">Ustawienia nawigacji</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 pb-8">
          {/* VOICE MODE */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Dźwięk nawigacji
            </Label>
            <div className="grid grid-cols-3 gap-2">
              <OptionButton
                active={voiceMode === 'off'}
                onClick={() => handleVoiceModeChange('off')}
                icon={<VolumeX className="w-5 h-5" />}
                label="Wycisz"
              />
              <OptionButton
                active={voiceMode === 'alerts'}
                onClick={() => handleVoiceModeChange('alerts')}
                icon={<Bell className="w-5 h-5" />}
                label="Alerty"
              />
              <OptionButton
                active={voiceMode === 'all'}
                onClick={() => handleVoiceModeChange('all')}
                icon={<Volume2 className="w-5 h-5" />}
                label="Wszystko"
              />
            </div>
            <p className="text-xs text-muted-foreground text-center">
              {voiceMode === 'off' && 'Nawigacja głosowa wyłączona'}
              {voiceMode === 'alerts' && 'Tylko ważne alerty (prędkość, fotoradary)'}
              {voiceMode === 'all' && 'Wszystkie komunikaty głosowe włączone'}
            </p>
          </div>

          {/* VOLUME */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Głośność
            </Label>
            <div className="grid grid-cols-3 gap-2">
              <OptionButton
                active={volumeLevel === 'low'}
                onClick={() => handleVolumeChange('low')}
                label="Niska"
                disabled={voiceMode === 'off'}
              />
              <OptionButton
                active={volumeLevel === 'medium'}
                onClick={() => handleVolumeChange('medium')}
                label="Średnia"
                disabled={voiceMode === 'off'}
              />
              <OptionButton
                active={volumeLevel === 'high'}
                onClick={() => handleVolumeChange('high')}
                label="Wysoka"
                disabled={voiceMode === 'off'}
              />
            </div>
          </div>

          <Separator />

          {/* ROUTE OPTIONS */}
          <div className="space-y-4">
            <ToggleRow
              label="Unikaj płatnych dróg"
              description="Trasy bez autostrad i dróg płatnych"
              checked={settings.avoid_tolls ?? false}
              onCheckedChange={(checked) => updateSettings({ avoid_tolls: checked })}
            />
            <ToggleRow
              label="Unikaj gruntowych dróg"
              description="Trasy po drogach utwardzonych"
              checked={settings.avoid_unpaved ?? false}
              onCheckedChange={(checked) => updateSettings({ avoid_unpaved: checked })}
            />
            <ToggleRow
              label="Pokaż limit prędkości"
              description="Wyświetlaj dozwolonę prędkość na drodze"
              checked={settings.show_speed_limit}
              onCheckedChange={(checked) => updateSettings({ show_speed_limit: checked })}
            />
            <ToggleRow
              label="Asystent pasa ruchu"
              description="Podpowiedzi wyboru pasa przed manewrem"
              checked={settings.show_lane_guidance}
              onCheckedChange={(checked) => updateSettings({ show_lane_guidance: checked })}
            />
          </div>

          <Separator />

          {/* NAVIGATION STYLE */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Styl nawigacji
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <StyleButton
                active={settings.navigation_style === 'banner'}
                onClick={() => handleNavigationStyleChange('banner')}
                label="Klasyczny"
                description="Pasek na górze ekranu"
              />
              <StyleButton
                active={settings.navigation_style === 'bubble'}
                onClick={() => handleNavigationStyleChange('bubble')}
                label="Zalecany"
                description="Dymek na mapie (Yandex)"
              />
            </div>
          </div>

          {/* CURSOR STYLE */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Kursor na mapie
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <OptionButton
                active={(settings.cursor_style ?? 'arrow') === 'arrow'}
                onClick={() => handleCursorStyleChange('arrow')}
                icon={<Navigation2 className="w-5 h-5" />}
                label="Strzałka"
              />
              <OptionButton
                active={settings.cursor_style === 'car'}
                onClick={() => handleCursorStyleChange('car')}
                icon={<Car className="w-5 h-5" />}
                label="Samochód"
              />
            </div>
          </div>

          {/* THEME */}
          <div className="space-y-3">
            <Label className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Motyw mapy
            </Label>
            <div className="grid grid-cols-3 gap-2">
              <OptionButton
                active={(settings.theme_preference ?? 'auto') === 'light'}
                onClick={() => handleThemeChange('light')}
                icon={<Sun className="w-5 h-5" />}
                label="Jasny"
              />
              <OptionButton
                active={settings.theme_preference === 'dark'}
                onClick={() => handleThemeChange('dark')}
                icon={<Moon className="w-5 h-5" />}
                label="Ciemny"
              />
              <OptionButton
                active={settings.theme_preference === 'auto'}
                onClick={() => handleThemeChange('auto')}
                icon={<Monitor className="w-5 h-5" />}
                label="Auto"
              />
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// Helper components
function OptionButton({ 
  active, 
  onClick, 
  icon, 
  label, 
  disabled 
}: { 
  active: boolean; 
  onClick: () => void; 
  icon?: React.ReactNode; 
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-center justify-center gap-1 py-3 px-2 rounded-xl border-2 transition-all",
        active 
          ? "border-primary bg-primary/10 text-primary" 
          : "border-border bg-card text-muted-foreground hover:border-primary/50",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      {icon}
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}

function StyleButton({ 
  active, 
  onClick, 
  label, 
  description 
}: { 
  active: boolean; 
  onClick: () => void; 
  label: string;
  description: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center gap-1 py-4 px-3 rounded-xl border-2 transition-all",
        active 
          ? "border-primary bg-primary/10" 
          : "border-border bg-card hover:border-primary/50"
      )}
    >
      <span className={cn("text-sm font-semibold", active ? "text-primary" : "text-foreground")}>
        {label}
      </span>
      <span className="text-xs text-muted-foreground text-center">{description}</span>
    </button>
  );
}

function ToggleRow({ 
  label, 
  description, 
  checked, 
  onCheckedChange 
}: { 
  label: string; 
  description: string; 
  checked: boolean; 
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-0.5">
        <Label className="text-sm font-medium">{label}</Label>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

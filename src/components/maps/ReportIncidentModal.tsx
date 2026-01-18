/**
 * GetRido Maps - Report Incident Modal
 * Allows users to report traffic incidents
 */
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  AlertTriangle, 
  Car, 
  Construction, 
  ShieldAlert, 
  XCircle, 
  Camera, 
  Gauge,
  TrafficCone,
  MapPin,
  Loader2,
  CheckCircle,
  Info
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { GpsState } from './useUserLocation';

interface ReportIncidentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gps: GpsState;
}

type IncidentType = 'police' | 'accident' | 'traffic' | 'roadwork' | 'hazard' | 'closure' | 'speed_cam' | 'red_light_cam' | 'other';

interface IncidentTypeOption {
  type: IncidentType;
  label: string;
  icon: React.ReactNode;
  expiresMinutes: number;
  color: string;
}

const INCIDENT_TYPES: IncidentTypeOption[] = [
  { type: 'police', label: 'Policja', icon: <ShieldAlert className="h-5 w-5" />, expiresMinutes: 60, color: 'bg-blue-500' },
  { type: 'accident', label: 'Wypadek', icon: <Car className="h-5 w-5" />, expiresMinutes: 120, color: 'bg-red-500' },
  { type: 'traffic', label: 'Korek', icon: <TrafficCone className="h-5 w-5" />, expiresMinutes: 60, color: 'bg-orange-500' },
  { type: 'roadwork', label: 'Roboty', icon: <Construction className="h-5 w-5" />, expiresMinutes: 360, color: 'bg-amber-500' },
  { type: 'hazard', label: 'Zagrożenie', icon: <AlertTriangle className="h-5 w-5" />, expiresMinutes: 90, color: 'bg-yellow-500' },
  { type: 'closure', label: 'Zamknięcie', icon: <XCircle className="h-5 w-5" />, expiresMinutes: 360, color: 'bg-gray-600' },
  { type: 'speed_cam', label: 'Fotoradar', icon: <Camera className="h-5 w-5" />, expiresMinutes: 1440, color: 'bg-violet-500' },
  { type: 'other', label: 'Inne', icon: <MapPin className="h-5 w-5" />, expiresMinutes: 60, color: 'bg-slate-500' },
];

const ReportIncidentModal = ({ open, onOpenChange, gps }: ReportIncidentModalProps) => {
  const [selectedType, setSelectedType] = useState<IncidentType | null>(null);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async () => {
    if (!selectedType || !gps.location) {
      toast.error('Wybierz typ zdarzenia i upewnij się, że GPS jest aktywny');
      return;
    }

    setIsSubmitting(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        toast.error('Musisz być zalogowany, aby zgłosić zdarzenie');
        setIsSubmitting(false);
        return;
      }

      const typeConfig = INCIDENT_TYPES.find(t => t.type === selectedType);
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + (typeConfig?.expiresMinutes || 60));

      const { error } = await supabase.from('map_reports').insert({
        user_id: user.id,
        type: selectedType,
        lat: gps.location.latitude,
        lng: gps.location.longitude,
        description: description.trim() || null,
        direction_deg: gps.location.heading ? Math.round(gps.location.heading) : null,
        expires_at: expiresAt.toISOString(),
        status: 'pending',
      });

      if (error) {
        console.error('[ReportIncidentModal] Insert error:', error);
        toast.error('Nie udało się zgłosić zdarzenia');
        setIsSubmitting(false);
        return;
      }

      setSuccess(true);
      toast.success('Zgłoszono zdarzenie! Dziękujemy 🎉');
      
      // Auto-close after success
      setTimeout(() => {
        onOpenChange(false);
        // Reset state
        setSelectedType(null);
        setDescription('');
        setSuccess(false);
      }, 1500);

    } catch (error) {
      console.error('[ReportIncidentModal] Error:', error);
      toast.error('Wystąpił błąd');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onOpenChange(false);
      setSelectedType(null);
      setDescription('');
      setSuccess(false);
    }
  };

  // Check GPS availability
  if (!gps.hasConsent || !gps.location) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Wymagany GPS
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Aby zgłosić zdarzenie, musisz włączyć lokalizację GPS. 
              Zgłoszenie zostanie dodane w Twojej bieżącej lokalizacji.
            </p>
            <Button onClick={handleClose} className="w-full">
              Rozumiem
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Success state
  if (success) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-sm">
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <div className="h-16 w-16 rounded-full bg-green-500/20 flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-lg font-semibold">Zgłoszono!</p>
            <p className="text-sm text-muted-foreground text-center">
              Twoje zgłoszenie zostało przyjęte i oczekuje na weryfikację.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Zgłoś zdarzenie
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Location info */}
          <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg border border-primary/20">
            <MapPin className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">
              {gps.location.latitude.toFixed(5)}, {gps.location.longitude.toFixed(5)}
            </span>
            <Badge variant="outline" className="ml-auto text-xs">
              ±{Math.round(gps.location.accuracy)}m
            </Badge>
          </div>

          {/* Type selection */}
          <div className="space-y-2">
            <Label>Typ zdarzenia</Label>
            <div className="grid grid-cols-4 gap-2">
              {INCIDENT_TYPES.map(({ type, label, icon, color }) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSelectedType(type)}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all ${
                    selectedType === type
                      ? 'border-primary bg-primary/10 shadow-sm'
                      : 'border-transparent bg-muted/50 hover:bg-muted'
                  }`}
                >
                  <div className={`h-10 w-10 rounded-full ${color} flex items-center justify-center text-white`}>
                    {icon}
                  </div>
                  <span className={`text-xs font-medium text-center ${selectedType === type ? 'text-primary' : ''}`}>
                    {label}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Opis (opcjonalnie)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Dodatkowe informacje..."
              rows={2}
              maxLength={200}
            />
            <p className="text-xs text-muted-foreground text-right">
              {description.length}/200
            </p>
          </div>

          {/* Info */}
          <div className="flex items-start gap-2 p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
            <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-blue-700">
              Zgłoszenie zostanie sprawdzone przez moderatorów. 
              Po zatwierdzeniu będzie widoczne dla wszystkich użytkowników.
            </p>
          </div>

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={!selectedType || isSubmitting}
            className="w-full h-12 text-base gap-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Wysyłanie...
              </>
            ) : (
              <>
                <AlertTriangle className="h-5 w-5" />
                Zgłoś zdarzenie
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ReportIncidentModal;

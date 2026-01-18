// GetRido Maps - Parking Purchase Sheet
import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { 
  ParkingCircle, 
  Car, 
  Clock, 
  CreditCard, 
  Check, 
  Plus, 
  Loader2,
  Timer
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { 
  ParkingZone, 
  ParkingSession,
  UserVehicle,
  getUserVehicles, 
  addUserVehicle, 
  purchaseParkingSession,
  formatTimeRemaining
} from './parkingService';
import { RIDO_THEME_COLORS } from './ridoMapTheme';

interface ParkingPurchaseSheetProps {
  open: boolean;
  onClose: () => void;
  zone: ParkingZone;
  onPurchaseComplete: (session: ParkingSession) => void;
}

const DURATION_PRESETS = [
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '1 godz', value: 60 },
  { label: '2 godz', value: 120 },
];

const ParkingPurchaseSheet = ({ open, onClose, zone, onPurchaseComplete }: ParkingPurchaseSheetProps) => {
  const [step, setStep] = useState<'vehicle' | 'duration' | 'confirm' | 'success'>('vehicle');
  const [vehicles, setVehicles] = useState<UserVehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<UserVehicle | null>(null);
  const [selectedDuration, setSelectedDuration] = useState<number>(30);
  const [customDuration, setCustomDuration] = useState('');
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [newPlate, setNewPlate] = useState('');
  const [newNickname, setNewNickname] = useState('');
  const [loading, setLoading] = useState(false);
  const [purchasedSession, setPurchasedSession] = useState<ParkingSession | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  // Get user ID
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id || null);
    });
  }, []);

  // Fetch user vehicles
  useEffect(() => {
    if (open && userId) {
      getUserVehicles(userId).then(v => {
        setVehicles(v);
        const defaultVehicle = v.find(veh => veh.is_default) || v[0];
        if (defaultVehicle) {
          setSelectedVehicle(defaultVehicle);
        }
      });
    }
  }, [open, userId]);

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep('vehicle');
      setShowAddVehicle(false);
      setNewPlate('');
      setNewNickname('');
      setCustomDuration('');
    }
  }, [open]);

  const calculatePrice = (): number => {
    const duration = customDuration ? parseInt(customDuration) : selectedDuration;
    const ratePerHour = zone.rules.ratePerHour || 5;
    return Math.round((duration / 60) * ratePerHour * 100) / 100;
  };

  const handleAddVehicle = async () => {
    if (!userId || !newPlate.trim()) return;
    setLoading(true);
    
    const vehicle = await addUserVehicle(userId, newPlate, newNickname || undefined);
    if (vehicle) {
      setVehicles(prev => [...prev, vehicle]);
      setSelectedVehicle(vehicle);
      setShowAddVehicle(false);
      setNewPlate('');
      setNewNickname('');
    }
    
    setLoading(false);
  };

  const handlePurchase = async () => {
    if (!userId || !selectedVehicle) return;
    setLoading(true);
    
    const duration = customDuration ? parseInt(customDuration) : selectedDuration;
    const session = await purchaseParkingSession(userId, zone.id, selectedVehicle.plate, duration);
    
    if (session) {
      setPurchasedSession(session);
      setStep('success');
      onPurchaseComplete(session);
    }
    
    setLoading(false);
  };

  const effectiveDuration = customDuration ? parseInt(customDuration) || 0 : selectedDuration;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="h-[80vh] rounded-t-2xl p-0">
        <SheetHeader className="p-4 pb-2 border-b">
          <SheetTitle className="flex items-center gap-2">
            <div 
              className="h-8 w-8 rounded-full flex items-center justify-center"
              style={{ background: RIDO_THEME_COLORS.goldAccent }}
            >
              <ParkingCircle className="h-5 w-5 text-white" />
            </div>
            <span>{zone.name}</span>
          </SheetTitle>
        </SheetHeader>
        
        <div className="p-4 overflow-y-auto" style={{ height: 'calc(80vh - 60px)' }}>
          {/* STEP 1: Vehicle Selection */}
          {step === 'vehicle' && (
            <div className="space-y-4">
              <Label className="text-sm font-semibold">Wybierz pojazd</Label>
              
              {vehicles.length > 0 ? (
                <div className="space-y-2">
                  {vehicles.map(v => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVehicle(v)}
                      className={`w-full p-4 rounded-xl border-2 flex items-center gap-3 transition-all ${
                        selectedVehicle?.id === v.id 
                          ? 'border-primary bg-primary/5' 
                          : 'border-muted hover:border-muted-foreground/30'
                      }`}
                    >
                      <Car className={`h-5 w-5 ${selectedVehicle?.id === v.id ? 'text-primary' : 'text-muted-foreground'}`} />
                      <div className="flex-1 text-left">
                        <p className="font-bold">{v.plate}</p>
                        {v.nickname && <p className="text-xs text-muted-foreground">{v.nickname}</p>}
                      </div>
                      {v.is_default && <Badge variant="secondary" className="text-xs">Domyślny</Badge>}
                      {selectedVehicle?.id === v.id && <Check className="h-5 w-5 text-primary" />}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nie masz jeszcze zapisanych pojazdów
                </p>
              )}
              
              {showAddVehicle ? (
                <div className="space-y-3 p-4 bg-muted/30 rounded-xl">
                  <Input
                    placeholder="Nr rejestracyjny (np. WA12345)"
                    value={newPlate}
                    onChange={(e) => setNewPlate(e.target.value.toUpperCase())}
                    className="uppercase"
                  />
                  <Input
                    placeholder="Nazwa (opcjonalnie, np. BMW)"
                    value={newNickname}
                    onChange={(e) => setNewNickname(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setShowAddVehicle(false)} className="flex-1">
                      Anuluj
                    </Button>
                    <Button onClick={handleAddVehicle} disabled={loading || !newPlate.trim()} className="flex-1">
                      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Dodaj'}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" className="w-full gap-2" onClick={() => setShowAddVehicle(true)}>
                  <Plus className="h-4 w-4" />
                  Dodaj nowy pojazd
                </Button>
              )}
              
              <Button 
                className="w-full h-12 font-semibold"
                disabled={!selectedVehicle}
                onClick={() => setStep('duration')}
              >
                Dalej
              </Button>
            </div>
          )}
          
          {/* STEP 2: Duration Selection */}
          {step === 'duration' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <Car className="h-5 w-5 text-primary" />
                <span className="font-bold">{selectedVehicle?.plate}</span>
                <Button variant="ghost" size="sm" onClick={() => setStep('vehicle')}>Zmień</Button>
              </div>
              
              <Label className="text-sm font-semibold">Wybierz czas parkowania</Label>
              
              <div className="grid grid-cols-2 gap-3">
                {DURATION_PRESETS.map(preset => (
                  <button
                    key={preset.value}
                    onClick={() => {
                      setSelectedDuration(preset.value);
                      setCustomDuration('');
                    }}
                    className={`p-4 rounded-xl border-2 flex flex-col items-center gap-1 transition-all ${
                      selectedDuration === preset.value && !customDuration
                        ? 'border-primary bg-primary/5'
                        : 'border-muted hover:border-muted-foreground/30'
                    }`}
                  >
                    <Clock className={`h-5 w-5 ${selectedDuration === preset.value && !customDuration ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span className="font-semibold">{preset.label}</span>
                  </button>
                ))}
              </div>
              
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Własny czas (minuty)</Label>
                <Input
                  type="number"
                  placeholder="np. 45"
                  value={customDuration}
                  onChange={(e) => setCustomDuration(e.target.value)}
                  min={zone.rules.minTime || 5}
                  max={zone.rules.maxTime || 480}
                />
              </div>
              
              {/* Price preview */}
              <div className="p-4 bg-gradient-to-br from-primary/5 to-primary/10 rounded-xl border border-primary/20">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-sm text-muted-foreground">Do zapłaty</p>
                    <p className="text-2xl font-bold">{calculatePrice().toFixed(2)} PLN</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">Czas</p>
                    <p className="font-semibold">{effectiveDuration} min</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Stawka: {zone.rules.ratePerHour || 5} PLN/h
                </p>
              </div>
              
              <Button 
                className="w-full h-12 font-semibold gap-2"
                style={{ 
                  background: `linear-gradient(135deg, ${RIDO_THEME_COLORS.goldAccent}, ${RIDO_THEME_COLORS.goldDark})`,
                  color: 'white'
                }}
                disabled={loading || effectiveDuration < 5}
                onClick={handlePurchase}
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <CreditCard className="h-5 w-5" />
                    Zapłać i aktywuj
                  </>
                )}
              </Button>
            </div>
          )}
          
          {/* STEP 3: Success */}
          {step === 'success' && purchasedSession && (
            <div className="text-center space-y-6 py-8">
              <div 
                className="mx-auto h-20 w-20 rounded-full flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${RIDO_THEME_COLORS.goldAccent}, ${RIDO_THEME_COLORS.goldDark})` }}
              >
                <Check className="h-10 w-10 text-white" />
              </div>
              
              <div>
                <h3 className="text-xl font-bold">Bilet aktywny!</h3>
                <p className="text-muted-foreground mt-1">Parking opłacony do:</p>
              </div>
              
              <div className="p-4 bg-muted/30 rounded-xl inline-block">
                <p className="text-3xl font-bold flex items-center gap-2">
                  <Timer className="h-6 w-6 text-primary" />
                  {formatTimeRemaining(purchasedSession.end_at)}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {new Date(purchasedSession.end_at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              
              <div className="flex items-center justify-center gap-2">
                <Car className="h-5 w-5 text-muted-foreground" />
                <span className="font-bold">{purchasedSession.vehicle_plate}</span>
              </div>
              
              <p className="text-xs text-muted-foreground">
                Kwota: {purchasedSession.amount.toFixed(2)} {purchasedSession.currency}
              </p>
              
              <Button className="w-full" onClick={onClose}>
                Zamknij
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ParkingPurchaseSheet;

// GetRido Maps - AI Assistant Sheet (Rido AI integration)
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { 
  Sparkles, 
  Mic, 
  MapPin, 
  AlertTriangle, 
  Fuel, 
  ParkingCircle,
  Navigation,
  Volume2,
  HelpCircle,
  Zap,
  Route,
  Coffee
} from 'lucide-react';

interface MapAISheetProps {
  open: boolean;
  onClose: () => void;
  onAction: (action: string) => void;
}

const MapAISheet = ({ open, onClose, onAction }: MapAISheetProps) => {
  const quickActions = [
    { id: 'parking', label: 'Znajdź parking', icon: <ParkingCircle className="h-4 w-4" /> },
    { id: 'fuel', label: 'Stacja paliw', icon: <Fuel className="h-4 w-4" /> },
    { id: 'avoid_traffic', label: 'Omijaj korki', icon: <Route className="h-4 w-4" /> },
    { id: 'report', label: 'Zgłoś zdarzenie', icon: <AlertTriangle className="h-4 w-4" /> },
  ];

  const featureCards = [
    { 
      id: 'help', 
      title: 'Co umiem?', 
      description: 'Dowiedz się więcej o funkcjach AI',
      icon: <HelpCircle className="h-6 w-6" />,
      color: 'bg-blue-500',
    },
    { 
      id: 'voice', 
      title: 'Prowadź głosem', 
      description: 'Steruj nawigacją głosowo',
      icon: <Mic className="h-6 w-6" />,
      color: 'bg-emerald-500',
    },
    { 
      id: 'location', 
      title: 'Gdzie jestem?', 
      description: 'Szczegóły bieżącej lokalizacji',
      icon: <MapPin className="h-6 w-6" />,
      color: 'bg-amber-500',
    },
    { 
      id: 'optimize', 
      title: 'Optymalizuj', 
      description: 'Znajdź lepszą trasę',
      icon: <Zap className="h-6 w-6" />,
      color: 'bg-violet-500',
    },
    { 
      id: 'break', 
      title: 'Przerwa', 
      description: 'Znajdź miejsce na odpoczynek',
      icon: <Coffee className="h-6 w-6" />,
      color: 'bg-orange-500',
    },
    { 
      id: 'read_signs', 
      title: 'Odczytaj znaki', 
      description: 'AI rozpozna znaki drogowe',
      icon: <Navigation className="h-6 w-6" />,
      color: 'bg-rose-500',
    },
  ];

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent 
        side="bottom" 
        className="h-[70vh] rounded-t-3xl p-0 overflow-hidden"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
      >
        {/* Handle */}
        <div className="flex items-center justify-center py-3 border-b bg-background">
          <div className="w-10 h-1 bg-muted-foreground/30 rounded-full" />
        </div>

        {/* Header with mascot */}
        <div className="p-4 flex items-center gap-4">
          <div className="relative">
            <img 
              src="/lovable-uploads/253e522c-702e-4ce9-9429-10ddbde63878.png"
              alt="Rido AI"
              className="h-16 w-16 drop-shadow-lg animate-bounce-gentle"
            />
            <div className="absolute -top-1 -right-1 h-6 w-6 bg-primary rounded-full flex items-center justify-center shadow-lg">
              <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
          </div>
          <div>
            <h2 className="text-xl font-bold">W czym mogę pomóc?</h2>
            <p className="text-sm text-muted-foreground">Rido AI jest do Twoich usług</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="px-4 pb-4">
          <div className="flex flex-wrap gap-2">
            {quickActions.map((action) => (
              <button
                key={action.id}
                onClick={() => onAction(action.id)}
                className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-muted hover:bg-muted/80 active:scale-95 transition-all"
              >
                <span className="text-primary">{action.icon}</span>
                <span className="text-sm font-medium">{action.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Feature Cards Grid */}
        <div className="px-4 pb-4 overflow-y-auto" style={{ maxHeight: 'calc(70vh - 200px)' }}>
          <div className="grid grid-cols-2 gap-3">
            {featureCards.map((card) => (
              <button
                key={card.id}
                onClick={() => onAction(card.id)}
                className="p-4 rounded-2xl bg-muted/50 hover:bg-muted active:scale-95 transition-all text-left"
              >
                <div className={`h-12 w-12 rounded-xl ${card.color} text-white flex items-center justify-center mb-3 shadow-lg`}>
                  {card.icon}
                </div>
                <h3 className="font-semibold text-sm">{card.title}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{card.description}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Voice input button */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}>
          <button
            onClick={() => onAction('voice_input')}
            className="h-16 w-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-transform"
          >
            <Mic className="h-7 w-7" />
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MapAISheet;

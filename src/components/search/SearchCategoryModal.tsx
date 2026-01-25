import { useState, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { 
  Car, 
  Home as HomeIcon, 
  Wrench, 
  Search, 
  Mic, 
  MicOff, 
  Sparkles,
  Calculator,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';

interface SearchCategoryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SEARCH_CATEGORIES = [
  {
    id: 'vehicles',
    label: 'Motoryzacja',
    description: 'Samochody, motocykle, dostawcze',
    icon: Car,
    color: 'bg-blue-100 text-blue-600',
    path: '/gielda'
  },
  {
    id: 'real-estate',
    label: 'Nieruchomości',
    description: 'Mieszkania, domy, działki',
    icon: HomeIcon,
    color: 'bg-emerald-100 text-emerald-600',
    path: '/nieruchomosci'
  },
  {
    id: 'services',
    label: 'Usługi',
    description: 'Fachowcy, warsztaty, serwisy',
    icon: Wrench,
    color: 'bg-orange-100 text-orange-600',
    path: '/uslugi'
  },
  {
    id: 'accounting',
    label: 'Księgowość',
    description: 'Faktury, dokumenty, rozliczenia',
    icon: Calculator,
    color: 'bg-purple-100 text-purple-600',
    path: '/klient?tab=ksiegowosc'
  }
];

export function SearchCategoryModal({ open, onOpenChange }: SearchCategoryModalProps) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const handleCategoryClick = (path: string) => {
    onOpenChange(false);
    if (searchQuery.trim()) {
      navigate(`${path}?q=${encodeURIComponent(searchQuery)}`);
    } else {
      navigate(path);
    }
  };

  const handleAISearch = async () => {
    if (!searchQuery.trim()) {
      toast.error('Wpisz czego szukasz');
      return;
    }

    setIsSearching(true);
    
    // For now, try to determine category from query and navigate
    const query = searchQuery.toLowerCase();
    let targetPath = '/gielda'; // Default to vehicles

    if (query.includes('mieszkan') || query.includes('dom') || query.includes('działk') || query.includes('nieruchom')) {
      targetPath = '/nieruchomosci';
    } else if (query.includes('usług') || query.includes('serwis') || query.includes('warsztat') || query.includes('napr')) {
      targetPath = '/uslugi';
    } else if (query.includes('faktur') || query.includes('księg') || query.includes('rozlicz')) {
      targetPath = '/klient?tab=ksiegowosc';
    }

    setIsSearching(false);
    onOpenChange(false);
    navigate(`${targetPath}?q=${encodeURIComponent(searchQuery)}`);
  };

  const startVoiceRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        
        // For now, show a message that voice is being processed
        toast.info('Przetwarzanie głosu...');
        
        // In a full implementation, this would send to a speech-to-text API
        // For demo purposes, we'll just show a placeholder
        setSearchQuery('Przykładowe wyszukiwanie głosowe...');
        setIsRecording(false);
      };

      mediaRecorder.start();
      setIsRecording(true);
      toast.info('Mów teraz... Naciśnij ponownie aby zakończyć.');
    } catch (error) {
      console.error('Error accessing microphone:', error);
      toast.error('Nie można uzyskać dostępu do mikrofonu');
      setIsRecording(false);
    }
  }, []);

  const stopVoiceRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
    }
  }, [isRecording]);

  const handleVoiceClick = () => {
    if (isRecording) {
      stopVoiceRecording();
    } else {
      startVoiceRecording();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Search className="h-5 w-5 text-primary" />
            Czego szukasz?
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* AI Search Input */}
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Napisz czego szukasz lub powiedz..."
                  className="pl-10 pr-12 h-12"
                  onKeyDown={(e) => e.key === 'Enter' && handleAISearch()}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className={`absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10 ${isRecording ? 'text-destructive animate-pulse' : 'text-muted-foreground'}`}
                  onClick={handleVoiceClick}
                >
                  {isRecording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </Button>
              </div>
              <Button 
                onClick={handleAISearch} 
                disabled={isSearching || !searchQuery.trim()}
                className="h-12 px-6"
              >
                {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground text-center">
              Wpisz lub powiedz czego szukasz - AI pomoże Ci znaleźć
            </p>
          </div>

          {/* Category Grid */}
          <div className="grid grid-cols-2 gap-3">
            {SEARCH_CATEGORIES.map((category) => {
              const IconComponent = category.icon;
              return (
                <Card 
                  key={category.id}
                  className="cursor-pointer hover:shadow-md hover:border-primary/50 transition-all"
                  onClick={() => handleCategoryClick(category.path)}
                >
                  <CardContent className="p-4">
                    <div className={`w-12 h-12 rounded-lg ${category.color} flex items-center justify-center mb-3`}>
                      <IconComponent className="h-6 w-6" />
                    </div>
                    <h4 className="font-semibold text-sm">{category.label}</h4>
                    <p className="text-xs text-muted-foreground">{category.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Car, 
  Building2, 
  User, 
  Sparkles, 
  Search,
  ArrowRight,
  MessageCircle,
  Building
} from "lucide-react";
import { cn } from "@/lib/utils";
import Footer from "@/components/Footer";

// Import tile images
import tileCars from "@/assets/tile-cars.jpg";
import tileFleet from "@/assets/tile-fleet.jpg";
import tileDriver from "@/assets/tile-driver.jpg";
import tileRealEstate from "@/assets/tile-realestate.jpg";

interface MarketplaceTile {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  image: string | null;
  link: string | null;
  available: boolean;
}

const marketplaceTiles: MarketplaceTile[] = [
  {
    id: 'vehicles',
    title: 'Giełda Aut',
    description: 'Wynajem, zakup, leasing aut do rideshare',
    icon: Car,
    image: tileCars,
    link: '/gielda',
    available: true
  },
  {
    id: 'realestate',
    title: 'Nieruchomości',
    description: 'Mieszkania, domy, działki, lokale',
    icon: Building,
    image: tileRealEstate,
    link: '/nieruchomosci',
    available: true
  },
  {
    id: 'fleet',
    title: 'Zarządzanie Flotą',
    description: 'Panel dla właścicieli flot',
    icon: Building2,
    image: tileFleet,
    link: '/fleet',
    available: true
  },
  {
    id: 'driver',
    title: 'Portal Kierowcy',
    description: 'Rozliczenia i dokumenty',
    icon: User,
    image: tileDriver,
    link: '/driver',
    available: true
  },
  {
    id: 'services',
    title: 'Usługi',
    description: 'Fotograf, mechanik, ubezpieczenia...',
    icon: Sparkles,
    image: null,
    link: null,
    available: false
  }
];

function MarketplaceTileCard({ tile, onClick }: { tile: MarketplaceTile; onClick: () => void }) {
  const Icon = tile.icon;
  
  return (
    <Card 
      className={cn(
        "group relative overflow-hidden cursor-pointer transition-all duration-300",
        "hover:shadow-xl hover:scale-[1.03] hover:-translate-y-1",
        "border-0 shadow-md",
        !tile.available && "opacity-60 cursor-not-allowed hover:scale-100 hover:translate-y-0"
      )}
      onClick={() => tile.available && onClick()}
    >
      {/* Background image or gradient */}
      {tile.image ? (
        <div 
          className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
          style={{ backgroundImage: `url(${tile.image})` }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20" />
        </div>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-primary/10 to-muted" />
      )}
      
      {/* Content */}
      <CardContent className="relative z-10 p-3 md:p-4 h-28 md:h-36 flex flex-col justify-end">
        <div className={cn(
          "mb-1 md:mb-2 p-1.5 md:p-2 rounded-lg w-fit transition-all duration-300",
          tile.image ? "bg-white/20 backdrop-blur-sm" : "bg-primary/10"
        )}>
          <Icon className={cn(
            "h-4 w-4 md:h-5 md:w-5",
            tile.image ? "text-white" : "text-primary"
          )} />
        </div>
        <h3 className={cn(
          "font-bold text-sm md:text-base leading-tight",
          tile.image ? "text-white" : "text-foreground"
        )}>
          {tile.title}
        </h3>
        <p className={cn(
          "text-[10px] md:text-xs mt-0.5 line-clamp-2",
          tile.image ? "text-white/80" : "text-muted-foreground"
        )}>
          {tile.description}
        </p>
        
        {!tile.available && (
          <Badge 
            variant="secondary" 
            className="absolute top-2 right-2 text-[10px] px-1.5 py-0.5 bg-white/90"
          >
            Wkrótce
          </Badge>
        )}
        
        {tile.available && (
          <div className={cn(
            "absolute top-2 right-2 p-1.5 rounded-full transition-all duration-300",
            "opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0",
            tile.image ? "bg-white/20 backdrop-blur-sm" : "bg-primary/10"
          )}>
            <ArrowRight className={cn(
              "h-3 w-3",
              tile.image ? "text-white" : "text-primary"
            )} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function EasyHub() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    checkUser();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });
    
    return () => subscription.unsubscribe();
  }, []);

  // Keywords indicating real estate search
  const REAL_ESTATE_KEYWORDS = [
    'mieszkanie', 'mieszkania', 'dom', 'domy', 'kawalerka', 'kawalerki',
    'działka', 'dzialka', 'działki', 'dzialki', 'lokal', 'lokale',
    'pokój', 'pokoj', 'pokoje', 'biuro', 'biura', 'magazyn', 'magazyny',
    'piętro', 'pietro', 'piętrze', 'pietrze', 'metraż', 'metraz', 'metrów', 'metrow', 'm2', 'm²',
    'wynajem mieszkania', 'sprzedaż mieszkania', 'nieruchomość', 'nieruchomosc',
    'apartament', 'apartamenty', 'penthouse', 'loft', 'studio',
    'balkon', 'ogród', 'ogrod', 'taras', 'winda', 'garaż', 'garaz', 'parking'
  ];

  // Keywords indicating vehicle search
  const VEHICLE_KEYWORDS = [
    'auto', 'auta', 'samochód', 'samochod', 'samochody', 'pojazd', 'pojazdy',
    'hybryda', 'hybrydy', 'elektryczny', 'elektryczne', 'lpg', 'diesel', 'benzyna',
    'toyota', 'honda', 'bmw', 'audi', 'mercedes', 'volkswagen', 'skoda', 'ford',
    'taxi', 'uber', 'bolt', 'freenow', 'rideshare',
    'wynajem auta', 'wynajem samochodu', 'leasing', 'flota', 'kierowca'
  ];

  const detectSearchType = (query: string): 'real_estate' | 'vehicle' | 'unknown' => {
    const queryLower = query.toLowerCase();
    
    const hasRealEstateKeyword = REAL_ESTATE_KEYWORDS.some(kw => queryLower.includes(kw));
    const hasVehicleKeyword = VEHICLE_KEYWORDS.some(kw => queryLower.includes(kw));
    
    if (hasRealEstateKeyword && !hasVehicleKeyword) return 'real_estate';
    if (hasVehicleKeyword && !hasRealEstateKeyword) return 'vehicle';
    if (hasRealEstateKeyword && hasVehicleKeyword) {
      // If both, prioritize based on which has more matches
      const realEstateMatches = REAL_ESTATE_KEYWORDS.filter(kw => queryLower.includes(kw)).length;
      const vehicleMatches = VEHICLE_KEYWORDS.filter(kw => queryLower.includes(kw)).length;
      return realEstateMatches >= vehicleMatches ? 'real_estate' : 'vehicle';
    }
    return 'unknown';
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    
    const searchType = detectSearchType(searchQuery);
    
    setTimeout(() => {
      setIsSearching(false);
      if (searchType === 'real_estate') {
        navigate(`/nieruchomosci?query=${encodeURIComponent(searchQuery)}`);
      } else {
        navigate(`/gielda?search=${encodeURIComponent(searchQuery)}`);
      }
    }, 300);
  };

  const handleTileClick = (tile: MarketplaceTile) => {
    if (tile.link) {
      navigate(tile.link);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img 
              src="/lovable-uploads/253e522c-702e-4ce9-9429-10ddbde63878.png" 
              alt="RIDO" 
              className="h-8 w-8"
            />
            <span className="font-bold text-lg md:text-xl bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              GetRido Easy
            </span>
          </div>
          <div className="flex gap-2">
            {user ? (
              <Button 
                onClick={() => navigate('/driver')}
                className="rounded-full"
              >
                Mój panel
              </Button>
            ) : (
              <>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => navigate('/auth')}
                  className="hidden sm:inline-flex"
                >
                  Zaloguj
                </Button>
                <Button 
                  size="sm"
                  onClick={() => navigate('/gielda/rejestracja')}
                  className="rounded-full"
                >
                  Zarejestruj
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 pt-8 pb-4 md:pt-12 md:pb-6 text-center">
        <h1 className="text-2xl sm:text-3xl md:text-5xl font-bold mb-2 md:mb-3">
          GetRido <span className="text-primary">Easy</span>
        </h1>
        <p className="text-sm md:text-lg text-muted-foreground max-w-xl mx-auto">
          Wszystko, czego potrzebujesz – łatwo i w jednym miejscu.
        </p>
      </section>

      {/* AI Search Bar */}
      <section className="container mx-auto px-4 py-4 md:py-6">
        <div className="max-w-2xl mx-auto">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="AI, które znajdzie to za Ciebie…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="pl-12 pr-24 h-12 md:h-14 text-base md:text-lg rounded-full border-2 border-primary/20 focus:border-primary shadow-lg"
            />
            <Button
              onClick={handleSearch}
              disabled={isSearching || !searchQuery.trim()}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full h-8 md:h-10 px-4 md:px-6"
            >
              {isSearching ? "..." : "Szukaj"}
            </Button>
          </div>
          <p className="text-center text-xs text-muted-foreground mt-2">
            Powered by <span className="text-primary font-medium">Rido AI</span>
          </p>
        </div>
      </section>

      {/* Marketplace Tiles */}
      <section className="container mx-auto px-4 py-6 md:py-8">
        <div className="grid grid-cols-3 md:grid-cols-4 gap-3 md:gap-4 lg:gap-6 max-w-4xl mx-auto">
          {marketplaceTiles.map((tile) => (
            <MarketplaceTileCard 
              key={tile.id} 
              tile={tile} 
              onClick={() => handleTileClick(tile)} 
            />
          ))}
        </div>
      </section>

      {/* Mascot Section */}
      <section className="container mx-auto px-4 py-8 md:py-12">
        <div className="flex flex-col md:flex-row items-center justify-center gap-4 max-w-3xl mx-auto">
          <div className="relative bg-gradient-to-br from-primary/5 to-primary/10 rounded-2xl p-5 md:p-6 border border-primary/10 shadow-lg flex-1">
            <MessageCircle className="absolute -top-2 -left-2 h-6 w-6 text-primary" />
            <p className="text-sm md:text-base leading-relaxed">
              <span className="font-bold text-primary">Cześć!</span> Jestem{" "}
              <strong>Rido AI</strong>.<br /><br />
              GetRido to inteligentny portal ogłoszeń, ofert i usług.<br /><br />
              Pomagam znaleźć, porównać i wybrać to, czego potrzebujesz.
            </p>
          </div>
          <div className="shrink-0">
            <img 
              src="/lovable-uploads/getrido-mascot-email.png" 
              alt="Rido AI"
              className="h-24 w-24 md:h-32 md:w-32 drop-shadow-lg animate-bounce-slow"
            />
          </div>
        </div>
      </section>

      {/* Tagline */}
      <section className="container mx-auto px-4 py-6 md:py-8 text-center">
        <p className="text-muted-foreground text-sm md:text-base">
          Tworzymy jedno miejsce, które upraszcza życie.
        </p>
      </section>

      <Footer />

      {/* Custom animation */}
      <style>{`
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        .animate-bounce-slow {
          animation: bounce-slow 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

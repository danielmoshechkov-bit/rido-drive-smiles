import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  Car, 
  Building2, 
  User, 
  Sparkles, 
  Search,
  ArrowRight,
  MessageCircle,
  Building,
  Map,
  ArrowLeft,
  Wrench,
  Shield,
  Palette,
  Paintbrush,
  HardHat,
  Receipt,
  ShoppingCart,
  Calculator,
  Droplets,
  Layers,
  Home,
  Wallet,
  Settings
} from "lucide-react";
import { cn } from "@/lib/utils";
import Footer from "@/components/Footer";
import { useModuleVisibility } from "@/hooks/useModuleVisibility";
import { MyGetRidoButton } from "@/components/MyGetRidoButton";
import { AddListingModal } from "@/components/AddListingModal";
import { UniversalHomeButton } from "@/components/UniversalHomeButton";
import { FeaturedListings } from "@/components/FeaturedListings";
import { SearchCategoryModal } from "@/components/SearchCategoryModal";
import { AccountingCategoryModal } from "@/components/AccountingCategoryModal";
import { LoginModal } from "@/components/LoginModal";

// Import tile images
import tileCars from "@/assets/tile-cars.jpg";
import tileFleet from "@/assets/tile-fleet.jpg";
import tileDriver from "@/assets/tile-driver.jpg";
import tileRealEstate from "@/assets/tile-realestate.jpg";
import tileMaps from "@/assets/tile-maps.jpg";
import tileServices from "@/assets/tile-services-new.jpg";
import tileInvoicing from "@/assets/tile-invoicing.jpg";
// New unique images for subcategories
import tileWorkshop from "@/assets/tile-workshop.jpg";
import tileDetailing from "@/assets/tile-detailing.jpg";
import tilePPF from "@/assets/tile-ppf.jpg";
import tileInteriorDesign from "@/assets/tile-interior-design.jpg";
import tileRenovation from "@/assets/tile-renovation.jpg";
import tileConstruction from "@/assets/tile-construction.jpg";
import tileClientPortal from "@/assets/tile-client-portal.jpg";

interface MarketplaceTile {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  image: string | null;
  link: string | null;
  available: boolean;
}

type CategoryView = 'main' | 'motoryzacja' | 'nieruchomosci';

// Main category tiles (no Portal Kierowcy - moved to Motoryzacja)
const mainTiles: MarketplaceTile[] = [
  {
    id: 'motoryzacja',
    title: 'Motoryzacja',
    description: 'Pojazdy, floty i usługi auto',
    icon: Car,
    image: tileCars,
    link: null, // Opens sub-menu
    available: true
  },
  {
    id: 'nieruchomosci',
    title: 'Nieruchomości',
    description: 'Mieszkania, domy i usługi budowlane',
    icon: Building,
    image: tileRealEstate,
    link: null, // Opens sub-menu
    available: true
  },
  {
    id: 'services',
    title: 'Usługi',
    description: 'Wszystkie kategorie usług',
    icon: Sparkles,
    image: tileServices,
    link: '/uslugi',
    available: true
  },
  {
    id: 'ksiegowosc',
    title: 'Księgowość',
    description: 'Darmowy program do faktur online',
    icon: Receipt,
    image: tileInvoicing,
    link: '/faktury',
    available: true
  }
];

// Motoryzacja sub-tiles - unique images and icons (includes Portal Kierowcy)
// Order: Ogłoszenia, Warsztaty, Detailing+PPF, Portal Flotowy, Portal Kierowcy
const motoryzacjaSubTiles: MarketplaceTile[] = [
  {
    id: 'portal-ogloszen-auto',
    title: 'Portal Ogłoszeń',
    description: 'Kupuj, sprzedawaj, wymieniaj',
    icon: ShoppingCart,
    image: tileCars,
    link: '/gielda',
    available: true
  },
  {
    id: 'warsztat',
    title: 'Warsztaty',
    description: 'Naprawy i serwis samochodowy',
    icon: Wrench,
    image: tileWorkshop,
    link: '/uslugi?kategoria=warsztat',
    available: true
  },
  {
    id: 'detailing-ppf',
    title: 'Detailing i Folia PPF',
    description: 'Pielęgnacja, ceramika i folie ochronne',
    icon: Droplets,
    image: tileDetailing,
    link: '/uslugi?kategoria=detailing',
    available: true
  },
  {
    id: 'portal-flotowy',
    title: 'Portal zarządzania Flotą',
    description: 'Zarządzaj flotą i kierowcami',
    icon: Calculator,
    image: tileFleet,
    link: '/fleet',
    available: true
  },
  {
    id: 'portal-kierowcy',
    title: 'Portal Kierowcy',
    description: 'Rozliczenia i dokumenty',
    icon: User,
    image: tileDriver,
    link: '/driver',
    available: true
  }
];

// Nieruchomości sub-tiles - unique images and icons
const nieruchomosciSubTiles: MarketplaceTile[] = [
  {
    id: 'portal-ogloszen-nieruchomosci',
    title: 'Portal Ogłoszeń',
    description: 'Mieszkania, domy, działki',
    icon: Home,
    image: tileRealEstate,
    link: '/nieruchomosci',
    available: true
  },
  {
    id: 'projektanci',
    title: 'Projektanci wnętrz',
    description: 'Projekty i wizualizacje',
    icon: Palette,
    image: tileInteriorDesign,
    link: '/uslugi?kategoria=projektanci',
    available: true
  },
  {
    id: 'remonty',
    title: 'Remonty i wykończenia',
    description: 'Kompleksowe wykończenia',
    icon: Paintbrush,
    image: tileRenovation,
    link: '/uslugi?kategoria=remonty',
    available: true
  },
  {
    id: 'budowlanka',
    title: 'Budowlanka',
    description: 'Prace budowlane i konstrukcyjne',
    icon: HardHat,
    image: tileConstruction,
    link: '/uslugi?kategoria=budowlanka',
    available: true
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
      
      {/* Content - no icons, only text */}
      <CardContent className="relative z-10 p-4 md:p-5 h-36 md:h-44 flex flex-col justify-end">
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
  const [searchParams] = useSearchParams();
  const [user, setUser] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [isMainAdmin, setIsMainAdmin] = useState(false);
  const [activeCategory, setActiveCategory] = useState<CategoryView>('main');
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showAccountingModal, setShowAccountingModal] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const { isVisible: mapsVisible } = useModuleVisibility('maps');

  // Handle URL parameter for category
  useEffect(() => {
    const kategoria = searchParams.get('kategoria');
    if (kategoria === 'motoryzacja') {
      setActiveCategory('motoryzacja');
    } else if (kategoria === 'nieruchomosci') {
      setActiveCategory('nieruchomosci');
    } else {
      // Reset to main view when no category parameter
      setActiveCategory('main');
    }
  }, [searchParams]);

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      
      // Check if user is the main admin
      if (user?.email === 'daniel.moshechkov@gmail.com') {
        setIsMainAdmin(true);
      }
    };
    checkUser();
    
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
      if (session?.user?.email === 'daniel.moshechkov@gmail.com') {
        setIsMainAdmin(true);
      } else {
        setIsMainAdmin(false);
      }
    });
    
    return () => subscription.unsubscribe();
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    
    // Always go to universal search page for multi-category AI search
    setTimeout(() => {
      setIsSearching(false);
      navigate(`/wyniki?query=${encodeURIComponent(searchQuery)}`);
    }, 300);
  };

  const handleTileClick = (tile: MarketplaceTile) => {
    // Handle category navigation
    if (tile.id === 'motoryzacja') {
      setActiveCategory('motoryzacja');
      return;
    }
    if (tile.id === 'nieruchomosci') {
      setActiveCategory('nieruchomosci');
      return;
    }
    
    // Księgowość - route based on auth status
    if (tile.id === 'ksiegowosc') {
      if (user) {
        navigate('/klient?tab=ksiegowosc');
      } else {
        // For non-logged users, go to info landing page
        navigate('/ksiegowosc-info');
      }
      return;
    }
    
    // Portal kierowcy - route based on auth status
    if (tile.id === 'portal-kierowcy') {
      if (user) {
        navigate('/driver');
      } else {
        // For non-logged users, go to driver info landing page
        navigate('/kierowca-info');
      }
      return;
    }
    
    // Direct link
    if (tile.link) {
      navigate(tile.link);
    }
  };

  // Build dynamic tiles list with conditional visibility
  const dynamicTiles = useMemo(() => {
    let tiles = [...mainTiles];
    
    // Insert Maps at position 2 for logged-in users
    if (mapsVisible && user) {
      tiles.splice(2, 0, {
        id: 'maps',
        title: 'Mapy',
        description: 'Nawigacja GetRido Maps',
        icon: Map,
        image: tileMaps,
        link: '/mapy',
        available: true
      });
    }
    
    // Add "Moje konto" (Client Portal) for logged-in users as their personal dashboard
    if (user) {
      tiles.push({
        id: 'moje-konto',
        title: 'Moje konto',
        description: 'Ogłoszenia, zakupy, ustawienia',
        icon: User,
        image: tileClientPortal,
        link: '/klient',
        available: true
      });
    }
    
    return tiles;
  }, [mapsVisible, user]);

  // Get category title
  const getCategoryTitle = () => {
    switch (activeCategory) {
      case 'motoryzacja': return 'Motoryzacja';
      case 'nieruchomosci': return 'Nieruchomości';
      default: return null;
    }
  };

  // Get current tiles based on active category
  const currentTiles = useMemo(() => {
    switch (activeCategory) {
      case 'motoryzacja': return motoryzacjaSubTiles;
      case 'nieruchomosci': return nieruchomosciSubTiles;
      default: return dynamicTiles;
    }
  }, [activeCategory, dynamicTiles]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30 overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b">
        <div className="container mx-auto px-2 sm:px-4 py-2 sm:py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            {activeCategory !== 'main' ? (
              <>
                <UniversalHomeButton />
                <span className="text-muted-foreground">/</span>
                <span className="font-semibold text-foreground text-sm sm:text-base">
                  {getCategoryTitle()}
                </span>
              </>
            ) : (
              <img 
                src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" 
                alt="RIDO" 
                className="h-8 w-8 sm:h-10 sm:w-10 cursor-pointer"
                onClick={() => setActiveCategory('main')}
              />
            )}
          </div>
          <div className="flex gap-2 items-center">
            {!user ? (
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-4 text-sm font-medium"
                onClick={() => setShowLoginModal(true)}
              >
                Zaloguj
              </Button>
            ) : (
              <MyGetRidoButton user={user} size="sm" className="text-xs sm:text-sm px-2 sm:px-3" />
            )}
            <Button
              size="sm"
              className="h-9 px-4 text-sm font-medium"
              onClick={() => navigate('/dodaj')}
            >
              Dodaj ogłoszenie
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 pt-6 pb-3 md:pt-12 md:pb-6 text-center">
        <h1 className="text-xl sm:text-2xl md:text-5xl font-bold mb-1 md:mb-3 text-primary">
          GetRido
        </h1>
        <p className="text-xs sm:text-sm md:text-lg text-muted-foreground max-w-xl mx-auto">
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
            {searchQuery.trim() ? (
              <Button
                onClick={handleSearch}
                disabled={isSearching}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full h-8 md:h-10 px-4 md:px-6"
              >
                {isSearching ? "..." : "Szukaj"}
              </Button>
            ) : (
              <SearchCategoryModal
                trigger={
                  <Button
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full h-8 md:h-10 px-4 md:px-6"
                  >
                    Szukaj
                  </Button>
                }
              />
            )}
          </div>
          <p className="text-center text-xs text-muted-foreground mt-2">
            Powered by <span className="text-primary font-medium">Rido AI</span>
          </p>
        </div>
      </section>

      {/* Category Navigation / Back Button */}
      {activeCategory !== 'main' && (
        <section className="container mx-auto px-4 py-2">
          <div className="max-w-4xl mx-auto">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setActiveCategory('main')}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Wróć do głównej
            </Button>
          </div>
        </section>
      )}

      {/* Marketplace Tiles */}
      <section className="container mx-auto px-4 py-6 md:py-8">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 lg:gap-6 max-w-4xl mx-auto">
          {currentTiles.map((tile) => (
            <MarketplaceTileCard 
              key={tile.id} 
              tile={tile} 
              onClick={() => handleTileClick(tile)} 
            />
          ))}
        </div>
      </section>

      {/* Featured Listings Section - on main view (all categories) */}
      {activeCategory === 'main' && (
        <FeaturedListings className="py-8 md:py-12 bg-muted/30" />
      )}

      {/* Featured Listings Section - on Motoryzacja (vehicles + services tabs) */}
      {activeCategory === 'motoryzacja' && (
        <FeaturedListings 
          className="py-8 md:py-12 bg-muted/30" 
          categoryContext="motoryzacja"
        />
      )}

      {/* Featured Listings Section - on Nieruchomości (properties + services tabs) */}
      {activeCategory === 'nieruchomosci' && (
        <FeaturedListings 
          className="py-8 md:py-12 bg-muted/30" 
          categoryContext="nieruchomosci"
        />
      )}

      {/* Mascot Section - only on main view */}
      {activeCategory === 'main' && (
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
                src="/lovable-uploads/rido-mascot-transparent.png" 
                alt="Rido AI"
                className="h-24 w-24 md:h-32 md:w-32 drop-shadow-lg animate-bounce-slow"
              />
            </div>
          </div>
        </section>
      )}

      {/* Tagline - only on main view */}
      {activeCategory === 'main' && (
        <section className="container mx-auto px-4 py-6 md:py-8 text-center">
          <p className="text-muted-foreground text-sm md:text-base">
            Tworzymy jedno miejsce, które upraszcza życie.
          </p>
        </section>
      )}

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

      {/* Accounting Modal for non-logged users */}
      {!user && (
        <AccountingCategoryModal
          trigger={<span style={{ display: 'none' }} />}
          user={user}
        />
      )}
      
      {/* Hidden trigger for accounting modal - controlled by state */}
      <Dialog open={showAccountingModal} onOpenChange={setShowAccountingModal}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Receipt className="h-6 w-6 text-primary" />
              Księgowość Online
            </DialogTitle>
          </DialogHeader>

          {/* Hero section */}
          <div className="relative h-32 rounded-lg overflow-hidden mb-4">
            <img 
              src={tileInvoicing} 
              alt="Księgowość" 
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-primary/80 to-primary/40 flex items-center px-6">
              <div className="text-white">
                <h3 className="text-lg font-bold">Darmowy Program do Faktur</h3>
                <p className="text-sm opacity-90">Profesjonalne faktury dla Twojej firmy</p>
              </div>
            </div>
          </div>

          {/* Services grid */}
          <div className="grid grid-cols-1 gap-3">
            {[
              { id: 'faktury', title: 'Program do Faktur', description: 'Wystawiaj faktury VAT, proformy i korekty online', icon: Receipt },
              { id: 'koszty', title: 'Ewidencja Kosztów', description: 'Zarządzaj wydatkami i dokumentami kosztowymi', icon: Wallet },
              { id: 'kontrahenci', title: 'Baza Kontrahentów', description: 'Weryfikacja VAT, historia transakcji', icon: User },
              { id: 'raporty', title: 'Raporty i Analizy', description: 'Podsumowania miesięczne, statystyki', icon: Calculator }
            ].map((service) => {
              const Icon = service.icon;
              return (
                <Card 
                  key={service.id}
                  className="cursor-pointer transition-all duration-200 hover:shadow-lg hover:bg-primary/5 hover:border-primary group"
                  onClick={() => {
                    setShowAccountingModal(false);
                    navigate('/faktury');
                  }}
                >
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary transition-all duration-200">
                      <Icon className="h-5 w-5 text-primary group-hover:text-primary-foreground transition-colors" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-sm flex items-center gap-1 group-hover:text-primary transition-colors">
                        {service.title}
                        <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {service.description}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* CTA for non-logged users */}
          <div className="mt-4 p-4 bg-muted/50 rounded-lg text-center">
            <p className="text-sm text-muted-foreground mb-2">
              Zaloguj się, aby korzystać z pełnych funkcji księgowości
            </p>
            <Button
              variant="link"
              onClick={() => {
                setShowAccountingModal(false);
                navigate('/faktury');
              }}
              className="text-primary font-medium text-sm"
            >
              Zaloguj się lub zarejestruj →
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Login Modal */}
      <LoginModal
        open={showLoginModal}
        onOpenChange={setShowLoginModal}
        redirectTo="/klient"
      />
    </div>
  );
}

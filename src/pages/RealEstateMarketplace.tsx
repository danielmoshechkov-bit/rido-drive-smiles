import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Building, Search, Plus, Sparkles, ArrowRight
} from "lucide-react";
import { cn } from "@/lib/utils";
import Footer from "@/components/Footer";
import { PropertyListingCard } from "@/components/realestate/PropertyListingCard";
import { RealEstateSearch, RealEstateFilters } from "@/components/realestate/RealEstateSearch";
import { PropertyTypeSelector } from "@/components/realestate/PropertyTypeSelector";
import { TransactionTypeChips } from "@/components/realestate/TransactionTypeChips";

// Import images
import heroImage from "@/assets/realestate-hero.jpg";

// Mock listings for demo
const MOCK_LISTINGS = [
  {
    id: "1",
    title: "Przestronne mieszkanie 3-pokojowe, Kazimierz",
    price: 450000,
    priceType: "sale",
    photos: [heroImage],
    location: "Kraków",
    district: "Kazimierz",
    buildYear: 2019,
    areaM2: 65,
    rooms: 3,
    floor: 4,
    floorsTotal: 10,
    propertyType: "mieszkanie",
    transactionType: "Na sprzedaż",
    transactionColor: "#10b981",
    hasBalcony: true,
    hasElevator: true,
    marketType: "wtorny",
    agencyName: "Nieruchomości Premium",
    contactName: "Jan Kowalski",
    contactPhone: "+48 123 456 789",
  },
  {
    id: "2",
    title: "Nowoczesne studio w centrum",
    price: 2800,
    priceType: "rent_monthly",
    photos: [heroImage],
    location: "Warszawa",
    district: "Śródmieście",
    buildYear: 2022,
    areaM2: 35,
    rooms: 1,
    floor: 8,
    floorsTotal: 15,
    propertyType: "kawalerka",
    transactionType: "Wynajem",
    transactionColor: "#3b82f6",
    hasElevator: true,
    hasParking: true,
    marketType: "pierwotny",
    agencyName: "City Apartments",
    contactName: "Anna Nowak",
    contactPhone: "+48 987 654 321",
  },
  {
    id: "3",
    title: "Dom jednorodzinny z ogrodem",
    price: 890000,
    priceType: "sale",
    photos: [heroImage],
    location: "Gdańsk",
    district: "Osowa",
    buildYear: 2015,
    areaM2: 180,
    rooms: 5,
    propertyType: "dom",
    transactionType: "Na sprzedaż",
    transactionColor: "#10b981",
    hasGarden: true,
    hasParking: true,
    agencyName: "Trójmiasto Nieruchomości",
    contactName: "Piotr Wiśniewski",
  },
  {
    id: "4",
    title: "Działka budowlana 1200m²",
    price: 320000,
    priceType: "sale",
    photos: [heroImage],
    location: "Wrocław",
    district: "Krzyki",
    areaM2: 1200,
    propertyType: "dzialka",
    transactionType: "Na sprzedaż",
    transactionColor: "#10b981",
    agencyName: "Grunty Plus",
  },
];

export default function RealEstateMarketplace() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [selectedPropertyType, setSelectedPropertyType] = useState<string | null>(null);
  const [selectedTransactionType, setSelectedTransactionType] = useState<string | null>(null);
  const [listings, setListings] = useState(MOCK_LISTINGS);
  const [loading, setLoading] = useState(false);
  const [aiQuery, setAiQuery] = useState("");
  const [isSearchingAI, setIsSearchingAI] = useState(false);

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

  const handleSearch = (filters: RealEstateFilters) => {
    console.log("Searching with filters:", filters);
    setLoading(true);
    // TODO: Implement real search
    setTimeout(() => setLoading(false), 500);
  };

  const handleAISearch = async () => {
    if (!aiQuery.trim()) return;
    setIsSearchingAI(true);
    // TODO: Integrate with AI search edge function
    setTimeout(() => {
      setIsSearchingAI(false);
      // Mock result
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div 
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => navigate("/easy")}
          >
            <img 
              src="/lovable-uploads/253e522c-702e-4ce9-9429-10ddbde63878.png" 
              alt="RIDO" 
              className="h-8 w-8"
            />
            <span className="font-bold text-lg md:text-xl">
              <span className="text-primary">RIDO</span> Nieruchomości
            </span>
          </div>
          <div className="flex gap-2">
            {user ? (
              <>
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={() => navigate('/nieruchomosci/agent/panel')}
                  className="hidden sm:inline-flex"
                >
                  Mój panel
                </Button>
                <Button 
                  size="sm"
                  onClick={() => navigate('/nieruchomosci/agent/panel?tab=add')}
                  className="rounded-full"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Dodaj ogłoszenie
                </Button>
              </>
            ) : (
              <>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => navigate('/nieruchomosci/agent/rejestracja')}
                  className="hidden sm:inline-flex"
                >
                  Dla agencji
                </Button>
                <Button 
                  size="sm"
                  onClick={() => navigate('/easy/login')}
                  className="rounded-full"
                >
                  Zaloguj
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section with Background */}
      <section className="relative overflow-hidden">
        {/* Background Image with Overlay */}
        <div 
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${heroImage})` }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-background/90 via-background/80 to-background" />
        </div>

        <div className="relative container mx-auto px-4 py-8 md:py-12">
          {/* AI Search Bar */}
          <div className="max-w-3xl mx-auto mb-6">
            <div className="relative">
              <Sparkles className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-primary" />
              <Input
                type="text"
                placeholder="Zapytaj AI: 'Mieszkanie 3-pokojowe w Krakowie do 500 tys.'"
                value={aiQuery}
                onChange={(e) => setAiQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAISearch()}
                className="pl-12 pr-28 h-14 text-base md:text-lg rounded-full border-2 border-primary/30 focus:border-primary shadow-xl bg-background/95 backdrop-blur"
              />
              <Button
                onClick={handleAISearch}
                disabled={isSearchingAI || !aiQuery.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full h-10 px-6"
              >
                {isSearchingAI ? "..." : "Szukaj AI"}
              </Button>
            </div>
            <p className="text-center text-xs text-muted-foreground mt-2">
              Powered by <span className="text-primary font-medium">Ludek AI</span> • 
              Szukaj naturalnym językiem
            </p>
          </div>

          {/* Title */}
          <div className="text-center mb-6">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2">
              Znajdź wymarzoną <span className="text-primary">nieruchomość</span>
            </h1>
            <p className="text-muted-foreground">
              Mieszkania, domy, działki i lokale od zweryfikowanych agencji
            </p>
          </div>
        </div>
      </section>

      {/* Property Type Selector */}
      <section className="container mx-auto px-4 py-4">
        <PropertyTypeSelector
          selectedType={selectedPropertyType}
          onTypeChange={setSelectedPropertyType}
          className="justify-center"
        />
      </section>

      {/* Transaction Type Chips */}
      <section className="container mx-auto px-4 py-2">
        <TransactionTypeChips
          selectedType={selectedTransactionType}
          onTypeChange={setSelectedTransactionType}
          className="justify-center"
        />
      </section>

      {/* Search Filters */}
      <section className="container mx-auto px-4 py-4">
        <RealEstateSearch
          onSearch={handleSearch}
          className="max-w-5xl mx-auto"
        />
      </section>

      {/* Results Count */}
      <section className="container mx-auto px-4 py-2">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <p className="text-sm text-muted-foreground">
            Znaleziono: <span className="font-medium text-foreground">{listings.length}</span> ogłoszeń
          </p>
          <Badge variant="outline" className="gap-1">
            <Building className="h-3 w-3" />
            Tylko zweryfikowane agencje
          </Badge>
        </div>
      </section>

      {/* Listings Grid */}
      <section className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 max-w-7xl mx-auto">
          {listings.map((listing) => (
            <PropertyListingCard
              key={listing.id}
              listing={listing}
              onView={() => navigate(`/nieruchomosci/ogloszenie/${listing.id}`)}
              onFavorite={() => console.log("Favorite:", listing.id)}
              isLoggedIn={!!user}
            />
          ))}
        </div>

        {listings.length === 0 && !loading && (
          <div className="text-center py-12">
            <Building className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium mb-2">Brak wyników</h3>
            <p className="text-muted-foreground mb-4">
              Spróbuj zmienić kryteria wyszukiwania
            </p>
          </div>
        )}
      </section>

      {/* CTA for Agencies */}
      <section className="container mx-auto px-4 py-12">
        <div className="max-w-3xl mx-auto bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl p-8 text-center border border-primary/20">
          <Building className="h-12 w-12 mx-auto text-primary mb-4" />
          <h2 className="text-2xl font-bold mb-2">Jesteś agentem nieruchomości?</h2>
          <p className="text-muted-foreground mb-6">
            Dołącz do GetRido i docieraj do tysięcy potencjalnych klientów. 
            Dodawaj ogłoszenia, zarządzaj zespołem agentów.
          </p>
          <Button 
            size="lg" 
            onClick={() => navigate('/nieruchomosci/agent/rejestracja')}
            className="rounded-full"
          >
            Zarejestruj agencję
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </section>

      <Footer />
    </div>
  );
}
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, MapPin, Wrench, Sparkles, Home, Hammer, Droplets, Zap, Flower, Truck, Star, Filter, ArrowLeft } from 'lucide-react';
import { ServiceCategoryTile, categoryImages } from '@/components/services/ServiceCategoryTile';
import { ServiceListingCard } from '@/components/services/ServiceListingCard';
import { ServiceProviderDetailModal } from '@/components/services/ServiceProviderDetailModal';
import { MyGetRidoButton } from '@/components/MyGetRidoButton';
import LanguageSelector from '@/components/LanguageSelector';
import { User } from '@supabase/supabase-js';

interface ServiceCategory {
  id: string;
  name: string;
  slug: string;
  icon: string;
  description: string;
}

interface ServiceProvider {
  id: string;
  company_name: string;
  company_city: string;
  company_address: string | null;
  company_phone: string | null;
  company_email: string | null;
  company_website: string | null;
  description: string;
  logo_url: string | null;
  cover_image_url: string | null;
  rating_avg: number | null;
  rating_count: number;
  category_id: string;
  category?: ServiceCategory;
  services?: { id: string; name: string; price: number; price_type: string }[];
}

const categoryIcons: Record<string, any> = {
  'wrench': Wrench,
  'sparkles': Sparkles,
  'home': Home,
  'hammer': Hammer,
  'droplets': Droplets,
  'zap': Zap,
  'flower': Flower,
  'truck': Truck,
};

const categoryDescriptions: Record<string, string> = {
  'sprzatanie': 'Profesjonalne sprzątanie mieszkań, biur i lokali',
  'warsztat': 'Naprawy, przeglądy i serwis samochodowy',
  'detailing': 'Polerowanie, ceramika i pielęgnacja lakieru',
  'zlota-raczka': 'Drobne naprawy domowe i montaż',
  'hydraulik': 'Instalacje wodne i usuwanie awarii',
  'elektryk': 'Instalacje elektryczne i naprawy',
  'ogrodnik': 'Pielęgnacja ogrodów i terenów zielonych',
  'przeprowadzki': 'Transport mebli i przeprowadzki',
};

export default function ServicesMarketplace() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [providers, setProviders] = useState<ServiceProvider[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<ServiceProvider | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const selectedCategorySlug = searchParams.get('kategoria');

  useEffect(() => {
    loadData();
    checkUser();
  }, []);

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load categories
      const { data: cats } = await supabase
        .from('service_categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      
      if (cats) setCategories(cats);

      // Load providers with their services
      const { data: provs } = await supabase
        .from('service_providers')
        .select(`
          *,
          category:service_categories(*),
          services(id, name, price, price_type)
        `)
        .eq('status', 'active')
        .order('rating_avg', { ascending: false, nullsFirst: false });
      
      if (provs) setProviders(provs as ServiceProvider[]);
    } catch (error) {
      console.error('Error loading services data:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectedCategory = categories.find(c => c.slug === selectedCategorySlug);

  const filteredProviders = providers.filter(provider => {
    // Category filter
    if (selectedCategorySlug && provider.category?.slug !== selectedCategorySlug) {
      return false;
    }
    
    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesName = provider.company_name?.toLowerCase().includes(query);
      const matchesDesc = provider.description?.toLowerCase().includes(query);
      const matchesServices = provider.services?.some(s => s.name.toLowerCase().includes(query));
      if (!matchesName && !matchesDesc && !matchesServices) {
        return false;
      }
    }
    
    // City filter
    if (cityFilter && !provider.company_city?.toLowerCase().includes(cityFilter.toLowerCase())) {
      return false;
    }
    
    return true;
  });

  const handleCategoryClick = (slug: string) => {
    setSearchParams({ kategoria: slug });
  };

  const handleBackToCategories = () => {
    setSearchParams({});
    setSearchQuery('');
    setCityFilter('');
  };

  const handleProviderClick = (provider: ServiceProvider) => {
    setSelectedProvider(provider);
    setDetailModalOpen(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // View: Category Selection (Landing)
  if (!selectedCategorySlug) {
    return (
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <img
                src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png"
                alt="RIDO"
                className="h-8 w-8 cursor-pointer"
                onClick={() => navigate('/')}
              />
              <span className="font-bold text-lg hidden sm:block">Usługi</span>
            </div>
            
            <div className="flex items-center gap-2">
              <LanguageSelector />
              <MyGetRidoButton user={user} />
            </div>
          </div>
        </header>

        {/* Hero Section */}
        <section className="bg-gradient-to-r from-primary/10 via-primary/5 to-background py-12 md:py-16">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-3xl md:text-5xl font-bold mb-4">
              Znajdź profesjonalną usługę
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-8">
              Warsztaty, sprzątanie, złota rączka i więcej. Sprawdź oceny i zarezerwuj termin online.
            </p>
          </div>
        </section>

        {/* Category Tiles Grid */}
        <main className="container mx-auto px-4 py-8">
          <h2 className="text-2xl font-bold mb-6">Wybierz kategorię</h2>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {categories.map(cat => {
              const IconComponent = categoryIcons[cat.icon];
              return (
                <ServiceCategoryTile
                  key={cat.id}
                  slug={cat.slug}
                  name={cat.name}
                  description={categoryDescriptions[cat.slug] || cat.description}
                  icon={IconComponent}
                  onClick={() => handleCategoryClick(cat.slug)}
                />
              );
            })}
          </div>

          {categories.length === 0 && (
            <div className="text-center py-16">
              <Wrench className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
              <h2 className="text-xl font-semibold mb-2">Brak kategorii</h2>
              <p className="text-muted-foreground">
                Moduł usług jest w trakcie uruchamiania. Wkrótce pojawią się tutaj kategorie!
              </p>
            </div>
          )}
        </main>
      </div>
    );
  }

  // View: Category Listings
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleBackToCategories}
              className="mr-2"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <img
              src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png"
              alt="RIDO"
              className="h-8 w-8 cursor-pointer"
              onClick={() => navigate('/')}
            />
            <span className="font-bold text-lg hidden sm:block">
              {selectedCategory?.name || 'Usługi'}
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <LanguageSelector />
            <MyGetRidoButton user={user} />
          </div>
        </div>
      </header>

      {/* Search Bar */}
      <section className="bg-gradient-to-r from-primary/10 via-primary/5 to-background py-6">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mx-auto flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Szukaj usługi, np. wymiana opon, sprzątanie..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="relative flex-1 md:max-w-xs">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Miasto"
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button className="bg-primary hover:bg-primary/90">
              <Search className="h-4 w-4 mr-2" />
              Szukaj
            </Button>
          </div>
        </div>
      </section>

      {/* Categories Filter */}
      <section className="py-4 border-b">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap gap-2 justify-center">
            <Badge
              variant={!selectedCategorySlug ? "default" : "outline"}
              className="cursor-pointer px-4 py-2 text-sm"
              onClick={handleBackToCategories}
            >
              <Filter className="h-4 w-4 mr-1" />
              Wszystkie
            </Badge>
            {categories.map(cat => {
              const IconComponent = categoryIcons[cat.icon];
              return (
                <Badge
                  key={cat.id}
                  variant={selectedCategorySlug === cat.slug ? "default" : "outline"}
                  className="cursor-pointer px-4 py-2 text-sm"
                  onClick={() => handleCategoryClick(cat.slug)}
                >
                  {IconComponent && <IconComponent className="h-4 w-4 mr-1" />}
                  {cat.name}
                </Badge>
              );
            })}
          </div>
        </div>
      </section>

      {/* Providers Grid */}
      <main className="container mx-auto px-4 py-8">
        {filteredProviders.length === 0 ? (
          <div className="text-center py-16">
            <Wrench className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
            <h2 className="text-xl font-semibold mb-2">Brak usługodawców</h2>
            <p className="text-muted-foreground">
              {providers.length === 0 
                ? 'Moduł usług jest w trakcie uruchamiania. Wkrótce pojawią się tutaj usługodawcy!'
                : 'Nie znaleziono usługodawców pasujących do kryteriów wyszukiwania.'}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
              <p className="text-muted-foreground">
                Znaleziono <strong>{filteredProviders.length}</strong> usługodawców
              </p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                Sortowane wg oceny
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProviders.map(provider => (
                <ServiceListingCard
                  key={provider.id}
                  provider={provider}
                  onClick={() => handleProviderClick(provider)}
                  isLoggedIn={!!user}
                />
              ))}
            </div>
          </>
        )}
      </main>

      {/* Provider Detail Modal */}
      <ServiceProviderDetailModal
        provider={selectedProvider}
        open={detailModalOpen}
        onOpenChange={setDetailModalOpen}
      />
    </div>
  );
}

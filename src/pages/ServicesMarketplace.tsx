import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, MapPin, Wrench, Sparkles, Home, Hammer, Droplets, Zap, Flower, Truck, Star, Filter, ArrowLeft, Shield, PenTool, HardHat, Grid3X3, LayoutList, List, Car, Scissors, Heart, Briefcase, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ServiceListingCard } from '@/components/services/ServiceListingCard';
import { ServiceProviderDetailModal } from '@/components/services/ServiceProviderDetailModal';
import { MyGetRidoButton } from '@/components/MyGetRidoButton';
import { UniversalHomeButton } from '@/components/UniversalHomeButton';
import LanguageSelector from '@/components/LanguageSelector';
import { Card, CardContent } from '@/components/ui/card';
import { User } from '@supabase/supabase-js';
import { SEOHead, seoConfigs } from '@/components/SEOHead';

// Category group images
import categoryAuto from '@/assets/category-auto.jpg';
import categoryDom from '@/assets/category-dom.jpg';
import categoryBeauty from '@/assets/category-beauty.jpg';
import categoryZdrowie from '@/assets/category-zdrowie.jpg';
import categoryEkspert from '@/assets/category-ekspert.jpg';
import categoryDostawy from '@/assets/category-dostawy.jpg';
import categoryFachowiec from '@/assets/category-fachowiec.jpg';

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

// Main category groups with subcategories and mapped slugs
const CATEGORY_GROUPS = [
  {
    id: 'auto',
    name: 'Auto',
    image: categoryAuto,
    icon: Car,
    subcategories: ['Warsztaty', 'Detailing', 'Myjnie', 'Flota', 'PPF'],
    slugs: ['warsztat', 'detailing', 'ppf'],
  },
  {
    id: 'dom',
    name: 'Dom',
    image: categoryDom,
    icon: Home,
    subcategories: ['Sprzątanie', 'Remonty', 'Wykończenia', 'Budowlanka', 'Meble i wyposażenie'],
    slugs: ['sprzatanie', 'remonty', 'budowlanka', 'projektanci'],
  },
  {
    id: 'beauty',
    name: 'Beauty',
    image: categoryBeauty,
    icon: Scissors,
    subcategories: ['Fryzjerzy', 'Kosmetyczki', 'Paznokcie', 'Rzęsy', 'Spa i masaże'],
    slugs: [],
  },
  {
    id: 'zdrowie',
    name: 'Zdrowie',
    image: categoryZdrowie,
    icon: Heart,
    subcategories: ['Lekarze', 'Dentyści', 'Fizjoterapeuci', 'Psycholodzy', 'Dietetycy'],
    slugs: [],
  },
  {
    id: 'ekspert',
    name: 'Ekspert',
    image: categoryEkspert,
    icon: Briefcase,
    subcategories: ['Prawnicy', 'Księgowi', 'Doradcy finansowi', 'Notariusze', 'Tłumacze'],
    slugs: [],
  },
  {
    id: 'dostawy',
    name: 'Dostawy',
    image: categoryDostawy,
    icon: Package,
    subcategories: ['Kurierzy', 'Transport', 'Przeprowadzki', 'Przewóz osób'],
    slugs: ['przeprowadzki'],
  },
  {
    id: 'fachowiec',
    name: 'Fachowiec',
    image: categoryFachowiec,
    icon: Wrench,
    subcategories: ['Hydraulicy', 'Elektrycy', 'Stolarze', 'Malarze', 'Złota rączka'],
    slugs: ['hydraulik', 'elektryk', 'zlota-raczka', 'ogrodnik'],
  },
];

const categoryIcons: Record<string, any> = {
  'wrench': Wrench,
  'sparkles': Sparkles,
  'home': Home,
  'hammer': Hammer,
  'droplets': Droplets,
  'zap': Zap,
  'flower': Flower,
  'truck': Truck,
  'shield': Shield,
  'pen-tool': PenTool,
  'hard-hat': HardHat,
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
  const [viewMode, setViewMode] = useState<'grid' | 'compact' | 'list'>('grid');

  const selectedCategorySlug = searchParams.get('kategoria');
  const selectedGroupId = searchParams.get('grupa');
  const selectedGroup = CATEGORY_GROUPS.find(g => g.id === selectedGroupId);

  const handleBackToCategories = () => {
    setSearchParams({});
    setSearchQuery('');
    setCityFilter('');
  };

  const handleBackToGroups = () => {
    setSearchParams({});
    setSearchQuery('');
    setCityFilter('');
  };

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

    // Group filter - match any slug in the group
    if (selectedGroupId && !selectedCategorySlug) {
      const group = CATEGORY_GROUPS.find(g => g.id === selectedGroupId);
      if (group && group.slugs.length > 0 && !group.slugs.includes(provider.category?.slug || '')) {
        return false;
      }
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

  const handleGroupClick = (groupId: string) => {
    setSearchParams({ grupa: groupId });
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

  // View: Category Selection (Landing) - unified with EasyHub sub-menu style
  if (!selectedCategorySlug) {
    return (
      <div className="min-h-screen bg-background">
        {/* SEO */}
        <SEOHead 
          title={seoConfigs.uslugi.title}
          description={seoConfigs.uslugi.description}
          keywords={seoConfigs.uslugi.keywords}
          canonicalUrl="https://getrido.pl/uslugi"
          schemaType="ItemList"
          schemaData={{
            '@context': 'https://schema.org',
            '@type': 'ItemList',
            name: 'Portal Usług GetRido',
            description: 'Znajdź fachowców i usługodawców: hydraulik, elektryk, sprzątanie, remonty i więcej',
            url: 'https://getrido.pl/uslugi'
          }}
        />
        {/* Header - unified with Nieruchomości */}
        <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UniversalHomeButton />
              <span className="text-muted-foreground">/</span>
              <span className="font-semibold text-foreground">Usługi</span>
            </div>
            
            <div className="flex items-center gap-2">
              <LanguageSelector />
              <MyGetRidoButton user={user} />
            </div>
          </div>
        </header>

        {/* Hero Section - unified style */}
        <section className="py-8 md:py-12">
          <div className="container mx-auto px-4 text-center">
            <h1 className="text-3xl md:text-5xl font-bold mb-2">
              GetRido <span className="text-primary">Easy</span>
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto mb-6">
              Wszystko, czego potrzebujesz – łatwo i w jednym miejscu.
            </p>
            
            {/* AI Search Bar */}
            <div className="max-w-2xl mx-auto mb-8">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="AI, które znajdzie to za Ciebie…"
                  className="w-full pl-12 pr-24 h-12 md:h-14 text-base md:text-lg rounded-full border-2 border-primary/20 focus:border-primary shadow-lg bg-background focus:outline-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                      navigate(`/wyniki?query=${encodeURIComponent((e.target as HTMLInputElement).value)}`);
                    }
                  }}
                />
                <Button
                  onClick={(e) => {
                    const input = (e.target as HTMLElement).parentElement?.querySelector('input');
                    if (input?.value.trim()) {
                      navigate(`/wyniki?query=${encodeURIComponent(input.value)}`);
                    }
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full h-8 md:h-10 px-4 md:px-6"
                >
                  <Sparkles className="h-4 w-4 mr-1" />
                  Szukaj
                </Button>
              </div>
              <p className="text-center text-xs text-muted-foreground mt-2">
                Powered by <span className="text-primary font-medium">Rido AI</span>
              </p>
            </div>
          </div>
        </section>

        {/* Back button + Category Tiles Grid - unified with Nieruchomości */}
        <main className="container mx-auto px-4 pb-8">
          {/* Back button */}
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Wróć do głównej
          </button>
          
          {/* Grid with unified tile size */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
              <UniversalHomeButton />
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
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <p className="text-muted-foreground">
                Znaleziono <strong>{filteredProviders.length}</strong> usługodawców
              </p>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  Sortowane wg oceny
                </div>
                {/* View mode toggle */}
                <div className="flex items-center gap-1 bg-muted rounded-lg p-1">
                  <Button
                    variant={viewMode === 'grid' ? 'default' : 'ghost'}
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setViewMode('grid')}
                  >
                    <Grid3X3 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'compact' ? 'default' : 'ghost'}
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setViewMode('compact')}
                  >
                    <LayoutList className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={viewMode === 'list' ? 'default' : 'ghost'}
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setViewMode('list')}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            
            <div className={cn(
              "grid gap-4",
              viewMode === 'grid' && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
              viewMode === 'compact' && "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
              viewMode === 'list' && "grid-cols-1"
            )}>
              {filteredProviders.map(provider => (
                <ServiceListingCard
                  key={provider.id}
                  provider={provider}
                  onClick={() => handleProviderClick(provider)}
                  isLoggedIn={!!user}
                  viewMode={viewMode}
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

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, MapPin, Wrench, Sparkles, Home, Hammer, Droplets, Zap, Flower, Truck, Star, Filter } from 'lucide-react';
import { ServiceProviderCard } from '@/components/services/ServiceProviderCard';
import { ServiceProviderDetailModal } from '@/components/services/ServiceProviderDetailModal';
import { MyGetRidoButton } from '@/components/MyGetRidoButton';
import LanguageSelector from '@/components/LanguageSelector';

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

const categoryIcons: Record<string, React.ReactNode> = {
  'wrench': <Wrench className="h-5 w-5" />,
  'sparkles': <Sparkles className="h-5 w-5" />,
  'home': <Home className="h-5 w-5" />,
  'hammer': <Hammer className="h-5 w-5" />,
  'droplets': <Droplets className="h-5 w-5" />,
  'zap': <Zap className="h-5 w-5" />,
  'flower': <Flower className="h-5 w-5" />,
  'truck': <Truck className="h-5 w-5" />,
};

export default function ServicesMarketplace() {
  const navigate = useNavigate();
  
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [providers, setProviders] = useState<ServiceProvider[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<ServiceProvider | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

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

  const filteredProviders = providers.filter(provider => {
    // Category filter
    if (selectedCategory && provider.category_id !== selectedCategory) {
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
              onClick={() => navigate('/easy')}
            />
            <span className="font-bold text-lg hidden sm:block">Usługi</span>
          </div>
          
          <div className="flex items-center gap-2">
            <LanguageSelector />
            <MyGetRidoButton user={null} />
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-gradient-to-r from-primary/10 via-primary/5 to-background py-8 md:py-12">
        <div className="container mx-auto px-4">
          <h1 className="text-2xl md:text-4xl font-bold text-center mb-4">
            Znajdź profesjonalną usługę
          </h1>
          <p className="text-muted-foreground text-center mb-6 max-w-2xl mx-auto">
            Warsztaty, sprzątanie, złota rączka i więcej. Sprawdź oceny i zarezerwuj termin online.
          </p>
          
          {/* Search Bar */}
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

      {/* Categories */}
      <section className="py-6 border-b">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap gap-2 justify-center">
            <Badge
              variant={selectedCategory === null ? "default" : "outline"}
              className="cursor-pointer px-4 py-2 text-sm"
              onClick={() => setSelectedCategory(null)}
            >
              <Filter className="h-4 w-4 mr-1" />
              Wszystkie
            </Badge>
            {categories.map(cat => (
              <Badge
                key={cat.id}
                variant={selectedCategory === cat.id ? "default" : "outline"}
                className="cursor-pointer px-4 py-2 text-sm"
                onClick={() => setSelectedCategory(cat.id)}
              >
                {categoryIcons[cat.icon] || <Wrench className="h-4 w-4 mr-1" />}
                <span className="ml-1">{cat.name}</span>
              </Badge>
            ))}
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
                <ServiceProviderCard
                  key={provider.id}
                  provider={provider}
                  onClick={() => handleProviderClick(provider)}
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

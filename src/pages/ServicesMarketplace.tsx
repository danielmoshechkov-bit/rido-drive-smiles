import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
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
import mascotServices from '@/assets/mascot-services.png';

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
  gallery_photos?: string[] | null;
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
    nameKey: 'services.groups.auto.name',
    image: categoryAuto,
    icon: Car,
    subcategoryKeys: [
      'services.groups.auto.sub.workshops',
      'services.groups.auto.sub.detailing',
      'services.groups.auto.sub.carWash',
      'services.groups.auto.sub.fleet',
      'services.groups.auto.sub.ppf',
    ],
    slugs: ['warsztat', 'mechanika', 'detailing', 'myjnia', 'wulkanizacja', 'klimatyzacja', 'elektryka-auto', 'blacharstwo', 'auto-szyby', 'serwis-lpg', 'przeglady', 'holowanie', 'ppf'],
  },
  {
    id: 'dom',
    nameKey: 'services.groups.dom.name',
    image: categoryDom,
    icon: Home,
    subcategoryKeys: [
      'services.groups.dom.sub.cleaning',
      'services.groups.dom.sub.renovations',
      'services.groups.dom.sub.finishing',
      'services.groups.dom.sub.construction',
      'services.groups.dom.sub.furniture',
    ],
    slugs: ['sprzatanie', 'remonty', 'budowlanka', 'projektanci'],
  },
  {
    id: 'beauty',
    nameKey: 'services.groups.beauty.name',
    image: categoryBeauty,
    icon: Scissors,
    subcategoryKeys: [
      'services.groups.beauty.sub.hairdressers',
      'services.groups.beauty.sub.beauticians',
      'services.groups.beauty.sub.nails',
      'services.groups.beauty.sub.lashes',
      'services.groups.beauty.sub.spa',
    ],
    slugs: ['fryzjer', 'kosmetyczka', 'paznokcie', 'rzesy-brwi', 'spa-masaz', 'barber'],
  },
  {
    id: 'zdrowie',
    nameKey: 'services.groups.zdrowie.name',
    image: categoryZdrowie,
    icon: Heart,
    subcategoryKeys: [
      'services.groups.zdrowie.sub.doctors',
      'services.groups.zdrowie.sub.dentists',
      'services.groups.zdrowie.sub.physiotherapists',
      'services.groups.zdrowie.sub.psychologists',
      'services.groups.zdrowie.sub.dietitians',
    ],
    slugs: ['lekarz', 'dentysta', 'fizjoterapeuta', 'psycholog', 'dietetyk'],
  },
  {
    id: 'ekspert',
    nameKey: 'services.groups.ekspert.name',
    image: categoryEkspert,
    icon: Briefcase,
    subcategoryKeys: [
      'services.groups.ekspert.sub.lawyers',
      'services.groups.ekspert.sub.accountants',
      'services.groups.ekspert.sub.financialAdvisors',
      'services.groups.ekspert.sub.notaries',
      'services.groups.ekspert.sub.translators',
    ],
    slugs: ['prawnik', 'ksiegowy', 'doradca-finansowy', 'notariusz', 'tlumacz'],
  },
  {
    id: 'dostawy',
    nameKey: 'services.groups.dostawy.name',
    image: categoryDostawy,
    icon: Package,
    subcategoryKeys: [
      'services.groups.dostawy.sub.couriers',
      'services.groups.dostawy.sub.transport',
      'services.groups.dostawy.sub.moving',
      'services.groups.dostawy.sub.passengerTransport',
    ],
    slugs: ['kurier', 'transport', 'przeprowadzki', 'przewoz-osob'],
  },
  {
    id: 'fachowiec',
    nameKey: 'services.groups.fachowiec.name',
    image: categoryFachowiec,
    icon: Wrench,
    subcategoryKeys: [
      'services.groups.fachowiec.sub.plumbers',
      'services.groups.fachowiec.sub.electricians',
      'services.groups.fachowiec.sub.carpenters',
      'services.groups.fachowiec.sub.painters',
      'services.groups.fachowiec.sub.handyman',
    ],
    slugs: ['hydraulik', 'elektryk', 'stolarz', 'malarz', 'glazurnik', 'dekarz', 'klimatyzacja-dom', 'zlota-raczka', 'ogrodnik'],
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
  const { t } = useTranslation();
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
  // Resolve active group: explicit ?grupa= OR derived from category slug
  const explicitGroup = CATEGORY_GROUPS.find(g => g.id === selectedGroupId);
  const derivedGroup = !explicitGroup && selectedCategorySlug
    ? CATEGORY_GROUPS.find(g => g.slugs.includes(selectedCategorySlug))
    : undefined;
  const selectedGroup = explicitGroup || derivedGroup;

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

  // Fallback dla linków rejestracji modułowej: /uslugi?activate=warsztat → panel usługodawcy
  // (panel sam odsyła na /auth, gdy brak sesji).
  useEffect(() => {
    if (searchParams.get('activate') === 'warsztat') {
      navigate('/uslugi/panel', { replace: true });
    }
  }, [searchParams, navigate]);

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

      // Load providers with their services (legacy + provider_services)
      const { data: provs } = await supabase
        .from('service_providers')
        .select(`
          *,
          category:service_categories(*),
          services(id, name, price, price_type),
          provider_services(id, name, price_from, price_to, is_active, category, category_id),
          provider_service_categories(id, name, service_category_id, is_active)
        `)
        .eq('status', 'active')
        .order('rating_avg', { ascending: false, nullsFirst: false });
      
      if (provs) {
        // Merge provider_services into services for each provider
        const merged = provs.map((p: any) => {
          const legacyServices = p.services || [];
          // Tabela provider_services używa kolumny `is_active` (boolean), nie `status`
          const provServices = (p.provider_services || [])
            .filter((ps: any) => ps.is_active !== false)
            .map((ps: any) => ({ id: ps.id, name: ps.name, price: ps.price_from, price_type: 'fixed', category: ps.category }));
          return { ...p, services: [...provServices, ...legacyServices] };
        });
        setProviders(merged as ServiceProvider[]);
      }
    } catch (error) {
      console.error('Error loading services data:', error);
    } finally {
      setLoading(false);
    }
  };

  const selectedCategory = categories.find(c => c.slug === selectedCategorySlug);

  // Czy dana kategoria ma choć jednego usługodawcę (ta sama logika co filtr kategorii)
  const providerInCategory = (provider: any, slug: string, catId?: string) => {
    const slugWords = slug.replace(/-/g, ' ');
    return provider.category?.slug === slug
      || (!!catId && provider.provider_service_categories?.some(
        (pc: any) => pc.is_active !== false && pc.service_category_id === catId))
      || provider.provider_services?.some((ps: any) => (ps.is_active !== false) && (
        ps.category?.toLowerCase().includes(slug) ||
        ps.category?.toLowerCase().includes(slugWords) ||
        ps.name?.toLowerCase().includes(slugWords)))
      || provider.company_name?.toLowerCase().includes(slugWords)
      || provider.description?.toLowerCase().includes(slugWords);
  };

  // Puste kategorie ukrywamy przed klientami — usługodawcy nadal je widzą w swoim panelu,
  // a kategoria pojawi się na portalu, gdy ktoś doda w niej swoją usługę.
  const visibleCategories = categories.filter(cat =>
    cat.slug === selectedCategorySlug ||
    providers.some(p => providerInCategory(p, cat.slug, cat.id))
  );

  const filteredProviders = providers.filter(provider => {
    // Category filter - show provider if they have matching category OR have services in that category
    if (selectedCategorySlug) {
      const slug = selectedCategorySlug.toLowerCase();
      const slugWords = slug.replace(/-/g, ' ');
      const selectedCatId = categories.find(c => c.slug === selectedCategorySlug)?.id;
      const categoryMatch = provider.category?.slug === selectedCategorySlug
        || (!!selectedCatId && (provider as any).provider_service_categories?.some(
          (pc: any) => pc.is_active !== false && pc.service_category_id === selectedCatId));
      // Sprawdź provider_services (raw) – is_active + dopasowanie po category lub nazwie usługi
      const hasServicesInCategory = (provider as any).provider_services?.some(
        (ps: any) => (ps.is_active !== false) && (
          ps.category?.toLowerCase().includes(slug) ||
          ps.category?.toLowerCase().includes(slugWords) ||
          ps.name?.toLowerCase().includes(slugWords)
        )
      );
      // Dopasowanie po nazwie firmy (np. "Warsztat Testowy" do slug "warsztat")
      const nameMatchesCategory = provider.company_name?.toLowerCase().includes(slugWords);
      // Dopasowanie po opisie firmy
      const descMatchesCategory = provider.description?.toLowerCase().includes(slugWords);
      if (!categoryMatch && !hasServicesInCategory && !nameMatchesCategory && !descMatchesCategory) {
        return false;
      }
    }

    // Group filter - applied also when a category from the same group is selected,
    // to keep results scoped to the active group (e.g. Auto only shows Auto providers).
    if (selectedGroup && !selectedCategorySlug) {
      const group = selectedGroup;
      if (group.slugs.length > 0) {
        const groupCatIds = categories.filter(c => group.slugs.includes(c.slug)).map(c => c.id);
        const hasGroupSlug = group.slugs.includes(provider.category?.slug || '')
          || (provider as any).provider_service_categories?.some(
            (pc: any) => pc.is_active !== false && groupCatIds.includes(pc.service_category_id));
        const nameOrDescMatch = group.slugs.some(s => {
          const sw = s.replace(/-/g, ' ');
          return provider.company_name?.toLowerCase().includes(sw) ||
                 provider.description?.toLowerCase().includes(sw);
        });
        const servicesMatch = (provider as any).provider_services?.some((ps: any) =>
          (ps.is_active !== false) && group.slugs.some(s => {
            const sw = s.replace(/-/g, ' ');
            return ps.category?.toLowerCase().includes(sw) || ps.name?.toLowerCase().includes(sw);
          })
        );
        if (!hasGroupSlug && !nameOrDescMatch && !servicesMatch) {
          return false;
        }
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
  }).sort((a, b) => {
    // Sort: providers with matching category first
    if (selectedCategorySlug) {
      const aMatch = a.category?.slug === selectedCategorySlug ? 0 : 1;
      const bMatch = b.category?.slug === selectedCategorySlug ? 0 : 1;
      if (aMatch !== bMatch) return aMatch - bMatch;
    }
    // Then by rating
    return (b.rating_avg || 0) - (a.rating_avg || 0);
  });

  const handleCategoryClick = (slug: string) => {
    const params: Record<string, string> = { kategoria: slug };
    const group = CATEGORY_GROUPS.find(g => g.slugs.includes(slug));
    if (group) params.grupa = group.id;
    else if (selectedGroupId) params.grupa = selectedGroupId;
    setSearchParams(params);
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

  // View: Category Group Selection (Landing)
  if (!selectedCategorySlug && !selectedGroupId) {
    return (
      <div className="min-h-screen bg-background">
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
            description: 'Znajdź fachowców i usługodawców w każdej kategorii',
            url: 'https://getrido.pl/uslugi'
          }}
        />
        <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UniversalHomeButton />
              <span className="text-muted-foreground">/</span>
              <span className="font-semibold text-foreground">{t('services.title', 'Usługi')}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-2 rounded-full border-primary/30 text-primary hover:bg-primary/10"
                onClick={() => navigate('/mapy')}
              >
                <MapPin className="h-4 w-4" />
                <span className="hidden sm:inline">Mapa GetRido</span>
              </Button>
               <LanguageSwitcher />
              <MyGetRidoButton user={user} />
            </div>
          </div>
        </header>

        {/* Hero Section — modern premium AI portal (matches Vehicles & Real Estate) */}
        <section className="relative overflow-hidden bg-gradient-to-br from-primary/5 via-background to-primary/10 border-b border-primary/10">
          <div className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full bg-primary/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 -right-16 w-[28rem] h-[28rem] rounded-full bg-primary/10 blur-3xl" />

          <div className="relative container mx-auto px-4 py-10 md:py-14">
            <div className="grid md:grid-cols-[1fr_auto] items-center gap-8 max-w-6xl mx-auto">
              <div className="text-center md:text-left">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-semibold mb-4">
                  <Sparkles className="h-3.5 w-3.5" />
                  Portal usług i fachowców z AI
                </div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight mb-3 text-slate-900">
                  {t('services.find', 'Znajdź fachowca dla siebie')}
                </h1>
                <p className="text-base md:text-lg text-slate-600 font-medium mb-6">
                  {t('services.chooseCategory', 'Sprawdzeni specjaliści w każdej kategorii — od warsztatu po remont')}
                </p>

                <div className="relative max-w-2xl">
                  <Sparkles className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-primary" />
                  <input
                    type="text"
                    placeholder={t('ui.searchPlaceholder', 'Zapytaj AI: „hydraulik w Warszawie na jutro"')}
                    className="w-full pl-12 pr-28 h-14 text-base md:text-lg rounded-full border-2 border-primary/30 focus:border-primary shadow-xl bg-white focus:outline-none"
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
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full h-10 px-6"
                  >
                    {t('ui.search', 'Szukaj')}
                  </Button>
                </div>
                <p className="text-xs text-slate-500 mt-2 md:text-left text-center">
                  Powered by <span className="text-primary font-semibold">Rido AI</span> • Szukaj naturalnym językiem
                </p>
              </div>

              <div className="hidden md:flex justify-center items-end">
                <img
                  src={mascotServices}
                  alt="GetRido mascot"
                  className="h-56 lg:h-64 w-auto drop-shadow-2xl"
                />
              </div>
            </div>
          </div>
        </section>

        <main className="container mx-auto px-4 pb-12">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('ui.backToMain', 'Wróć do głównej')}
          </button>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {CATEGORY_GROUPS.map(group => {
              const IconComp = group.icon;
              return (
                <Card
                  key={group.id}
                  className={cn(
                    "group relative overflow-hidden cursor-pointer transition-all duration-300",
                    "hover:shadow-xl hover:scale-[1.02] hover:-translate-y-1",
                    "border-0 shadow-md"
                  )}
                  onClick={() => handleGroupClick(group.id)}
                >
                  <div 
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
                    style={{ backgroundImage: `url(${group.image})` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20" />
                  </div>
                  
                  <CardContent className="relative z-10 p-4 h-40 md:h-48 flex flex-col justify-end">
                    <div className="flex items-center gap-2 mb-1">
                      <IconComp className="h-5 w-5 text-white" />
                      <h3 className="font-bold text-lg md:text-xl text-white">
                        {t(group.nameKey)}
                      </h3>
                    </div>
                    <p className="text-[11px] md:text-xs text-white/70 line-clamp-2">
                      {group.subcategoryKeys.map(k => t(k)).join(' · ')}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </main>
      </div>
    );
  }

  // View: Group or Category Listings
  const activeGroup = selectedGroup;
  const displayTitle = selectedCategory?.name || (activeGroup ? t(activeGroup.nameKey) : t('services.title', 'Usługi'));
  return (
    <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b">
          <div className="container mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={handleBackToGroups}
                className="mr-2"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <UniversalHomeButton />
              <span className="font-bold text-lg hidden sm:block">
                {displayTitle}
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <LanguageSwitcher />
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
                placeholder={t('services.searchPlaceholder', 'Szukaj usługi, np. wymiana opon, sprzątanie...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="relative flex-1 md:max-w-xs">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t('ui.city', 'Miasto')}
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
                className="pl-10"
              />
            </div>
            <Button className="bg-primary hover:bg-primary/90">
               <Search className="h-4 w-4 mr-2" />
               {t('ui.search', 'Szukaj')}
            </Button>
          </div>
        </div>
      </section>

      {/* Categories Filter */}
      <section className="py-4 border-b">
        <div className="container mx-auto px-4">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 md:flex-wrap md:justify-center">
            <Badge
              variant={!selectedCategorySlug ? "default" : "outline"}
              className="cursor-pointer px-4 py-2 text-sm"
              onClick={() => {
                if (activeGroup) {
                  setSearchParams({ grupa: activeGroup.id });
                } else {
                  handleBackToGroups();
                }
              }}
            >
              <Filter className="h-4 w-4 mr-1" />
              {t('ui.all', 'Wszystkie')}
            </Badge>
            {(activeGroup
              ? visibleCategories.filter(c => activeGroup.slugs.includes(c.slug))
              : visibleCategories
            ).map(cat => {
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
             <h2 className="text-xl font-semibold mb-2">{t('ui.noProviders', 'Brak usługodawców')}</h2>
             <p className="text-muted-foreground">
               {providers.length === 0 
                 ? t('ui.providersLoading', 'Moduł usług jest w trakcie uruchamiania.')
                 : t('ui.noProvidersMatch', 'Nie znaleziono usługodawców pasujących do kryteriów.')}
             </p>
          </div>
        ) : (
          <>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <p className="text-muted-foreground">
                {t('ui.found', 'Znaleziono')} <strong>{filteredProviders.length}</strong> {t('ui.foundProviders', 'usługodawców')}
              </p>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  {t('ui.sortByRating', 'Sortowane wg oceny')}
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

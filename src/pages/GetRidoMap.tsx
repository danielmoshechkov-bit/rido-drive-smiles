import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import MapGL, { Marker, Popup, NavigationControl } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ArrowLeft, MapPin, Search, Sparkles, Star, Loader2, Navigation } from 'lucide-react';
import { cn } from '@/lib/utils';
import SEOHead from '@/components/SEOHead';
import { RIDO_LIGHT_STYLE_URL } from '@/components/maps/ridoMapTheme';

interface MapProvider {
  id: string;
  company_name: string;
  short_name: string | null;
  company_city: string | null;
  company_address: string | null;
  logo_url: string | null;
  rating_avg: number | null;
  rating_count: number | null;
  latitude: number | null;
  longitude: number | null;
  category?: { name: string; slug: string } | null;
}

const POLAND_VIEW = { longitude: 19.4, latitude: 52.0, zoom: 5.4 };

export default function GetRidoMap() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [providers, setProviders] = useState<MapProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMatches, setAiMatches] = useState<string[] | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [categorySlug, setCategorySlug] = useState<string>(searchParams.get('kategoria') || 'all');
  const [viewState, setViewState] = useState(POLAND_VIEW);


  useEffect(() => {
    (async () => {
      const { data, error } = await (supabase as any)
        .from('service_providers')
        .select(
          'id, company_name, short_name, company_city, company_address, logo_url, rating_avg, rating_count, latitude, longitude, category:service_categories(name, slug)'
        )
        .eq('status', 'active')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);
      if (error) console.error('[mapa] błąd pobierania usługodawców', error);
      setProviders((data as MapProvider[]) || []);
      setLoading(false);
    })();
  }, []);

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    providers.forEach((p) => {
      if (p.category?.slug) map.set(p.category.slug, p.category.name);
    });
    return Array.from(map.entries());
  }, [providers]);

  const filtered = useMemo(() => {
    let list = providers;
    if (categorySlug !== 'all') list = list.filter((p) => p.category?.slug === categorySlug);
    if (aiMatches) list = list.filter((p) => aiMatches.includes(p.id));
    else if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (p) =>
          p.company_name?.toLowerCase().includes(q) ||
          p.company_city?.toLowerCase().includes(q) ||
          p.category?.name?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [providers, categorySlug, query, aiMatches]);

  const active = filtered.find((p) => p.id === activeId) || null;

  const runAiSearch = async () => {
    if (!query.trim()) {
      setAiMatches(null);
      setAiSummary(null);
      return;
    }
    setAiLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-service-search', {
        body: { query, city: null },
      });
      if (error) throw error;
      setAiMatches((data?.providerIds as string[]) || []);
      setAiSummary(data?.summary || null);
      setSearchParams({ q: query });
    } catch (e) {
      console.error('[mapa] AI search error', e);
      setAiMatches(null);
      setAiSummary(null);
    } finally {
      setAiLoading(false);
    }
  };

  const focus = (p: MapProvider) => {
    setActiveId(p.id);
    if (p.latitude && p.longitude) {
      setViewState({ longitude: p.longitude, latitude: p.latitude, zoom: 13 });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Mapa GetRido — warsztaty i usługodawcy na mapie"
        description="Znajdź na Mapie GetRido warsztaty, myjnie, detailing, wulkanizację i innych sprawdzonych usługodawców. Wyszukiwarka AI przeszukuje ofertę każdej firmy."
        keywords="mapa usług, warsztat w pobliżu, myjnia, detailing, wulkanizacja, usługi na mapie, GetRido"
        canonicalUrl="https://getrido.pl/mapa"
        schemaType="WebSite"
      />
      {/* Header */}
      <div className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/uslugi')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <MapPin className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-extrabold leading-tight text-foreground">Mapa GetRido</h1>
                <p className="text-xs text-muted-foreground">
                  {loading ? 'Ładowanie…' : `${filtered.length} firm na mapie`}
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setAiMatches(null);
                }}
                onKeyDown={(e) => e.key === 'Enter' && runAiSearch()}
                placeholder="Czego szukasz? np. wymiana rozrządu w Krakowie, ceramika na auto…"
                className="h-11 rounded-xl pl-9"
              />
            </div>
            <Button onClick={runAiSearch} disabled={aiLoading} className="h-11 gap-2 rounded-xl px-5">
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Szukaj z AI
            </Button>
          </div>

          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setCategorySlug('all')}
              className={cn(
                'whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-semibold transition',
                categorySlug === 'all'
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-foreground hover:border-primary'
              )}
            >
              Wszystkie
            </button>
            {categories.map(([slug, name]) => (
              <button
                key={slug}
                onClick={() => setCategorySlug(slug)}
                className={cn(
                  'whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-semibold transition',
                  categorySlug === slug
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-foreground hover:border-primary'
                )}
              >
                {name}
              </button>
            ))}
          </div>

          {aiSummary && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-2 text-sm text-foreground">
              <Sparkles className="mr-2 inline h-4 w-4 text-primary" />
              {aiSummary}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto flex max-w-[1600px] flex-col gap-4 p-4 lg:h-[calc(100vh-150px)] lg:flex-row">
        {/* Lista */}
        <div className="order-2 w-full space-y-3 overflow-y-auto lg:order-1 lg:w-[340px]">
          {filtered.map((p) => (
            <Card
              key={p.id}
              onClick={() => focus(p)}
              className={cn(
                'cursor-pointer rounded-2xl border-2 p-3 transition hover:border-primary',
                activeId === p.id ? 'border-primary shadow-md' : 'border-border'
              )}
            >
              <div className="flex gap-3">
                {p.logo_url ? (
                  <img
                    src={p.logo_url}
                    alt={p.company_name}
                    className="h-14 w-14 rounded-xl object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <MapPin className="h-6 w-6" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-foreground">{p.short_name || p.company_name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[p.company_address, p.company_city].filter(Boolean).join(', ')}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    {p.category?.name && (
                      <Badge variant="secondary" className="text-[10px]">
                        {p.category.name}
                      </Badge>
                    )}
                    {!!p.rating_count && (
                      <span className="flex items-center gap-1 text-xs font-semibold text-foreground">
                        <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                        {(p.rating_avg ?? 0).toFixed(1)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
          {!loading && filtered.length === 0 && (
            <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              Brak firm spełniających kryteria.
            </p>
          )}
        </div>

        {/* Mapa */}
        <div className="order-1 h-[55vh] flex-1 overflow-hidden rounded-2xl border-2 border-border lg:order-2 lg:h-full">
          <MapGL
            {...viewState}
            onMove={(e) => setViewState(e.viewState as any)}
            mapStyle={RIDO_LIGHT_STYLE_URL}
            style={{ width: '100%', height: '100%' }}
          >
            <NavigationControl position="top-right" />
            {filtered.map((p) => (
              <Marker
                key={p.id}
                longitude={p.longitude!}
                latitude={p.latitude!}
                anchor="bottom"
                onClick={(e) => {
                  e.originalEvent.stopPropagation();
                  setActiveId(p.id);
                }}
              >
                <div
                  className={cn(
                    'flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-2 border-white shadow-lg transition',
                    activeId === p.id ? 'scale-125 bg-primary' : 'bg-primary/85'
                  )}
                >
                  <MapPin className="h-4 w-4 text-primary-foreground" />
                </div>
              </Marker>
            ))}

            {active && active.latitude && active.longitude && (
              <Popup
                longitude={active.longitude}
                latitude={active.latitude}
                anchor="top"
                closeButton
                onClose={() => setActiveId(null)}
                maxWidth="280px"
              >
                <div className="space-y-2 p-1">
                  <p className="font-bold text-slate-900">{active.short_name || active.company_name}</p>
                  <p className="text-xs text-slate-600">
                    {[active.company_address, active.company_city].filter(Boolean).join(', ')}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="h-8 rounded-lg"
                      onClick={() => navigate(`/uslugi/uslugodawca/${active.id}`)}
                    >
                      Zobacz firmę
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 gap-1 rounded-lg"
                      onClick={() =>
                        window.open(
                          `https://www.google.com/maps/dir/?api=1&destination=${active.latitude},${active.longitude}`,
                          '_blank'
                        )
                      }
                    >
                      <Navigation className="h-3 w-3" /> Trasa
                    </Button>
                  </div>
                </div>
              </Popup>
            )}
          </MapGL>
        </div>
      </div>
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { AuthModal } from '@/components/auth/AuthModal';
import { 
  Star, MapPin, Phone, Mail, Globe, Clock, 
  ChevronLeft, ChevronRight, Heart, Share2, ArrowLeft,
  User, Calendar, CheckCircle2, MessageCircle, LogIn
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ServiceBookingModal } from './ServiceBookingModal';
import { getServiceCoverImage } from './serviceCategoryImages';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface Service {
  id: string;
  name: string;
  description: string | null;
  price: number;
  price_from: number | null;
  price_type: string;
  duration_minutes: number;
}

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  provider_response: string | null;
  created_at: string;
  customer_user_id: string;
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
  category?: { name: string; slug: string };
}

export function ServiceProviderDetailPage() {
  const navigate = useNavigate();
  const { providerId } = useParams();
  
  const [provider, setProvider] = useState<ServiceProvider | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [isFavorited, setIsFavorited] = useState(false);
  
  // Auth state
  const [user, setUser] = useState<any>(null);
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [showContactPhone, setShowContactPhone] = useState(false);

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

  useEffect(() => {
    if (providerId) {
      loadProviderDetails();
    }
  }, [providerId]);

  const loadProviderDetails = async () => {
    if (!providerId) return;
    
    setLoading(true);
    try {
      // Load provider
      const { data: providerData, error: providerError } = await supabase
        .from('service_providers')
        .select(`
          *,
          category:service_categories(name, slug)
        `)
        .eq('id', providerId)
        .single();
      
      if (providerError) throw providerError;
      setProvider(providerData);

      // Load services from provider_services (where providers save their services)
      const { data: servicesData } = await (supabase as any)
        .from('provider_services')
        .select('*')
        .eq('provider_id', providerId)
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      
      // Also check legacy services table
      const { data: legacyServices } = await supabase
        .from('services')
        .select('*')
        .eq('provider_id', providerId)
        .eq('is_active', true)
        .order('sort_order');
      
      const providerCategory = providerData?.category?.slug || '';
      
      const allServices = [
        ...(servicesData || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          price: s.price_from,
          price_to: s.price_to,
          category: s.category,
          photos: s.photos || [],
          is_active: true,
          _isProviderCategory: s.category === providerCategory || s.category === 'ogolne',
        })),
        ...(legacyServices || []).map((s: any) => ({
          ...s,
          _isProviderCategory: true,
        })),
      ];
      
      // Sort: services matching provider's main category first
      allServices.sort((a: any, b: any) => {
        if (a._isProviderCategory && !b._isProviderCategory) return -1;
        if (!a._isProviderCategory && b._isProviderCategory) return 1;
        return 0;
      });
      
      if (allServices.length > 0) setServices(allServices);

      // Load reviews
      const { data: reviewsData } = await supabase
        .from('service_reviews')
        .select('*')
        .eq('provider_id', providerId)
        .eq('is_visible', true)
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (reviewsData) setReviews(reviewsData);
    } catch (error) {
      console.error('Error loading provider details:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBookService = (service: Service) => {
    setSelectedService(service);
    setBookingModalOpen(true);
  };

  // Get photos for gallery
  const getPhotos = () => {
    const photos: string[] = [];
    
    if (provider?.cover_image_url) {
      photos.push(provider.cover_image_url);
    } else {
      photos.push(getServiceCoverImage(provider?.category?.slug));
    }
    
    if (provider?.logo_url) {
      photos.push(provider.logo_url);
    }
    
    const categoryImage = getServiceCoverImage(provider?.category?.slug);
    if (!photos.includes(categoryImage)) {
      photos.push(categoryImage);
    }
    
    return photos;
  };

  const photos = getPhotos();

  const nextPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev + 1) % photos.length);
  };

  const prevPhoto = () => {
    setCurrentPhotoIndex((prev) => (prev - 1 + photos.length) % photos.length);
  };

  // Calculate price range
  const priceRange = services.length > 0 
    ? {
        min: Math.min(...services.map(s => s.price_from || s.price)),
        max: Math.max(...services.map(s => s.price))
      }
    : null;

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({
        title: provider?.company_name,
        text: `Sprawdź tego usługodawcę: ${provider?.company_name}`,
        url: window.location.href,
      });
    } else {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link skopiowany do schowka");
    }
  };

  const handleFavorite = () => {
    setIsFavorited(!isFavorited);
    toast.success(isFavorited ? "Usunięto z ulubionych" : "Dodano do ulubionych");
  };

  const handleRevealContact = () => {
    if (!user) {
      setShowLoginDialog(true);
      return;
    }
    setShowContactPhone(true);
  };

  // Mask contact info for non-logged users
  const maskPhone = (phone: string) => {
    if (!phone) return '';
    return phone.slice(0, 3) + '-***-' + phone.slice(-3);
  };

  const maskEmail = (email: string) => {
    if (!email) return '';
    const [name, domain] = email.split('@');
    return name.charAt(0) + '***@***.' + domain?.split('.').pop();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Ładowanie...</div>
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">Nie znaleziono usługodawcy</h1>
        <Button onClick={() => navigate("/uslugi")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Wróć do listy
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      {/* Sticky Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate("/uslugi")} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Wróć do listy</span>
            </Button>
            <div className="hidden md:flex items-center gap-2 cursor-pointer" onClick={() => navigate("/easy")}>
              <img src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" alt="RIDO" className="h-8 w-8" />
              <span className="font-bold text-lg"><span className="text-primary">RIDO</span> Usługi</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleShare} className="gap-2">
              <Share2 className="h-4 w-4" />
              <span className="hidden sm:inline">Udostępnij</span>
            </Button>
            <Button
              variant={isFavorited ? "default" : "outline"}
              size="sm"
              onClick={handleFavorite}
              className={cn("gap-2", isFavorited && "bg-red-500 hover:bg-red-600 border-red-500")}
            >
              <Heart className={cn("h-4 w-4", isFavorited && "fill-white")} />
              <span className="hidden sm:inline">{isFavorited ? "Zapisano" : "Zapisz"}</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Photo Gallery */}
        <div className="relative bg-muted rounded-xl overflow-hidden aspect-[16/9] md:aspect-[21/9] mb-6">
          <img
            src={photos[currentPhotoIndex]}
            alt={provider.company_name}
            className="w-full h-full object-cover"
          />
          
          {/* Photo Navigation */}
          {photos.length > 1 && (
            <>
              <button
                onClick={prevPhoto}
                className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-3 rounded-full transition-colors"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                onClick={nextPhoto}
                className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-3 rounded-full transition-colors"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
            </>
          )}

          {/* Photo Indicators */}
          {photos.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
              {photos.map((_, idx) => (
                <button
                  key={idx}
                  onClick={() => setCurrentPhotoIndex(idx)}
                  className={cn(
                    "w-3 h-3 rounded-full transition-all",
                    idx === currentPhotoIndex 
                      ? "bg-white w-8" 
                      : "bg-white/50 hover:bg-white/70"
                  )}
                />
              ))}
            </div>
          )}

          {/* Category Badge */}
          {provider.category && (
            <Badge className="absolute top-4 left-4 bg-primary text-primary-foreground">
              {provider.category.name}
            </Badge>
          )}

          {/* Rating Badge */}
          {provider.rating_avg && provider.rating_avg > 0 && (
            <Badge className="absolute top-4 right-4 bg-yellow-500 text-white">
              <Star className="h-3 w-3 mr-1 fill-current" />
              {provider.rating_avg.toFixed(1)} ({provider.rating_count})
            </Badge>
          )}

          {/* Photo counter */}
          <div className="absolute bottom-4 right-4 bg-black/60 text-white px-3 py-1.5 rounded-lg text-sm">
            {currentPhotoIndex + 1} / {photos.length}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Provider Info */}
            <div>
              <div className="flex items-start gap-4 mb-4">
                {/* Logo */}
                {provider.logo_url ? (
                  <img
                    src={provider.logo_url}
                    alt={provider.company_name}
                    className="h-16 w-16 rounded-xl object-cover border-2 border-primary shrink-0"
                  />
                ) : (
                  <div className="h-16 w-16 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
                    <span className="text-2xl font-bold text-primary">
                      {provider.company_name?.charAt(0)}
                    </span>
                  </div>
                )}
                
                <div className="flex-1">
                  <h1 className="text-2xl md:text-3xl font-bold">{provider.company_name}</h1>
                  
                  {provider.company_city && (
                    <div className="flex items-center gap-2 mt-2 text-muted-foreground">
                      <MapPin className="h-5 w-5 text-primary" />
                      <span>{provider.company_city}</span>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Price Range */}
              {priceRange && (
                <div className="flex items-baseline gap-2 mb-4">
                  <span className="text-muted-foreground">Ceny od</span>
                  <span className="text-3xl md:text-4xl font-bold text-primary">
                    {priceRange.min} - {priceRange.max} zł
                  </span>
                </div>
              )}

              {/* Rating Summary */}
              {provider.rating_count > 0 && (
                <div className="flex items-center gap-3 mt-4">
                  <div className="flex items-center">
                    {[1, 2, 3, 4, 5].map(star => (
                      <Star 
                        key={star}
                        className={cn(
                          "h-5 w-5",
                          star <= Math.round(provider.rating_avg || 0)
                            ? "fill-yellow-400 text-yellow-400"
                            : "text-muted-foreground/30"
                        )}
                      />
                    ))}
                  </div>
                  <span className="font-semibold">{provider.rating_avg?.toFixed(1)}</span>
                  <span className="text-muted-foreground">({provider.rating_count} opinii)</span>
                </div>
              )}
            </div>

            <Separator />

            {/* Description */}
            <div>
              <h2 className="text-xl font-semibold mb-4">O firmie</h2>
              <div className="prose prose-sm max-w-none text-muted-foreground whitespace-pre-line">
                {provider.description || "Brak opisu"}
              </div>
            </div>

            <Separator />

            {/* Services List */}
            <div>
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                Oferta usług ({services.length})
              </h2>
              
              {services.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  Ten usługodawca nie ma jeszcze dodanych usług
                </p>
              ) : (
                <div className="space-y-3">
                  {services.map(service => (
                    <Card key={service.id} className="hover:border-primary/50 transition-all">
                      <CardContent className="p-4 flex items-center justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium">{service.name}</h4>
                          {service.description && (
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {service.description}
                            </p>
                          )}
                          <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-3.5 w-3.5" />
                              {service.duration_minutes} min
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-4 ml-4">
                          <div className="text-right">
                            {service.price_type === 'from' && service.price_from ? (
                              <span className="font-bold text-lg text-primary">od {service.price_from} zł</span>
                            ) : (
                              <span className="font-bold text-lg text-primary">{service.price} zł</span>
                            )}
                          </div>
                          <Button size="sm" onClick={() => handleBookService(service)}>
                            Zarezerwuj
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            <Separator />

            {/* Reviews */}
            <div>
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Star className="h-5 w-5 text-yellow-500" />
                Opinie klientów ({reviews.length})
              </h2>
              
              {reviews.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  Ten usługodawca nie ma jeszcze opinii
                </p>
              ) : (
                <div className="space-y-4">
                  {reviews.map(review => (
                    <Card key={review.id}>
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1">
                            {[1, 2, 3, 4, 5].map(star => (
                              <Star 
                                key={star}
                                className={cn(
                                  "h-4 w-4",
                                  star <= review.rating 
                                    ? "fill-yellow-400 text-yellow-400" 
                                    : "text-muted-foreground/30"
                                )}
                              />
                            ))}
                          </div>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(review.created_at).toLocaleDateString('pl-PL')}
                          </span>
                        </div>
                        
                        {review.comment && (
                          <p className="text-sm">{review.comment}</p>
                        )}
                        
                        {review.provider_response && (
                          <div className="mt-3 pl-4 border-l-2 border-primary/30 bg-accent/30 rounded-r-lg p-3">
                            <p className="text-xs font-medium text-primary mb-1">Odpowiedź usługodawcy:</p>
                            <p className="text-sm text-muted-foreground">{review.provider_response}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Contact Sidebar */}
          <div className="space-y-6">
            <div className="lg:sticky lg:top-24">
              <Card className="p-6 shadow-lg border-primary/20">
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                  <Phone className="h-5 w-5 text-primary" />
                  Kontakt
                </h3>

                {/* Phone */}
                {provider.company_phone && (
                  <div className="mb-3">
                    {showContactPhone || user ? (
                      <a 
                        href={`tel:${provider.company_phone}`} 
                        className="flex items-center gap-2 text-primary hover:underline font-medium"
                      >
                        <Phone className="h-4 w-4" />
                        {provider.company_phone}
                      </a>
                    ) : (
                      <Button onClick={handleRevealContact} className="w-full" size="lg">
                        <Phone className="h-4 w-4 mr-2" />
                        Pokaż numer telefonu
                      </Button>
                    )}
                  </div>
                )}

                {/* Email - only show when logged in */}
                {provider.company_email && (showContactPhone || user) && (
                  <a 
                    href={`mailto:${provider.company_email}`} 
                    className="flex items-center gap-2 text-primary hover:underline mb-4"
                  >
                    <Mail className="h-4 w-4" />
                    {provider.company_email}
                  </a>
                )}

                {/* Masked contact for non-logged users */}
                {!user && !showContactPhone && (
                  <div className="mb-4 p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2 text-muted-foreground mb-2">
                      <Phone className="h-4 w-4" />
                      <span className="font-mono">{maskPhone(provider.company_phone || '')}</span>
                    </div>
                    {provider.company_email && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="h-4 w-4" />
                        <span className="font-mono">{maskEmail(provider.company_email)}</span>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
                      <LogIn className="h-3 w-3" />
                      Zaloguj się, aby zobaczyć pełne dane
                    </p>
                  </div>
                )}

                {/* Address */}
                {provider.company_address && (showContactPhone || user) && (
                  <div className="flex items-start gap-2 text-sm text-muted-foreground mb-4">
                    <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{provider.company_address}, {provider.company_city}</span>
                  </div>
                )}

                {/* Website */}
                {provider.company_website && (showContactPhone || user) && (
                  <a 
                    href={provider.company_website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-primary hover:underline mb-4 text-sm"
                  >
                    <Globe className="h-4 w-4" />
                    <span className="truncate">{provider.company_website}</span>
                  </a>
                )}

                <Button variant="outline" className="w-full mt-2" size="lg">
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Napisz wiadomość
                </Button>

                {/* CTA */}
                {services.length > 0 && (
                  <Button 
                    className="w-full mt-3" 
                    size="lg"
                    onClick={() => handleBookService(services[0])}
                  >
                    Zarezerwuj wizytę
                  </Button>
                )}
              </Card>
            </div>
          </div>
        </div>
      </main>

      {/* Auth Modal for login */}
      <AuthModal
        open={showLoginDialog}
        onOpenChange={setShowLoginDialog}
        initialMode="login"
        customDescription="Zaloguj się, aby zobaczyć dane kontaktowe usługodawcy."
        onSuccess={() => {
          setShowLoginDialog(false);
          supabase.auth.getUser().then(({ data: { user } }) => {
            setUser(user);
            if (user) setShowContactPhone(true);
          });
        }}
      />

      {/* Booking Modal */}
      <ServiceBookingModal
        provider={provider}
        service={selectedService}
        open={bookingModalOpen}
        onOpenChange={setBookingModalOpen}
      />
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { 
  Star, MapPin, Phone, Mail, Globe, Clock, 
  ChevronLeft, ChevronRight, Heart, Share2, ArrowLeft,
  User, Calendar, CheckCircle2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ServiceBookingModal } from './ServiceBookingModal';
import { getServiceCoverImage } from './serviceCategoryImages';
import { cn } from '@/lib/utils';

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
  const [searchParams] = useSearchParams();
  
  const [provider, setProvider] = useState<ServiceProvider | null>(null);
  const [services, setServices] = useState<Service[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [isFavorited, setIsFavorited] = useState(false);

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

      // Load services
      const { data: servicesData } = await supabase
        .from('services')
        .select('*')
        .eq('provider_id', providerId)
        .eq('is_active', true)
        .order('sort_order');
      
      if (servicesData) setServices(servicesData);

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
    
    // Add cover image or category image
    if (provider?.cover_image_url) {
      photos.push(provider.cover_image_url);
    } else {
      photos.push(getServiceCoverImage(provider?.category?.slug));
    }
    
    // Add logo if exists
    if (provider?.logo_url) {
      photos.push(provider.logo_url);
    }
    
    // Add additional category images for gallery
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

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (!provider) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Nie znaleziono usługodawcy</p>
        <Button onClick={() => navigate('/uslugi')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Wróć do usług
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b sticky top-0 z-40">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate(-1)}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Wróć
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setIsFavorited(!isFavorited)}>
              <Heart className={cn("h-4 w-4", isFavorited && "fill-red-500 text-red-500")} />
            </Button>
            <Button variant="outline" size="icon">
              <Share2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column - Photos & Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Photo Gallery */}
            <div className="relative bg-muted rounded-xl overflow-hidden aspect-[16/9]">
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
                    className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    onClick={nextPhoto}
                    className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-2 rounded-full"
                  >
                    <ChevronRight className="h-5 w-5" />
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
                        "w-2.5 h-2.5 rounded-full transition-all",
                        idx === currentPhotoIndex 
                          ? "bg-white w-6" 
                          : "bg-white/50 hover:bg-white/70"
                      )}
                    />
                  ))}
                </div>
              )}

              {/* Category Badge */}
              {provider.category && (
                <Badge className="absolute top-4 left-4 bg-primary">
                  {provider.category.name}
                </Badge>
              )}

              {/* Rating Badge */}
              {provider.rating_avg && provider.rating_avg > 0 && (
                <div className="absolute top-4 right-4 bg-black/60 text-white px-3 py-1.5 rounded-lg flex items-center gap-1.5">
                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                  <span className="font-semibold">{provider.rating_avg.toFixed(1)}</span>
                  <span className="text-white/70 text-sm">({provider.rating_count})</span>
                </div>
              )}
            </div>

            {/* Provider Info */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-start gap-4">
                  {/* Logo */}
                  {provider.logo_url ? (
                    <img
                      src={provider.logo_url}
                      alt={provider.company_name}
                      className="h-16 w-16 rounded-xl object-cover border-2 border-primary"
                    />
                  ) : (
                    <div className="h-16 w-16 rounded-xl bg-primary/20 flex items-center justify-center">
                      <span className="text-2xl font-bold text-primary">
                        {provider.company_name?.charAt(0)}
                      </span>
                    </div>
                  )}
                  
                  <div className="flex-1">
                    <h1 className="text-2xl font-bold">{provider.company_name}</h1>
                    
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-muted-foreground">
                      {provider.company_city && (
                        <div className="flex items-center gap-1">
                          <MapPin className="h-4 w-4" />
                          <span>{provider.company_city}</span>
                        </div>
                      )}
                      {provider.rating_count > 0 && (
                        <div className="flex items-center gap-1">
                          <User className="h-4 w-4" />
                          <span>{provider.rating_count} opinii</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Description */}
                {provider.description && (
                  <div className="mt-6">
                    <h3 className="font-semibold mb-2">O firmie</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      {provider.description}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Services List */}
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  Oferta usług ({services.length})
                </h3>
                
                {services.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">
                    Ten usługodawca nie ma jeszcze dodanych usług
                  </p>
                ) : (
                  <div className="space-y-3">
                    {services.map(service => (
                      <div 
                        key={service.id} 
                        className="flex items-center justify-between p-4 rounded-lg border hover:border-primary/50 hover:bg-accent/50 transition-all"
                      >
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
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Reviews */}
            <Card>
              <CardContent className="p-6">
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                  <Star className="h-5 w-5 text-yellow-500" />
                  Opinie klientów ({reviews.length})
                </h3>
                
                {reviews.length === 0 ? (
                  <p className="text-center py-8 text-muted-foreground">
                    Ten usługodawca nie ma jeszcze opinii
                  </p>
                ) : (
                  <div className="space-y-4">
                    {reviews.map(review => (
                      <div key={review.id} className="border-b last:border-0 pb-4 last:pb-0">
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
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Sidebar */}
          <div className="space-y-4">
            {/* Price Card */}
            <Card className="sticky top-20">
              <CardContent className="p-6">
                {/* Price Range */}
                <div className="mb-4">
                  <span className="text-muted-foreground text-sm">Zakres cen</span>
                  {priceRange ? (
                    <div className="text-2xl font-bold text-primary">
                      {priceRange.min} - {priceRange.max} zł
                    </div>
                  ) : (
                    <div className="text-lg font-medium text-muted-foreground">
                      Zapytaj o cenę
                    </div>
                  )}
                </div>

                {/* Rating Summary */}
                <div className="flex items-center gap-2 mb-4 pb-4 border-b">
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
                  <span className="font-medium">
                    {provider.rating_avg?.toFixed(1) || '—'}
                  </span>
                  <span className="text-muted-foreground">
                    ({provider.rating_count} opinii)
                  </span>
                </div>

                {/* Contact Info */}
                <div className="space-y-3 mb-6">
                  <h4 className="font-medium">Kontakt</h4>
                  
                  {provider.company_phone && (
                    <a 
                      href={`tel:${provider.company_phone}`}
                      className="flex items-center gap-3 p-3 rounded-lg bg-accent hover:bg-accent/80 transition-colors"
                    >
                      <Phone className="h-5 w-5 text-primary" />
                      <span className="font-medium">{provider.company_phone}</span>
                    </a>
                  )}
                  
                  {provider.company_email && (
                    <a 
                      href={`mailto:${provider.company_email}`}
                      className="flex items-center gap-3 p-3 rounded-lg bg-accent hover:bg-accent/80 transition-colors"
                    >
                      <Mail className="h-5 w-5 text-primary" />
                      <span className="text-sm">{provider.company_email}</span>
                    </a>
                  )}

                  {provider.company_address && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-accent">
                      <MapPin className="h-5 w-5 text-primary" />
                      <span className="text-sm">
                        {provider.company_address}, {provider.company_city}
                      </span>
                    </div>
                  )}

                  {provider.company_website && (
                    <a 
                      href={provider.company_website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-lg bg-accent hover:bg-accent/80 transition-colors"
                    >
                      <Globe className="h-5 w-5 text-primary" />
                      <span className="text-sm truncate">{provider.company_website}</span>
                    </a>
                  )}
                </div>

                {/* CTA Button */}
                {services.length > 0 && (
                  <Button 
                    className="w-full" 
                    size="lg"
                    onClick={() => handleBookService(services[0])}
                  >
                    Zarezerwuj wizytę
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

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

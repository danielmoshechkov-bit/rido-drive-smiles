import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Star, MapPin, Phone, Mail, Globe, Clock, ChevronRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { ServiceBookingModal } from './ServiceBookingModal';

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
  category?: { name: string };
}

interface ServiceProviderDetailModalProps {
  provider: ServiceProvider | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ServiceProviderDetailModal({ provider, open, onOpenChange }: ServiceProviderDetailModalProps) {
  const [services, setServices] = useState<Service[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);

  useEffect(() => {
    if (provider && open) {
      loadProviderDetails();
    }
  }, [provider, open]);

  const loadProviderDetails = async () => {
    if (!provider) return;
    
    setLoading(true);
    try {
      // Load services from provider_services (where providers save their services)
      const { data: providerServices } = await (supabase as any)
        .from('provider_services')
        .select('*')
        .eq('provider_id', provider.id)
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      
      // Also check legacy services table
      const { data: legacyServices } = await supabase
        .from('services')
        .select('*')
        .eq('provider_id', provider.id)
        .eq('is_active', true)
        .order('sort_order');
      
      const allServices = [
        ...(providerServices || []).map((s: any) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          price: s.price_from,
          price_to: s.price_to,
          category: s.category,
          photos: s.photos || [],
          is_active: true,
        })),
        ...(legacyServices || []),
      ];
      
      if (allServices.length > 0) setServices(allServices);

      // Load reviews
      const { data: reviewsData } = await supabase
        .from('service_reviews')
        .select('*')
        .eq('provider_id', provider.id)
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

  if (!provider) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center gap-4">
              {provider.logo_url ? (
                <img
                  src={provider.logo_url}
                  alt={provider.company_name}
                  className="h-16 w-16 rounded-full object-cover border-2 border-primary"
                />
              ) : (
                <div className="h-16 w-16 rounded-full bg-primary/20 flex items-center justify-center">
                  <span className="text-2xl font-bold text-primary">
                    {provider.company_name?.charAt(0)}
                  </span>
                </div>
              )}
              
              <div className="flex-1">
                <DialogTitle className="text-xl">{provider.company_name}</DialogTitle>
                
                <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
                  {provider.category && (
                    <Badge variant="secondary">{provider.category.name}</Badge>
                  )}
                  
                  {provider.rating_avg && provider.rating_avg > 0 && (
                    <div className="flex items-center">
                      <Star className="h-4 w-4 fill-yellow-400 text-yellow-400 mr-1" />
                      <span className="font-medium text-foreground">{provider.rating_avg.toFixed(1)}</span>
                      <span className="ml-1">({provider.rating_count} opinii)</span>
                    </div>
                  )}
                  
                  {provider.company_city && (
                    <div className="flex items-center">
                      <MapPin className="h-4 w-4 mr-1" />
                      {provider.company_city}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </DialogHeader>

          <Tabs defaultValue="services" className="mt-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="services">Usługi ({services.length})</TabsTrigger>
              <TabsTrigger value="info">Informacje</TabsTrigger>
              <TabsTrigger value="reviews">Opinie ({reviews.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="services" className="mt-4 space-y-3">
              {services.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  Ten usługodawca nie ma jeszcze dodanych usług
                </p>
              ) : (
                services.map(service => (
                  <Card key={service.id} className="hover:border-primary/50 transition-colors">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium">{service.name}</h4>
                        {service.description && (
                          <p className="text-sm text-muted-foreground line-clamp-1">
                            {service.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                          <span className="flex items-center">
                            <Clock className="h-3.5 w-3.5 mr-1" />
                            {service.duration_minutes} min
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          {service.price_type === 'from' && service.price_from ? (
                            <span className="font-bold text-primary">od {service.price_from} zł</span>
                          ) : (
                            <span className="font-bold text-primary">{service.price} zł</span>
                          )}
                        </div>
                        <Button size="sm" onClick={() => handleBookService(service)}>
                          Zarezerwuj
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="info" className="mt-4 space-y-4">
              {provider.description && (
                <div>
                  <h4 className="font-medium mb-2">O nas</h4>
                  <p className="text-muted-foreground">{provider.description}</p>
                </div>
              )}
              
              <div>
                <h4 className="font-medium mb-2">Kontakt</h4>
                <div className="space-y-2 text-sm">
                  {provider.company_address && (
                    <div className="flex items-center text-muted-foreground">
                      <MapPin className="h-4 w-4 mr-2" />
                      {provider.company_address}, {provider.company_city}
                    </div>
                  )}
                  {provider.company_phone && (
                    <div className="flex items-center text-muted-foreground">
                      <Phone className="h-4 w-4 mr-2" />
                      <a href={`tel:${provider.company_phone}`} className="hover:text-primary">
                        {provider.company_phone}
                      </a>
                    </div>
                  )}
                  {provider.company_email && (
                    <div className="flex items-center text-muted-foreground">
                      <Mail className="h-4 w-4 mr-2" />
                      <a href={`mailto:${provider.company_email}`} className="hover:text-primary">
                        {provider.company_email}
                      </a>
                    </div>
                  )}
                  {provider.company_website && (
                    <div className="flex items-center text-muted-foreground">
                      <Globe className="h-4 w-4 mr-2" />
                      <a 
                        href={provider.company_website} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="hover:text-primary"
                      >
                        {provider.company_website}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="reviews" className="mt-4 space-y-4">
              {reviews.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  Ten usługodawca nie ma jeszcze opinii
                </p>
              ) : (
                reviews.map(review => (
                  <Card key={review.id}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center">
                          {[1, 2, 3, 4, 5].map(star => (
                            <Star 
                              key={star}
                              className={`h-4 w-4 ${
                                star <= review.rating 
                                  ? 'fill-yellow-400 text-yellow-400' 
                                  : 'text-muted-foreground/30'
                              }`}
                            />
                          ))}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {new Date(review.created_at).toLocaleDateString('pl-PL')}
                        </span>
                      </div>
                      
                      {review.comment && (
                        <p className="text-sm">{review.comment}</p>
                      )}
                      
                      {review.provider_response && (
                        <div className="mt-3 pl-4 border-l-2 border-primary/30">
                          <p className="text-xs font-medium text-primary mb-1">Odpowiedź usługodawcy:</p>
                          <p className="text-sm text-muted-foreground">{review.provider_response}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Booking Modal */}
      <ServiceBookingModal
        provider={provider}
        service={selectedService}
        open={bookingModalOpen}
        onOpenChange={setBookingModalOpen}
      />
    </>
  );
}

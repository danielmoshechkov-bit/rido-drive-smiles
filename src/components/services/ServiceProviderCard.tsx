import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Star, MapPin, Clock } from 'lucide-react';

interface Service {
  id: string;
  name: string;
  price: number;
  price_type: string;
}

interface ServiceProvider {
  id: string;
  company_name: string;
  company_city: string;
  description: string;
  logo_url: string | null;
  cover_image_url: string | null;
  rating_avg: number | null;
  rating_count: number;
  category?: { name: string; icon: string };
  services?: Service[];
}

interface ServiceProviderCardProps {
  provider: ServiceProvider;
  onClick: () => void;
}

export function ServiceProviderCard({ provider, onClick }: ServiceProviderCardProps) {
  const minPrice = provider.services?.length
    ? Math.min(...provider.services.map(s => s.price || 0))
    : null;

  return (
    <Card
      className="group overflow-hidden cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border-0 shadow-md rounded-2xl"
      onClick={onClick}
    >
      {/* Cover Image */}
      <div className="relative h-44 bg-gradient-to-br from-primary/20 to-primary/5 overflow-hidden">
        {provider.cover_image_url ? (
          <img
            src={provider.cover_image_url}
            alt={provider.company_name}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
          />
        ) : provider.logo_url ? (
          <div className="w-full h-full flex items-center justify-center">
            <img
              src={provider.logo_url}
              alt={provider.company_name}
              className="h-20 w-20 object-contain rounded-full border-4 border-background shadow-lg"
            />
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="h-20 w-20 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-3xl font-extrabold text-primary">
                {provider.company_name?.charAt(0) || '?'}
              </span>
            </div>
          </div>
        )}

        {/* Category Badge */}
        {provider.category && (
          <Badge className="absolute top-3 left-3 bg-white/95 text-primary font-bold shadow-md hover:bg-white">
            {provider.category.name}
          </Badge>
        )}

        {/* Rating Badge */}
        {provider.rating_avg && provider.rating_avg > 0 && (
          <Badge className="absolute top-3 right-3 bg-yellow-500 text-white font-bold shadow-md">
            <Star className="h-3 w-3 mr-1 fill-current" />
            {provider.rating_avg.toFixed(1)}
          </Badge>
        )}
      </div>

      <CardContent className="p-4 bg-white">
        {/* Company Name — matches EasyHub tile style */}
        <h3 className="font-extrabold text-lg text-primary mb-1 line-clamp-1 group-hover:text-primary/80 transition-colors">
          {provider.company_name}
        </h3>

        {/* Location */}
        {provider.company_city && (
          <div className="flex items-center text-sm text-slate-700 font-semibold mb-2">
            <MapPin className="h-3.5 w-3.5 mr-1 text-primary" />
            {provider.company_city}
          </div>
        )}

        {/* Description */}
        {provider.description && (
          <p className="text-sm text-slate-700 font-semibold line-clamp-2 mb-3">
            {provider.description}
          </p>
        )}

        {/* Services Preview */}
        {provider.services && provider.services.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {provider.services.slice(0, 3).map(service => (
              <Badge key={service.id} variant="secondary" className="text-xs font-semibold">
                {service.name}
              </Badge>
            ))}
            {provider.services.length > 3 && (
              <Badge variant="outline" className="text-xs font-semibold">
                +{provider.services.length - 3}
              </Badge>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <div className="flex items-center text-sm text-slate-600 font-semibold">
            <Clock className="h-3.5 w-3.5 mr-1" />
            <span>{provider.rating_count || 0} opinii</span>
          </div>

          {minPrice !== null && minPrice > 0 && (
            <div className="text-right">
              <span className="text-xs text-slate-600 font-semibold">od </span>
              <span className="font-extrabold text-lg text-primary">{minPrice}&nbsp;zł</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

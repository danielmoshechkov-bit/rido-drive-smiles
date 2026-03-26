import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AuthModal } from "@/components/auth/AuthModal";
import { 
  ArrowLeft, Heart, Share2, Home, MapPin, Calendar, Layers, Maximize, 
  Phone, Mail, User, Building2, Eye, GitCompare, MessageCircle,
  CheckCircle, AlertTriangle, Sparkles, LogIn
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PropertyPhotoGallery } from "@/components/realestate/PropertyPhotoGallery";
import { PropertySpecsTable } from "@/components/realestate/PropertySpecsTable";
import { PropertyLocationMap } from "@/components/realestate/PropertyLocationMap";
import { AIListingAssessment } from "@/components/realestate/AIListingAssessment";
import { SimilarListings } from "@/components/realestate/SimilarListings";
import { AdBannerSlot } from "@/components/realestate/AdBannerSlot";

const PRICE_TYPE_LABELS: Record<string, string> = {
  sale: "",
  rent_monthly: "/ miesiąc",
  rent_daily: "/ dzień",
};

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  mieszkanie: "Mieszkanie",
  kawalerka: "Kawalerka",
  dom: "Dom",
  dzialka: "Działka",
  lokal: "Lokal użytkowy",
  pokoj: "Pokój",
  inwestycja: "Inwestycja",
};

// Map DB listing to display format
function mapDbToDisplayListing(db: any) {
  const transTypeMap: Record<string, { label: string; color: string }> = {
    sprzedaz: { label: "Na sprzedaż", color: "#10b981" },
    wynajem: { label: "Wynajem", color: "#3b82f6" },
  };
  const trans = transTypeMap[db.transaction_type || ''] || { label: db.transaction_type, color: "#6b7280" };
  
  // Try to extract real area from description if DB area seems wrong
  const dbArea = Number(db.area) || 0;
  let correctedArea = dbArea;
  if (db.description) {
    const matches = [...db.description.matchAll(/(\d[\d\s]*\d)\s*m(?:2|²)/gi)];
    const simpleMatches = [...db.description.matchAll(/(\d{2,})\s*m(?:2|²)/gi)];
    const allMatches = [...matches, ...simpleMatches];
    if (allMatches.length > 0) {
      const descAreas = allMatches
        .map(m => Number(m[1].replace(/\s/g, '')))
        .filter(n => n >= 10 && n < 100000);
      if (descAreas.length > 0) {
        const maxDescArea = Math.max(...descAreas);
        if (dbArea < 10 || (maxDescArea > dbArea * 3 && maxDescArea >= 50)) {
          correctedArea = maxDescArea;
        }
      }
    }
  }

  return {
    id: db.id,
    title: db.title,
    description: db.description,
    price: Number(db.price) || 0,
    priceType: db.price_type || 'sale',
    photos: db.photos || [],
    location: db.city || db.location || '',
    district: db.district,
    address: db.address,
    buildYear: db.build_year,
    areaM2: correctedArea,
    rooms: db.rooms,
    floor: db.floor,
    floorsTotal: db.total_floors,
    propertyType: db.property_type,
    transactionType: trans.label,
    transactionColor: trans.color,
    hasBalcony: db.has_balcony,
    hasElevator: db.has_elevator,
    hasParking: db.has_parking,
    hasGarden: db.has_garden,
    agencyName: db.real_estate_agents?.company_name,
    contactName: db.contact_person,
    contactPhone: db.contact_phone,
    contactEmail: db.contact_email,
    listingNumber: db.listing_number,
    latitude: db.latitude ? Number(db.latitude) : undefined,
    longitude: db.longitude ? Number(db.longitude) : undefined,
    viewCount: db.views || 0,
    favoriteCount: db.favorites_count || 0,
    compareCount: db.comparison_count || 0,
    contactRevealCount: db.contact_reveals_count || 0,
    amenities: [
      db.has_balcony && "Balkon",
      db.has_elevator && "Winda",
      db.has_parking && "Parking",
      db.has_garden && "Ogród",
    ].filter(Boolean),
  };
}

export default function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [listing, setListing] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isFavorited, setIsFavorited] = useState(false);
  const [showContactPhone, setShowContactPhone] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [showLoginDialog, setShowLoginDialog] = useState(false);

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
    const fetchListing = async () => {
      if (!id) return;
      
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('real_estate_listings')
          .select(`
            *,
            real_estate_agents!agent_id(company_name)
          `)
          .eq('id', id)
          .single();

        if (error) {
          console.error('Error fetching listing:', error);
          setListing(null);
        } else if (data) {
          setListing(mapDbToDisplayListing(data));
          // Track view interaction
          trackInteraction("view");
        }
      } catch (err) {
        console.error('Exception fetching listing:', err);
        setListing(null);
      } finally {
        setLoading(false);
      }
    };
    
    fetchListing();
  }, [id]);

  const trackInteraction = async (type: "view" | "favorite" | "compare" | "contact_reveal" | "contact_reveal_detail_page") => {
    try {
      await supabase.functions.invoke("track-listing-interaction", {
        body: { listingId: id, interactionType: type }
      });
    } catch (error) {
      console.error("Failed to track interaction:", error);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({
        title: listing?.title,
        text: `Sprawdź tę nieruchomość: ${listing?.title}`,
        url: window.location.href,
      });
    } else {
      await navigator.clipboard.writeText(window.location.href);
      // TODO: Show toast
    }
  };

  const handleFavorite = () => {
    if (!isFavorited) {
      trackInteraction("favorite");
    }
    setIsFavorited(!isFavorited);
  };

  const handleRevealContact = () => {
    if (!user) {
      setShowLoginDialog(true);
      return;
    }
    
    if (!showContactPhone) {
      trackInteraction("contact_reveal_detail_page");
    }
    setShowContactPhone(true);
  };

  const pricePerM2 = listing?.areaM2 && listing?.price 
    ? Math.round(listing.price / listing.areaM2) 
    : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Ładowanie...</div>
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">Nie znaleziono ogłoszenia</h1>
         <Button onClick={() => navigate(-1)}>
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
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(-1)}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Wróć do listy</span>
            </Button>
            <div 
              className="hidden md:flex items-center gap-2 cursor-pointer"
              onClick={() => navigate("/easy")}
            >
              <img 
                src="/lovable-uploads/253e522c-702e-4ce9-9429-10ddbde63878.png" 
                alt="RIDO" 
                className="h-8 w-8"
              />
              <span className="font-bold text-lg">
                <span className="text-primary">RIDO</span> Nieruchomości
              </span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleShare}
              className="gap-2"
            >
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
        <PropertyPhotoGallery photos={listing.photos || []} title={listing.title} />

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          {/* Left Column - Property Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Title & Price */}
            <div>
              <div className="flex items-start justify-between gap-4 mb-2">
                <h1 className="text-2xl md:text-3xl font-bold">{listing.title}</h1>
                {listing.transactionType && (
                  <Badge 
                    style={{ backgroundColor: listing.transactionColor || '#10b981' }}
                    className="text-white shrink-0"
                  >
                    {listing.transactionType}
                  </Badge>
                )}
              </div>
              
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-3xl md:text-4xl font-bold text-primary">
                  {listing.price?.toLocaleString('pl-PL')} zł
                </span>
                <span className="text-lg text-muted-foreground">
                  {PRICE_TYPE_LABELS[listing.priceType || 'sale'] || ''}
                </span>
              </div>
              
              {pricePerM2 && (
                <p className="text-muted-foreground">
                  {pricePerM2.toLocaleString('pl-PL')} zł/m²
                </p>
              )}

              {/* Location */}
              <div className="flex items-center gap-2 mt-4 text-muted-foreground">
                <MapPin className="h-5 w-5 text-primary" />
                <span>
                  {listing.address && `${listing.address}, `}
                  {listing.district && `${listing.district}, `}
                  {listing.location}
                </span>
              </div>
            </div>

            <Separator />

            {/* Property Specs */}
            <PropertySpecsTable listing={listing} />

            <Separator />

            {/* Description */}
            <div>
              <h2 className="text-xl font-semibold mb-4">Opis</h2>
              <div className="prose prose-sm max-w-none text-foreground/80 whitespace-pre-line leading-relaxed">
                {listing.description || "Brak opisu"}
              </div>
            </div>

            {/* Amenities */}
            {listing.amenities?.length > 0 && (
              <>
                <Separator />
                <div>
                  <h2 className="text-xl font-semibold mb-4">Udogodnienia</h2>
                  <div className="flex flex-wrap gap-2">
                    {listing.amenities.map((amenity: string) => (
                      <Badge key={amenity} variant="secondary" className="px-3 py-1">
                        <CheckCircle className="h-3.5 w-3.5 mr-1.5 text-green-500" />
                        {amenity}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            <Separator />

            {/* Location Map */}
            <PropertyLocationMap 
              latitude={listing.latitude} 
              longitude={listing.longitude}
              address={`${listing.address || ''} ${listing.district || ''} ${listing.location || ''}`}
              hasStreetAddress={!!listing.address && listing.address.trim().length > 0}
            />

            {/* Ad Banner - pod mapą na pełną szerokość */}
            <div className="mt-4">
              <AdBannerSlot placement="property_detail_map" />
            </div>
          </div>

          {/* Right Column - Contact & AI Assessment */}
          <div className="space-y-6">
            {/* Contact Card - Sticky on desktop */}
            <div className="lg:sticky lg:top-24">
              <Card className="p-6 shadow-lg border-primary/20">
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                  <Phone className="h-5 w-5 text-primary" />
                  Kontakt
                </h3>
                
                {listing.agencyName && (
                  <div className="flex items-center gap-3 mb-4 pb-4 border-b">
                    <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Building2 className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{listing.agencyName}</p>
                      <p className="text-sm text-muted-foreground">Agencja nieruchomości</p>
                    </div>
                  </div>
                )}

                {listing.contactName && (
                  <div className="flex items-center gap-2 mb-3">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{listing.contactName}</span>
                  </div>
                )}

                {listing.contactPhone && (
                  <div className="mb-3">
                    {showContactPhone ? (
                      <a 
                        href={`tel:${listing.contactPhone}`}
                        className="flex items-center gap-2 text-primary hover:underline font-medium"
                      >
                        <Phone className="h-4 w-4" />
                        {listing.contactPhone}
                      </a>
                    ) : (
                      <Button 
                        onClick={handleRevealContact}
                        className="w-full"
                        size="lg"
                      >
                        <Phone className="h-4 w-4 mr-2" />
                        Pokaż numer telefonu
                      </Button>
                    )}
                  </div>
                )}

                {listing.contactEmail && showContactPhone && (
                  <a 
                    href={`mailto:${listing.contactEmail}`}
                    className="flex items-center gap-2 text-primary hover:underline mb-4"
                  >
                    <Mail className="h-4 w-4" />
                    {listing.contactEmail}
                  </a>
                )}

                <Button 
                  variant="outline" 
                  className="w-full mt-2"
                  size="lg"
                >
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Napisz wiadomość
                </Button>

                {listing.listingNumber && (
                  <p className="text-xs text-muted-foreground mt-4 text-center">
                    Nr oferty: <span className="font-mono">{listing.listingNumber}</span>
                  </p>
                )}
              </Card>

              {/* AI Assessment */}
              <div className="mt-6">
                <AIListingAssessment listing={listing} />
              </div>

            </div>
          </div>
        </div>

        {/* Similar Listings */}
        <SimilarListings 
          currentListingId={listing.id}
          propertyType={listing.propertyType}
          location={listing.location}
        />
      </main>

      {/* Footer */}
      <footer className="border-t py-8 bg-card mt-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div 
              className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => navigate('/easy')}
            >
              <img 
                src="/lovable-uploads/253e522c-702e-4ce9-9429-10ddbde63878.png" 
                alt="RIDO" 
                className="h-8 w-8"
              />
              <span className="font-semibold">RIDO Nieruchomości</span>
            </div>
            <a 
              href="/nieruchomosci" 
              className="text-sm text-primary hover:underline"
            >
              ← Wróć do wszystkich ogłoszeń
            </a>
            <p className="text-muted-foreground text-sm">
              © 2025 get RIDO. Wszystkie prawa zastrzeżone.
            </p>
          </div>
        </div>
      </footer>

      {/* Auth Modal for login */}
      <AuthModal
        open={showLoginDialog}
        onOpenChange={setShowLoginDialog}
        initialMode="login"
        customDescription="Zaloguj się, aby zobaczyć dane kontaktowe. Pozwala to agencjom śledzić zainteresowanie ofertami."
        onSuccess={() => {
          setShowLoginDialog(false);
          // Refresh user state
          supabase.auth.getUser().then(({ data: { user } }) => {
            setUser(user);
            if (user) setShowContactPhone(true);
          });
        }}
      />
    </div>
  );
}

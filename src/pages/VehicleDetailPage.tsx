import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AuthModal } from "@/components/auth/AuthModal";
import { 
  ArrowLeft, Heart, Share2, Home, MapPin, 
  Phone, Mail, User, Building2, MessageCircle, LogIn,
  ShieldCheck, FileCheck, Key
} from "lucide-react";
import { cn } from "@/lib/utils";
import { VehiclePhotoGallery } from "@/components/vehicles/VehiclePhotoGallery";
import { VehicleSpecsTable } from "@/components/vehicles/VehicleSpecsTable";
import { AIVehicleAssessment } from "@/components/vehicles/AIVehicleAssessment";
import { SimilarVehicles } from "@/components/vehicles/SimilarVehicles";
import { AdBannerSlot } from "@/components/realestate/AdBannerSlot";
import { toast } from "sonner";

const PRICE_TYPE_LABELS: Record<string, string> = {
  sale: "",
  weekly: "/ tydzień",
  monthly: "/ miesiąc",
  daily: "/ dzień",
};

function mapDbToDisplayListing(db: any) {
  const transTypeMap: Record<string, { label: string; color: string }> = {
    sprzedaz: { label: "Na sprzedaż", color: "#10b981" },
    wynajem: { label: "Wynajem", color: "#3b82f6" },
    "wynajem-krotkoterminowy": { label: "Krótkoterminowy", color: "#8b5cf6" },
  };
  const trans = transTypeMap[db.transaction_type || ''] || { label: db.transaction_type, color: "#6b7280" };
  
  return {
    id: db.id,
    title: db.title,
    description: db.description_long,
    price: Number(db.price) || 0,
    priceType: db.price_type || 'sale',
    photos: db.photos || [],
    location: db.city || db.location || '',
    brand: db.brand,
    model: db.model,
    year: db.year,
    fuelType: db.fuel_type,
    odometer: db.odometer,
    engineCapacity: db.engine_capacity,
    power: db.power,
    bodyType: db.body_type,
    color: db.color,
    transmission: db.transmission,
    transactionType: trans.label,
    transactionColor: trans.color,
    contactPhone: db.contact_phone,
    contactEmail: db.contact_email,
    listingNumber: db.listing_number,
    latitude: db.latitude ? Number(db.latitude) : undefined,
    longitude: db.longitude ? Number(db.longitude) : undefined,
    // Verification and VIN fields
    vin: db.vin,
    vinRevealsCount: db.vin_reveals_count || 0,
    isVerified: db.is_verified,
    insuranceValid: db.insurance_valid,
    inspectionValid: db.inspection_valid,
    equipment: db.equipment,
  };
}

export default function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [listing, setListing] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isFavorited, setIsFavorited] = useState(false);
  const [showContactPhone, setShowContactPhone] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [showLoginDialog, setShowLoginDialog] = useState(false);
  const [showVin, setShowVin] = useState(false);

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
          .from('vehicle_listings')
          .select('*')
          .eq('id', id)
          .single();

        if (error) {
          console.error('Error fetching listing:', error);
          setListing(null);
        } else if (data) {
          setListing(mapDbToDisplayListing(data));
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

  const trackInteraction = async (type: string) => {
    // Track interaction - table exists but types not regenerated yet
    console.log("Tracking vehicle interaction:", type, "for listing:", id);
  };

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({
        title: listing?.title,
        text: `Sprawdź ten pojazd: ${listing?.title}`,
        url: window.location.href,
      });
    } else {
      await navigator.clipboard.writeText(window.location.href);
    }
  };

  const handleFavorite = () => {
    if (!isFavorited) trackInteraction("favorite");
    setIsFavorited(!isFavorited);
  };

  const handleRevealContact = () => {
    if (!user) {
      setShowLoginDialog(true);
      return;
    }
    if (!showContactPhone) trackInteraction("contact_reveal");
    setShowContactPhone(true);
  };

  const handleShowVin = async () => {
    if (!user) {
      setShowLoginDialog(true);
      return;
    }
    
    // Increment VIN reveals counter
    const { error } = await supabase
      .from('vehicle_listings')
      .update({ vin_reveals_count: (listing?.vinRevealsCount || 0) + 1 })
      .eq('id', listing?.id);
    
    if (!error) {
      setShowVin(true);
      toast.success("VIN został odkryty");
    }
  };

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
        <Button onClick={() => navigate("/gielda")}>
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
            <Button variant="ghost" size="sm" onClick={() => navigate("/gielda")} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Wróć do listy</span>
            </Button>
            <div className="hidden md:flex items-center gap-2 cursor-pointer" onClick={() => navigate("/easy")}>
              <img src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" alt="RIDO" className="h-8 w-8" />
              <span className="font-bold text-lg"><span className="text-primary">RIDO</span> Giełda</span>
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
        <VehiclePhotoGallery photos={listing.photos || []} title={listing.title} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          <div className="lg:col-span-2 space-y-6">
            <div>
              <div className="flex items-start justify-between gap-4 mb-2">
                <h1 className="text-2xl md:text-3xl font-bold">{listing.title}</h1>
                {listing.transactionType && (
                  <Badge style={{ backgroundColor: listing.transactionColor }} className="text-white shrink-0">
                    {listing.transactionType}
                  </Badge>
                )}
              </div>
              
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-3xl md:text-4xl font-bold text-primary">
                  {listing.price?.toLocaleString('pl-PL')} zł
                </span>
                <span className="text-lg text-muted-foreground">
                  {PRICE_TYPE_LABELS[listing.priceType || 'sale']}
                </span>
              </div>

              {listing.location && (
                <div className="flex items-center gap-2 mt-4 text-muted-foreground">
                  <MapPin className="h-5 w-5 text-primary" />
                  <span>{listing.location}</span>
                </div>
              )}

              {/* Verification badges */}
              <div className="flex gap-2 flex-wrap mt-4">
                {listing.isVerified && (
                  <Badge className="bg-green-500 hover:bg-green-600 text-white gap-1">
                    <ShieldCheck className="h-3 w-3" />
                    Dane zweryfikowane
                  </Badge>
                )}
                {listing.insuranceValid && (
                  <Badge className="bg-blue-500 hover:bg-blue-600 text-white gap-1">
                    <FileCheck className="h-3 w-3" />
                    Ważna polisa
                  </Badge>
                )}
                {listing.inspectionValid && (
                  <Badge className="bg-blue-500 hover:bg-blue-600 text-white gap-1">
                    <FileCheck className="h-3 w-3" />
                    Przegląd OK
                  </Badge>
                )}
              </div>

              {/* VIN reveal */}
              {listing.vin && (
                <div className="flex items-center gap-3 mt-4 p-3 bg-muted/50 rounded-lg">
                  <Key className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">VIN:</span>
                  {showVin ? (
                    <span className="font-mono text-sm font-medium">{listing.vin}</span>
                  ) : (
                    <Button variant="outline" size="sm" onClick={handleShowVin}>
                      Pokaż VIN
                    </Button>
                  )}
                </div>
              )}
            </div>

            <Separator />
            <VehicleSpecsTable listing={listing} />
            <Separator />

            <div>
              <h2 className="text-xl font-semibold mb-4">Opis</h2>
              <div className="prose prose-sm max-w-none text-muted-foreground whitespace-pre-line">
                {listing.description || "Brak opisu"}
              </div>
            </div>

            {/* Ad slot placeholder - AdBannerSlot will be added later */}
          </div>

          <div className="space-y-6">
            <div className="lg:sticky lg:top-24">
              <Card className="p-6 shadow-lg border-primary/20">
                <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                  <Phone className="h-5 w-5 text-primary" />
                  Kontakt
                </h3>

                {listing.contactPhone && (
                  <div className="mb-3">
                    {showContactPhone ? (
                      <a href={`tel:${listing.contactPhone}`} className="flex items-center gap-2 text-primary hover:underline font-medium">
                        <Phone className="h-4 w-4" />
                        {listing.contactPhone}
                      </a>
                    ) : (
                      <Button onClick={handleRevealContact} className="w-full" size="lg">
                        <Phone className="h-4 w-4 mr-2" />
                        Pokaż numer telefonu
                      </Button>
                    )}
                  </div>
                )}

                {listing.contactEmail && showContactPhone && (
                  <a href={`mailto:${listing.contactEmail}`} className="flex items-center gap-2 text-primary hover:underline mb-4">
                    <Mail className="h-4 w-4" />
                    {listing.contactEmail}
                  </a>
                )}

                <Button variant="outline" className="w-full mt-2" size="lg">
                  <MessageCircle className="h-4 w-4 mr-2" />
                  Napisz wiadomość
                </Button>

                {listing.listingNumber && (
                  <p className="text-xs text-muted-foreground mt-4 text-center">
                    Nr oferty: <span className="font-mono">{listing.listingNumber}</span>
                  </p>
                )}
              </Card>

              <div className="mt-6">
                <AIVehicleAssessment listing={listing} />
              </div>
            </div>
          </div>
        </div>

        <SimilarVehicles currentListingId={listing.id} brand={listing.brand} />
      </main>

      {/* Auth Modal for login */}
      <AuthModal
        open={showLoginDialog}
        onOpenChange={setShowLoginDialog}
        initialMode="login"
        customDescription="Zaloguj się, aby zobaczyć dane kontaktowe sprzedawcy."
        onSuccess={() => {
          setShowLoginDialog(false);
          // Refresh user state and reveal contact
          supabase.auth.getUser().then(({ data: { user } }) => {
            setUser(user);
            if (user) setShowContactPhone(true);
          });
        }}
      />
    </div>
  );
}

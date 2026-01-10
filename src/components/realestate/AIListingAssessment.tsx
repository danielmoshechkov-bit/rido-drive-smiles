import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, CheckCircle, AlertTriangle, RefreshCw, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface AIListingAssessmentProps {
  listing: {
    id: string;
    title: string;
    price: number;
    priceType?: string;
    areaM2?: number;
    rooms?: number;
    floor?: number;
    buildYear?: number;
    location?: string;
    district?: string;
    propertyType?: string;
    hasBalcony?: boolean;
    hasElevator?: boolean;
    hasParking?: boolean;
    hasGarden?: boolean;
    amenities?: string[];
    description?: string;
  };
}

interface AIAssessment {
  rating: number;
  pros: string[];
  cons: string[];
  summary: string;
}

export function AIListingAssessment({ listing }: AIListingAssessmentProps) {
  const [assessment, setAssessment] = useState<AIAssessment | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate assessment on mount
  useEffect(() => {
    generateAssessment();
  }, [listing.id]);

  const generateAssessment = async () => {
    setLoading(true);
    setError(null);

    try {
      // Prepare listing data for AI analysis
      const listingInfo = {
        title: listing.title,
        price: listing.price,
        priceType: listing.priceType,
        areaM2: listing.areaM2,
        pricePerM2: listing.areaM2 ? Math.round(listing.price / listing.areaM2) : null,
        rooms: listing.rooms,
        floor: listing.floor,
        buildYear: listing.buildYear,
        location: listing.location,
        district: listing.district,
        propertyType: listing.propertyType,
        hasBalcony: listing.hasBalcony,
        hasElevator: listing.hasElevator,
        hasParking: listing.hasParking,
        hasGarden: listing.hasGarden,
        amenities: listing.amenities,
      };

      const { data, error: fnError } = await supabase.functions.invoke("ai-listing-assessment", {
        body: { listing: listingInfo }
      });

      if (fnError) throw fnError;

      if (data?.assessment) {
        setAssessment(data.assessment);
      } else {
        // Fallback to mock assessment if edge function not available
        setAssessment(generateMockAssessment());
      }
    } catch (err) {
      console.error("Failed to generate AI assessment:", err);
      // Use mock data as fallback
      setAssessment(generateMockAssessment());
    } finally {
      setLoading(false);
    }
  };

  // Generate mock assessment based on listing data
  const generateMockAssessment = (): AIAssessment => {
    const pros: string[] = [];
    const cons: string[] = [];
    let rating = 3.5;

    // Analyze pros
    if (listing.buildYear && listing.buildYear >= 2015) {
      pros.push("Nowe budownictwo");
      rating += 0.3;
    }
    if (listing.hasElevator) {
      pros.push("Winda w budynku");
      rating += 0.2;
    }
    if (listing.hasBalcony) {
      pros.push("Balkon lub taras");
      rating += 0.2;
    }
    if (listing.hasParking) {
      pros.push("Miejsce parkingowe");
      rating += 0.2;
    }
    if (listing.hasGarden) {
      pros.push("Ogród lub działka");
      rating += 0.3;
    }
    if (listing.district) {
      pros.push(`Lokalizacja: ${listing.district}`);
    }
    if (listing.rooms && listing.rooms >= 3) {
      pros.push("Przestronne układy pokoi");
    }

    // Analyze cons
    if (listing.buildYear && listing.buildYear < 1990) {
      cons.push("Starsze budownictwo");
      rating -= 0.3;
    }
    if (listing.floor && listing.floor > 3 && !listing.hasElevator) {
      cons.push("Wysokie piętro bez windy");
      rating -= 0.4;
    }
    if (!listing.hasParking) {
      cons.push("Brak miejsca parkingowego");
    }
    if (!listing.hasBalcony && listing.propertyType === "mieszkanie") {
      cons.push("Brak balkonu");
    }

    // Calculate price assessment
    const pricePerM2 = listing.areaM2 ? listing.price / listing.areaM2 : 0;
    if (pricePerM2 > 15000) {
      cons.push("Cena powyżej średniej rynkowej");
      rating -= 0.2;
    } else if (pricePerM2 < 8000 && pricePerM2 > 0) {
      pros.push("Atrakcyjna cena za m²");
      rating += 0.3;
    }

    // Ensure at least some pros/cons
    if (pros.length === 0) pros.push("Standardowe wyposażenie");
    if (cons.length === 0) cons.push("Brak wyróżniających cech");

    // Clamp rating
    rating = Math.max(1, Math.min(5, rating));

    // Generate summary
    const summaryOptions = [
      `Dobry wybór dla osób szukających ${listing.rooms ? `${listing.rooms}-pokojowego` : ""} mieszkania w ${listing.district || listing.location}.`,
      `Solidna oferta z dobrym stosunkiem ceny do jakości. Warto rozważyć przy poszukiwaniach w tej okolicy.`,
      `Nieruchomość o standardowym standardzie. Idealna dla osób ceniących lokalizację.`,
    ];

    return {
      rating: Math.round(rating * 10) / 10,
      pros: pros.slice(0, 4),
      cons: cons.slice(0, 3),
      summary: summaryOptions[Math.floor(Math.random() * summaryOptions.length)],
    };
  };

  const renderStars = (rating: number) => {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    
    return (
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={cn(
              "h-5 w-5",
              i < fullStars 
                ? "fill-yellow-400 text-yellow-400" 
                : i === fullStars && hasHalfStar
                  ? "fill-yellow-400/50 text-yellow-400"
                  : "text-muted-foreground/30"
            )}
          />
        ))}
      </div>
    );
  };

  return (
    <Card className="p-5 border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Ocena Rido AI
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={generateAssessment}
          disabled={loading}
          className="h-8 w-8 p-0"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-6 bg-muted rounded w-1/2" />
          <div className="space-y-2">
            <div className="h-4 bg-muted rounded w-full" />
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-4 bg-muted rounded w-5/6" />
          </div>
        </div>
      ) : assessment ? (
        <div className="space-y-4">
          {/* Rating */}
          <div className="flex items-center gap-3">
            {renderStars(assessment.rating)}
            <span className="text-2xl font-bold">{assessment.rating}</span>
            <span className="text-muted-foreground">/ 5</span>
          </div>

          {/* Pros */}
          <div className="space-y-2">
            {assessment.pros.map((pro, index) => (
              <div key={index} className="flex items-start gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                <span>{pro}</span>
              </div>
            ))}
          </div>

          {/* Cons */}
          <div className="space-y-2">
            {assessment.cons.map((con, index) => (
              <div key={index} className="flex items-start gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                <span>{con}</span>
              </div>
            ))}
          </div>

          {/* Summary */}
          <div className="pt-3 border-t">
            <p className="text-sm text-muted-foreground italic">
              "{assessment.summary}"
            </p>
          </div>
        </div>
      ) : error ? (
        <div className="text-center py-4">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={generateAssessment} className="mt-2">
            Spróbuj ponownie
          </Button>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground mt-4 text-center">
        Ocena wygenerowana przez AI • Może nie być dokładna
      </p>
    </Card>
  );
}

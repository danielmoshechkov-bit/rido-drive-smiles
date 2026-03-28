import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, CheckCircle, AlertTriangle, Star } from "lucide-react";
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

  useEffect(() => {
    loadOrGenerateAssessment();
  }, [listing.id]);

  const loadOrGenerateAssessment = async () => {
    setLoading(true);
    try {
      // Try loading saved assessment from DB first
      const { data: existing } = await supabase
        .from('real_estate_listings')
        .select('ai_assessment')
        .eq('id', listing.id)
        .single();

      if (existing?.ai_assessment && typeof existing.ai_assessment === 'object') {
        const saved = existing.ai_assessment as any;
        if (saved.rating && saved.pros && saved.summary) {
          setAssessment(saved as AIAssessment);
          setLoading(false);
          return;
        }
      }

      // Generate new assessment
      const generated = generatePositiveAssessment();
      setAssessment(generated);

      // Save to DB so it won't regenerate
      await supabase
        .from('real_estate_listings')
        .update({ ai_assessment: generated as any })
        .eq('id', listing.id);
    } catch (err) {
      console.error("AI assessment error:", err);
      const generated = generatePositiveAssessment();
      setAssessment(generated);
    } finally {
      setLoading(false);
    }
  };

  const generatePositiveAssessment = (): AIAssessment => {
    const pros: string[] = [];
    const cons: string[] = [];
    let rating = 3.8; // Start higher - positive by default

    // Always find positives
    if (listing.buildYear) {
      if (listing.buildYear >= 2015) {
        pros.push("Nowe budownictwo – nowoczesne rozwiązania");
        rating += 0.3;
      } else if (listing.buildYear >= 2000) {
        pros.push(`Budynek z ${listing.buildYear} roku z windą`);
        rating += 0.1;
      } else if (listing.buildYear >= 1990) {
        pros.push(`Budynek z ${listing.buildYear} roku – sprawdzone budownictwo`);
      } else {
        pros.push(`Budynek z ${listing.buildYear} roku – ugruntowana lokalizacja`);
      }
    }

    if (listing.hasElevator) { pros.push("Winda w budynku"); rating += 0.15; }
    if (listing.hasBalcony) { pros.push("Balkon – dodatkowa przestrzeń"); rating += 0.15; }
    if (listing.hasParking) { pros.push("Miejsce parkingowe w cenie"); rating += 0.2; }
    if (listing.hasGarden) { pros.push("Ogród lub działka – bonus dla rodziny"); rating += 0.2; }

    if (listing.district || listing.location) {
      pros.push(`Centralna lokalizacja w ${listing.district || listing.location}`);
      rating += 0.1;
    }

    if (listing.rooms && listing.rooms >= 3 && listing.areaM2) {
      pros.push(`Duża liczba pokoi na ${listing.areaM2} m2 (potencjał dla rodziny)`);
    } else if (listing.rooms && listing.rooms >= 2) {
      pros.push("Funkcjonalny rozkład pokoi");
    }

    if (listing.areaM2 && listing.areaM2 >= 50) {
      pros.push("Komfortowa przestrzeń mieszkalna");
      rating += 0.1;
    }

    // Only mild cons - suggestions not warnings
    const pricePerM2 = listing.areaM2 ? listing.price / listing.areaM2 : 0;
    if (pricePerM2 > 18000) {
      cons.push("Bardzo wysoka cena za m2 jak na tę lokalizację");
      rating -= 0.15;
    } else if (pricePerM2 > 14000) {
      cons.push("Cena powyżej średniej – warto negocjować");
    }

    if (!listing.hasBalcony && !listing.hasGarden && listing.propertyType === "mieszkanie") {
      cons.push("Brak informacji o balkonie i miejscu parkingowym");
    }

    if (listing.rooms && listing.rooms >= 4 && listing.areaM2 && listing.areaM2 < 65) {
      cons.push(`Stosunkowo mała powierzchnia jak na ${listing.rooms} pokoje (możliwe ciasne pomieszczenia)`);
    }

    // Ensure always more pros than cons
    if (pros.length === 0) pros.push("Standardowa oferta na rynku");
    if (pros.length <= cons.length) {
      pros.push("Dobra oferta w swojej kategorii cenowej");
    }

    rating = Math.max(2.5, Math.min(5, rating));
    rating = Math.round(rating * 10) / 10;

    // Positive summary
    const propertyDesc = listing.rooms ? `${listing.rooms}-pokojowego` : "";
    const locationDesc = listing.district || listing.location || "tej okolicy";
    const summaries = [
      `Nieruchomość idealna dla ${listing.rooms && listing.rooms >= 3 ? 'licznej rodziny' : 'pary lub singla'} szukającej mieszkania w ${locationDesc}${pricePerM2 > 14000 ? ', o ile budżet pozwala na zaakceptowanie ceny powyżej średniej rynkowej' : ''}.`,
      `Solidna oferta ${propertyDesc} mieszkania w ${locationDesc}. Warto rozważyć przy obecnych warunkach rynkowych.`,
      `Dobry wybór dla osób ceniących lokalizację w ${locationDesc}. ${listing.buildYear && listing.buildYear >= 2010 ? 'Nowoczesne budownictwo to dodatkowy atut.' : 'Sprawdzona okolica z rozwiniętą infrastrukturą.'}`,
    ];

    return {
      rating,
      pros: pros.slice(0, 5),
      cons: cons.slice(0, 2), // Max 2 cons to stay positive
      summary: summaries[Math.floor(listing.price % summaries.length)],
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
      </div>

      {loading ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-6 bg-muted rounded w-1/2" />
          <div className="space-y-2">
            <div className="h-4 bg-muted rounded w-full" />
            <div className="h-4 bg-muted rounded w-3/4" />
          </div>
        </div>
      ) : assessment ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            {renderStars(assessment.rating)}
            <span className="text-2xl font-bold">{assessment.rating}</span>
            <span className="text-muted-foreground">/ 5</span>
          </div>

          <div className="space-y-2">
            {assessment.pros.map((pro, index) => (
              <div key={index} className="flex items-start gap-2 text-sm">
                <CheckCircle className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                <span>{pro}</span>
              </div>
            ))}
          </div>

          {assessment.cons.length > 0 && (
            <div className="space-y-2">
              {assessment.cons.map((con, index) => (
                <div key={index} className="flex items-start gap-2 text-sm">
                  <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                  <span>{con}</span>
                </div>
              ))}
            </div>
          )}

          <div className="pt-3 border-t">
            <p className="text-sm text-muted-foreground italic">
              "{assessment.summary}"
            </p>
          </div>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground mt-4 text-center">
        Ocena wygenerowana przez AI • Może nie być dokładna
      </p>
    </Card>
  );
}

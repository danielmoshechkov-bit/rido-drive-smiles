import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Sparkles, TrendingUp, TrendingDown, AlertTriangle, 
  CheckCircle, Info, ChevronDown, ChevronUp, Zap
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AIVehicleAssessmentProps {
  listing: {
    price?: number;
    priceType?: string;
    brand?: string;
    model?: string;
    year?: number;
    fuelType?: string;
    odometer?: number;
    power?: number;
    engineCapacity?: number;
  };
}

export function AIVehicleAssessment({ listing }: AIVehicleAssessmentProps) {
  const [expanded, setExpanded] = useState(false);

  // Mock AI analysis - w produkcji pobierane z edge function
  const generateAssessment = () => {
    const currentYear = new Date().getFullYear();
    const age = listing.year ? currentYear - listing.year : 0;
    const mileage = listing.odometer || 0;
    const avgMileagePerYear = listing.year ? mileage / age : 0;

    const priceAssessment = {
      status: Math.random() > 0.5 ? 'fair' : Math.random() > 0.5 ? 'good' : 'high',
      marketPrice: listing.price ? listing.price * (0.9 + Math.random() * 0.2) : 0,
    };

    const warnings: string[] = [];
    const highlights: string[] = [];

    // Mileage analysis
    if (avgMileagePerYear > 20000) {
      warnings.push("Wysoki przebieg roczny (powyżej 20 tys. km/rok)");
    } else if (avgMileagePerYear < 10000) {
      highlights.push("Niski przebieg roczny - dobrze utrzymany pojazd");
    }

    // Age analysis
    if (age > 10) {
      warnings.push("Pojazd starszy niż 10 lat - sprawdź stan techniczny");
    } else if (age <= 3) {
      highlights.push("Młody pojazd - prawdopodobnie pod gwarancją");
    }

    // Fuel type analysis
    if (listing.fuelType === 'elektryczny') {
      highlights.push("Pojazd elektryczny - niskie koszty eksploatacji");
    } else if (listing.fuelType === 'hybryda') {
      highlights.push("Napęd hybrydowy - ekonomiczny w mieście");
    }

    // Power analysis
    if (listing.power && listing.power > 200) {
      warnings.push("Wysokie ubezpieczenie dla pojazdów powyżej 200 KM");
    }

    return {
      priceAssessment,
      warnings,
      highlights,
      estimatedCosts: {
        insurance: Math.round((listing.power || 100) * 8 + 800),
        service: Math.round(age * 200 + 500),
        fuel: listing.fuelType === 'elektryczny' ? 150 : listing.fuelType === 'diesel' ? 450 : 550,
      }
    };
  };

  const assessment = generateAssessment();

  const priceStatusConfig = {
    good: { 
      label: "Dobra cena", 
      color: "bg-green-500", 
      icon: TrendingDown,
      description: "Cena poniżej średniej rynkowej"
    },
    fair: { 
      label: "Cena rynkowa", 
      color: "bg-blue-500", 
      icon: Info,
      description: "Cena zgodna ze średnią rynkową"
    },
    high: { 
      label: "Wysoka cena", 
      color: "bg-orange-500", 
      icon: TrendingUp,
      description: "Cena powyżej średniej rynkowej"
    },
  };

  const priceConfig = priceStatusConfig[assessment.priceAssessment.status as keyof typeof priceStatusConfig];
  const PriceIcon = priceConfig.icon;

  return (
    <Card className="p-4 border-primary/20">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-2 rounded-lg bg-primary/10">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold">Ocena RIDO AI</h3>
          <p className="text-xs text-muted-foreground">Automatyczna analiza ogłoszenia</p>
        </div>
      </div>

      {/* Price Assessment */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 mb-4">
        <div className="flex items-center gap-2">
          <PriceIcon className={cn("h-5 w-5", 
            assessment.priceAssessment.status === 'good' && "text-green-500",
            assessment.priceAssessment.status === 'fair' && "text-blue-500",
            assessment.priceAssessment.status === 'high' && "text-orange-500"
          )} />
          <div>
            <p className="font-medium text-sm">{priceConfig.label}</p>
            <p className="text-xs text-muted-foreground">{priceConfig.description}</p>
          </div>
        </div>
        <Badge className={priceConfig.color}>
          {assessment.priceAssessment.status === 'good' ? '-5%' : 
           assessment.priceAssessment.status === 'high' ? '+8%' : '±0%'}
        </Badge>
      </div>

      {/* Highlights */}
      {assessment.highlights.length > 0 && (
        <div className="space-y-2 mb-4">
          {assessment.highlights.map((highlight, idx) => (
            <div key={idx} className="flex items-start gap-2 text-sm">
              <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span>{highlight}</span>
            </div>
          ))}
        </div>
      )}

      {/* Warnings */}
      {assessment.warnings.length > 0 && (
        <div className="space-y-2 mb-4">
          {assessment.warnings.map((warning, idx) => (
            <div key={idx} className="flex items-start gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
              <span>{warning}</span>
            </div>
          ))}
        </div>
      )}

      {/* Expandable Costs Section */}
      <Button
        variant="ghost"
        size="sm"
        className="w-full justify-between"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="flex items-center gap-2">
          <Zap className="h-4 w-4" />
          Szacowane koszty miesięczne
        </span>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </Button>

      {expanded && (
        <div className="mt-3 pt-3 border-t space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Ubezpieczenie (OC/AC)</span>
            <span className="font-medium">~{assessment.estimatedCosts.insurance} zł/rok</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Serwis roczny</span>
            <span className="font-medium">~{assessment.estimatedCosts.service} zł/rok</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Paliwo (1000 km)</span>
            <span className="font-medium">~{assessment.estimatedCosts.fuel} zł</span>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            * Szacunki oparte na danych rynkowych. Rzeczywiste koszty mogą się różnić.
          </p>
        </div>
      )}
    </Card>
  );
}

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CarBrandModelSelector } from "@/components/CarBrandModelSelector";
import { VehiclePhotoUpload } from "@/components/marketplace/VehiclePhotoUpload";
import { EquipmentAccordion } from "@/components/marketplace/EquipmentAccordion";
import { AuthModal } from "@/components/auth/AuthModal";
import { 
  TransactionTypeFields, 
  RentToOwnData, 
  LeasingTransferData, 
  ExchangeData,
  ShortTermRentalData,
  LongTermRentalData,
  FleetPackageData,
  initialRentToOwn,
  initialLeasingTransfer,
  initialExchange,
  initialShortTermRental,
  initialLongTermRental,
  initialFleetPackage
} from "@/components/marketplace/TransactionTypeFields";
import { 
  ArrowLeft, Car, Fuel, Gauge, Calendar, Settings2, 
  Palette, MapPin, Phone, Mail, User, FileText, 
  Loader2, Sparkles, Shield, CheckCircle2, Search
} from "lucide-react";

const BODY_TYPES = [
  { value: "sedan", label: "Sedan" },
  { value: "kombi", label: "Kombi" },
  { value: "suv", label: "SUV" },
  { value: "hatchback", label: "Hatchback" },
  { value: "coupe", label: "Coupe" },
  { value: "cabrio", label: "Kabriolet" },
  { value: "van", label: "Van" },
  { value: "pickup", label: "Pickup" },
  { value: "minivan", label: "Minivan" },
];

const FUEL_TYPES = [
  { value: "benzyna", label: "Benzyna" },
  { value: "diesel", label: "Diesel" },
  { value: "lpg", label: "LPG" },
  { value: "elektryczny", label: "Elektryczny" },
  { value: "hybryda", label: "Hybryda" },
  { value: "hybryda-plugin", label: "Hybryda Plug-in" },
];

const TRANSMISSIONS = [
  { value: "manual", label: "Manualna" },
  { value: "automatic", label: "Automatyczna" },
];

const DRIVE_TYPES = [
  { value: "fwd", label: "Przedni (FWD)" },
  { value: "rwd", label: "Tylny (RWD)" },
  { value: "awd", label: "4x4 / AWD" },
];

const COLORS = [
  { value: "biały", label: "Biały" },
  { value: "czarny", label: "Czarny" },
  { value: "srebrny", label: "Srebrny" },
  { value: "szary", label: "Szary" },
  { value: "niebieski", label: "Niebieski" },
  { value: "czerwony", label: "Czerwony" },
  { value: "zielony", label: "Zielony" },
  { value: "żółty", label: "Żółty" },
  { value: "pomarańczowy", label: "Pomarańczowy" },
  { value: "brązowy", label: "Brązowy" },
  { value: "beżowy", label: "Beżowy" },
  { value: "fioletowy", label: "Fioletowy" },
  { value: "inny", label: "Inny" },
];

const COLOR_TYPES = [
  { value: "metalik", label: "Metalik" },
  { value: "perłowy", label: "Perłowy" },
  { value: "matowy", label: "Matowy" },
  { value: "zwykły", label: "Zwykły" },
];

const COUNTRIES = [
  { value: "polska", label: "Polska" },
  { value: "niemcy", label: "Niemcy" },
  { value: "francja", label: "Francja" },
  { value: "holandia", label: "Holandia" },
  { value: "belgia", label: "Belgia" },
  { value: "usa", label: "USA" },
  { value: "inne", label: "Inne" },
];

// Transaction types - fallback if DB fails
const FALLBACK_TRANSACTION_TYPES = [
  { value: "sprzedaz", label: "Sprzedaż" },
  { value: "wynajem", label: "Wynajem długoterminowy" },
  { value: "wynajem-krotkoterminowy", label: "Wynajem krótkoterminowy" },
  { value: "wynajem-z-wykupem", label: "Wynajem z wykupem" },
  { value: "cesja-leasingu", label: "Cesja leasingu" },
  { value: "zamiana", label: "Zamiana" },
  { value: "po-flocie", label: "Po flocie / taxi" },
  { value: "pakiety-flotowe", label: "Pakiety flotowe" },
];

interface FormData {
  // Basic
  brand: string;
  model: string;
  year: string;
  odometer: string;
  bodyType: string;
  
  // Technical
  engineCapacity: string;
  power: string;
  fuelType: string;
  transmission: string;
  driveType: string;
  doorsCount: string;
  seatsCount: string;
  
  // Condition & History
  isDamaged: boolean;
  isImported: boolean;
  countryOrigin: string;
  vin: string;
  hideVin: boolean;
  registrationNumber: string;
  firstRegistrationDate: string;
  
  // Appearance
  color: string;
  colorType: string;
  
  // Equipment
  equipment: Record<string, boolean>;
  
  // Price & Transaction
  price: string;
  transactionType: string;
  negotiable: boolean;
  rentToOwn: RentToOwnData;
  leasingTransfer: LeasingTransferData;
  exchange: ExchangeData;
  shortTermRental: ShortTermRentalData;
  longTermRental: LongTermRentalData;
  fleetPackage: FleetPackageData;
  
  // Contact
  city: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  
  // Description
  title: string;
  description: string;
  
  // Photos
  photos: string[];
  aiPhotos: string[];
  hasAiPhotos: boolean;
}

const initialFormData: FormData = {
  brand: "",
  model: "",
  year: "",
  odometer: "",
  bodyType: "",
  engineCapacity: "",
  power: "",
  fuelType: "",
  transmission: "",
  driveType: "",
  doorsCount: "",
  seatsCount: "",
  isDamaged: false,
  isImported: false,
  countryOrigin: "polska",
  vin: "",
  hideVin: true,
  registrationNumber: "",
  firstRegistrationDate: "",
  color: "",
  colorType: "",
  equipment: {},
  price: "",
  transactionType: "sprzedaz",
  negotiable: false,
  rentToOwn: initialRentToOwn,
  leasingTransfer: initialLeasingTransfer,
  exchange: initialExchange,
  shortTermRental: initialShortTermRental,
  longTermRental: initialLongTermRental,
  fleetPackage: initialFleetPackage,
  city: "",
  contactName: "",
  contactPhone: "",
  contactEmail: "",
  title: "",
  description: "",
  photos: [],
  aiPhotos: [],
  hasAiPhotos: false,
};

export default function AddVehicleListing() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [vinLoading, setVinLoading] = useState(false);
  const [transactionTypes, setTransactionTypes] = useState(FALLBACK_TRANSACTION_TYPES);

  useEffect(() => {
    // Load transaction types from DB
    const loadTransactionTypes = async () => {
      const { data } = await supabase
        .from("marketplace_transaction_types")
        .select("slug, name")
        .eq("is_active", true)
        .not("slug", "in", "(wynajem-nieruchomosci,sprzedaz-nieruchomosci)")
        .order("sort_order");
      
      if (data && data.length > 0) {
        setTransactionTypes(data.map(t => ({ value: t.slug, label: t.name })));
      }
    };
    loadTransactionTypes();
  }, []);

  const [showAuthModal, setShowAuthModal] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      
      // Don't require login - allow form access for guests
      if (session) {
        setUser(session.user);

        // Load profile
        const { data: profileData } = await supabase
          .from("marketplace_user_profiles")
          .select("*")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (profileData) {
          setProfile(profileData);
          // Pre-fill contact info
          setFormData(prev => ({
            ...prev,
            contactName: `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim(),
            contactEmail: profileData.email || session.user.email || '',
            contactPhone: profileData.phone || '',
          }));
        }
      }

      setLoading(false);
    };
    loadUser();
  }, [navigate]);

  // Re-check user after auth modal closes and auto-submit
  const [pendingSubmit, setPendingSubmit] = useState(false);
  
  const handleAuthSuccess = async () => {
    setShowAuthModal(false);
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      setUser(session.user);
      // Load profile
      const { data: profileData } = await supabase
        .from("marketplace_user_profiles")
        .select("*")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (profileData) {
        setProfile(profileData);
        setFormData(prev => ({
          ...prev,
          contactName: prev.contactName || `${profileData.first_name || ''} ${profileData.last_name || ''}`.trim(),
          contactEmail: prev.contactEmail || profileData.email || session.user.email || '',
          contactPhone: prev.contactPhone || profileData.phone || '',
        }));
      }
      
      // Mark that we need to submit after auth
      setPendingSubmit(true);
    }
  };
  
  // Auto-submit after successful login
  useEffect(() => {
    if (pendingSubmit && user) {
      setPendingSubmit(false);
      // Small delay to ensure state is updated
      setTimeout(() => {
        handleSubmit();
      }, 100);
    }
  }, [pendingSubmit, user]);

  const updateField = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const generateTitle = () => {
    if (formData.brand && formData.model && formData.year) {
      updateField("title", `${formData.brand} ${formData.model} ${formData.year}`);
    }
  };

  // VIN Decoder using NHTSA API (free)
  const decodeVin = async () => {
    if (formData.vin.length !== 17) {
      toast.error("VIN musi mieć 17 znaków");
      return;
    }

    setVinLoading(true);
    try {
      const response = await fetch(
        `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${formData.vin}?format=json`
      );
      const data = await response.json();
      const result = data.Results[0];

      if (result.ErrorCode !== "0") {
        toast.error("Nie udało się zdekodować VIN");
        return;
      }

      // Map NHTSA data to form fields
      const updates: Partial<FormData> = {};

      if (result.Make) updates.brand = result.Make;
      if (result.Model) updates.model = result.Model;
      if (result.ModelYear) updates.year = result.ModelYear;
      
      // Body type mapping
      const bodyTypeMap: Record<string, string> = {
        "SEDAN": "sedan",
        "WAGON": "kombi",
        "SUV": "suv",
        "HATCHBACK": "hatchback",
        "COUPE": "coupe",
        "CONVERTIBLE": "cabrio",
        "VAN": "van",
        "PICKUP": "pickup",
        "MINIVAN": "minivan",
      };
      if (result.BodyClass) {
        const mappedBody = Object.entries(bodyTypeMap).find(([key]) => 
          result.BodyClass.toUpperCase().includes(key)
        );
        if (mappedBody) updates.bodyType = mappedBody[1];
      }

      // Fuel type mapping
      const fuelTypeMap: Record<string, string> = {
        "GASOLINE": "benzyna",
        "DIESEL": "diesel",
        "ELECTRIC": "elektryczny",
        "HYBRID": "hybryda",
        "PLUG-IN HYBRID": "hybryda-plugin",
      };
      if (result.FuelTypePrimary) {
        const mappedFuel = Object.entries(fuelTypeMap).find(([key]) => 
          result.FuelTypePrimary.toUpperCase().includes(key)
        );
        if (mappedFuel) updates.fuelType = mappedFuel[1];
      }

      // Transmission
      if (result.TransmissionStyle) {
        updates.transmission = result.TransmissionStyle.toLowerCase().includes("manual") 
          ? "manual" 
          : "automatic";
      }

      // Drive type
      if (result.DriveType) {
        if (result.DriveType.includes("4WD") || result.DriveType.includes("AWD")) {
          updates.driveType = "awd";
        } else if (result.DriveType.includes("RWD")) {
          updates.driveType = "rwd";
        } else {
          updates.driveType = "fwd";
        }
      }

      // Engine
      if (result.DisplacementCC) updates.engineCapacity = result.DisplacementCC;
      if (result.EngineHP) updates.power = result.EngineHP;
      if (result.Doors) updates.doorsCount = result.Doors;

      setFormData(prev => ({ ...prev, ...updates }));
      toast.success("Dane pobrane z VIN!");
      setTimeout(generateTitle, 100);
    } catch (err) {
      console.error("VIN decode error:", err);
      toast.error("Błąd podczas pobierania danych z VIN");
    } finally {
      setVinLoading(false);
    }
  };

  const [generatingDescription, setGeneratingDescription] = useState(false);

  const handleGenerateAiDescription = async () => {
    if (!formData.brand || !formData.model) {
      toast.error("Najpierw wybierz markę i model pojazdu");
      return;
    }

    setGeneratingDescription(true);
    try {
      const vehicleInfo = {
        brand: formData.brand,
        model: formData.model,
        year: formData.year,
        mileage: formData.odometer,
        fuel: formData.fuelType,
        transmission: formData.transmission,
        power: formData.power,
        engine: formData.engineCapacity,
        bodyType: formData.bodyType,
        color: formData.color,
        equipment: Object.keys(formData.equipment).filter(k => formData.equipment[k]),
        isDamaged: formData.isDamaged,
        transactionType: formData.transactionType,
      };

      const { data, error } = await supabase.functions.invoke("ai-service", {
        body: {
          type: "vehicle-description",
          payload: { vehicleData: vehicleInfo },
          userId: user?.id
        },
      });

      if (error) {
        console.error("AI description error:", error);
        toast.error("Błąd generowania opisu");
        return;
      }

      if (data?.description) {
        updateField("description", data.description);
        toast.success("Opis wygenerowany! Koszt: 10 kredytów");
      } else {
        toast.error("Nie udało się wygenerować opisu");
      }
    } catch (err) {
      console.error("AI description error:", err);
      toast.error("Błąd podczas generowania opisu");
    } finally {
      setGeneratingDescription(false);
    }
  };

  const handleSubmit = async () => {
    // Validation
    if (!formData.brand || !formData.model) {
      toast.error("Wybierz markę i model pojazdu");
      return;
    }
    if (!formData.year) {
      toast.error("Podaj rok produkcji");
      return;
    }
    if (!formData.price) {
      toast.error("Podaj cenę");
      return;
    }
    if (formData.photos.length === 0) {
      toast.error("Dodaj przynajmniej jedno zdjęcie");
      return;
    }
    if (!formData.city) {
      toast.error("Podaj lokalizację");
      return;
    }
    if (!formData.contactPhone) {
      toast.error("Podaj numer telefonu");
      return;
    }

    // Check if user is logged in - show auth modal if not
    if (!user) {
      setShowAuthModal(true);
      return;
    }

    setSubmitting(true);
    try {
      // Prepare transaction-specific data
      const rentToOwnData = formData.transactionType === "wynajem-z-wykupem" 
        ? formData.rentToOwn 
        : null;
      const leasingTransferData = formData.transactionType === "cesja-leasingu" 
        ? formData.leasingTransfer 
        : null;
      const exchangeData = formData.transactionType === "zamiana" 
        ? formData.exchange 
        : null;
      const shortTermRentalData = formData.transactionType === "wynajem-krotkoterminowy"
        ? formData.shortTermRental
        : null;
      const longTermRentalData = formData.transactionType === "wynajem"
        ? formData.longTermRental
        : null;
      const fleetPackageData = formData.transactionType === "pakiety-flotowe"
        ? formData.fleetPackage
        : null;

      const { data, error } = await supabase
        .from("vehicle_listings")
        .insert({
          title: formData.title || `${formData.brand} ${formData.model} ${formData.year}`,
          brand: formData.brand,
          model: formData.model,
          year: parseInt(formData.year),
          odometer: formData.odometer ? parseInt(formData.odometer) : null,
          body_type: formData.bodyType || null,
          engine_capacity: formData.engineCapacity ? parseInt(formData.engineCapacity) : null,
          power: formData.power ? parseInt(formData.power) : null,
          fuel_type: formData.fuelType || null,
          transmission: formData.transmission || null,
          doors_count: formData.doorsCount ? parseInt(formData.doorsCount) : null,
          seats_count: formData.seatsCount ? parseInt(formData.seatsCount) : null,
          is_damaged: formData.isDamaged,
          is_imported: formData.isImported,
          country_origin: formData.countryOrigin || null,
          vin: formData.vin || null,
          registration_number: formData.registrationNumber || null,
          first_registration_date: formData.firstRegistrationDate || null,
          color: formData.color || null,
          color_type: formData.colorType || null,
          equipment: formData.equipment,
          price: parseFloat(formData.price),
          weekly_price: formData.transactionType.includes('wynajem') ? parseFloat(formData.price) : 0,
          transaction_type: formData.transactionType,
          // New JSONB fields - cast needed until types regenerate
          rent_to_own_data: rentToOwnData as any,
          leasing_transfer_data: leasingTransferData as any,
          exchange_data: exchangeData as any,
          short_term_rental_data: shortTermRentalData as any,
          long_term_rental_data: longTermRentalData as any,
          fleet_package_data: fleetPackageData as any,
          city: formData.city,
          location: formData.city,
          contact_name: formData.contactName || null,
          contact_phone: formData.contactPhone,
          contact_email: formData.contactEmail || null,
          description_long: formData.description || null,
          photos: formData.hasAiPhotos ? formData.aiPhotos : formData.photos,
          ai_enhanced_photos: formData.hasAiPhotos ? formData.aiPhotos : null,
          has_ai_photos: formData.hasAiPhotos,
          status: "aktywne",
        } as any)
        .select()
        .single();

      if (error) {
        console.error("Insert error:", error);
        toast.error("Błąd podczas dodawania ogłoszenia");
        return;
      }

      toast.success("Ogłoszenie zostało dodane!");
      navigate(`/gielda/ogloszenie/${data.id}`);
    } catch (err) {
      console.error("Submit error:", err);
      toast.error("Wystąpił błąd");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show auth modal if not logged in
  if (!user) {
    return (
      <>
        <AuthModal 
          open={showAuthModal} 
          onOpenChange={(open) => {
            if (!open) {
              // If modal is closed without login, go back to marketplace
              navigate("/gielda");
            }
          }}
          initialMode="login"
          onSuccess={handleAuthSuccess}
        />
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
            <p className="text-muted-foreground">Logowanie...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate("/klient")} className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden sm:inline">Anuluj</span>
            </Button>
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/gielda")}>
              <img src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" alt="RIDO" className="h-8 w-8" />
              <span className="font-bold text-lg"><span className="text-primary">RIDO</span> Giełda</span>
            </div>
          </div>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Opublikuj ogłoszenie
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="space-y-6">
          {/* Section 1: Basic Data */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Car className="h-5 w-5 text-primary" />
                Dane podstawowe
              </CardTitle>
              <CardDescription>Podstawowe informacje o pojeździe</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <CarBrandModelSelector
                brand={formData.brand}
                model={formData.model}
                onBrandChange={(v) => updateField("brand", v)}
                onModelChange={(v) => { updateField("model", v); setTimeout(generateTitle, 100); }}
              />

              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <Label>Rok produkcji *</Label>
                  <Select value={formData.year} onValueChange={(v) => { updateField("year", v); setTimeout(generateTitle, 100); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz rok" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 37 }, (_, i) => 2026 - i).map(year => (
                        <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Przebieg (km)</Label>
                  <Input
                    type="number"
                    placeholder="np. 150000"
                    value={formData.odometer}
                    onChange={(e) => updateField("odometer", e.target.value)}
                  />
                </div>

                <div>
                  <Label>Typ nadwozia</Label>
                  <Select value={formData.bodyType} onValueChange={(v) => updateField("bodyType", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz typ" />
                    </SelectTrigger>
                    <SelectContent>
                      {BODY_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 2: Technical Data */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-primary" />
                Dane techniczne
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <Label>Pojemność silnika (cm³)</Label>
                  <Input
                    type="number"
                    placeholder="np. 1998"
                    value={formData.engineCapacity}
                    onChange={(e) => updateField("engineCapacity", e.target.value)}
                  />
                </div>

                <div>
                  <Label>Moc (KM)</Label>
                  <Input
                    type="number"
                    placeholder="np. 150"
                    value={formData.power}
                    onChange={(e) => updateField("power", e.target.value)}
                  />
                </div>

                <div>
                  <Label>Rodzaj paliwa</Label>
                  <Select value={formData.fuelType} onValueChange={(v) => updateField("fuelType", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz" />
                    </SelectTrigger>
                    <SelectContent>
                      {FUEL_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Skrzynia biegów</Label>
                  <Select value={formData.transmission} onValueChange={(v) => updateField("transmission", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz" />
                    </SelectTrigger>
                    <SelectContent>
                      {TRANSMISSIONS.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Napęd</Label>
                  <Select value={formData.driveType} onValueChange={(v) => updateField("driveType", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz" />
                    </SelectTrigger>
                    <SelectContent>
                      {DRIVE_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Drzwi</Label>
                    <Select value={formData.doorsCount} onValueChange={(v) => updateField("doorsCount", v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="-" />
                      </SelectTrigger>
                      <SelectContent>
                        {["2", "3", "4", "5"].map(v => (
                          <SelectItem key={v} value={v}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Miejsca</Label>
                    <Select value={formData.seatsCount} onValueChange={(v) => updateField("seatsCount", v)}>
                      <SelectTrigger>
                        <SelectValue placeholder="-" />
                      </SelectTrigger>
                      <SelectContent>
                        {["2", "4", "5", "7", "9+"].map(v => (
                          <SelectItem key={v} value={v}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 3: Condition & History */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Stan i historia
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-6">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={formData.isDamaged}
                    onCheckedChange={(v) => updateField("isDamaged", v)}
                  />
                  <Label>Pojazd uszkodzony</Label>
                </div>

                <div className="flex items-center gap-3">
                  <Switch
                    checked={formData.isImported}
                    onCheckedChange={(v) => updateField("isImported", v)}
                  />
                  <Label>Importowany</Label>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Kraj pochodzenia</Label>
                  <Select value={formData.countryOrigin} onValueChange={(v) => updateField("countryOrigin", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz" />
                    </SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map(c => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Data pierwszej rejestracji</Label>
                  <Input
                    type="date"
                    value={formData.firstRegistrationDate}
                    onChange={(e) => updateField("firstRegistrationDate", e.target.value)}
                  />
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>VIN (opcjonalnie)</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="np. WBA12345678901234"
                      value={formData.vin}
                      onChange={(e) => updateField("vin", e.target.value.toUpperCase())}
                      maxLength={17}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={decodeVin}
                      disabled={formData.vin.length !== 17 || vinLoading}
                      className="gap-1"
                    >
                      {vinLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                      Pobierz dane
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Wpisz VIN i kliknij "Pobierz dane" aby automatycznie uzupełnić dane pojazdu
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <Switch
                      checked={formData.hideVin}
                      onCheckedChange={(v) => updateField("hideVin", v)}
                    />
                    <span className="text-sm text-muted-foreground">Ukryj VIN dla kupujących</span>
                  </div>
                </div>

                <div>
                  <Label>Numer rejestracyjny (opcjonalnie)</Label>
                  <Input
                    placeholder="np. WA 12345"
                    value={formData.registrationNumber}
                    onChange={(e) => updateField("registrationNumber", e.target.value.toUpperCase())}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 4: Appearance */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Palette className="h-5 w-5 text-primary" />
                Wygląd
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Kolor</Label>
                  <Select value={formData.color} onValueChange={(v) => updateField("color", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz kolor" />
                    </SelectTrigger>
                    <SelectContent>
                      {COLORS.map(c => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Typ lakieru</Label>
                  <Select value={formData.colorType} onValueChange={(v) => updateField("colorType", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Wybierz typ" />
                    </SelectTrigger>
                    <SelectContent>
                      {COLOR_TYPES.map(c => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 5: Equipment */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-primary" />
                Wyposażenie
              </CardTitle>
              <CardDescription>Zaznacz dostępne wyposażenie pojazdu</CardDescription>
            </CardHeader>
            <CardContent>
              <EquipmentAccordion
                equipment={formData.equipment}
                onChange={(eq) => updateField("equipment", eq)}
              />
            </CardContent>
          </Card>

          {/* Section 6: Price */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gauge className="h-5 w-5 text-primary" />
                Cena
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Cena (PLN) *</Label>
                  <Input
                    type="number"
                    placeholder="np. 45000"
                    value={formData.price}
                    onChange={(e) => updateField("price", e.target.value)}
                  />
                </div>

                <div>
                  <Label>Typ transakcji</Label>
                  <Select value={formData.transactionType} onValueChange={(v) => updateField("transactionType", v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {transactionTypes.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Switch
                  checked={formData.negotiable}
                  onCheckedChange={(v) => updateField("negotiable", v)}
                />
                <Label>Cena do negocjacji</Label>
              </div>

              {/* Dynamic transaction type fields */}
              <TransactionTypeFields
                transactionType={formData.transactionType}
                rentToOwn={formData.rentToOwn}
                leasingTransfer={formData.leasingTransfer}
                exchange={formData.exchange}
                onRentToOwnChange={(data) => updateField("rentToOwn", data)}
                onLeasingTransferChange={(data) => updateField("leasingTransfer", data)}
                onExchangeChange={(data) => updateField("exchange", data)}
                shortTermRental={formData.shortTermRental}
                onShortTermRentalChange={(data) => updateField("shortTermRental", data)}
                longTermRental={formData.longTermRental}
                onLongTermRentalChange={(data) => updateField("longTermRental", data)}
                fleetPackage={formData.fleetPackage}
                onFleetPackageChange={(data) => updateField("fleetPackage", data)}
              />
            </CardContent>
          </Card>

          {/* Section 7: Contact */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5 text-primary" />
                Dane kontaktowe
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Lokalizacja / Miasto *</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="np. Warszawa"
                      value={formData.city}
                      onChange={(e) => updateField("city", e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div>
                  <Label>Imię i nazwisko</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="np. Jan Kowalski"
                      value={formData.contactName}
                      onChange={(e) => updateField("contactName", e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div>
                  <Label>Telefon kontaktowy *</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="tel"
                      placeholder="np. +48 123 456 789"
                      value={formData.contactPhone}
                      onChange={(e) => updateField("contactPhone", e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div>
                  <Label>Email kontaktowy</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder="np. jan@example.com"
                      value={formData.contactEmail}
                      onChange={(e) => updateField("contactEmail", e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 8: Description */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Opis ogłoszenia
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Tytuł ogłoszenia</Label>
                <Input
                  placeholder="np. BMW 320d M-Pakiet 2019"
                  value={formData.title}
                  onChange={(e) => updateField("title", e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Pozostaw puste, aby wygenerować automatycznie z marki, modelu i roku
                </p>
              </div>

              <div>
                <Label>Opis</Label>
                <Textarea
                  placeholder="Opisz swój pojazd - stan techniczny, historia serwisowa, dodatkowe wyposażenie..."
                  value={formData.description}
                  onChange={(e) => updateField("description", e.target.value)}
                  rows={6}
                />
              </div>

              <Button 
                variant="outline" 
                className="gap-2" 
                onClick={handleGenerateAiDescription}
                disabled={generatingDescription || !formData.brand || !formData.model}
              >
                {generatingDescription ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {generatingDescription ? "Generowanie..." : "Wygeneruj opis z AI"}
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">10 kredytów</span>
              </Button>
            </CardContent>
          </Card>

          {/* Section 9: Photos */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-primary" />
                Zdjęcia pojazdu
              </CardTitle>
              <CardDescription>
                Dodaj do 15 zdjęć. Zalecany format 4:3. Możesz poprawić zdjęcia z AI!
              </CardDescription>
            </CardHeader>
            <CardContent>
              <VehiclePhotoUpload
                photos={formData.photos}
                aiPhotos={formData.aiPhotos}
                hasAiPhotos={formData.hasAiPhotos}
                onPhotosChange={(photos) => updateField("photos", photos)}
                onAiPhotosChange={(photos) => updateField("aiPhotos", photos)}
                onHasAiPhotosChange={(v) => updateField("hasAiPhotos", v)}
                userId={user?.id}
              />
            </CardContent>
          </Card>

          {/* Submit Button */}
          <div className="flex justify-end gap-4 pt-4">
            <Button variant="outline" onClick={() => navigate("/klient")}>
              Anuluj
            </Button>
            <Button onClick={handleSubmit} disabled={submitting} size="lg" className="gap-2">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Opublikuj ogłoszenie
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

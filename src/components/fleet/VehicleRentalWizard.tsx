import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, parse, isValid } from "date-fns";
import { pl } from "date-fns/locale";
import { 
  Car, 
  User, 
  Calendar as CalendarIcon, 
  FileText, 
  Check, 
  ChevronLeft, 
  ChevronRight,
  Search,
  Plus,
  AlertCircle,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AddVehicleModal } from "@/components/AddVehicleModal";
import { AddFleetDriverModal } from "./AddFleetDriverModal";
import { EditDriverDataModal } from "./EditDriverDataModal";
import { Pencil } from "lucide-react";

interface Vehicle {
  id: string;
  plate: string;
  brand: string;
  model: string;
  year: number | null;
  status: string;
  weekly_rental_fee?: number | null;
  is_rented?: boolean;
}

interface Driver {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  pesel: string | null;
  address_street: string | null;
  address_city: string | null;
  address_postal_code: string | null;
  license_number: string | null;
}

interface VehicleRentalWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fleetId: string;
  onComplete?: () => void;
  preselectedVehicleId?: string;
}

const STEPS = [
  { id: 1, title: "Pojazd", icon: Car },
  { id: 2, title: "Okres", icon: CalendarIcon },
  { id: 3, title: "Rodzaj", icon: FileText },
  { id: 4, title: "Kierowca", icon: User },
  { id: 5, title: "Podsumowanie", icon: Check },
];

const RENTAL_TYPES = [
  { value: "standard", label: "Wynajem zwykły / prywatny", description: "Standardowa umowa najmu pojazdu" },
  { value: "taxi", label: "Wynajem taxi (Uber / Bolt)", description: "Umowa dostosowana do przewozu osób" },
  { value: "long_term", label: "Wynajem długoterminowy", description: "Umowa na dłuższy okres z preferencyjnymi warunkami" },
  { value: "buyout", label: "Wynajem z wykupem", description: "Najem z opcją wykupu pojazdu" },
];

export function VehicleRentalWizard({ 
  open, 
  onOpenChange, 
  fleetId, 
  onComplete,
  preselectedVehicleId 
}: VehicleRentalWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Step 1: Vehicle
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  
  // Step 2: Period
  const [isIndefinite, setIsIndefinite] = useState(true);
  const [rentalStart, setRentalStart] = useState<Date>(new Date());
  const [rentalEnd, setRentalEnd] = useState<Date | null>(null);
  
  // Step 3: Rental type
  const [rentalType, setRentalType] = useState("standard");
  
  // Step 4: Driver
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [driverSearch, setDriverSearch] = useState("");
  const [showAddDriver, setShowAddDriver] = useState(false);
  const [showEditDriver, setShowEditDriver] = useState(false);
  const [driverMissingFields, setDriverMissingFields] = useState<string[]>([]);
  
  // Step 5: Weekly fee
  const [weeklyFee, setWeeklyFee] = useState("");

  // Load vehicles
  useEffect(() => {
    if (open && fleetId) {
      loadVehicles();
      loadDrivers();
    }
  }, [open, fleetId]);

  // Preselect vehicle if provided
  useEffect(() => {
    if (preselectedVehicleId && vehicles.length > 0) {
      const vehicle = vehicles.find(v => v.id === preselectedVehicleId);
      if (vehicle) {
        setSelectedVehicle(vehicle);
        if (vehicle.weekly_rental_fee) {
          setWeeklyFee(vehicle.weekly_rental_fee.toString());
        }
      }
    }
  }, [preselectedVehicleId, vehicles]);

  const loadVehicles = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("vehicles")
      .select("id, plate, brand, model, year, status, weekly_rental_fee")
      .eq("fleet_id", fleetId)
      .eq("status", "aktywne")
      .order("plate");
    
    if (!error && data) {
      // Check which vehicles are currently rented
      const supabaseAny = supabase as any;
      const { data: activeRentals } = await supabaseAny
        .from("vehicle_rentals")
        .select("vehicle_id")
        .in("status", ["draft", "pending_signature", "active"]);
      
      const rentedVehicleIds = new Set((activeRentals || []).map((r: any) => r.vehicle_id));
      
      const vehiclesWithRentalStatus = data.map(v => ({
        ...v,
        is_rented: rentedVehicleIds.has(v.id)
      }));
      
      setVehicles(vehiclesWithRentalStatus);
    }
    setIsLoading(false);
  };

  const loadDrivers = async () => {
    const { data, error } = await supabase
      .from("drivers")
      .select("id, first_name, last_name, email, phone, pesel, address_street, address_city, address_postal_code, license_number")
      .eq("fleet_id", fleetId)
      .order("first_name");
    
    if (!error && data) {
      setDrivers(data as Driver[]);
    }
  };

  const validateDriver = (driver: Driver): string[] => {
    const missing: string[] = [];
    if (!driver.first_name) missing.push("Imię");
    if (!driver.last_name) missing.push("Nazwisko");
    if (!driver.pesel) missing.push("PESEL");
    if (!driver.address_street && !driver.address_city) missing.push("Adres");
    if (!driver.license_number) missing.push("Numer prawa jazdy");
    if (!driver.email) missing.push("E-mail");
    if (!driver.phone) missing.push("Telefon");
    return missing;
  };

  const handleSelectDriver = (driver: Driver) => {
    setSelectedDriver(driver);
    const missing = validateDriver(driver);
    setDriverMissingFields(missing);
  };

  const filteredVehicles = vehicles.filter(v => 
    v.plate.toLowerCase().includes(vehicleSearch.toLowerCase()) ||
    `${v.brand} ${v.model}`.toLowerCase().includes(vehicleSearch.toLowerCase())
  );

  const filteredDrivers = drivers.filter(d => 
    `${d.first_name} ${d.last_name}`.toLowerCase().includes(driverSearch.toLowerCase()) ||
    d.email?.toLowerCase().includes(driverSearch.toLowerCase()) ||
    d.phone?.includes(driverSearch)
  );

  const canProceed = (): boolean => {
    switch (currentStep) {
      case 1: return !!selectedVehicle;
      case 2: return isIndefinite || (!!rentalStart && !!rentalEnd);
      case 3: return !!rentalType;
      case 4: return !!selectedDriver && driverMissingFields.length === 0;
      case 5: return !!weeklyFee && parseFloat(weeklyFee) > 0;
      default: return false;
    }
  };

  const handleNext = () => {
    if (currentStep < 5) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleComplete = async () => {
    if (!selectedVehicle || !selectedDriver) return;
    
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Brak autoryzacji");

      // Generate access token for client portal
      const accessToken = crypto.randomUUID();

      // Create rental record using raw query (types not yet generated)
      const { data: rental, error } = await (supabase
        .from("vehicle_rentals") as any)
        .insert({
          vehicle_id: selectedVehicle.id,
          driver_id: selectedDriver.id,
          fleet_id: fleetId,
          rental_start: format(rentalStart, "yyyy-MM-dd"),
          rental_end: isIndefinite ? null : (rentalEnd ? format(rentalEnd, "yyyy-MM-dd") : null),
          is_indefinite: isIndefinite,
          rental_type: rentalType,
          weekly_rental_fee: parseFloat(weeklyFee),
          status: "draft",
          portal_access_token: accessToken,
          invitation_email: selectedDriver.email,
          created_by: user.id
        })
        .select()
        .single();

      if (error) throw error;

      // Update vehicle weekly fee
      await supabase
        .from("vehicles")
        .update({ 
          weekly_rental_fee: parseFloat(weeklyFee)
        })
        .eq("id", selectedVehicle.id);

      // Create or update vehicle assignment
      // First check if there's an existing active assignment
      const supabaseAny = supabase as any;
      const { data: existingAssignment } = await supabaseAny
        .from("vehicle_assignments")
        .select("id")
        .eq("vehicle_id", selectedVehicle.id)
        .is("unassigned_at", null)
        .single();

      if (existingAssignment?.id) {
        // Unassign current driver
        await supabaseAny
          .from("vehicle_assignments")
          .update({ unassigned_at: new Date().toISOString() })
          .eq("id", existingAssignment.id);
      }

      // Create new assignment
      await supabaseAny
        .from("vehicle_assignments")
        .insert({
          vehicle_id: selectedVehicle.id,
          driver_id: selectedDriver.id,
          assigned_at: format(rentalStart, "yyyy-MM-dd'T'HH:mm:ss")
        });

      toast.success("Najem utworzony pomyślnie!");
      toast.info("Następny krok: wyślij zaproszenie do klienta i wykonaj protokół zdjęciowy");
      
      onComplete?.();
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      console.error("Error creating rental:", error);
      toast.error(error.message || "Błąd tworzenia najmu");
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setCurrentStep(1);
    setSelectedVehicle(null);
    setSelectedDriver(null);
    setIsIndefinite(true);
    setRentalStart(new Date());
    setRentalEnd(null);
    setRentalType("standard");
    setWeeklyFee("");
    setVehicleSearch("");
    setDriverSearch("");
    setDriverMissingFields([]);
  };

  const handleClose = () => {
    onOpenChange(false);
    resetForm();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-0">
          <DialogHeader className="p-6 pb-4 border-b">
            <DialogTitle className="text-xl">Wynajmij pojazd</DialogTitle>
            
            {/* Progress steps */}
            <div className="flex items-center justify-between mt-4">
              {STEPS.map((step, index) => (
                <div key={step.id} className="flex items-center">
                  <div 
                    className={cn(
                      "flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors",
                      currentStep === step.id 
                        ? "bg-primary border-primary text-primary-foreground" 
                        : currentStep > step.id
                          ? "bg-primary/20 border-primary text-primary"
                          : "border-muted-foreground/30 text-muted-foreground"
                    )}
                  >
                    {currentStep > step.id ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      <step.icon className="h-5 w-5" />
                    )}
                  </div>
                  <span className={cn(
                    "ml-2 text-sm font-medium hidden sm:inline",
                    currentStep === step.id ? "text-foreground" : "text-muted-foreground"
                  )}>
                    {step.title}
                  </span>
                  {index < STEPS.length - 1 && (
                    <div className={cn(
                      "w-8 h-0.5 mx-2",
                      currentStep > step.id ? "bg-primary" : "bg-muted-foreground/30"
                    )} />
                  )}
                </div>
              ))}
            </div>
          </DialogHeader>

          <ScrollArea className="flex-1 p-6">
            {/* Step 1: Vehicle Selection */}
            {currentStep === 1 && (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder="Szukaj pojazdu..."
                    value={vehicleSearch}
                    onChange={(e) => setVehicleSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>

                <Button 
                  variant="outline" 
                  className="w-full gap-2"
                  onClick={() => setShowAddVehicle(true)}
                >
                  <Plus className="h-4 w-4" />
                  Dodaj nowy pojazd
                </Button>

                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="grid gap-2 max-h-[300px] overflow-y-auto">
                    {filteredVehicles.length === 0 ? (
                      <p className="text-center text-muted-foreground py-4">
                        Brak dostępnych pojazdów
                      </p>
                    ) : (
                      filteredVehicles.map(vehicle => {
                        const isSelected = selectedVehicle?.id === vehicle.id;
                        return (
                          <Card 
                            key={vehicle.id}
                            className={cn(
                              "cursor-pointer transition-all border-2",
                              isSelected 
                                ? "ring-2 ring-primary border-primary bg-primary/10 shadow-md" 
                                : "border-transparent hover:bg-accent hover:border-accent",
                              vehicle.is_rented && !isSelected && "opacity-70"
                            )}
                            onClick={() => {
                              if (vehicle.is_rented) {
                                toast.warning("Ten pojazd jest już wynajęty. Wybór spowoduje odłączenie obecnego kierowcy.", {
                                  duration: 4000
                                });
                              }
                              setSelectedVehicle(vehicle);
                              if (vehicle.weekly_rental_fee) {
                                setWeeklyFee(vehicle.weekly_rental_fee.toString());
                              }
                            }}
                          >
                            <CardContent className="p-4 flex items-center justify-between">
                              <div className="flex items-center gap-4">
                                <div className={cn(
                                  "flex items-center justify-center w-10 h-10 rounded-full",
                                  isSelected ? "bg-primary text-primary-foreground" : "bg-muted"
                                )}>
                                  {isSelected ? (
                                    <Check className="h-5 w-5" />
                                  ) : (
                                    <Car className="h-5 w-5 text-muted-foreground" />
                                  )}
                                </div>
                                <div>
                                  <p className={cn("font-semibold", isSelected && "text-primary")}>{vehicle.plate}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {vehicle.brand} {vehicle.model} {vehicle.year && `(${vehicle.year})`}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {vehicle.is_rented && (
                                  <Badge variant="destructive" className="text-xs">
                                    Wynajęty
                                  </Badge>
                                )}
                                {vehicle.weekly_rental_fee && (
                                  <Badge variant="secondary">
                                    {vehicle.weekly_rental_fee} zł/tydz.
                                  </Badge>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Rental Period */}
            {currentStep === 2 && (
              <div className="space-y-6">
                <div className="space-y-4">
                  <Label className="text-base font-medium">Okres najmu</Label>
                  
                  <div className="flex items-center gap-4">
                    <Checkbox
                      id="indefinite"
                      checked={isIndefinite}
                      onCheckedChange={(checked) => setIsIndefinite(checked === true)}
                    />
                    <Label htmlFor="indefinite" className="cursor-pointer">
                      Bezterminowo (do odwołania)
                    </Label>
                  </div>

                  {!isIndefinite && (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Data rozpoczęcia</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start gap-2">
                              <CalendarIcon className="h-4 w-4" />
                              {format(rentalStart, "dd.MM.yyyy", { locale: pl })}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar
                              mode="single"
                              selected={rentalStart}
                              onSelect={(date) => date && setRentalStart(date)}
                              locale={pl}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>

                      <div className="space-y-2">
                        <Label>Data zakończenia</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start gap-2">
                              <CalendarIcon className="h-4 w-4" />
                              {rentalEnd ? format(rentalEnd, "dd.MM.yyyy", { locale: pl }) : "Wybierz datę"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar
                              mode="single"
                              selected={rentalEnd || undefined}
                              onSelect={(date) => setRentalEnd(date || null)}
                              locale={pl}
                              disabled={(date) => date < rentalStart}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Data rozpoczęcia najmu</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start gap-2">
                        <CalendarIcon className="h-4 w-4" />
                        {format(rentalStart, "dd.MM.yyyy", { locale: pl })}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={rentalStart}
                        onSelect={(date) => date && setRentalStart(date)}
                        locale={pl}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            )}

            {/* Step 3: Rental Type */}
            {currentStep === 3 && (
              <div className="space-y-4">
                <Label className="text-base font-medium">Rodzaj najmu</Label>
                <RadioGroup value={rentalType} onValueChange={setRentalType}>
                  {RENTAL_TYPES.map(type => (
                    <Card 
                      key={type.value}
                      className={cn(
                        "cursor-pointer transition-colors",
                        rentalType === type.value && "ring-2 ring-primary bg-primary/5"
                      )}
                      onClick={() => setRentalType(type.value)}
                    >
                      <CardContent className="p-4 flex items-start gap-4">
                        <RadioGroupItem value={type.value} id={type.value} className="mt-1" />
                        <div>
                          <Label htmlFor={type.value} className="font-medium cursor-pointer">
                            {type.label}
                          </Label>
                          <p className="text-sm text-muted-foreground mt-1">
                            {type.description}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </RadioGroup>
              </div>
            )}

            {/* Step 4: Driver Selection */}
            {currentStep === 4 && (
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                  <Input
                    placeholder="Szukaj kierowcy..."
                    value={driverSearch}
                    onChange={(e) => setDriverSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>

                <Button 
                  variant="outline" 
                  className="w-full gap-2"
                  onClick={() => setShowAddDriver(true)}
                >
                  <Plus className="h-4 w-4" />
                  Dodaj nowego kierowcę
                </Button>

                {selectedDriver && driverMissingFields.length > 0 && (
                  <Card className="border-destructive bg-destructive/10">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                        <div className="flex-1">
                          <p className="font-medium text-destructive">Brakujące dane kierowcy:</p>
                          <ul className="text-sm text-destructive/80 list-disc ml-4 mt-1">
                            {driverMissingFields.map(field => (
                              <li key={field}>{field}</li>
                            ))}
                          </ul>
                          <p className="text-sm text-muted-foreground mt-2">
                            Uzupełnij dane kierowcy, aby kontynuować.
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          onClick={() => setShowEditDriver(true)}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Uzupełnij dane
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <div className="grid gap-2 max-h-[300px] overflow-y-auto">
                  {filteredDrivers.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">
                      Brak kierowców
                    </p>
                  ) : (
                    filteredDrivers.map(driver => (
                      <Card 
                        key={driver.id}
                        className={cn(
                          "cursor-pointer transition-colors hover:bg-accent",
                          selectedDriver?.id === driver.id && "ring-2 ring-primary bg-primary/5"
                        )}
                        onClick={() => handleSelectDriver(driver)}
                      >
                        <CardContent className="p-4 flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <User className="h-8 w-8 text-muted-foreground" />
                            <div>
                              <p className="font-semibold">
                                {driver.first_name} {driver.last_name}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {driver.email || driver.phone || "Brak kontaktu"}
                              </p>
                            </div>
                          </div>
                          {validateDriver(driver).length > 0 && (
                            <Badge variant="outline" className="text-destructive border-destructive">
                              Niekompletne dane
                            </Badge>
                          )}
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Step 5: Summary */}
            {currentStep === 5 && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label>Stawka tygodniowa (zł)</Label>
                  <Input
                    type="number"
                    value={weeklyFee}
                    onChange={(e) => setWeeklyFee(e.target.value)}
                    placeholder="np. 500"
                    className="text-lg"
                  />
                </div>

                <Card>
                  <CardContent className="p-4 space-y-4">
                    <h4 className="font-semibold">Podsumowanie</h4>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Pojazd:</span>
                        <p className="font-medium">
                          {selectedVehicle?.plate} - {selectedVehicle?.brand} {selectedVehicle?.model}
                        </p>
                      </div>
                      
                      <div>
                        <span className="text-muted-foreground">Kierowca:</span>
                        <p className="font-medium">
                          {selectedDriver?.first_name} {selectedDriver?.last_name}
                        </p>
                      </div>
                      
                      <div>
                        <span className="text-muted-foreground">Okres:</span>
                        <p className="font-medium">
                          {isIndefinite 
                            ? `Od ${format(rentalStart, "dd.MM.yyyy")} - bezterminowo`
                            : `${format(rentalStart, "dd.MM.yyyy")} - ${rentalEnd ? format(rentalEnd, "dd.MM.yyyy") : "?"}`
                          }
                        </p>
                      </div>
                      
                      <div>
                        <span className="text-muted-foreground">Rodzaj:</span>
                        <p className="font-medium">
                          {RENTAL_TYPES.find(t => t.value === rentalType)?.label}
                        </p>
                      </div>
                      
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Stawka:</span>
                        <p className="font-semibold text-lg text-primary">
                          {weeklyFee ? `${weeklyFee} zł / tydzień` : "—"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-primary/50 bg-primary/5">
                  <CardContent className="p-4">
                    <p className="text-sm">
                      <strong>Następne kroki po utworzeniu:</strong>
                    </p>
                    <ol className="text-sm text-muted-foreground list-decimal ml-4 mt-2 space-y-1">
                      <li>System wygeneruje umowę najmu</li>
                      <li>Wyślij link do portalu klienta z umową do podpisu</li>
                      <li>Klient zapozna się z umową i podpisze</li>
                      <li>Podpis flotowego (automatyczny lub ręczny)</li>
                      <li>Wykonaj protokół zdjęciowy pojazdu</li>
                    </ol>
                  </CardContent>
                </Card>
              </div>
            )}
          </ScrollArea>

          {/* Footer with navigation */}
          <div className="p-6 pt-4 border-t flex items-center justify-between">
            <Button
              variant="outline"
              onClick={currentStep === 1 ? handleClose : handleBack}
              disabled={isSaving}
            >
              <ChevronLeft className="h-4 w-4 mr-2" />
              {currentStep === 1 ? "Anuluj" : "Wstecz"}
            </Button>

            {currentStep < 5 ? (
              <Button onClick={handleNext} disabled={!canProceed()}>
                Dalej
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleComplete} disabled={!canProceed() || isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Utwórz najem
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Vehicle Modal */}
      <AddVehicleModal
        isOpen={showAddVehicle}
        onClose={() => setShowAddVehicle(false)}
        fleetId={fleetId}
        variant="rental"
        onSuccess={async (vehicleId) => {
          // Reload vehicles list
          await loadVehicles();
          
          // Fetch and auto-select the newly added vehicle
          const { data: newVehicle } = await supabase
            .from("vehicles")
            .select("id, plate, brand, model, year, status, weekly_rental_fee")
            .eq("id", vehicleId)
            .single();
          
          if (newVehicle) {
            setSelectedVehicle({ ...newVehicle, is_rented: false });
            if (newVehicle.weekly_rental_fee) {
              setWeeklyFee(newVehicle.weekly_rental_fee.toString());
            }
            toast.success("Pojazd dodany i wybrany do wynajmu");
          }
          
          setShowAddVehicle(false);
        }}
      />

      {/* Add Driver Modal */}
      <AddFleetDriverModal
        isOpen={showAddDriver}
        onClose={() => setShowAddDriver(false)}
        fleetId={fleetId}
        onSuccess={() => {
          loadDrivers();
          setShowAddDriver(false);
        }}
      />

      {/* Edit Driver Modal */}
      {selectedDriver && (
        <EditDriverDataModal
          isOpen={showEditDriver}
          onClose={() => setShowEditDriver(false)}
          driver={selectedDriver}
          missingFields={driverMissingFields}
          onSuccess={(updatedDriver) => {
            setSelectedDriver(updatedDriver);
            setDriverMissingFields(validateDriver(updatedDriver));
            loadDrivers();
          }}
        />
      )}
    </>
  );
}
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { 
  Search, Plus, MessageSquare, Heart, Settings, LogOut, 
  Car, Building2, User, ChevronRight, Package, Loader2,
  Truck, Users, Repeat
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

interface MarketplaceProfile {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string;
  phone: string;
  account_mode: string;
  company_name: string | null;
  listings_count: number;
}

interface City {
  id: string;
  name: string;
}

export default function MarketplaceDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<MarketplaceProfile | null>(null);
  const [activeTab, setActiveTab] = useState("start");
  const [isDriverAccount, setIsDriverAccount] = useState(false);
  const [isFleetAccount, setIsFleetAccount] = useState(false);
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [cities, setCities] = useState<City[]>([]);
  const [driverForm, setDriverForm] = useState({
    city_id: "",
    payment_method: "transfer" as "transfer" | "cash",
    iban: "",
    fleet_nip: ""
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const loadCities = async () => {
      const { data } = await supabase.from("cities").select("id, name").order("name");
      if (data) setCities(data);
    };
    loadCities();
  }, []);

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate("/gielda/logowanie");
        return;
      }

      // Check if user has driver account
      const { data: driverData } = await supabase
        .from("driver_app_users")
        .select("id")
        .eq("user_id", session.user.id)
        .maybeSingle();
      setIsDriverAccount(!!driverData);

      // Check if user has fleet account
      const { data: fleetRoles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .in("role", ["fleet_settlement", "fleet_rental"]);
      setIsFleetAccount(!!fleetRoles && fleetRoles.length > 0);

      const { data, error } = await supabase
        .from("marketplace_user_profiles")
        .select("*")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (error || !data) {
        // User logged in but no marketplace profile - create one from auth data
        const { error: createError } = await supabase
          .from("marketplace_user_profiles")
          .insert({
            user_id: session.user.id,
            first_name: session.user.user_metadata?.first_name || session.user.email?.split('@')[0] || 'Użytkownik',
            last_name: session.user.user_metadata?.last_name || null,
            email: session.user.email || '',
            phone: session.user.user_metadata?.phone || '',
            account_mode: 'buyer'
          });

        if (createError) {
          console.error("Profile creation error:", createError);
        }

        // Reload profile
        const { data: newProfile } = await supabase
          .from("marketplace_user_profiles")
          .select("*")
          .eq("user_id", session.user.id)
          .maybeSingle();

        if (newProfile) {
          setProfile(newProfile);
        } else {
          setProfile({
            id: session.user.id,
            first_name: session.user.user_metadata?.first_name || 'Użytkownik',
            last_name: session.user.user_metadata?.last_name || null,
            email: session.user.email || '',
            phone: '',
            account_mode: 'buyer',
            company_name: null,
            listings_count: 0
          });
        }
        setLoading(false);
        return;
      }

      setProfile(data);
      setLoading(false);
    };

    loadProfile();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        navigate("/gielda/logowanie");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Wylogowano");
    navigate("/gielda");
  };

  const handleUpgradeToSeller = async (mode: 'private_seller' | 'business') => {
    if (!profile) return;

    const { error } = await supabase
      .from("marketplace_user_profiles")
      .update({ account_mode: mode })
      .eq("id", profile.id);

    if (error) {
      toast.error("Błąd zmiany trybu konta");
      return;
    }

    setProfile({ ...profile, account_mode: mode });
    toast.success(mode === 'business' ? "Konto firmowe aktywowane" : "Tryb sprzedawcy aktywowany");
  };

  const handleDriverRegistration = async () => {
    if (!driverForm.city_id) {
      toast.error("Wybierz miasto");
      return;
    }
    if (!driverForm.fleet_nip) {
      toast.error("Podaj NIP partnera flotowego");
      return;
    }
    if (driverForm.payment_method === "transfer" && !driverForm.iban) {
      toast.error("Podaj numer konta IBAN");
      return;
    }

    setSubmitting(true);
    try {
      // Find fleet by NIP
      const { data: fleet, error: fleetError } = await supabase
        .from("fleets")
        .select("id, name")
        .eq("nip", driverForm.fleet_nip.replace(/\s/g, ""))
        .maybeSingle();

      if (fleetError || !fleet) {
        toast.error("Nie znaleziono floty o podanym NIP");
        setSubmitting(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Brak sesji użytkownika");
        setSubmitting(false);
        return;
      }

      // Create driver record
      const { data: driver, error: driverError } = await supabase
        .from("drivers")
        .insert({
          first_name: profile?.first_name || '',
          last_name: profile?.last_name || '',
          email: profile?.email || session.user.email,
          phone: profile?.phone || '',
          city_id: driverForm.city_id,
          payment_method: driverForm.payment_method,
          iban: driverForm.payment_method === "transfer" ? driverForm.iban : null,
          fleet_id: fleet.id
        })
        .select()
        .single();

      if (driverError) {
        console.error("Driver creation error:", driverError);
        toast.error("Błąd tworzenia profilu kierowcy");
        setSubmitting(false);
        return;
      }

      // Link auth user to driver
      const { error: linkError } = await supabase.rpc('link_auth_user_to_driver', {
        p_user_id: session.user.id,
        p_driver_id: driver.id
      });

      if (linkError) {
        console.error("Link error:", linkError);
        toast.error("Błąd powiązania konta");
        setSubmitting(false);
        return;
      }

      toast.success(`Zarejestrowano jako kierowca w flocie ${fleet.name}`);
      setShowDriverModal(false);
      setIsDriverAccount(true);
      navigate("/driver");
    } catch (error) {
      console.error("Registration error:", error);
      toast.error("Błąd rejestracji kierowcy");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSwitchAccount = (type: 'driver' | 'fleet' | 'marketplace') => {
    if (type === 'driver') {
      if (isDriverAccount) {
        navigate("/driver");
      } else {
        setShowDriverModal(true);
      }
    } else if (type === 'fleet') {
      if (isFleetAccount) {
        navigate("/fleet/dashboard");
      } else {
        toast.info("Rejestracja floty - wkrótce dostępna");
      }
    } else {
      // Already on marketplace
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div 
              className="flex items-center gap-3 cursor-pointer" 
              onClick={() => navigate("/gielda")}
            >
              <img 
                src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" 
                alt="RIDO" 
                className="h-9 w-9"
              />
              <span className="text-xl font-bold">RIDO</span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground hidden sm:block">
                {profile?.first_name} {profile?.last_name}
              </span>
              <Badge variant={profile?.account_mode === 'business' ? 'default' : 'secondary'}>
                {profile?.account_mode === 'buyer' && 'Kupujący'}
                {profile?.account_mode === 'private_seller' && 'Sprzedawca'}
                {profile?.account_mode === 'business' && 'Firma'}
              </Badge>

              {/* Switch Account Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <Repeat className="h-4 w-4" />
                    <span className="hidden sm:inline">Przełącz konto</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Twoje konta</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  
                  <DropdownMenuItem disabled className="flex items-center gap-2 bg-muted">
                    <User className="h-4 w-4" />
                    <span>Konto główne (giełda)</span>
                    <Badge variant="outline" className="ml-auto text-xs">aktywne</Badge>
                  </DropdownMenuItem>

                  <DropdownMenuItem 
                    onClick={() => handleSwitchAccount('driver')}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Car className="h-4 w-4" />
                    <span>Konto kierowcy</span>
                    {isDriverAccount ? (
                      <Badge variant="secondary" className="ml-auto text-xs">zarejestrowany</Badge>
                    ) : (
                      <Badge variant="outline" className="ml-auto text-xs">dołącz</Badge>
                    )}
                  </DropdownMenuItem>

                  <DropdownMenuItem 
                    onClick={() => handleSwitchAccount('fleet')}
                    className="flex items-center gap-2 cursor-pointer"
                  >
                    <Truck className="h-4 w-4" />
                    <span>Konto flotowe</span>
                    {isFleetAccount ? (
                      <Badge variant="secondary" className="ml-auto text-xs">aktywne</Badge>
                    ) : (
                      <Badge variant="outline" className="ml-auto text-xs">wkrótce</Badge>
                    )}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button variant="ghost" size="icon" onClick={handleLogout}>
                <LogOut className="h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 max-w-2xl">
            <TabsTrigger value="start">Start</TabsTrigger>
            <TabsTrigger value="listings">Ogłoszenia</TabsTrigger>
            <TabsTrigger value="messages">Wiadomości</TabsTrigger>
            <TabsTrigger value="favorites">Ulubione</TabsTrigger>
            <TabsTrigger value="settings">Ustawienia</TabsTrigger>
          </TabsList>

          {/* START TAB */}
          <TabsContent value="start" className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Search Card */}
              <Card 
                className="cursor-pointer hover:shadow-lg transition-shadow group"
                onClick={() => navigate("/gielda")}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <Search className="h-10 w-10 text-primary" />
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                  </div>
                  <CardTitle className="text-xl">Szukam</CardTitle>
                  <CardDescription>
                    Przeglądaj oferty pojazdów, nieruchomości i usług
                  </CardDescription>
                </CardHeader>
              </Card>

              {/* Sell Card */}
              <Card 
                className="cursor-pointer hover:shadow-lg transition-shadow group"
                onClick={() => {
                  if (profile?.account_mode === 'buyer') {
                    setActiveTab("settings");
                  } else {
                    setActiveTab("listings");
                  }
                }}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <Plus className="h-10 w-10 text-accent" />
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                  </div>
                  <CardTitle className="text-xl">Sprzedaję</CardTitle>
                  <CardDescription>
                    {profile?.account_mode === 'buyer' 
                      ? "Aktywuj tryb sprzedawcy, aby wystawiać ogłoszenia"
                      : "Dodaj nowe ogłoszenie lub zarządzaj istniejącymi"
                    }
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <Package className="h-6 w-6 mx-auto mb-2 text-primary" />
                  <p className="text-2xl font-bold">{profile?.listings_count || 0}</p>
                  <p className="text-sm text-muted-foreground">Ogłoszenia</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <MessageSquare className="h-6 w-6 mx-auto mb-2 text-primary" />
                  <p className="text-2xl font-bold">0</p>
                  <p className="text-sm text-muted-foreground">Wiadomości</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <Heart className="h-6 w-6 mx-auto mb-2 text-primary" />
                  <p className="text-2xl font-bold">0</p>
                  <p className="text-sm text-muted-foreground">Ulubione</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <Search className="h-6 w-6 mx-auto mb-2 text-primary" />
                  <p className="text-2xl font-bold">0</p>
                  <p className="text-sm text-muted-foreground">Zapisane wyszukiwania</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* LISTINGS TAB */}
          <TabsContent value="listings" className="space-y-6">
            {profile?.account_mode === 'buyer' ? (
              <Card>
                <CardHeader>
                  <CardTitle>Aktywuj tryb sprzedawcy</CardTitle>
                  <CardDescription>
                    Wybierz typ konta, aby móc wystawiać ogłoszenia
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid md:grid-cols-2 gap-4">
                  <Button 
                    variant="outline" 
                    className="h-auto p-6 flex flex-col items-center gap-2"
                    onClick={() => handleUpgradeToSeller('private_seller')}
                  >
                    <User className="h-8 w-8" />
                    <span className="font-semibold">Osoba prywatna</span>
                    <span className="text-xs text-muted-foreground">Sprzedaż okazjonalna</span>
                  </Button>
                  <Button 
                    variant="outline" 
                    className="h-auto p-6 flex flex-col items-center gap-2"
                    onClick={() => handleUpgradeToSeller('business')}
                  >
                    <Building2 className="h-8 w-8" />
                    <span className="font-semibold">Firma / Komis</span>
                    <span className="text-xs text-muted-foreground">Wiele ogłoszeń, zespół</span>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-xl font-semibold">Moje ogłoszenia</h2>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Dodaj ogłoszenie
                  </Button>
                </div>
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <Car className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nie masz jeszcze żadnych ogłoszeń</p>
                    <Button variant="link" className="mt-2">
                      Dodaj pierwsze ogłoszenie
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* MESSAGES TAB */}
          <TabsContent value="messages">
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Brak wiadomości</p>
                <p className="text-sm">Tu pojawią się Twoje rozmowy z innymi użytkownikami</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* FAVORITES TAB */}
          <TabsContent value="favorites">
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Heart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Brak ulubionych ogłoszeń</p>
                <Button variant="link" onClick={() => navigate("/gielda")}>
                  Przeglądaj oferty
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* SETTINGS TAB */}
          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Dane osobowe
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Imię</p>
                    <p className="font-medium">{profile?.first_name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Nazwisko</p>
                    <p className="font-medium">{profile?.last_name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <p className="font-medium">{profile?.email}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Telefon</p>
                    <p className="font-medium">{profile?.phone}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Account Mode */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Typ konta
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-4">
                  <Badge variant={profile?.account_mode === 'buyer' ? 'default' : 'secondary'}>
                    {profile?.account_mode === 'buyer' && 'Kupujący'}
                    {profile?.account_mode === 'private_seller' && 'Sprzedawca prywatny'}
                    {profile?.account_mode === 'business' && 'Firma'}
                  </Badge>
                </div>

                {profile?.account_mode === 'buyer' && (
                  <div className="pt-4 border-t space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Chcesz sprzedawać? Wybierz typ konta:
                    </p>
                    <div className="flex gap-3">
                      <Button variant="outline" onClick={() => handleUpgradeToSeller('private_seller')}>
                        <User className="h-4 w-4 mr-2" />
                        Osoba prywatna
                      </Button>
                      <Button variant="outline" onClick={() => handleUpgradeToSeller('business')}>
                        <Building2 className="h-4 w-4 mr-2" />
                        Firma
                      </Button>
                    </div>
                  </div>
                )}

                {profile?.account_mode === 'business' && (
                  <div className="pt-4 border-t space-y-3">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Nazwa firmy</p>
                        <p className="font-medium">{profile.company_name || 'Nie podano'}</p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">
                      Edytuj dane firmowe
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Driver Registration Modal */}
      <Dialog open={showDriverModal} onOpenChange={setShowDriverModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Car className="h-5 w-5" />
              Zarejestruj się jako kierowca
            </DialogTitle>
            <DialogDescription>
              Podaj dane, aby dołączyć do floty partnera
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="fleet_nip">NIP partnera flotowego *</Label>
              <Input
                id="fleet_nip"
                placeholder="np. 5223252793"
                value={driverForm.fleet_nip}
                onChange={(e) => setDriverForm({ ...driverForm, fleet_nip: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Podaj NIP floty, do której chcesz dołączyć
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="city">Miasto *</Label>
              <Select 
                value={driverForm.city_id} 
                onValueChange={(value) => setDriverForm({ ...driverForm, city_id: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Wybierz miasto" />
                </SelectTrigger>
                <SelectContent>
                  {cities.map((city) => (
                    <SelectItem key={city.id} value={city.id}>
                      {city.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Metoda płatności *</Label>
              <RadioGroup 
                value={driverForm.payment_method}
                onValueChange={(value: "transfer" | "cash") => 
                  setDriverForm({ ...driverForm, payment_method: value })
                }
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="transfer" id="transfer" />
                  <Label htmlFor="transfer" className="cursor-pointer">Przelew</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="cash" id="cash" />
                  <Label htmlFor="cash" className="cursor-pointer">Gotówka</Label>
                </div>
              </RadioGroup>
            </div>

            {driverForm.payment_method === "transfer" && (
              <div className="space-y-2">
                <Label htmlFor="iban">Numer konta IBAN *</Label>
                <Input
                  id="iban"
                  placeholder="PL 00 0000 0000 0000 0000 0000 0000"
                  value={driverForm.iban}
                  onChange={(e) => setDriverForm({ ...driverForm, iban: e.target.value })}
                />
              </div>
            )}

            {driverForm.payment_method === "cash" && (
              <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
                💵 Gotówka do odbioru w każdy wtorek w biurze partnera
              </p>
            )}

            <Button 
              onClick={handleDriverRegistration} 
              className="w-full"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Rejestracja...
                </>
              ) : (
                "Zarejestruj jako kierowca"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

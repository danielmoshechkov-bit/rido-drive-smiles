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
  Truck, Users, Repeat, Home, Globe, Briefcase
} from "lucide-react";
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
import { useFeatureToggles } from "@/hooks/useFeatureToggles";
import { DriverOnboardingWizard } from "@/components/driver/DriverOnboardingWizard";
import { AccountSwitcherPanel } from "@/components/AccountSwitcherPanel";
import { AddListingModal } from "@/components/AddListingModal";
import { UniversalHomeButton } from "@/components/UniversalHomeButton";
import { GeneralListingsTab } from "@/components/marketplace/GeneralListingsTab";
import { MyListingsTab } from "@/components/marketplace/MyListingsTab";
import { MyPurchasesTab } from "@/components/marketplace/MyPurchasesTab";
import { ShoppingBag, Store } from "lucide-react";

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
  const { features } = useFeatureToggles();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<MarketplaceProfile | null>(null);
  const [activeTab, setActiveTab] = useState("start");
  const [user, setUser] = useState<any>(null);
  const [isDriverAccount, setIsDriverAccount] = useState(false);
  const [isFleetAccount, setIsFleetAccount] = useState(false);
  const [isRealEstateAccount, setIsRealEstateAccount] = useState(false);
  const [isAdminAccount, setIsAdminAccount] = useState(false);
  const [isSalesAdmin, setIsSalesAdmin] = useState(false);
  const [isSalesRep, setIsSalesRep] = useState(false);
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [showAccountsModal, setShowAccountsModal] = useState(false);
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
      
      setUser(session.user);

      // Check if user has driver account
      const { data: driverData } = await supabase
        .from("driver_app_users")
        .select("user_id")
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

      // Check if user has real estate account
      const { data: realEstateRoles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .in("role", ["real_estate_agent", "real_estate_admin"]);
      setIsRealEstateAccount(!!realEstateRoles && realEstateRoles.length > 0);

      // Check if user has admin account
      const isMainAdmin = session.user.email === 'daniel.moshechkov@gmail.com';
      const { data: adminRole } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .eq("role", "admin")
        .maybeSingle();
      setIsAdminAccount(isMainAdmin || !!adminRole);

      // Check for sales accounts
      const { data: salesRoles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .in("role", ["sales_admin", "sales_rep"]);
      if (salesRoles) {
        setIsSalesAdmin(salesRoles.some((r: any) => r.role === 'sales_admin'));
        setIsSalesRep(salesRoles.some((r: any) => r.role === 'sales_rep'));
      }

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

  const handleUpgradeToSeller = async (mode: 'buyer' | 'private_seller' | 'business') => {
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

  const handleSwitchAccount = async (type: 'driver' | 'fleet' | 'marketplace') => {
    if (type === 'driver') {
      // Re-check driver account status asynchronously to avoid stale state
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: driverData } = await supabase
          .from("driver_app_users")
          .select("user_id")
          .eq("user_id", session.user.id)
          .maybeSingle();
        
        if (driverData) {
          setIsDriverAccount(true);
          navigate("/driver");
          return;
        }
      }
      // If no driver account, show registration modal
      setShowDriverModal(true);
    } else if (type === 'fleet') {
      if (isFleetAccount) {
        navigate("/fleet/dashboard");
      } else {
        navigate("/fleet/rejestracja");
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
            <div className="flex items-center gap-4">
              <UniversalHomeButton />
              <span className="text-xl font-bold text-primary">Mój panel</span>
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

              {/* Add Listing Modal with category selection */}
              <AddListingModal user={user} />

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
          {/* Tab bar with account switcher as a tab */}
          <TabsList className="flex gap-2 overflow-x-auto scrollbar-hide bg-primary text-white rounded-full p-1 shadow-soft h-12">
            <TabsTrigger 
              value="start"
              className="px-5 py-2.5 rounded-full text-sm whitespace-nowrap transition-all duration-150 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:font-semibold hover:bg-white/90 hover:text-primary"
            >
              Start
            </TabsTrigger>
            <TabsTrigger 
              value="listings"
              className="px-5 py-2.5 rounded-full text-sm whitespace-nowrap transition-all duration-150 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:font-semibold hover:bg-white/90 hover:text-primary"
            >
              Ogłoszenia (Pojazdy)
            </TabsTrigger>
            <TabsTrigger 
              value="general"
              className="px-5 py-2.5 rounded-full text-sm whitespace-nowrap transition-all duration-150 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:font-semibold hover:bg-white/90 hover:text-primary"
            >
              Marketplace
            </TabsTrigger>
            <TabsTrigger 
              value="messages"
              className="px-5 py-2.5 rounded-full text-sm whitespace-nowrap transition-all duration-150 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:font-semibold hover:bg-white/90 hover:text-primary"
            >
              Wiadomości
            </TabsTrigger>
            <TabsTrigger 
              value="favorites"
              className="px-5 py-2.5 rounded-full text-sm whitespace-nowrap transition-all duration-150 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:font-semibold hover:bg-white/90 hover:text-primary"
            >
              Ulubione
            </TabsTrigger>
            <TabsTrigger 
              value="my-listings"
              className="px-5 py-2.5 rounded-full text-sm whitespace-nowrap transition-all duration-150 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:font-semibold hover:bg-white/90 hover:text-primary"
            >
              <Store className="h-4 w-4 mr-1" />
              Moje ogłoszenia
            </TabsTrigger>
            <TabsTrigger 
              value="my-purchases"
              className="px-5 py-2.5 rounded-full text-sm whitespace-nowrap transition-all duration-150 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:font-semibold hover:bg-white/90 hover:text-primary"
            >
              <ShoppingBag className="h-4 w-4 mr-1" />
              Moje zakupy
            </TabsTrigger>
            <TabsTrigger 
              value="settings"
              className="px-5 py-2.5 rounded-full text-sm whitespace-nowrap transition-all duration-150 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:font-semibold hover:bg-white/90 hover:text-primary"
            >
              Ustawienia
            </TabsTrigger>
            {features.account_switching_enabled && (
              <TabsTrigger 
                value="accounts"
                className="px-5 py-2.5 rounded-full text-sm whitespace-nowrap transition-all duration-150 data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:font-semibold hover:bg-white/90 hover:text-primary"
              >
                <Repeat className="h-4 w-4 mr-2" />
                Wybierz moduł
              </TabsTrigger>
            )}
          </TabsList>

          {/* START TAB */}
          <TabsContent value="start" className="space-y-6">
            <div className="grid md:grid-cols-3 gap-6">
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

              {/* Switch Account Card */}
              <Card 
                className="cursor-pointer hover:shadow-lg transition-shadow group"
                onClick={() => setShowAccountsModal(true)}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <Users className="h-10 w-10 text-green-500" />
                    <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                  </div>
                  <CardTitle className="text-xl">Wybierz moduł</CardTitle>
                  <CardDescription>
                    Zarządzaj kontami kierowcy, floty i sprzedawcy
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
                  <Button onClick={() => navigate("/gielda/dodaj-pojazd")}>
                    <Plus className="h-4 w-4 mr-2" />
                    Dodaj ogłoszenie
                  </Button>
                </div>
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Nie masz jeszcze żadnych ogłoszeń</p>
                    <Button variant="link" className="mt-2" onClick={() => navigate("/gielda/dodaj-pojazd")}>
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

          {/* GENERAL MARKETPLACE TAB */}
          <TabsContent value="general" className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold">RidoMarket — Ogłoszenia</h2>
                <p className="text-sm text-muted-foreground">Twoje ogłoszenia z marketplace ogólnego</p>
              </div>
              <Button onClick={() => navigate("/marketplace/dodaj")}>
                <Plus className="h-4 w-4 mr-2" />
                Dodaj ogłoszenie
              </Button>
            </div>
            <GeneralListingsTab userId={user?.id} />
          </TabsContent>


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

                {(profile?.account_mode === 'private_seller' || profile?.account_mode === 'business') && (
                  <div className="pt-4 border-t space-y-3">
                    {profile?.account_mode === 'business' && (
                      <div className="grid md:grid-cols-2 gap-4 mb-4">
                        <div>
                          <p className="text-sm text-muted-foreground">Nazwa firmy</p>
                          <p className="font-medium">{profile.company_name || 'Nie podano'}</p>
                        </div>
                      </div>
                    )}
                    
                    <p className="text-sm text-muted-foreground">Zmień typ konta:</p>
                    <div className="flex flex-wrap gap-2">
                      <Button 
                        variant="outline"
                        size="sm"
                        onClick={() => handleUpgradeToSeller('buyer')}
                      >
                        Kupujący
                      </Button>
                      <Button 
                        variant={profile?.account_mode === 'private_seller' ? 'default' : 'outline'} 
                        size="sm"
                        onClick={() => handleUpgradeToSeller('private_seller')}
                        disabled={profile?.account_mode === 'private_seller'}
                      >
                        <User className="h-4 w-4 mr-2" />
                        Osoba prywatna
                      </Button>
                      <Button 
                        variant={profile?.account_mode === 'business' ? 'default' : 'outline'} 
                        size="sm"
                        onClick={() => handleUpgradeToSeller('business')}
                        disabled={profile?.account_mode === 'business'}
                      >
                        <Building2 className="h-4 w-4 mr-2" />
                        Firma
                      </Button>
                    </div>
                    
                    {profile?.account_mode === 'business' && (
                      <Button variant="outline" size="sm" className="mt-2">
                        Edytuj dane firmowe
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Accounts Management Modal */}
      <Dialog open={showAccountsModal} onOpenChange={setShowAccountsModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Twoje konta</DialogTitle>
            <DialogDescription>
              Przełącz na inne konto lub utwórz nowe
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3">
            {/* Main Account - always visible */}
            <Card className="bg-muted/50 border-primary">
              <CardContent className="p-4 flex items-center gap-3">
                <User className="h-6 w-6 text-primary" />
                <div className="flex-1">
                  <p className="font-medium">Konto główne (Giełda)</p>
                  <p className="text-sm text-muted-foreground">{profile?.email}</p>
                </div>
                <Badge variant="outline" className="text-primary border-primary">Aktywne</Badge>
              </CardContent>
            </Card>
            
            {/* Driver Account */}
            {isDriverAccount ? (
              <Card 
                className="cursor-pointer hover:bg-muted/30 transition-colors" 
                onClick={() => {
                  setShowAccountsModal(false);
                  navigate("/driver");
                }}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <Car className="h-6 w-6 text-primary" />
                  <div className="flex-1">
                    <p className="font-medium">Konto kierowcy</p>
                    <p className="text-sm text-muted-foreground">Zarejestrowany</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </CardContent>
              </Card>
            ) : (
              <Card 
                className="cursor-pointer hover:bg-muted/30 transition-colors" 
                onClick={() => {
                  setShowAccountsModal(false);
                  setShowDriverModal(true);
                }}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <Car className="h-6 w-6 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="font-medium">Konto kierowcy</p>
                    <p className="text-sm text-muted-foreground">Zarejestruj się jako kierowca</p>
                  </div>
                  <Plus className="h-5 w-5 text-muted-foreground" />
                </CardContent>
              </Card>
            )}
            
            {/* Admin Account */}
            {isAdminAccount && (
              <Card 
                className="cursor-pointer hover:bg-muted/30 transition-colors" 
                onClick={() => {
                  setShowAccountsModal(false);
                  navigate("/admin/dashboard");
                }}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <Globe className="h-6 w-6 text-primary" />
                  <div className="flex-1">
                    <p className="font-medium">Administrator</p>
                    <p className="text-sm text-muted-foreground">Panel administracyjny</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </CardContent>
              </Card>
            )}

            {/* Sales Account */}
            {(isSalesAdmin || isSalesRep) && (
              <Card 
                className="cursor-pointer hover:bg-muted/30 transition-colors" 
                onClick={() => {
                  setShowAccountsModal(false);
                  navigate("/sprzedaz");
                }}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <Briefcase className="h-6 w-6 text-primary" />
                  <div className="flex-1">
                    <p className="font-medium">{isSalesAdmin ? 'CRM Sprzedaż' : 'Handlowiec'}</p>
                    <p className="text-sm text-muted-foreground">Portal sprzedażowy</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </CardContent>
              </Card>
            )}

            {/* Fleet Account */}
            {isFleetAccount ? (
              <Card 
                className="cursor-pointer hover:bg-muted/30 transition-colors" 
                onClick={() => {
                  setShowAccountsModal(false);
                  navigate("/fleet/dashboard");
                }}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <Truck className="h-6 w-6 text-primary" />
                  <div className="flex-1">
                    <p className="font-medium">Konto flotowe</p>
                    <p className="text-sm text-muted-foreground">Partner flotowy</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </CardContent>
              </Card>
            ) : (
              <Card 
                className="cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => navigate("/fleet/rejestracja")}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <Truck className="h-6 w-6 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="font-medium">Konto flotowe</p>
                    <p className="text-sm text-muted-foreground">Zarządzaj flotą pojazdów</p>
                  </div>
                  <Plus className="h-5 w-5 text-muted-foreground" />
                </CardContent>
              </Card>
            )}
            
            {/* Seller Account */}
            {(profile?.account_mode === 'private_seller' || profile?.account_mode === 'business') ? (
              <Card 
                className="cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => {
                  setShowAccountsModal(false);
                  setActiveTab("listings");
                }}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <Building2 className="h-6 w-6 text-primary" />
                  <div className="flex-1">
                    <p className="font-medium">Konto sprzedawcy</p>
                    <p className="text-sm text-muted-foreground">
                      {profile?.account_mode === 'business' ? 'Firma' : 'Osoba prywatna'}
                    </p>
                  </div>
                  <Badge variant="secondary">Aktywne</Badge>
                </CardContent>
              </Card>
            ) : (
              <Card 
                className="cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => {
                  setShowAccountsModal(false);
                  setActiveTab("listings");
                }}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <Building2 className="h-6 w-6 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="font-medium">Konto sprzedawcy</p>
                    <p className="text-sm text-muted-foreground">Aktywuj tryb sprzedawcy</p>
                  </div>
                  <Plus className="h-5 w-5 text-muted-foreground" />
                </CardContent>
              </Card>
            )}
            
            {/* Real Estate Agent Account */}
            {isRealEstateAccount ? (
              <Card 
                className="cursor-pointer hover:bg-muted/30 transition-colors" 
                onClick={() => {
                  setShowAccountsModal(false);
                  navigate("/nieruchomosci/agent/panel");
                }}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <Home className="h-6 w-6 text-primary" />
                  <div className="flex-1">
                    <p className="font-medium">Konto agenta nieruchomości</p>
                    <p className="text-sm text-muted-foreground">Zarejestrowany</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </CardContent>
              </Card>
            ) : (
              <Card 
                className="cursor-pointer hover:bg-muted/30 transition-colors" 
                onClick={() => {
                  setShowAccountsModal(false);
                  navigate("/nieruchomosci/agent/rejestracja");
                }}
              >
                <CardContent className="p-4 flex items-center gap-3">
                  <Home className="h-6 w-6 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="font-medium">Konto agenta nieruchomości</p>
                    <p className="text-sm text-muted-foreground">Publikuj oferty nieruchomości</p>
                  </div>
                  <Plus className="h-5 w-5 text-muted-foreground" />
                </CardContent>
              </Card>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Driver Registration Modal - Full Wizard */}
      <Dialog open={showDriverModal} onOpenChange={setShowDriverModal}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Car className="h-5 w-5" />
              Rejestracja kierowcy
            </DialogTitle>
            <DialogDescription>
              Wypełnij formularz, aby zarejestrować się jako kierowca
            </DialogDescription>
          </DialogHeader>
          
          {profile && (
            <DriverOnboardingWizard
              profile={{
                first_name: profile.first_name,
                last_name: profile.last_name,
                email: profile.email,
                phone: profile.phone
              }}
              onComplete={() => {
                setShowDriverModal(false);
                setIsDriverAccount(true);
                navigate("/driver");
              }}
              onCancel={() => setShowDriverModal(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

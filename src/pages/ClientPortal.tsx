import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UniversalHomeButton } from '@/components/UniversalHomeButton';
import { AccountSwitcherPanel } from '@/components/AccountSwitcherPanel';
import { TabsPill } from '@/components/ui/TabsPill';
import { TabsContent, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  ArrowLeft,
  Car,
  Home,
  FileText,
  Clock,
  CheckCircle,
  User,
  Calendar,
  MessageSquare,
  Heart,
  ShoppingCart,
  Settings,
  RefreshCw,
  Package,
  Plus,
  LogOut,
  Menu,
  ChevronDown
} from 'lucide-react';
import { toast } from 'sonner';
import LanguageSelector from '@/components/LanguageSelector';

interface VehicleListing {
  id: string;
  title: string;
  price: number;
  status: string;
  created_at: string;
  photos: string[];
}

interface PropertyListing {
  id: string;
  title: string;
  price: number;
  status: string;
  created_at: string;
  photos: string[];
}

export default function ClientPortal() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('ogloszenia');
  
  // Account types
  const [isDriverAccount, setIsDriverAccount] = useState(false);
  const [isFleetAccount, setIsFleetAccount] = useState(false);
  const [isMarketplaceAccount, setIsMarketplaceAccount] = useState(false);
  const [isRealEstateAccount, setIsRealEstateAccount] = useState(false);
  const [isAdminAccount, setIsAdminAccount] = useState(false);
  
  // User listings
  const [vehicleListings, setVehicleListings] = useState<VehicleListing[]>([]);
  const [propertyListings, setPropertyListings] = useState<PropertyListing[]>([]);
  const [favorites, setFavorites] = useState<any[]>([]);

  useEffect(() => {
    checkUser();
  }, []);

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
    
    if (!user) {
      toast.error('Zaloguj się, aby uzyskać dostęp');
      navigate('/easy/login');
      return;
    }

    // Check account types
    await Promise.all([
      checkDriverAccount(user.id),
      checkFleetAccount(user.id),
      checkMarketplaceAccount(user.id),
      checkRealEstateAccount(user.id),
      checkAdminAccount(user.id),
      fetchUserListings(user.id),
      fetchUserFavorites(user.id)
    ]);
    
    setLoading(false);
  };

  const checkDriverAccount = async (userId: string) => {
    const { data } = await supabase
      .from('driver_app_users')
      .select('driver_id')
      .eq('user_id', userId)
      .maybeSingle();
    setIsDriverAccount(!!data?.driver_id);
  };

  const checkFleetAccount = async (userId: string) => {
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .in('role', ['fleet_settlement', 'fleet_rental'])
      .maybeSingle();
    setIsFleetAccount(!!data);
  };

  const checkMarketplaceAccount = async (userId: string) => {
    const { data } = await supabase
      .from('marketplace_user_profiles')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    setIsMarketplaceAccount(!!data);
  };

  const checkRealEstateAccount = async (userId: string) => {
    const { data } = await supabase
      .from('real_estate_agents')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    setIsRealEstateAccount(!!data);
  };

  const checkAdminAccount = async (userId: string) => {
    const { data } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    setIsAdminAccount(!!data);
  };

  const fetchUserListings = async (userId: string) => {
    // Fetch vehicle listings
    const vehicleResult = await (supabase as any)
      .from('vehicle_listings')
      .select('id, title, price, status, created_at, photos')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (vehicleResult.data) {
      setVehicleListings(vehicleResult.data as VehicleListing[]);
    }

    // Fetch property listings (via real estate agent if applicable)
    const agentResult = await (supabase as any)
      .from('real_estate_agents')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (agentResult.data) {
      const propertyResult = await (supabase as any)
        .from('property_listings')
        .select('id, title, price, status, created_at, photos')
        .eq('agent_id', agentResult.data.id)
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (propertyResult.data) {
        setPropertyListings(propertyResult.data as PropertyListing[]);
      }
    }
  };

  const fetchUserFavorites = async (userId: string) => {
    const favResult = await (supabase as any)
      .from('vehicle_favorites')
      .select('id, vehicle_id')
      .eq('user_id', userId)
      .limit(10);
    
    const favData = favResult.data as { id: string; vehicle_id: string }[] | null;
    
    if (favData && favData.length > 0) {
      // Fetch the related vehicle listings
      const vehicleIds = favData.map((f: any) => f.vehicle_id);
      const vehicleResult = await (supabase as any)
        .from('vehicle_listings')
        .select('id, title, price, photos')
        .in('id', vehicleIds);
      
      const vehicleData = vehicleResult.data as { id: string; title: string; price: number; photos: string[] }[] | null;
      
      if (vehicleData) {
        const favoritesWithVehicles = favData.map((fav: any) => ({
          ...fav,
          vehicle_listings: vehicleData.find((v: any) => v.id === fav.vehicle_id)
        }));
        setFavorites(favoritesWithVehicles);
      }
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-500/10 text-green-600">Aktywne</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-500/10 text-yellow-600">Oczekuje</Badge>;
      case 'sold':
      case 'completed':
        return <Badge className="bg-blue-500/10 text-blue-600">Zakończone</Badge>;
      case 'inactive':
        return <Badge className="bg-muted text-muted-foreground">Nieaktywne</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const totalListings = vehicleListings.length + propertyListings.length;

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Header - matching DriverDashboard style */}
      <div className="bg-white border-b shadow-sm">
        <div className="container mx-auto px-4 py-4">
          {/* Desktop header */}
          <div className="hidden md:flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <UniversalHomeButton />
              <div className="flex items-center gap-2 text-sm">
                <User className="h-5 w-5 text-primary" />
                <span className="font-semibold text-primary">Moje konto</span>
                <span className="text-muted-foreground">-</span>
                <span className="font-medium text-foreground">
                  {user?.email?.split('@')[0]}
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <div className="scale-90">
                <LanguageSelector />
              </div>
              <Button variant="outline" onClick={handleLogout} size="sm" className="rounded-lg text-sm">
                <LogOut className="h-4 w-4 mr-1" />
                Wyloguj
              </Button>
            </div>
          </div>

          {/* Mobile header */}
          <div className="md:hidden flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <UniversalHomeButton />
              <User className="h-5 w-5 text-primary" />
            </div>
            <div className="flex items-center gap-2">
              <LanguageSelector />
              <Button variant="ghost" size="icon" onClick={handleLogout}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <main className="container mx-auto px-4 py-6">
        {/* Desktop TabsPill - matching driver dashboard */}
        <div className="hidden md:block mb-6">
          <TabsPill value={activeTab} onValueChange={setActiveTab}>
            <TabsTrigger value="ogloszenia">
              <Package className="h-4 w-4 mr-2" />
              Moje ogłoszenia
            </TabsTrigger>
            <TabsTrigger value="obserwowane">
              <Heart className="h-4 w-4 mr-2" />
              Obserwowane
            </TabsTrigger>
            <TabsTrigger value="wiadomosci">
              <MessageSquare className="h-4 w-4 mr-2" />
              Wiadomości
            </TabsTrigger>
            <TabsTrigger value="konta">
              <RefreshCw className="h-4 w-4 mr-2" />
              Przełącz konto
            </TabsTrigger>
          </TabsPill>
        </div>

        {/* Mobile Hamburger Menu - matching driver dashboard */}
        <div className="md:hidden mb-3">
          <div className="flex items-center gap-2">
            <Sheet>
              <SheetTrigger asChild>
                <Button 
                  variant="default" 
                  size="icon" 
                  className="h-10 w-10 rounded-xl shrink-0"
                >
                  <Menu className="h-4 w-4" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 bg-gradient-to-b from-primary/5 to-background">
                <div className="space-y-2 mt-4">
                  <SheetTrigger asChild>
                    <Button 
                      variant={activeTab === 'ogloszenia' ? 'default' : 'ghost'} 
                      className="w-full justify-start rounded-xl transition-all"
                      onClick={() => setActiveTab('ogloszenia')}
                    >
                      <Package className="h-4 w-4 mr-2" />
                      Moje ogłoszenia
                    </Button>
                  </SheetTrigger>
                  <SheetTrigger asChild>
                    <Button 
                      variant={activeTab === 'obserwowane' ? 'default' : 'ghost'} 
                      className="w-full justify-start rounded-xl transition-all"
                      onClick={() => setActiveTab('obserwowane')}
                    >
                      <Heart className="h-4 w-4 mr-2" />
                      Obserwowane
                    </Button>
                  </SheetTrigger>
                  <SheetTrigger asChild>
                    <Button 
                      variant={activeTab === 'wiadomosci' ? 'default' : 'ghost'} 
                      className="w-full justify-start rounded-xl transition-all"
                      onClick={() => setActiveTab('wiadomosci')}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Wiadomości
                    </Button>
                  </SheetTrigger>
                  <SheetTrigger asChild>
                    <Button 
                      variant={activeTab === 'konta' ? 'default' : 'ghost'} 
                      className="w-full justify-start rounded-xl transition-all"
                      onClick={() => setActiveTab('konta')}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Przełącz konto
                    </Button>
                  </SheetTrigger>
                </div>
              </SheetContent>
            </Sheet>

            {/* Current tab label - collapsible */}
            <Collapsible className="flex-1">
              <CollapsibleTrigger className="w-full">
                <div className="flex items-center justify-between bg-primary text-primary-foreground px-4 py-2.5 rounded-xl">
                  <span className="font-medium text-sm truncate">
                    {activeTab === 'ogloszenia' && 'Moje ogłoszenia'}
                    {activeTab === 'obserwowane' && 'Obserwowane'}
                    {activeTab === 'wiadomosci' && 'Wiadomości'}
                    {activeTab === 'konta' && 'Przełącz konto'}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 ml-2" />
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-1">
                <div className="bg-background border rounded-xl p-2 shadow-lg space-y-1">
                  <Button 
                    variant={activeTab === 'ogloszenia' ? 'secondary' : 'ghost'} 
                    size="sm"
                    className="w-full justify-start text-xs"
                    onClick={() => setActiveTab('ogloszenia')}
                  >
                    <Package className="h-3 w-3 mr-2" />
                    Moje ogłoszenia
                  </Button>
                  <Button 
                    variant={activeTab === 'obserwowane' ? 'secondary' : 'ghost'} 
                    size="sm"
                    className="w-full justify-start text-xs"
                    onClick={() => setActiveTab('obserwowane')}
                  >
                    <Heart className="h-3 w-3 mr-2" />
                    Obserwowane
                  </Button>
                  <Button 
                    variant={activeTab === 'wiadomosci' ? 'secondary' : 'ghost'} 
                    size="sm"
                    className="w-full justify-start text-xs"
                    onClick={() => setActiveTab('wiadomosci')}
                  >
                    <MessageSquare className="h-3 w-3 mr-2" />
                    Wiadomości
                  </Button>
                  <Button 
                    variant={activeTab === 'konta' ? 'secondary' : 'ghost'} 
                    size="sm"
                    className="w-full justify-start text-xs"
                    onClick={() => setActiveTab('konta')}
                  >
                    <RefreshCw className="h-3 w-3 mr-2" />
                    Przełącz konto
                  </Button>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>

        {/* Tab Content */}
        <div className="space-y-6">
          {/* My Listings Tab */}
          {activeTab === 'ogloszenia' && (
            <div className="space-y-6">
              {/* Vehicle Listings */}
              {vehicleListings.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Car className="h-5 w-5" />
                      Ogłoszenia motoryzacyjne
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {vehicleListings.map((listing) => (
                        <div
                          key={listing.id}
                          className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                          onClick={() => navigate(`/gielda/ogloszenie/${listing.id}`)}
                        >
                          <div className="flex items-center gap-4">
                            {listing.photos?.[0] ? (
                              <img 
                                src={listing.photos[0]} 
                                alt={listing.title}
                                className="w-16 h-12 object-cover rounded-lg"
                              />
                            ) : (
                              <div className="w-16 h-12 bg-muted rounded-lg flex items-center justify-center">
                                <Car className="h-6 w-6 text-muted-foreground" />
                              </div>
                            )}
                            <div>
                              <p className="font-semibold">{listing.title}</p>
                              <p className="text-sm text-muted-foreground">
                                {new Date(listing.created_at).toLocaleDateString('pl-PL')}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <p className="font-semibold">{listing.price?.toLocaleString('pl-PL')} PLN</p>
                            {getStatusBadge(listing.status)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Property Listings */}
              {propertyListings.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Home className="h-5 w-5" />
                      Ogłoszenia nieruchomości
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {propertyListings.map((listing) => (
                        <div
                          key={listing.id}
                          className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                          onClick={() => navigate(`/nieruchomosci/ogloszenie/${listing.id}`)}
                        >
                          <div className="flex items-center gap-4">
                            {listing.photos?.[0] ? (
                              <img 
                                src={listing.photos[0]} 
                                alt={listing.title}
                                className="w-16 h-12 object-cover rounded-lg"
                              />
                            ) : (
                              <div className="w-16 h-12 bg-muted rounded-lg flex items-center justify-center">
                                <Home className="h-6 w-6 text-muted-foreground" />
                              </div>
                            )}
                            <div>
                              <p className="font-semibold">{listing.title}</p>
                              <p className="text-sm text-muted-foreground">
                                {new Date(listing.created_at).toLocaleDateString('pl-PL')}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <p className="font-semibold">{listing.price?.toLocaleString('pl-PL')} PLN</p>
                            {getStatusBadge(listing.status)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Empty State */}
              {totalListings === 0 && (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
                    <p className="font-semibold mb-2">Brak ogłoszeń</p>
                    <p className="text-sm text-muted-foreground mb-4">
                      Nie masz jeszcze żadnych ogłoszeń
                    </p>
                    <Button onClick={() => navigate('/gielda/dodaj-pojazd')}>
                      <Plus className="h-4 w-4 mr-2" />
                      Dodaj ogłoszenie
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {/* Favorites Tab */}
          {activeTab === 'obserwowane' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Heart className="h-5 w-5" />
                  Obserwowane ogłoszenia
                </CardTitle>
              </CardHeader>
              <CardContent>
                {favorites.length > 0 ? (
                  <div className="space-y-4">
                    {favorites.map((fav) => (
                      <div
                        key={fav.id}
                        className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                        onClick={() => navigate(`/gielda/ogloszenie/${fav.vehicle_id}`)}
                      >
                        <div className="flex items-center gap-4">
                          {fav.vehicle_listings?.photos?.[0] ? (
                            <img 
                              src={fav.vehicle_listings.photos[0]} 
                              alt={fav.vehicle_listings.title}
                              className="w-16 h-12 object-cover rounded-lg"
                            />
                          ) : (
                            <div className="w-16 h-12 bg-muted rounded-lg flex items-center justify-center">
                              <Car className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                          <div>
                            <p className="font-semibold">{fav.vehicle_listings?.title}</p>
                          </div>
                        </div>
                        <p className="font-semibold">{fav.vehicle_listings?.price?.toLocaleString('pl-PL')} PLN</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-muted-foreground">
                    <Heart className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Brak obserwowanych ogłoszeń</p>
                    <p className="text-sm mt-1">
                      Dodaj ogłoszenia do ulubionych, aby je tutaj zobaczyć
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Messages Tab */}
          {activeTab === 'wiadomosci' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Wiadomości
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Brak nowych wiadomości</p>
                  <p className="text-sm mt-1">
                    Tutaj pojawią się wiadomości od sprzedawców i kupujących
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Account Switching Tab */}
          {activeTab === 'konta' && (
            <>
              <AccountSwitcherPanel
                isDriverAccount={isDriverAccount}
                isFleetAccount={isFleetAccount}
                isMarketplaceAccount={isMarketplaceAccount}
                isRealEstateAccount={isRealEstateAccount}
                isAdminAccount={isAdminAccount}
                isMarketplaceEnabled={true}
                currentAccountType="marketplace"
                navigate={navigate}
              />
              
              {/* Quick actions based on account types */}
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                {isDriverAccount && (
                  <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate('/driver')}>
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="p-3 rounded-lg bg-primary/10">
                        <Car className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold">Panel Kierowcy</p>
                        <p className="text-sm text-muted-foreground">Rozliczenia i dokumenty</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
                
                {isFleetAccount && (
                  <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate('/fleet/dashboard')}>
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="p-3 rounded-lg bg-primary/10">
                        <Settings className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold">Panel Floty</p>
                        <p className="text-sm text-muted-foreground">Zarządzaj flotą</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
                
                {isRealEstateAccount && (
                  <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate('/nieruchomosci/agent/panel')}>
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="p-3 rounded-lg bg-primary/10">
                        <Home className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold">Panel Agenta</p>
                        <p className="text-sm text-muted-foreground">Nieruchomości</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
                
                {isAdminAccount && (
                  <Card className="cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => navigate('/admin/dashboard')}>
                    <CardContent className="p-4 flex items-center gap-4">
                      <div className="p-3 rounded-lg bg-primary/10">
                        <Settings className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <p className="font-semibold">Panel Admina</p>
                        <p className="text-sm text-muted-foreground">Zarządzaj platformą</p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

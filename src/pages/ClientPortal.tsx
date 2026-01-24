import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UniversalHomeButton } from '@/components/UniversalHomeButton';
import { MyGetRidoButton } from '@/components/MyGetRidoButton';
import { AccountSwitcherPanel } from '@/components/AccountSwitcherPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  LogOut
} from 'lucide-react';
import { toast } from 'sonner';

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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <UniversalHomeButton />
            <div className="hidden sm:flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              <span className="font-bold text-lg">Moje konto</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <MyGetRidoButton user={user} />
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {/* Back Button */}
        <Button variant="ghost" size="sm" className="mb-6" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Wróć do strony głównej
        </Button>

        {/* Page Title */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Witaj, {user?.email?.split('@')[0]}!</h1>
          <p className="text-muted-foreground mt-1">
            Zarządzaj swoimi ogłoszeniami, zakupami i ustawieniami
          </p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Package className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{totalListings}</p>
                  <p className="text-sm text-muted-foreground">Ogłoszenia</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-500/10">
                  <Heart className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{favorites.length}</p>
                  <p className="text-sm text-muted-foreground">Obserwowane</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <ShoppingCart className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">0</p>
                  <p className="text-sm text-muted-foreground">Zakupy</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/10">
                  <MessageSquare className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">0</p>
                  <p className="text-sm text-muted-foreground">Wiadomości</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-muted/50 p-1 rounded-xl flex-wrap h-auto">
            <TabsTrigger value="ogloszenia" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Package className="h-4 w-4 mr-2" />
              Moje ogłoszenia
            </TabsTrigger>
            <TabsTrigger value="obserwowane" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Heart className="h-4 w-4 mr-2" />
              Obserwowane
            </TabsTrigger>
            <TabsTrigger value="wiadomosci" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <MessageSquare className="h-4 w-4 mr-2" />
              Wiadomości
            </TabsTrigger>
            <TabsTrigger value="konta" className="rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <RefreshCw className="h-4 w-4 mr-2" />
              Przełącz konto
            </TabsTrigger>
          </TabsList>

          {/* My Listings Tab */}
          <TabsContent value="ogloszenia">
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
          </TabsContent>

          {/* Favorites Tab */}
          <TabsContent value="obserwowane">
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
          </TabsContent>

          {/* Messages Tab */}
          <TabsContent value="wiadomosci">
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
          </TabsContent>

          {/* Account Switching Tab */}
          <TabsContent value="konta">
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
                    <div className="p-3 rounded-lg bg-blue-500/10">
                      <Settings className="h-6 w-6 text-blue-600" />
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
                    <div className="p-3 rounded-lg bg-green-500/10">
                      <Home className="h-6 w-6 text-green-600" />
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
                    <div className="p-3 rounded-lg bg-purple-500/10">
                      <Settings className="h-6 w-6 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-semibold">Panel Admina</p>
                      <p className="text-sm text-muted-foreground">Zarządzaj platformą</p>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

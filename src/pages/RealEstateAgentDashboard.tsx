import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TabsPill } from "@/components/ui/TabsPill";
import { TabsContent, TabsTrigger } from "@/components/ui/tabs";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Building, Plus, Home, Users, Settings,
  ArrowLeft, Eye, Edit, Trash2, AlertCircle, Heart, 
  GitCompare, Phone, ChevronDown, ChevronUp, Repeat
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { AccountSwitcherPanel } from "@/components/AccountSwitcherPanel";
import { UniversalHomeButton } from "@/components/UniversalHomeButton";

interface AgentProfile {
  id: string;
  company_name: string;
  company_nip: string;
  status: string;
  active_listings_count: number;
  max_employees: number;
  owner_first_name: string;
  owner_last_name: string;
}

interface Listing {
  id: string;
  title: string;
  price: number;
  property_type: string;
  location: string;
  status: string;
  views: number;
  favorites: number;
  compares: number;
  contact_reveals: number;
  listing_number: string;
  created_at: string;
}

export default function RealEstateAgentDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [noProfile, setNoProfile] = useState(false);
  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "listings");
  const [expandedListings, setExpandedListings] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetchAgentProfile();
  }, []);

  const fetchAgentProfile = async () => {
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        console.error("Session error:", sessionError);
        navigate("/easy/login?redirect=/nieruchomosci/agent/panel");
        return;
      }

      const user = session.user;
      console.log("Fetching agent for user_id:", user.id);

      const { data: agentData, error } = await supabase
        .from("real_estate_agents")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      console.log("Agent query result:", { agentData, error });

      if (error) {
        console.error("Error fetching agent:", error);
        toast.error("Błąd pobierania danych agencji");
        return;
      }

      if (!agentData) {
        setNoProfile(true);
        setLoading(false);
        return;
      }

      setAgent(agentData as AgentProfile);
      // TODO: Fetch listings from database
      // For now using mock data
      setListings([
        {
          id: "1",
          title: "Przestronne mieszkanie 3-pokojowe, Kazimierz",
          price: 450000,
          property_type: "Mieszkanie",
          location: "Kraków, Kazimierz",
          status: "active",
          views: 1234,
          favorites: 45,
          compares: 12,
          contact_reveals: 8,
          listing_number: "33928",
          created_at: "2026-01-10",
        },
        {
          id: "2",
          title: "Nowoczesne studio w centrum",
          price: 2800,
          property_type: "Kawalerka",
          location: "Warszawa, Śródmieście",
          status: "active",
          views: 567,
          favorites: 23,
          compares: 5,
          contact_reveals: 3,
          listing_number: "78421",
          created_at: "2026-01-08",
        },
      ]);
    } catch (error) {
      console.error("Error fetching agent:", error);
    } finally {
      setLoading(false);
    }
  };

  const toggleListingExpanded = (listingId: string) => {
    setExpandedListings(prev => ({
      ...prev,
      [listingId]: !prev[listingId]
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (noProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-background to-muted/30 p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 mx-auto text-orange-500 mb-4" />
            <CardTitle>Nie masz jeszcze agencji</CardTitle>
            <CardDescription>
              Aby korzystać z panelu agenta, zarejestruj swoją agencję nieruchomości.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Button 
              variant="outline" 
              onClick={() => navigate("/nieruchomosci")} 
              className="flex-1"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Wróć do giełdy
            </Button>
            <Button 
              onClick={() => navigate("/nieruchomosci/agent/rejestracja")} 
              className="flex-1"
            >
              <Building className="h-4 w-4 mr-2" />
              Zarejestruj agencję
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!agent) {
    return null;
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "verified":
        return <Badge className="bg-green-500">Zweryfikowany</Badge>;
      case "pending":
        return <Badge variant="secondary">Oczekuje na weryfikację</Badge>;
      case "suspended":
        return <Badge variant="destructive">Zawieszony</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getListingStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500 text-xs">Aktywne</Badge>;
      case "pending":
        return <Badge variant="secondary" className="text-xs">Oczekuje</Badge>;
      case "expired":
        return <Badge variant="destructive" className="text-xs">Wygasłe</Badge>;
      default:
        return <Badge variant="outline" className="text-xs">{status}</Badge>;
    }
  };

  // Calculate totals for stats cards
  const totalViews = listings.reduce((sum, l) => sum + (l.views || 0), 0);
  const totalContacts = listings.reduce((sum, l) => sum + (l.contact_reveals || 0), 0);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => navigate("/nieruchomosci")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="font-bold text-lg">{agent.company_name}</h1>
              <p className="text-xs text-muted-foreground">
                Panel agenta • NIP: {agent.company_nip}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {getStatusBadge(agent.status)}
            <Button 
              size="sm"
              onClick={() => setActiveTab("add")}
              disabled={agent.status !== "verified"}
            >
              <Plus className="h-4 w-4 mr-1" />
              Dodaj ogłoszenie
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        {/* Status Alert */}
        {agent.status === "pending" && (
          <Card className="mb-6 border-orange-500/50 bg-orange-500/10">
            <CardContent className="flex items-center gap-3 py-4">
              <AlertCircle className="h-5 w-5 text-orange-500" />
              <div>
                <p className="font-medium text-orange-700">Konto oczekuje na weryfikację</p>
                <p className="text-sm text-orange-600">
                  Zweryfikujemy Twoje dane w ciągu 24-48 godzin. Po weryfikacji będziesz mógł dodawać ogłoszenia.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Home className="h-5 w-5 text-primary" />
                <span className="text-2xl font-bold">{listings.length}</span>
              </div>
              <p className="text-sm text-muted-foreground">Aktywne ogłoszenia</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-blue-500" />
                <span className="text-2xl font-bold">{totalViews.toLocaleString()}</span>
              </div>
              <p className="text-sm text-muted-foreground">Wyświetlenia (7 dni)</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-green-500" />
                <span className="text-2xl font-bold">0/{agent.max_employees}</span>
              </div>
              <p className="text-sm text-muted-foreground">Agenci w zespole</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Phone className="h-5 w-5 text-purple-500" />
                <span className="text-2xl font-bold">{totalContacts}</span>
              </div>
              <p className="text-sm text-muted-foreground">Kontakty (7 dni)</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs - unified with driver portal style */}
        <TabsPill value={activeTab} onValueChange={setActiveTab}>
          <TabsTrigger value="listings">
            <Home className="h-4 w-4 mr-2" />
            Ogłoszenia
          </TabsTrigger>
          <TabsTrigger value="add" disabled={agent.status !== "verified"}>
            <Plus className="h-4 w-4 mr-2" />
            Dodaj
          </TabsTrigger>
          <TabsTrigger value="team">
            <Users className="h-4 w-4 mr-2" />
            Zespół
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings className="h-4 w-4 mr-2" />
            Ustawienia
          </TabsTrigger>
          <TabsTrigger value="accounts">
            <Repeat className="h-4 w-4 mr-2" />
            Przełącz konto
          </TabsTrigger>

          <TabsContent value="listings">
            <Card>
              <CardHeader>
                <CardTitle>Moje ogłoszenia</CardTitle>
                <CardDescription>Zarządzaj swoimi ogłoszeniami nieruchomości</CardDescription>
              </CardHeader>
              <CardContent>
                {listings.length === 0 ? (
                  <div className="text-center py-12">
                    <Building className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
                    <h3 className="text-lg font-medium mb-2">Brak ogłoszeń</h3>
                    <p className="text-muted-foreground mb-4">
                      Dodaj swoje pierwsze ogłoszenie nieruchomości
                    </p>
                    <Button 
                      onClick={() => setActiveTab("add")}
                      disabled={agent.status !== "verified"}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Dodaj ogłoszenie
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {listings.map((listing) => (
                      <Collapsible 
                        key={listing.id}
                        open={expandedListings[listing.id]}
                        onOpenChange={() => toggleListingExpanded(listing.id)}
                      >
                        <div className="border rounded-lg overflow-hidden">
                          <div className="flex items-center justify-between p-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-medium">{listing.title}</h4>
                                {getListingStatusBadge(listing.status)}
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {listing.property_type} • {listing.location}
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-bold text-primary text-lg">
                                {listing.price.toLocaleString()} zł
                              </span>
                              <Button variant="ghost" size="icon">
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                              <CollapsibleTrigger asChild>
                                <Button variant="ghost" size="icon">
                                  {expandedListings[listing.id] ? (
                                    <ChevronUp className="h-4 w-4" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4" />
                                  )}
                                </Button>
                              </CollapsibleTrigger>
                            </div>
                          </div>
                          
                          <CollapsibleContent>
                            <div className="px-4 pb-4 pt-2 border-t bg-muted/30">
                              {/* Statistics */}
                              <p className="text-sm font-medium mb-3">📊 Statystyki ogłoszenia</p>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                                <div className="flex items-center gap-2 text-sm">
                                  <Eye className="h-4 w-4 text-blue-500" />
                                  <span className="font-semibold">{listing.views.toLocaleString()}</span>
                                  <span className="text-muted-foreground">wyśw.</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                  <Heart className="h-4 w-4 text-red-500" />
                                  <span className="font-semibold">{listing.favorites}</span>
                                  <span className="text-muted-foreground">polub.</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                  <GitCompare className="h-4 w-4 text-purple-500" />
                                  <span className="font-semibold">{listing.compares}</span>
                                  <span className="text-muted-foreground">porów.</span>
                                </div>
                                <div className="flex items-center gap-2 text-sm">
                                  <Phone className="h-4 w-4 text-green-500" />
                                  <span className="font-semibold">{listing.contact_reveals}</span>
                                  <span className="text-muted-foreground">kontaktów</span>
                                </div>
                              </div>
                              
                              {/* Meta info */}
                              <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                                <span>Nr oferty: <span className="font-mono font-medium">{listing.listing_number}</span></span>
                                <span>Dodano: <span className="font-medium">{listing.created_at}</span></span>
                              </div>
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="add">
            <Card>
              <CardHeader>
                <CardTitle>Dodaj nowe ogłoszenie</CardTitle>
                <CardDescription>
                  Pamiętaj: możesz dodawać tylko nieruchomości na wyłączność Twojej agencji
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    Formularz dodawania ogłoszenia - w przygotowaniu
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="team">
            <Card>
              <CardHeader>
                <CardTitle>Zarządzanie zespołem</CardTitle>
                <CardDescription>
                  Dodawaj agentów do swojego zespołu ({agent.max_employees} max)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12">
                  <Users className="h-16 w-16 mx-auto text-muted-foreground/30 mb-4" />
                  <h3 className="text-lg font-medium mb-2">Brak agentów w zespole</h3>
                  <p className="text-muted-foreground mb-4">
                    Zaproś agentów do współpracy
                  </p>
                  <Button disabled>
                    <Plus className="h-4 w-4 mr-2" />
                    Dodaj agenta
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>Ustawienia agencji</CardTitle>
                <CardDescription>Zarządzaj danymi firmy i ustawieniami</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Nazwa firmy</p>
                      <p className="font-medium">{agent.company_name}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">NIP</p>
                      <p className="font-medium">{agent.company_nip}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Właściciel</p>
                      <p className="font-medium">
                        {agent.owner_first_name} {agent.owner_last_name}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      {getStatusBadge(agent.status)}
                    </div>
                  </div>
                  <Button variant="outline" className="mt-4">
                    <Edit className="h-4 w-4 mr-2" />
                    Edytuj dane
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          {/* Account Switcher */}
          <TabsContent value="accounts">
            <Card>
              <CardHeader>
                <CardTitle>Przełącz konto</CardTitle>
                <CardDescription>Przełącz między swoimi kontami w systemie</CardDescription>
              </CardHeader>
              <CardContent>
                <AccountSwitcherPanel />
              </CardContent>
            </Card>
          </TabsContent>
        </TabsPill>
      </div>
    </div>
  );
}

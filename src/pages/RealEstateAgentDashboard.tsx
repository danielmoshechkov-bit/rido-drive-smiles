import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Building, Plus, Home, Users, BarChart3, Settings,
  ArrowLeft, Eye, Edit, Trash2, AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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
  created_at: string;
}

export default function RealEstateAgentDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [listings, setListings] = useState<Listing[]>([]);
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "listings");

  useEffect(() => {
    fetchAgentProfile();
  }, []);

  const fetchAgentProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate("/easy/login");
        return;
      }

      const { data: agentData, error } = await supabase
        .from("real_estate_agents" as any)
        .select("*")
        .eq("user_id", user.id)
        .single();

      if (error || !agentData) {
        toast.error("Nie znaleziono profilu agenta");
        navigate("/nieruchomosci/agent/rejestracja");
        return;
      }

      setAgent(agentData as any);
      // TODO: Fetch listings
      setListings([]);
    } catch (error) {
      console.error("Error fetching agent:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
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
                <span className="text-2xl font-bold">{agent.active_listings_count}</span>
              </div>
              <p className="text-sm text-muted-foreground">Aktywne ogłoszenia</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-blue-500" />
                <span className="text-2xl font-bold">0</span>
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
                <BarChart3 className="h-5 w-5 text-purple-500" />
                <span className="text-2xl font-bold">0</span>
              </div>
              <p className="text-sm text-muted-foreground">Kontakty (7 dni)</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="listings" className="gap-2">
              <Home className="h-4 w-4" />
              <span className="hidden sm:inline">Ogłoszenia</span>
            </TabsTrigger>
            <TabsTrigger value="add" className="gap-2" disabled={agent.status !== "verified"}>
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Dodaj</span>
            </TabsTrigger>
            <TabsTrigger value="team" className="gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Zespół</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Ustawienia</span>
            </TabsTrigger>
          </TabsList>

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
                      <div
                        key={listing.id}
                        className="flex items-center justify-between p-4 border rounded-lg"
                      >
                        <div>
                          <h4 className="font-medium">{listing.title}</h4>
                          <p className="text-sm text-muted-foreground">
                            {listing.property_type} • {listing.location}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-primary">
                            {listing.price.toLocaleString()} zł
                          </span>
                          <Button variant="ghost" size="icon">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
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
        </Tabs>
      </div>
    </div>
  );
}
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { 
  Shield, Bell, FileText, Settings, LogOut, Car, Calendar, 
  AlertTriangle, CheckCircle, Clock, Send, Eye, DollarSign 
} from "lucide-react";
import { InsuranceNotificationCard } from "@/components/insurance/InsuranceNotificationCard";
import { InsuranceOfferModal } from "@/components/insurance/InsuranceOfferModal";

interface AgentProfile {
  id: string;
  company_name: string;
  nip: string | null;
  phone: string;
  email: string;
  license_number: string | null;
  is_active: boolean;
}

interface Notification {
  id: string;
  vehicle_id: string;
  policy_id: string | null;
  fleet_id: string | null;
  notification_type: string;
  status: string;
  policy_type: string | null;
  current_premium: number | null;
  expiry_date: string;
  vehicle_plate: string | null;
  vehicle_vin: string | null;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  fleet_name: string | null;
  created_at: string;
}

interface Offer {
  id: string;
  vehicle_id: string;
  fleet_id: string | null;
  policy_type: string;
  current_premium: number | null;
  offer_premium: number;
  offer_details: string | null;
  valid_until: string;
  status: string;
  fleet_response: string | null;
  created_at: string;
  viewed_at: string | null;
  vehicles?: {
    plate: string;
    brand: string;
    model: string;
  };
}

export default function InsuranceAgentDashboard() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [agent, setAgent] = useState<AgentProfile | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [activeTab, setActiveTab] = useState("notifications");
  
  // Offer modal state
  const [offerModalOpen, setOfferModalOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);

  useEffect(() => {
    checkAuthAndLoad();
  }, []);

  const checkAuthAndLoad = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.user) {
      navigate("/auth");
      return;
    }

    // Get agent profile
    const { data: agentData, error: agentError } = await supabase
      .from("insurance_agents")
      .select("*")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (agentError || !agentData) {
      toast.error("Nie znaleziono profilu agenta");
      navigate("/");
      return;
    }

    setAgent(agentData);
    await Promise.all([
      loadNotifications(agentData.id),
      loadOffers(agentData.id)
    ]);
    setLoading(false);
  };

  const loadNotifications = async (agentId: string) => {
    const { data, error } = await supabase
      .from("insurance_notifications")
      .select("*")
      .or(`agent_id.eq.${agentId},agent_id.is.null`)
      .in("status", ["pending", "sent", "read"])
      .order("expiry_date", { ascending: true });

    if (!error && data) {
      setNotifications(data);
    }
  };

  const loadOffers = async (agentId: string) => {
    const { data, error } = await supabase
      .from("insurance_offers")
      .select(`
        *,
        vehicles (plate, brand, model)
      `)
      .eq("agent_id", agentId)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setOffers(data);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  const handlePrepareOffer = (notification: Notification) => {
    setSelectedNotification(notification);
    setOfferModalOpen(true);
  };

  const handleOfferSent = () => {
    if (agent) {
      loadNotifications(agent.id);
      loadOffers(agent.id);
    }
    setOfferModalOpen(false);
    setSelectedNotification(null);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Oczekuje</Badge>;
      case "viewed":
        return <Badge variant="outline"><Eye className="h-3 w-3 mr-1" />Przejrzana</Badge>;
      case "accepted":
        return <Badge className="bg-green-500"><CheckCircle className="h-3 w-3 mr-1" />Zaakceptowana</Badge>;
      case "rejected":
        return <Badge variant="destructive">Odrzucona</Badge>;
      case "contact_requested":
        return <Badge className="bg-blue-500"><Send className="h-3 w-3 mr-1" />Kontakt zamówiony</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  const pendingNotifications = notifications.filter(n => n.status === "pending" || n.status === "sent");
  const pendingOffers = offers.filter(o => o.status === "pending");
  const acceptedOffers = offers.filter(o => o.status === "accepted" || o.status === "contact_requested");

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-semibold">{agent?.company_name}</h1>
              <p className="text-sm text-muted-foreground">Panel Agenta Ubezpieczeń</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 mr-2" />
              Wyloguj
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                  <Bell className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{pendingNotifications.length}</p>
                  <p className="text-sm text-muted-foreground">Powiadomienia</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{pendingOffers.length}</p>
                  <p className="text-sm text-muted-foreground">Oferty wysłane</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{acceptedOffers.length}</p>
                  <p className="text-sm text-muted-foreground">Zaakceptowane</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                  <DollarSign className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{offers.length}</p>
                  <p className="text-sm text-muted-foreground">Wszystkie oferty</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="notifications" className="gap-2">
              <Bell className="h-4 w-4" />
              Powiadomienia
              {pendingNotifications.length > 0 && (
                <Badge variant="secondary" className="ml-1">{pendingNotifications.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="offers" className="gap-2">
              <FileText className="h-4 w-4" />
              Moje oferty
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="h-4 w-4" />
              Ustawienia
            </TabsTrigger>
          </TabsList>

          <TabsContent value="notifications">
            {pendingNotifications.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">Brak powiadomień</h3>
                  <p className="text-muted-foreground">
                    Gdy pojazdy będą miały kończące się polisy, zobaczysz je tutaj
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {pendingNotifications.map((notification) => (
                  <InsuranceNotificationCard
                    key={notification.id}
                    notification={notification}
                    onPrepareOffer={() => handlePrepareOffer(notification)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="offers">
            {offers.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <h3 className="text-lg font-medium mb-2">Brak wysłanych ofert</h3>
                  <p className="text-muted-foreground">
                    Przygotuj pierwszą ofertę z zakładki Powiadomienia
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {offers.map((offer) => (
                  <Card key={offer.id}>
                    <CardContent className="py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="p-2 bg-muted rounded-lg">
                            <Car className="h-5 w-5 text-muted-foreground" />
                          </div>
                          <div>
                            <p className="font-medium">
                              {offer.vehicles?.plate || "—"} - {offer.vehicles?.brand} {offer.vehicles?.model}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {offer.policy_type} • Składka: {offer.offer_premium} PLN
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-sm text-muted-foreground">Ważna do</p>
                            <p className="font-medium">{new Date(offer.valid_until).toLocaleDateString("pl-PL")}</p>
                          </div>
                          {getStatusBadge(offer.status)}
                        </div>
                      </div>

                      {offer.fleet_response && (
                        <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                          <p className="text-sm">
                            <span className="font-medium">Odpowiedź floty:</span> {offer.fleet_response}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="settings">
            <Card>
              <CardHeader>
                <CardTitle>Dane firmy</CardTitle>
                <CardDescription>Informacje o Twojej agencji ubezpieczeniowej</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Nazwa firmy</label>
                    <p className="font-medium">{agent?.company_name}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">NIP</label>
                    <p className="font-medium">{agent?.nip || "—"}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Email</label>
                    <p className="font-medium">{agent?.email}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Telefon</label>
                    <p className="font-medium">{agent?.phone}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Nr licencji</label>
                    <p className="font-medium">{agent?.license_number || "—"}</p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Status</label>
                    <p>
                      {agent?.is_active ? (
                        <Badge className="bg-green-500">Aktywny</Badge>
                      ) : (
                        <Badge variant="secondary">Nieaktywny</Badge>
                      )}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>

      {/* Offer Modal */}
      <InsuranceOfferModal
        open={offerModalOpen}
        onClose={() => {
          setOfferModalOpen(false);
          setSelectedNotification(null);
        }}
        notification={selectedNotification}
        agentId={agent?.id || ""}
        onSuccess={handleOfferSent}
      />
    </div>
  );
}

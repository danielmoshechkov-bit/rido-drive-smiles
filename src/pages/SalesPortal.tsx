import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  Phone, 
  Calendar, 
  Mail, 
  BarChart3, 
  Settings,
  Plus,
  Building,
  Car,
  Wrench,
  Bell
} from "lucide-react";
import { SalesLeadsList } from "@/components/sales/SalesLeadsList";
import { SalesLeadForm } from "@/components/sales/SalesLeadForm";
import { SalesCallbacksPanel } from "@/components/sales/SalesCallbacksPanel";
import { SalesSettingsPanel } from "@/components/sales/SalesSettingsPanel";
import { SalesStatsPanel } from "@/components/sales/SalesStatsPanel";
import { useMyCallbacks, useSalesCategories } from "@/hooks/useSalesLeads";
import { MainNavbar } from "@/components/MainNavbar";

export default function SalesPortal() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSalesUser, setIsSalesUser] = useState(false);
  const [showAddLead, setShowAddLead] = useState(false);
  
  const tab = searchParams.get("tab") || "leads";
  const categoryFilter = searchParams.get("category") || "";
  
  const { data: callbacks } = useMyCallbacks();
  const { data: categories } = useSalesCategories();
  
  const pendingCallbacksCount = callbacks?.filter(c => {
    const callbackDate = new Date(c.callback_date);
    return callbackDate <= new Date();
  }).length || 0;

  useEffect(() => {
    const checkAccess = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }
      setIsAuthenticated(true);
      
      // Check if user has sales role
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .in("role", ["sales_admin", "sales_rep"]);
      
      if (!roles || roles.length === 0) {
        navigate("/klient");
        return;
      }
      setIsSalesUser(true);
    };
    
    checkAccess();
  }, [navigate]);

  if (!isAuthenticated || !isSalesUser) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
  };

  const handleCategoryChange = (slug: string) => {
    if (slug) {
      setSearchParams({ tab: "leads", category: slug });
    } else {
      setSearchParams({ tab: "leads" });
    }
  };

  const getCategoryIcon = (icon: string | null) => {
    switch (icon) {
      case "Wrench": return <Wrench className="h-4 w-4" />;
      case "Car": return <Car className="h-4 w-4" />;
      case "Building": return <Building className="h-4 w-4" />;
      default: return <Users className="h-4 w-4" />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <MainNavbar />
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Portal Sprzedaży</h1>
            <p className="text-muted-foreground">Zarządzaj leadami i kontaktami</p>
          </div>
          <div className="flex items-center gap-2">
            {pendingCallbacksCount > 0 && (
              <Button 
                variant="outline" 
                onClick={() => handleTabChange("callbacks")}
                className="gap-2"
              >
                <Bell className="h-4 w-4 text-orange-500" />
                <span>{pendingCallbacksCount} do oddzwonienia</span>
              </Button>
            )}
            <Button onClick={() => setShowAddLead(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Dodaj lead
            </Button>
          </div>
        </div>

        {/* Category Quick Filters */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={!categoryFilter ? "default" : "outline"}
            size="sm"
            onClick={() => handleCategoryChange("")}
          >
            Wszystkie
          </Button>
          {categories?.map((cat) => (
            <Button
              key={cat.id}
              variant={categoryFilter === cat.slug ? "default" : "outline"}
              size="sm"
              onClick={() => handleCategoryChange(cat.slug)}
              className="gap-2"
            >
              {getCategoryIcon(cat.icon)}
              {cat.name}
            </Button>
          ))}
        </div>

        {/* Main Tabs */}
        <Tabs value={tab} onValueChange={handleTabChange}>
          <TabsList className="w-full md:w-auto grid grid-cols-3 md:grid-cols-6 gap-1">
            <TabsTrigger value="leads" className="gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden md:inline">Leady</span>
            </TabsTrigger>
            <TabsTrigger value="callbacks" className="gap-2 relative">
              <Phone className="h-4 w-4" />
              <span className="hidden md:inline">Oddzwoń</span>
              {pendingCallbacksCount > 0 && (
                <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 text-xs flex items-center justify-center">
                  {pendingCallbacksCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="calendar" className="gap-2">
              <Calendar className="h-4 w-4" />
              <span className="hidden md:inline">Kalendarz</span>
            </TabsTrigger>
            <TabsTrigger value="emails" className="gap-2">
              <Mail className="h-4 w-4" />
              <span className="hidden md:inline">Zaproszenia</span>
            </TabsTrigger>
            <TabsTrigger value="stats" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden md:inline">Statystyki</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="h-4 w-4" />
              <span className="hidden md:inline">Ustawienia</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="leads" className="mt-6">
            <SalesLeadsList categorySlug={categoryFilter} />
          </TabsContent>

          <TabsContent value="callbacks" className="mt-6">
            <SalesCallbacksPanel />
          </TabsContent>

          <TabsContent value="calendar" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Kalendarz</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Kalendarz z zaplanowanymi połączeniami i spotkaniami (w trakcie implementacji)
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="emails" className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle>Wysłane zaproszenia</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Lista wysłanych zaproszeń do rejestracji (w trakcie implementacji)
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="stats" className="mt-6">
            <SalesStatsPanel />
          </TabsContent>

          <TabsContent value="settings" className="mt-6">
            <SalesSettingsPanel />
          </TabsContent>
        </Tabs>

        {/* Add Lead Dialog */}
        {showAddLead && (
          <SalesLeadForm
            open={showAddLead}
            onOpenChange={setShowAddLead}
            defaultCategory={categoryFilter}
          />
        )}
      </div>
    </div>
  );
}

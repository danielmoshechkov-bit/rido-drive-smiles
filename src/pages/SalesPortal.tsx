import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { TabsPill } from "@/components/ui/TabsPill";
import { TabsContent, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
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
  Bell,
  Menu,
  ChevronDown,
  Bot
} from "lucide-react";
import { SalesLeadsList } from "@/components/sales/SalesLeadsList";
import { SalesLeadForm } from "@/components/sales/SalesLeadForm";
import { SalesCallbacksPanel } from "@/components/sales/SalesCallbacksPanel";
import { SalesSettingsPanel } from "@/components/sales/SalesSettingsPanel";
import { SalesStatsPanel } from "@/components/sales/SalesStatsPanel";
import { SalesCalendar } from "@/components/sales/SalesCalendar";
import { AIAgentDashboard } from "@/components/sales/ai-agent/AIAgentDashboard";
import { useMyCallbacks, useSalesCategories } from "@/hooks/useSalesLeads";
import { UniversalHomeButton } from "@/components/UniversalHomeButton";
import { UserDropdown } from "@/components/UserDropdown";
import LanguageSelector from "@/components/LanguageSelector";
import { toast } from "sonner";

export default function SalesPortal() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isSalesUser, setIsSalesUser] = useState(false);
  const [showAddLead, setShowAddLead] = useState(false);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [userRole, setUserRole] = useState("");
  
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
      setUserEmail(user.email || "");
      setUserName(user.email?.split("@")[0] || "Użytkownik");
      
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
      setUserRole(roles[0].role === "sales_admin" ? "Admin Sprzedaży" : "Przedstawiciel");
    };
    
    checkAccess();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Wylogowano pomyślnie");
    navigate("/auth");
  };

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
    <div className="min-h-screen bg-gradient-subtle">
      {/* Header - matching Driver Portal style */}
      <div className="bg-white border-b shadow-sm">
        <div className="container mx-auto px-4 py-4">
          {/* Desktop header */}
          <div className="hidden md:flex justify-between items-center">
            <div className="flex items-center gap-4">
              <UniversalHomeButton />
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold text-primary">Portal Sprzedaży</span>
                {userName && (
                  <>
                    <span className="text-muted-foreground">-</span>
                    <span className="font-medium text-foreground">{userName}</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {pendingCallbacksCount > 0 && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleTabChange("callbacks")}
                  className="gap-2 rounded-xl"
                >
                  <Bell className="h-4 w-4 text-destructive" />
                  <span>{pendingCallbacksCount} do oddzwonienia</span>
                </Button>
              )}
              <LanguageSelector />
              <UserDropdown 
                userName={userName}
                userEmail={userEmail}
                userRole={userRole}
                onLogout={handleLogout}
              />
            </div>
          </div>

          {/* Mobile header */}
          <div className="md:hidden flex justify-between items-center">
            <div className="flex items-center gap-2">
              <UniversalHomeButton />
              <span className="text-sm font-semibold text-primary">Sprzedaż</span>
            </div>
            <div className="flex items-center gap-2">
              {pendingCallbacksCount > 0 && (
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => handleTabChange("callbacks")}
                  className="h-9 w-9 relative"
                >
                  <Bell className="h-4 w-4" />
                  <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 text-[10px]">
                    {pendingCallbacksCount}
                  </Badge>
                </Button>
              )}
              <LanguageSelector />
              <UserDropdown 
                userName={userName}
                userEmail={userEmail}
                userRole={userRole}
                onLogout={handleLogout}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button onClick={() => setShowAddLead(true)} className="gap-2 rounded-xl">
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
            className="rounded-xl"
            onClick={() => handleCategoryChange("")}
          >
            Wszystkie
          </Button>
          {categories?.map((cat) => (
            <Button
              key={cat.id}
              variant={categoryFilter === cat.slug ? "default" : "outline"}
              size="sm"
              className="gap-2 rounded-xl"
              onClick={() => handleCategoryChange(cat.slug)}
            >
              {getCategoryIcon(cat.icon)}
              {cat.name}
            </Button>
          ))}
        </div>

        {/* Main Tabs - Desktop TabsPill */}
        <div className="hidden md:block">
          <TabsPill value={tab} onValueChange={handleTabChange}>
            <TabsTrigger value="leads">
              <Users className="h-4 w-4 mr-2" />
              Leady
            </TabsTrigger>
            <TabsTrigger value="callbacks">
              <Phone className="h-4 w-4 mr-2" />
              Oddzwoń
              {pendingCallbacksCount > 0 && (
                <Badge className="ml-2 h-5 w-5 p-0 text-xs flex items-center justify-center">
                  {pendingCallbacksCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="calendar">
              <Calendar className="h-4 w-4 mr-2" />
              Kalendarz
            </TabsTrigger>
            <TabsTrigger value="ai-agent">
              <Bot className="h-4 w-4 mr-2" />
              AI Agent
            </TabsTrigger>
            <TabsTrigger value="emails">
              <Mail className="h-4 w-4 mr-2" />
              Zaproszenia
            </TabsTrigger>
            <TabsTrigger value="stats">
              <BarChart3 className="h-4 w-4 mr-2" />
              Statystyki
            </TabsTrigger>
            <TabsTrigger value="settings">
              <Settings className="h-4 w-4 mr-2" />
              Ustawienia
            </TabsTrigger>
          </TabsPill>
        </div>

        {/* Mobile - Hamburger menu with collapsible tab bar */}
        <div className="md:hidden">
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
                <div className="space-y-2 mt-6">
                  <SheetTrigger asChild>
                    <Button 
                      variant={tab === 'leads' ? 'default' : 'ghost'} 
                      className="w-full justify-start rounded-xl"
                      onClick={() => handleTabChange('leads')}
                    >
                      <Users className="h-4 w-4 mr-2" />
                      Leady
                    </Button>
                  </SheetTrigger>
                  <SheetTrigger asChild>
                    <Button 
                      variant={tab === 'callbacks' ? 'default' : 'ghost'} 
                      className="w-full justify-start rounded-xl"
                      onClick={() => handleTabChange('callbacks')}
                    >
                      <Phone className="h-4 w-4 mr-2" />
                      Oddzwoń
                      {pendingCallbacksCount > 0 && (
                        <Badge className="ml-auto">{pendingCallbacksCount}</Badge>
                      )}
                    </Button>
                  </SheetTrigger>
                  <SheetTrigger asChild>
                    <Button 
                      variant={tab === 'calendar' ? 'default' : 'ghost'} 
                      className="w-full justify-start rounded-xl"
                      onClick={() => handleTabChange('calendar')}
                    >
                      <Calendar className="h-4 w-4 mr-2" />
                      Kalendarz
                    </Button>
                  </SheetTrigger>
                  <SheetTrigger asChild>
                    <Button 
                      variant={tab === 'ai-agent' ? 'default' : 'ghost'} 
                      className="w-full justify-start rounded-xl"
                      onClick={() => handleTabChange('ai-agent')}
                    >
                      <Bot className="h-4 w-4 mr-2" />
                      AI Agent
                    </Button>
                  </SheetTrigger>
                  <SheetTrigger asChild>
                    <Button 
                      variant={tab === 'emails' ? 'default' : 'ghost'} 
                      className="w-full justify-start rounded-xl"
                      onClick={() => handleTabChange('emails')}
                    >
                      <Mail className="h-4 w-4 mr-2" />
                      Zaproszenia
                    </Button>
                  </SheetTrigger>
                  <SheetTrigger asChild>
                    <Button 
                      variant={tab === 'stats' ? 'default' : 'ghost'} 
                      className="w-full justify-start rounded-xl"
                      onClick={() => handleTabChange('stats')}
                    >
                      <BarChart3 className="h-4 w-4 mr-2" />
                      Statystyki
                    </Button>
                  </SheetTrigger>
                  <SheetTrigger asChild>
                    <Button 
                      variant={tab === 'settings' ? 'default' : 'ghost'} 
                      className="w-full justify-start rounded-xl"
                      onClick={() => handleTabChange('settings')}
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      Ustawienia
                    </Button>
                  </SheetTrigger>
                </div>
              </SheetContent>
            </Sheet>

            <Collapsible className="flex-1">
              <CollapsibleTrigger className="w-full">
                <div className="flex items-center justify-between bg-primary text-primary-foreground px-4 py-2.5 rounded-xl">
                  <span className="font-medium text-sm truncate">
                    {tab === 'leads' && 'Leady'}
                    {tab === 'callbacks' && 'Oddzwoń'}
                    {tab === 'calendar' && 'Kalendarz'}
                    {tab === 'ai-agent' && 'AI Agent'}
                    {tab === 'emails' && 'Zaproszenia'}
                    {tab === 'stats' && 'Statystyki'}
                    {tab === 'settings' && 'Ustawienia'}
                  </span>
                  <ChevronDown className="h-4 w-4 shrink-0 ml-2" />
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-1">
                <div className="bg-background border rounded-xl p-2 shadow-lg space-y-1">
                  {tab !== 'leads' && (
                    <Button variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={() => handleTabChange('leads')}>
                      <Users className="h-3 w-3 mr-2" />Leady
                    </Button>
                  )}
                  {tab !== 'callbacks' && (
                    <Button variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={() => handleTabChange('callbacks')}>
                      <Phone className="h-3 w-3 mr-2" />Oddzwoń
                    </Button>
                  )}
                  {tab !== 'calendar' && (
                    <Button variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={() => handleTabChange('calendar')}>
                      <Calendar className="h-3 w-3 mr-2" />Kalendarz
                    </Button>
                  )}
                  {tab !== 'ai-agent' && (
                    <Button variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={() => handleTabChange('ai-agent')}>
                      <Bot className="h-3 w-3 mr-2" />AI Agent
                    </Button>
                  )}
                  {tab !== 'emails' && (
                    <Button variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={() => handleTabChange('emails')}>
                      <Mail className="h-3 w-3 mr-2" />Zaproszenia
                    </Button>
                  )}
                  {tab !== 'stats' && (
                    <Button variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={() => handleTabChange('stats')}>
                      <BarChart3 className="h-3 w-3 mr-2" />Statystyki
                    </Button>
                  )}
                  {tab !== 'settings' && (
                    <Button variant="ghost" size="sm" className="w-full justify-start text-xs" onClick={() => handleTabChange('settings')}>
                      <Settings className="h-3 w-3 mr-2" />Ustawienia
                    </Button>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>

        {/* Tab Content */}
        {tab === "leads" && (
          <div className="mt-6">
            <SalesLeadsList categorySlug={categoryFilter} />
          </div>
        )}

        {tab === "callbacks" && (
          <div className="mt-6">
            <SalesCallbacksPanel />
          </div>
        )}

        {tab === "calendar" && (
          <div className="mt-6">
            <SalesCalendar />
          </div>
        )}

        {tab === "ai-agent" && (
          <div className="mt-6">
            <AIAgentDashboard />
          </div>
        )}

        {tab === "emails" && (
          <div className="mt-6">
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
          </div>
        )}

        {tab === "stats" && (
          <div className="mt-6">
            <SalesStatsPanel />
          </div>
        )}

        {tab === "settings" && (
          <div className="mt-6">
            <SalesSettingsPanel />
          </div>
        )}

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

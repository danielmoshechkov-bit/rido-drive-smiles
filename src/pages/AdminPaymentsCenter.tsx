import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import { AdminPortalSwitcher } from '@/components/admin/AdminPortalSwitcher';
import { UserDropdown } from '@/components/UserDropdown';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Loader2, Wallet, CreditCard, Gift, ShoppingCart, History, Tag,
  Layers, Puzzle, Sparkles, Calculator,
} from 'lucide-react';
import {
  PaymentGatewayConfig, AssignCreditsPanel, CreditPackagesManager, PaymentHistory,
} from '@/components/admin/AdminPaymentsTab';
import { PromoCodesPanel } from '@/components/admin/PromoCodesPanel';
import { BillingFeaturesPanel } from '@/components/admin/billing/BillingFeaturesPanel';
import { BillingPlansPanel } from '@/components/admin/billing/BillingPlansPanel';
import { RidoAiStartPanel } from '@/components/admin/billing/RidoAiStartPanel';
import { ServiceProviderAccountingView } from '@/components/service-provider/ServiceProviderAccountingView';

/**
 * Centrum Platnosci — jedno miejsce na wszystko, co dotyczy pieniedzy w portalu:
 * bramki, plany, pule startowe, doladowania AI, kody promocyjne, historia oraz
 * faktury sprzedazowe GetRido.
 *
 * Te same panele sa nadal dostepne w Portalu GetRido (zakladka Platnosci) —
 * to ten sam komponent i ta sama tabela, wiec zmiana zrobiona tu widoczna jest
 * tam i odwrotnie.
 */
export default function AdminPaymentsCenter() {
  const navigate = useNavigate();
  const { isAdmin, isPlatformAdmin, loading: roleLoading } = useUserRole();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('gateways');
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (!user) navigate('/auth');
      else setUserEmail(user.email || '');
      setLoading(false);
    };
    fetchUser();
  }, []);

  useEffect(() => {
    if (!roleLoading && !loading && user && !isAdmin) navigate('/');
  }, [roleLoading, isAdmin, user, loading]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab');
    if (tabParam) setActiveTab(tabParam);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (activeTab) {
      params.set('tab', activeTab);
      window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
    }
  }, [activeTab]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  if (loading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) return null;

  // Zakladki billingowe czytaja tabele billing_*, do ktorych RLS przepuszcza
  // wylacznie platform_admin — ukrycie ich to UX, kontrole robi baza.
  const tabs = [
    { value: 'gateways', label: 'Bramki', icon: CreditCard },
    { value: 'ksiegowosc', label: 'Księgowość', icon: Calculator },
    { value: 'assign-credits', label: 'Kredyty', icon: Gift },
    { value: 'onetime', label: 'Pakiety', icon: ShoppingCart },
    ...(isPlatformAdmin ? [
      { value: 'ai-start', label: 'Pula startowa AI', icon: Sparkles },
      { value: 'billing-plans', label: 'Plany', icon: Layers },
      { value: 'billing-features', label: 'Funkcje', icon: Puzzle },
    ] : []),
    { value: 'promo', label: 'Kody promo', icon: Tag },
    { value: 'history', label: 'Historia', icon: History },
  ];

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <div className="bg-white border-b shadow-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="hidden md:flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <img src="/lovable-uploads/6fb7181a-c1bd-4e7b-be77-b8bd95b04042.png" alt="GetRido Logo" className="h-6 w-6" />
              <AdminPortalSwitcher />
            </div>
            <div className="flex items-center space-x-3">
              <UserDropdown userName="Administrator" userRole="Centrum Płatności" userEmail={userEmail} onLogout={handleLogout} />
            </div>
          </div>
          <div className="md:hidden flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Wallet className="h-5 w-5 text-primary" />
              <span className="text-sm font-semibold text-primary">Centrum Płatności</span>
            </div>
            <UserDropdown userName="Admin" userRole="Płatności" userEmail={userEmail} onLogout={handleLogout} />
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Wallet className="h-7 w-7 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Centrum Płatności</h1>
            <p className="text-sm text-muted-foreground">
              Bramki, plany, pule startowe, doładowania AI i faktury sprzedażowe GetRido
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="hidden md:block">
            <div className="rounded-full p-1 shadow-lg" style={{ backgroundColor: 'var(--nav-bar-color, #6C3CF0)' }}>
              <TabsList className="flex w-full items-center gap-1 overflow-x-auto scrollbar-hide rounded-full px-1 min-h-[44px] bg-transparent">
                {tabs.map((tab) => (
                  <TabsTrigger
                    key={tab.value}
                    value={tab.value}
                    className="px-4 h-10 flex items-center gap-2 rounded-full text-sm whitespace-nowrap transition text-white data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:font-semibold hover:bg-white/20 focus-visible:outline-none"
                  >
                    <tab.icon className="h-4 w-4" />
                    {tab.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>
          </div>

          <div className="md:hidden overflow-x-auto">
            <div className="flex gap-2 pb-2">
              {tabs.map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={`px-3 py-2 rounded-full text-sm whitespace-nowrap flex items-center gap-1 ${
                    activeTab === tab.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <tab.icon className="h-3 w-3" />
                  {tab.label.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>

          <TabsContent value="gateways"><PaymentGatewayConfig /></TabsContent>

          {/* Caly modul ksiegowy — ten sam, ktory ma kazde konto uzytkownika.
              Konto platformy jest wystawca faktur GetRido, wiec ten sam widok
              pokazuje tu sprzedaz portalu razem z ustawieniami firmy i KSeF. */}
          <TabsContent value="ksiegowosc">
            <ServiceProviderAccountingView />
          </TabsContent>

          <TabsContent value="assign-credits"><AssignCreditsPanel /></TabsContent>
          <TabsContent value="onetime"><CreditPackagesManager /></TabsContent>

          {isPlatformAdmin && (
            <TabsContent value="ai-start"><RidoAiStartPanel /></TabsContent>
          )}
          {isPlatformAdmin && (
            <TabsContent value="billing-plans"><BillingPlansPanel /></TabsContent>
          )}
          {isPlatformAdmin && (
            <TabsContent value="billing-features"><BillingFeaturesPanel /></TabsContent>
          )}

          <TabsContent value="promo"><PromoCodesPanel /></TabsContent>
          <TabsContent value="history"><PaymentHistory /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

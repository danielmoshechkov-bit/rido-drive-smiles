import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { CompareProvider } from "@/contexts/CompareContext";
import { OnboardingProvider } from "@/contexts/OnboardingContext";
import { QuotaGuardProvider } from "@/components/quota/QuotaGuardProvider";
import { GlobalRidoAIButton } from "@/components/ai/GlobalRidoAIButton";
import { ReferralCapture } from "@/components/ReferralCapture";
import { PwaUpdater } from "@/components/PwaUpdater";

import { OnboardingWidget } from "@/components/onboarding";
import { useUISettings } from "@/hooks/useUISettings";
import { useDynamicTranslations } from "@/hooks/useDynamicTranslations";
import { useDisableNumberInputScroll } from "@/hooks/useDisableNumberInputScroll";
import { WorkshopInvitationHandler } from "./components/workshop/WorkshopInvitationHandler";
import { InviteWelcomeBanner } from "./components/workspace/InviteWelcomeBanner";

// PERF C1: strony przez React.lazy — wcześniej 100+ statycznych importów
// pakowało WSZYSTKIE portale (giełda, nieruchomości, admin, AI, warsztat…)
// do jednego chunku 7,98 MB ściąganego przy każdym wejściu. Teraz każda
// strona to osobny chunk ładowany przy pierwszej nawigacji. Eager zostają
// tylko EasyHub (landing "/") i NotFound.
// Usunięte martwe importy: Index, MarketplaceDashboard, EasyAuth,
// SettlementSheetView (nieużywane w żadnym route).
import EasyHub from "./pages/EasyHub";
import NotFound from "./pages/NotFound";

const AddVehicleListing = lazy(() => import("./pages/AddVehicleListing"));
const GeneralMarketplace = lazy(() => import("./pages/GeneralMarketplace"));
const GeneralListingDetail = lazy(() => import("./pages/GeneralListingDetail"));
const MarketplaceCart = lazy(() => import("./pages/MarketplaceCart"));
const MarketplaceWishlist = lazy(() => import("./pages/MarketplaceWishlist"));
const MarketplaceCompare = lazy(() => import("./pages/MarketplaceCompare"));
const Auth = lazy(() => import("./pages/Auth"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminRealEstate = lazy(() => import("./pages/AdminRealEstate"));
const AdminMarketplace = lazy(() => import("./pages/AdminMarketplace"));
const AdminMaps = lazy(() => import("./pages/AdminMaps"));
const AdminPortal = lazy(() => import("./pages/AdminPortal"));
const AdminServices = lazy(() => import("./pages/AdminServices"));
const AdminAIBrain = lazy(() => import("./pages/AdminAIBrain"));
const FleetVehicleDetails = lazy(() => import("./pages/FleetVehicleDetails"));
const DriverRegister = lazy(() => import("./pages/DriverRegister"));
const RegisterSuccess = lazy(() => import("./pages/RegisterSuccess"));
const EmailConfirmed = lazy(() => import("./pages/EmailConfirmed"));
const ActivationConfirm = lazy(() => import("./pages/ActivationConfirm"));
const DriverDashboard = lazy(() => import("./pages/DriverDashboard"));
const FleetDashboard = lazy(() => import("./pages/FleetDashboard"));
const SettlementSheet = lazy(() => import("./pages/SettlementSheet"));
const SystemAlerts = lazy(() => import("./pages/SystemAlerts"));
const Install = lazy(() => import("./pages/Install"));
const RentalModule = lazy(() => import("./pages/RentalModule"));
const RentalContractPortal = lazy(() => import("./pages/RentalContractPortal"));
const CennikPage = lazy(() => import("./pages/CennikPage"));
const JakZaczacPage = lazy(() => import("./pages/JakZaczacPage"));
const KontaktPage = lazy(() => import("./pages/KontaktPage"));
const VehicleMarketplace = lazy(() => import("./pages/VehicleMarketplace"));
const VehicleDetailPage = lazy(() => import("./pages/VehicleDetailPage"));
const VehicleCompare = lazy(() => import("./pages/VehicleCompare"));
const MarketplaceRegister = lazy(() => import("./pages/MarketplaceRegister"));
const MarketplaceAuth = lazy(() => import("./pages/MarketplaceAuth"));
const WorkshopLanding = lazy(() => import("./pages/WorkshopLanding"));
const RealEstateMarketplace = lazy(() => import("./pages/RealEstateMarketplace"));
const RealEstateLanding = lazy(() => import("./pages/RealEstateLanding"));
const OfertaPage = lazy(() => import("./pages/OfertaPage"));
const PropertyCompare = lazy(() => import("./pages/PropertyCompare"));
const RealEstateAgentRegister = lazy(() => import("./pages/RealEstateAgentRegister"));
const RealEstateAgentDashboard = lazy(() => import("./pages/RealEstateAgentDashboard"));
const GeneralListingAdd = lazy(() => import("./pages/GeneralListingAdd"));
const GeneralListingEdit = lazy(() => import("./pages/GeneralListingEdit"));
const MarketplaceSellerProfile = lazy(() => import("./pages/MarketplaceSellerProfile"));
const FleetLanding = lazy(() => import("./pages/FleetLanding"));
const FleetRegister = lazy(() => import("./pages/FleetRegister"));
const FleetRegisterSuccess = lazy(() => import("./pages/FleetRegisterSuccess"));
const PropertyDetailPage = lazy(() => import("./pages/PropertyDetailPage"));
const LegalPage = lazy(() => import("./pages/LegalPage"));
const GetRidoMaps = lazy(() => import("./pages/GetRidoMaps"));
const ServicesMarketplace = lazy(() => import("./pages/ServicesMarketplace"));
const AdminRidoMarket = lazy(() => import("./pages/AdminRidoMarket"));
const ServiceProviderDetail = lazy(() => import("./pages/ServiceProviderDetail"));
const ServiceProviderDashboard = lazy(() => import("./pages/ServiceProviderDashboard"));
const WorkflowModule = lazy(() => import("./pages/WorkflowModule"));
const UniversalSearchResults = lazy(() => import("./pages/UniversalSearchResults"));
const AccountingDashboard = lazy(() => import("./pages/AccountingDashboard"));
const InsuranceAgentRegister = lazy(() => import("./pages/InsuranceAgentRegister"));
const InsuranceAgentDashboard = lazy(() => import("./pages/InsuranceAgentDashboard"));
const InvoiceProgram = lazy(() => import("./pages/InvoiceProgram"));
const ClientPortal = lazy(() => import("./pages/ClientPortal"));
const AIProPage = lazy(() => import("./pages/AIProPage"));
const InvoicingLanding = lazy(() => import("./pages/InvoicingLanding"));
const DriverInfoLanding = lazy(() => import("./pages/DriverInfoLanding"));
const SalesPortal = lazy(() => import("./pages/SalesPortal"));
const RentalClientPortal = lazy(() => import("./pages/RentalClientPortal"));
const WorkshopClientCard = lazy(() => import("./pages/WorkshopClientCard"));
const DriverBankChangeConfirm = lazy(() => import("./pages/DriverBankChangeConfirm"));
const BookingConfirm = lazy(() => import("./pages/BookingConfirm"));
const WorkshopSmsCenter = lazy(() => import("./pages/WorkshopSmsCenter"));
const RidoAIChat = lazy(() => import("./pages/RidoAIChat"));
const MeetingsPage = lazy(() => import("./pages/MeetingsPage"));
const RidoMailPage = lazy(() => import("./pages/RidoMailPage"));
const AdminAIAgentsPage = lazy(() => import("./pages/AdminAIAgentsPage"));
const AdminMarketing = lazy(() => import("./pages/AdminMarketing"));
const ConfirmViewingPage = lazy(() => import("./pages/ConfirmViewingPage"));
const MyViewingsPage = lazy(() => import("./pages/MyViewingsPage"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const PaymentCancel = lazy(() => import("./pages/PaymentCancel"));
const BuyCredits = lazy(() => import("./pages/BuyCredits"));
const WorkshopEmployeePortal = lazy(() => import("./pages/WorkshopEmployeePortal"));

// Fallback ładowania chunku strony
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
  </div>
);
// PERF B2: bez tej konfiguracji TanStack Query v5 używa staleTime: 0 +
// refetchOnWindowFocus: true — każdy alt-tab i każdy remount refetchował
// WSZYSTKIE aktywne zapytania (listy warsztatu z joinami itd.).
// Zmiany między klientami dosyła realtime; po 45 s dane i tak się odświeżą.

// PERF P3: klienckie błędy (4xx / RLS / kształt odpowiedzi) są deterministyczne —
// retry ich nie naprawi, tylko trzyma spinner. Supabase-js nie zawsze daje
// status HTTP, więc rozpoznajemy też po kodach: 42501 = permission denied (RLS),
// PGRST* = błędy protokołu PostgREST (np. PGRST116 zła liczność, PGRST301 JWT).
// Przejściowe (5xx, timeout 57014, przerwana transakcja 25P02, sieć) — retry TAK.
const isNonRetryableError = (error: any) => {
  const status = typeof error?.status === 'number' ? error.status : undefined;
  if (status !== undefined) return status >= 400 && status < 500;
  const code = String(error?.code ?? '');
  return code === '42501' || code.startsWith('PGRST');
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 45 * 1000,
      refetchOnWindowFocus: false,
      // PERF P3: domyślne 3 retry z backoffem 1s/2s/4s potrafiły (z łańcuchem
      // auth -> providerId -> lista) trzymać panel na spinnerze kilkanaście
      // sekund przy burście 500 z Supabase. Teraz: max 2 próby, 0,5 s / 1 s,
      // i zero ponawiania błędów klienckich.
      retry: (failureCount, error) => failureCount < 2 && !isNonRetryableError(error),
      retryDelay: (attemptIndex) => Math.min(500 * 2 ** attemptIndex, 2000),
    },
  },
});

/**
 * UISettingsLoader component - loads UI settings and applies them
 */
function UISettingsLoader({ children }: { children: React.ReactNode }) {
  // This hook loads settings from DB and applies CSS variable
  useUISettings();
  useDynamicTranslations();
  // C1: globalnie blokuje zmianę wartości <input type="number"> przez scroll
  // myszki/touchpada (wcześniej wpięte tylko w kilku miejscach — teraz działa
  // na całym portalu, w tym w formularzach nieruchomości/giełdy/warsztatu).
  useDisableNumberInputScroll();
  return <>{children}</>;
}

/** 
 * Main App component with routes
 * @version 2.0.0
 */
const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <OnboardingProvider>
        <UISettingsLoader>
          <Toaster />
          <Sonner />
          <PwaUpdater />
          <BrowserRouter>
            <QuotaGuardProvider>
            <CompareProvider>
              <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/" element={<EasyHub />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/oferta" element={<OfertaPage />} />
                <Route path="/install" element={<Install />} />
                <Route path="/gielda" element={<VehicleMarketplace />} />
                <Route path="/gielda/ogloszenie/:id" element={<VehicleDetailPage />} />
                <Route path="/gielda/porownaj" element={<VehicleCompare />} />
                <Route path="/gielda/logowanie" element={<MarketplaceAuth />} />
                <Route path="/gielda/rejestracja" element={<MarketplaceRegister />} />
                <Route path="/gielda/panel" element={<Navigate to="/klient" replace />} />
                <Route path="/gielda/dodaj-pojazd" element={<AddVehicleListing />} />
                <Route path="/easy" element={<EasyHub />} />
                <Route path="/marketplace" element={<GeneralMarketplace />} />
                <Route path="/marketplace/listing/:id" element={<GeneralListingDetail />} />
                <Route path="/marketplace/cart" element={<MarketplaceCart />} />
                <Route path="/marketplace/wishlist" element={<MarketplaceWishlist />} />
                <Route path="/marketplace/compare" element={<MarketplaceCompare />} />
                <Route path="/marketplace/dodaj" element={<GeneralListingAdd />} />
                <Route path="/marketplace/edit-listing/:id" element={<GeneralListingEdit />} />
                <Route path="/marketplace/seller/:userId" element={<MarketplaceSellerProfile />} />
                <Route path="/easy/login" element={<Navigate to="/easy" replace />} />
                <Route path="/easy/register" element={<Navigate to="/easy" replace />} />
                <Route path="/nieruchomosci" element={<RealEstateMarketplace />} />
                {/* Iteracja 2 — landing routes SEO. Kolejność ważna: przed :id, żeby "kategoria" nie została zjedzona jako id. */}
                <Route path="/nieruchomosci/kategoria/:typ" element={<RealEstateLanding />} />
                <Route path="/nieruchomosci/kategoria/:typ/:transakcja" element={<RealEstateLanding />} />
                <Route path="/nieruchomosci/kategoria/:typ/:transakcja/:lokalizacja" element={<RealEstateLanding />} />
                <Route path="/nieruchomosci/ogloszenie/:id" element={<PropertyDetailPage />} />
                <Route path="/nieruchomosci/porownaj" element={<PropertyCompare />} />
                <Route path="/nieruchomosci/agent/rejestracja" element={<RealEstateAgentRegister />} />
                <Route path="/nieruchomosci/agent/panel" element={<RealEstateAgentDashboard />} />
                <Route path="/uslugi" element={<ServicesMarketplace />} />
                <Route path="/uslugi/panel" element={<ServiceProviderDashboard />} />
                <Route path="/workflow" element={<WorkflowModule />} />
                <Route path="/uslugi/uslugodawca/:providerId" element={<ServiceProviderDetail />} />
                <Route path="/wyniki" element={<UniversalSearchResults />} />
                <Route path="/ksiegowosc" element={<AccountingDashboard />} />
                <Route path="/ksiegowosc-info" element={<InvoicingLanding />} />
                <Route path="/warsztat-info" element={<WorkshopLanding />} />
                <Route path="/faktury" element={<InvoiceProgram />} />
                <Route path="/klient" element={<ClientPortal />} />
                <Route path="/ai-pro" element={<AIProPage />} />
                <Route path="/ubezpieczenia/rejestracja" element={<InsuranceAgentRegister />} />
                <Route path="/ubezpieczenia/panel" element={<InsuranceAgentDashboard />} />
                <Route path="/fleet" element={<FleetLanding />} />
                <Route path="/fleet/rejestracja" element={<FleetRegister />} />
                <Route path="/fleet/rejestracja-sukces" element={<FleetRegisterSuccess />} />
                <Route path="/fleet/aktywacja" element={<ActivationConfirm />} />
                <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
                <Route path="/admin/dashboard" element={<AdminDashboard />} />
                <Route path="/admin/marketplace" element={<AdminMarketplace />} />
                <Route path="/admin/ridomarket" element={<AdminRidoMarket />} />
                <Route path="/admin/nieruchomosci" element={<AdminRealEstate />} />
                <Route path="/admin/mapy" element={<AdminMaps />} />
                <Route path="/admin/portal" element={<AdminPortal />} />
                <Route path="/admin/uslugi" element={<AdminServices />} />
                <Route path="/admin/ai" element={<AdminAIBrain />} />
                <Route path="/admin/agenci-ai" element={<AdminAIAgentsPage />} />
                <Route path="/admin/marketing" element={<AdminMarketing />} />
                <Route path="/rido-ai" element={<RidoAIChat />} />
                <Route path="/potwierdz-termin/:token" element={<ConfirmViewingPage />} />
                <Route path="/moje-ogladania" element={<MyViewingsPage />} />
                <Route path="/meetings" element={<MeetingsPage />} />
                <Route path="/mail" element={<RidoMailPage />} />
                <Route path="/mapy" element={<GetRidoMaps />} />
                <Route path="/fleet/dashboard" element={<FleetDashboard />} />
                <Route path="/admin/system-alerts" element={<SystemAlerts />} />
                <Route path="/admin/fleet/:id" element={<FleetVehicleDetails />} />
                <Route path="/admin/settlement/:id" element={<SettlementSheet />} />
                <Route path="/settlement/:id" element={<SettlementSheet />} />
                <Route path="/driver/register" element={<DriverRegister />} />
                <Route path="/register-success" element={<RegisterSuccess />} />
                <Route path="/email-confirmed" element={<EmailConfirmed />} />
                <Route path="/kierowca/aktywacja" element={<ActivationConfirm />} />
                <Route path="/aktywacja" element={<ActivationConfirm />} />
                <Route path="/driver" element={<DriverDashboard />} />
                <Route path="/kierowca-info" element={<DriverInfoLanding />} />
                <Route path="/sprzedaz" element={<SalesPortal />} />
                <Route path="/handlowiec" element={<SalesPortal />} />
                <Route path="/prawne" element={<LegalPage />} />
                <Route path="/cennik" element={<CennikPage />} />
                <Route path="/jak-zaczac" element={<JakZaczacPage />} />
                <Route path="/kontakt" element={<KontaktPage />} />
                <Route path="/polityka-prywatnosci" element={<Navigate to="/prawne?tab=polityka" replace />} />
                <Route path="/regulamin" element={<Navigate to="/prawne?tab=regulamin" replace />} />
                <Route path="/rodo" element={<Navigate to="/prawne?tab=rodo" replace />} />
                <Route path="/cookies" element={<Navigate to="/prawne?tab=cookies" replace />} />
                <Route path="/umowa/:rentalId" element={<RentalClientPortal />} />
                <Route path="/warsztat/klient/:code" element={<WorkshopClientCard />} />
                <Route path="/kierowca/potwierdz-konto/:token" element={<DriverBankChangeConfirm />} />
                <Route path="/r/:token" element={<BookingConfirm />} />
                <Route path="/warsztat/sms" element={<WorkshopSmsCenter />} />
                {/* Aliases for marketplace add listing */}
                <Route path="/dodaj" element={<AddVehicleListing />} />
                <Route path="/dodaj-ogloszenie" element={<AddVehicleListing />} />
                <Route path="/payment/success" element={<PaymentSuccess />} />
                <Route path="/payment/cancel" element={<PaymentCancel />} />
                <Route path="/buy-credits" element={<BuyCredits />} />
                <Route path="/pracownik-warsztat" element={<WorkshopEmployeePortal />} />
                <Route path="/pracownik-warsztat/zlecenia/:id" element={<WorkshopEmployeePortal />} />
                <Route path="/wynajem" element={<RentalModule />} />
                <Route path="/wynajem/umowa/:token" element={<RentalContractPortal />} />
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
              </Suspense>
              {/* Global invitation handler — processes ?invitation=<id> after email confirm */}
              <WorkshopInvitationHandler />
              {/* Ramka „Zostałeś zaproszony do projektu" — strona główna ?invite=1 / oczekujące zaproszenia */}
              <InviteWelcomeBanner />
              {/* Global referral tracking + welcome banner */}
              <ReferralCapture />
              {/* Global RidoAI Button */}
              <GlobalRidoAIButton />
              {/* Global Onboarding Widget */}
              <OnboardingWidget />
            </CompareProvider>
            </QuotaGuardProvider>
          </BrowserRouter>
        </UISettingsLoader>
      </OnboardingProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

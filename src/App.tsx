import { lazy, Suspense } from "react";
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { CompareProvider } from "@/contexts/CompareContext";
import { OnboardingProvider } from "@/contexts/OnboardingContext";
import { QuotaGuardProvider } from "@/components/quota/QuotaGuardProvider";
import { ZakupProvider } from "@/components/billing/ZakupProvider";
// Ludek RidoAI chwilowo zdjęty z ekranu — patrz miejsce montowania niżej.
// import { GlobalRidoAIButton } from "@/components/ai/GlobalRidoAIButton";
import { SupportChatWidget } from "@/components/support/SupportChatWidget";
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

const AddVehicleListing = lazyWithRetry(() => import("./pages/AddVehicleListing"));
const GeneralMarketplace = lazyWithRetry(() => import("./pages/GeneralMarketplace"));
const GeneralListingDetail = lazyWithRetry(() => import("./pages/GeneralListingDetail"));
const MarketplaceCart = lazyWithRetry(() => import("./pages/MarketplaceCart"));
const MarketplaceWishlist = lazyWithRetry(() => import("./pages/MarketplaceWishlist"));
const MarketplaceCompare = lazyWithRetry(() => import("./pages/MarketplaceCompare"));
const Auth = lazyWithRetry(() => import("./pages/Auth"));
const ResetPassword = lazyWithRetry(() => import("./pages/ResetPassword"));
const AdminDashboard = lazyWithRetry(() => import("./pages/AdminDashboard"));
const AdminRealEstate = lazyWithRetry(() => import("./pages/AdminRealEstate"));
const AdminMarketplace = lazyWithRetry(() => import("./pages/AdminMarketplace"));
const AdminMaps = lazyWithRetry(() => import("./pages/AdminMaps"));
const AdminPortal = lazyWithRetry(() => import("./pages/AdminPortal"));
const AdminServices = lazyWithRetry(() => import("./pages/AdminServices"));
const AdminAIBrain = lazyWithRetry(() => import("./pages/AdminAIBrain"));
const FleetVehicleDetails = lazyWithRetry(() => import("./pages/FleetVehicleDetails"));
const DriverRegister = lazyWithRetry(() => import("./pages/DriverRegister"));
const RegisterSuccess = lazyWithRetry(() => import("./pages/RegisterSuccess"));
const EmailConfirmed = lazyWithRetry(() => import("./pages/EmailConfirmed"));
const ActivationConfirm = lazyWithRetry(() => import("./pages/ActivationConfirm"));
const DriverDashboard = lazyWithRetry(() => import("./pages/DriverDashboard"));
const FleetDashboard = lazyWithRetry(() => import("./pages/FleetDashboard"));
const SettlementSheet = lazyWithRetry(() => import("./pages/SettlementSheet"));
const SystemAlerts = lazyWithRetry(() => import("./pages/SystemAlerts"));
const Install = lazyWithRetry(() => import("./pages/Install"));
const RentalModule = lazyWithRetry(() => import("./pages/RentalModule"));
const RentalContractPortal = lazyWithRetry(() => import("./pages/RentalContractPortal"));
const CennikPage = lazyWithRetry(() => import("./pages/CennikPage"));
const JakZaczacPage = lazyWithRetry(() => import("./pages/JakZaczacPage"));
const KontaktPage = lazyWithRetry(() => import("./pages/KontaktPage"));
const DataDeletionPage = lazyWithRetry(() => import("./pages/DataDeletionPage"));
const VehicleMarketplace = lazyWithRetry(() => import("./pages/VehicleMarketplace"));
const VehicleDetailPage = lazyWithRetry(() => import("./pages/VehicleDetailPage"));
const VehicleCompare = lazyWithRetry(() => import("./pages/VehicleCompare"));
const MarketplaceRegister = lazyWithRetry(() => import("./pages/MarketplaceRegister"));
const MarketplaceAuth = lazyWithRetry(() => import("./pages/MarketplaceAuth"));
const WorkshopLanding = lazyWithRetry(() => import("./pages/WorkshopLanding"));
const RealEstateMarketplace = lazyWithRetry(() => import("./pages/RealEstateMarketplace"));
const RealEstateLanding = lazyWithRetry(() => import("./pages/RealEstateLanding"));
const OfertaPage = lazyWithRetry(() => import("./pages/OfertaPage"));
const PropertyCompare = lazyWithRetry(() => import("./pages/PropertyCompare"));
const RealEstateAgentRegister = lazyWithRetry(() => import("./pages/RealEstateAgentRegister"));
const RealEstateAgentDashboard = lazyWithRetry(() => import("./pages/RealEstateAgentDashboard"));
const GeneralListingAdd = lazyWithRetry(() => import("./pages/GeneralListingAdd"));
const GeneralListingEdit = lazyWithRetry(() => import("./pages/GeneralListingEdit"));
const MarketplaceSellerProfile = lazyWithRetry(() => import("./pages/MarketplaceSellerProfile"));
const FleetLanding = lazyWithRetry(() => import("./pages/FleetLanding"));
const FleetRegister = lazyWithRetry(() => import("./pages/FleetRegister"));
const FleetRegisterSuccess = lazyWithRetry(() => import("./pages/FleetRegisterSuccess"));
const PropertyDetailPage = lazyWithRetry(() => import("./pages/PropertyDetailPage"));
const LegalPage = lazyWithRetry(() => import("./pages/LegalPage"));
const GetRidoMaps = lazyWithRetry(() => import("./pages/GetRidoMaps"));
const GetRidoMap = lazyWithRetry(() => import("./pages/GetRidoMap"));
const ServicesMarketplace = lazyWithRetry(() => import("./pages/ServicesMarketplace"));
const AdminRidoMarket = lazyWithRetry(() => import("./pages/AdminRidoMarket"));
const ServiceProviderDetail = lazyWithRetry(() => import("./pages/ServiceProviderDetail"));
const ServiceProviderDashboard = lazyWithRetry(() => import("./pages/ServiceProviderDashboard"));
const WorkflowModule = lazyWithRetry(() => import("./pages/WorkflowModule"));
const UniversalSearchResults = lazyWithRetry(() => import("./pages/UniversalSearchResults"));
const AccountingDashboard = lazyWithRetry(() => import("./pages/AccountingDashboard"));
const InsuranceAgentRegister = lazyWithRetry(() => import("./pages/InsuranceAgentRegister"));
const InsuranceAgentDashboard = lazyWithRetry(() => import("./pages/InsuranceAgentDashboard"));
const InvoiceProgram = lazyWithRetry(() => import("./pages/InvoiceProgram"));
const ClientPortal = lazyWithRetry(() => import("./pages/ClientPortal"));
const AIProPage = lazyWithRetry(() => import("./pages/AIProPage"));
const InvoicingLanding = lazyWithRetry(() => import("./pages/InvoicingLanding"));
const DriverInfoLanding = lazyWithRetry(() => import("./pages/DriverInfoLanding"));
const SalesPortal = lazyWithRetry(() => import("./pages/SalesPortal"));
const RentalClientPortal = lazyWithRetry(() => import("./pages/RentalClientPortal"));
const WorkshopClientCard = lazyWithRetry(() => import("./pages/WorkshopClientCard"));
const DriverBankChangeConfirm = lazyWithRetry(() => import("./pages/DriverBankChangeConfirm"));
const BookingConfirm = lazyWithRetry(() => import("./pages/BookingConfirm"));
const WorkshopSmsCenter = lazyWithRetry(() => import("./pages/WorkshopSmsCenter"));
const RidoAIChat = lazyWithRetry(() => import("./pages/RidoAIChat"));
const MeetingsPage = lazyWithRetry(() => import("./pages/MeetingsPage"));
const RidoMailPage = lazyWithRetry(() => import("./pages/RidoMailPage"));
const AdminAIAgentsPage = lazyWithRetry(() => import("./pages/AdminAIAgentsPage"));
const AdminMarketing = lazyWithRetry(() => import("./pages/AdminMarketing"));
const ConfirmViewingPage = lazyWithRetry(() => import("./pages/ConfirmViewingPage"));
const MyViewingsPage = lazyWithRetry(() => import("./pages/MyViewingsPage"));
const PaymentSuccess = lazyWithRetry(() => import("./pages/PaymentSuccess"));
const PaymentCancel = lazyWithRetry(() => import("./pages/PaymentCancel"));
const BuyCredits = lazyWithRetry(() => import("./pages/BuyCredits"));
const WorkshopEmployeePortal = lazyWithRetry(() => import("./pages/WorkshopEmployeePortal"));

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
  // Granica bledu: bez niej kazdy blad renderowania (albo nieaktualny plik
  // modulu po wdrozeniu) konczyl sie bialym ekranem bez zadnej informacji.
  <AppErrorBoundary>
  <ConfirmDialogProvider>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <OnboardingProvider>
        <UISettingsLoader>
          <Toaster />
          <Sonner />
          <PwaUpdater />
          <BrowserRouter>
            <QuotaGuardProvider>
            <ZakupProvider>
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
                <Route path="/mapa" element={<Navigate to="/mapy" replace />} />
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
                <Route path="/usuwanie-danych" element={<DataDeletionPage />} />
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
              {/* Global RidoAI Button — CHWILOWO WYŁĄCZONY.
                  Prawy dolny róg zajmuje czat wsparcia (SupportChatWidget).
                  Gdy ludek wróci, ma stanąć po LEWEJ stronie:
                  w GlobalRidoAIButton.tsx zamień `right-6` na `left-6`. */}
              {/* <GlobalRidoAIButton /> */}
              {/* Czat wsparcia — dymek w prawym dolnym rogu */}
              <SupportChatWidget />
              {/* Global Onboarding Widget */}
              <OnboardingWidget />
            </CompareProvider>
            </ZakupProvider>
            </QuotaGuardProvider>
          </BrowserRouter>
        </UISettingsLoader>
      </OnboardingProvider>
    </TooltipProvider>
  </QueryClientProvider>
  </ConfirmDialogProvider>
  </AppErrorBoundary>
);

export default App;

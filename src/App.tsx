import { Toaster } from "@/components/ui/toaster";
import AddVehicleListing from "./pages/AddVehicleListing";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { CompareProvider } from "@/contexts/CompareContext";
import { RidoAssistantWidget } from "@/components/ai/RidoAssistantWidget";
import { useUISettings } from "@/hooks/useUISettings";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import AdminDashboard from "./pages/AdminDashboard";
import AdminRealEstate from "./pages/AdminRealEstate";
import AdminMarketplace from "./pages/AdminMarketplace";
import AdminMaps from "./pages/AdminMaps";
import AdminPortal from "./pages/AdminPortal";
import AdminServices from "./pages/AdminServices";
import FleetVehicleDetails from "./pages/FleetVehicleDetails";
import DriverRegister from "./pages/DriverRegister";
import RegisterSuccess from "./pages/RegisterSuccess";
import EmailConfirmed from "./pages/EmailConfirmed";
import DriverDashboard from "./pages/DriverDashboard";
import FleetDashboard from "./pages/FleetDashboard";
import SettlementSheet from "./pages/SettlementSheet";
import SettlementSheetView from "./pages/SettlementSheetView";
import SystemAlerts from "./pages/SystemAlerts";
import Install from "./pages/Install";
import NotFound from "./pages/NotFound";
import VehicleMarketplace from "./pages/VehicleMarketplace";
import VehicleDetailPage from "./pages/VehicleDetailPage";
import VehicleCompare from "./pages/VehicleCompare";
import MarketplaceRegister from "./pages/MarketplaceRegister";
import MarketplaceAuth from "./pages/MarketplaceAuth";
import MarketplaceDashboard from "./pages/MarketplaceDashboard";
import EasyHub from "./pages/EasyHub";
import EasyAuth from "./pages/EasyAuth";
import RealEstateMarketplace from "./pages/RealEstateMarketplace";
import OfertaPage from "./pages/OfertaPage";
import PropertyCompare from "./pages/PropertyCompare";
import RealEstateAgentRegister from "./pages/RealEstateAgentRegister";
import RealEstateAgentDashboard from "./pages/RealEstateAgentDashboard";
import FleetLanding from "./pages/FleetLanding";
import FleetRegister from "./pages/FleetRegister";
import PropertyDetailPage from "./pages/PropertyDetailPage";
import LegalPage from "./pages/LegalPage";
import GetRidoMaps from "./pages/GetRidoMaps";
import ServicesMarketplace from "./pages/ServicesMarketplace";
import ServiceProviderDetail from "./pages/ServiceProviderDetail";
import UniversalSearchResults from "./pages/UniversalSearchResults";
import AccountingDashboard from "./pages/AccountingDashboard";
import InsuranceAgentRegister from "./pages/InsuranceAgentRegister";
import InsuranceAgentDashboard from "./pages/InsuranceAgentDashboard";
import InvoiceProgram from "./pages/InvoiceProgram";
import ClientPortal from "./pages/ClientPortal";
import AIProPage from "./pages/AIProPage";
import InvoicingLanding from "./pages/InvoicingLanding";
import DriverInfoLanding from "./pages/DriverInfoLanding";
import SalesPortal from "./pages/SalesPortal";
import RentalClientPortal from "./pages/RentalClientPortal";
const queryClient = new QueryClient();

/**
 * UISettingsLoader component - loads UI settings and applies them
 */
function UISettingsLoader({ children }: { children: React.ReactNode }) {
  // This hook loads settings from DB and applies CSS variable
  useUISettings();
  return <>{children}</>;
}

/** 
 * Main App component with routes
 * @version 2.0.0
 */
const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <UISettingsLoader>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <CompareProvider>
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
            <Route path="/gielda/panel" element={<MarketplaceDashboard />} />
            <Route path="/gielda/dodaj-pojazd" element={<AddVehicleListing />} />
            <Route path="/easy" element={<EasyHub />} />
            <Route path="/easy/login" element={<EasyAuth mode="login" />} />
            <Route path="/easy/register" element={<EasyAuth mode="register" />} />
            <Route path="/nieruchomosci" element={<RealEstateMarketplace />} />
            <Route path="/nieruchomosci/ogloszenie/:id" element={<PropertyDetailPage />} />
            <Route path="/nieruchomosci/porownaj" element={<PropertyCompare />} />
            <Route path="/nieruchomosci/agent/rejestracja" element={<RealEstateAgentRegister />} />
            <Route path="/nieruchomosci/agent/panel" element={<RealEstateAgentDashboard />} />
            <Route path="/uslugi" element={<ServicesMarketplace />} />
            <Route path="/uslugi/uslugodawca/:providerId" element={<ServiceProviderDetail />} />
            <Route path="/wyniki" element={<UniversalSearchResults />} />
            <Route path="/ksiegowosc" element={<AccountingDashboard />} />
            <Route path="/ksiegowosc-info" element={<InvoicingLanding />} />
            <Route path="/faktury" element={<InvoiceProgram />} />
            <Route path="/klient" element={<ClientPortal />} />
            <Route path="/ai-pro" element={<AIProPage />} />
            <Route path="/ubezpieczenia/rejestracja" element={<InsuranceAgentRegister />} />
            <Route path="/ubezpieczenia/panel" element={<InsuranceAgentDashboard />} />
            <Route path="/fleet" element={<FleetLanding />} />
            <Route path="/fleet/rejestracja" element={<FleetRegister />} />
            <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/marketplace" element={<AdminMarketplace />} />
            <Route path="/admin/nieruchomosci" element={<AdminRealEstate />} />
            <Route path="/admin/mapy" element={<AdminMaps />} />
            <Route path="/admin/portal" element={<AdminPortal />} />
            <Route path="/admin/uslugi" element={<AdminServices />} />
            <Route path="/mapy" element={<GetRidoMaps />} />
            <Route path="/fleet/dashboard" element={<FleetDashboard />} />
            <Route path="/admin/system-alerts" element={<SystemAlerts />} />
            <Route path="/admin/fleet/:id" element={<FleetVehicleDetails />} />
            <Route path="/admin/settlement/:id" element={<SettlementSheet />} />
            <Route path="/settlement/:id" element={<SettlementSheet />} />
            <Route path="/driver/register" element={<DriverRegister />} />
            <Route path="/register-success" element={<RegisterSuccess />} />
            <Route path="/email-confirmed" element={<EmailConfirmed />} />
            <Route path="/driver" element={<DriverDashboard />} />
            <Route path="/kierowca-info" element={<DriverInfoLanding />} />
            <Route path="/sprzedaz" element={<SalesPortal />} />
            <Route path="/prawne" element={<LegalPage />} />
            <Route path="/umowa/:rentalId" element={<RentalClientPortal />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          {/* Global AI Assistant Widget */}
          <RidoAssistantWidget />
        </CompareProvider>
      </BrowserRouter>
      </UISettingsLoader>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

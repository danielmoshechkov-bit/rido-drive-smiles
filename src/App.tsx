import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { CompareProvider } from "@/contexts/CompareContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import AdminDashboard from "./pages/AdminDashboard";
import AdminRealEstate from "./pages/AdminRealEstate";
import AdminMarketplace from "./pages/AdminMarketplace";
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
import VehicleCompare from "./pages/VehicleCompare";
import MarketplaceRegister from "./pages/MarketplaceRegister";
import MarketplaceAuth from "./pages/MarketplaceAuth";
import MarketplaceDashboard from "./pages/MarketplaceDashboard";
import EasyHub from "./pages/EasyHub";
import EasyAuth from "./pages/EasyAuth";
import RealEstateMarketplace from "./pages/RealEstateMarketplace";
import PropertyCompare from "./pages/PropertyCompare";
import RealEstateAgentRegister from "./pages/RealEstateAgentRegister";
import RealEstateAgentDashboard from "./pages/RealEstateAgentDashboard";
import FleetLanding from "./pages/FleetLanding";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <CompareProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Auth />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/landing" element={<Index />} />
            <Route path="/install" element={<Install />} />
            <Route path="/gielda" element={<VehicleMarketplace />} />
            <Route path="/gielda/porownaj" element={<VehicleCompare />} />
            <Route path="/gielda/logowanie" element={<MarketplaceAuth />} />
            <Route path="/gielda/rejestracja" element={<MarketplaceRegister />} />
            <Route path="/gielda/panel" element={<MarketplaceDashboard />} />
            <Route path="/easy" element={<EasyHub />} />
            <Route path="/easy/login" element={<EasyAuth mode="login" />} />
            <Route path="/easy/register" element={<EasyAuth mode="register" />} />
            <Route path="/nieruchomosci" element={<RealEstateMarketplace />} />
            <Route path="/nieruchomosci/porownaj" element={<PropertyCompare />} />
            <Route path="/nieruchomosci/agent/rejestracja" element={<RealEstateAgentRegister />} />
            <Route path="/nieruchomosci/agent/panel" element={<RealEstateAgentDashboard />} />
            <Route path="/fleet" element={<FleetLanding />} />
            <Route path="/admin/dashboard" element={<AdminDashboard />} />
            <Route path="/admin/marketplace" element={<AdminMarketplace />} />
            <Route path="/admin/nieruchomosci" element={<AdminRealEstate />} />
            <Route path="/fleet/dashboard" element={<FleetDashboard />} />
            <Route path="/admin/system-alerts" element={<SystemAlerts />} />
            <Route path="/admin/fleet/:id" element={<FleetVehicleDetails />} />
            <Route path="/admin/settlement/:id" element={<SettlementSheet />} />
            <Route path="/settlement/:id" element={<SettlementSheet />} />
            <Route path="/driver/register" element={<DriverRegister />} />
            <Route path="/register-success" element={<RegisterSuccess />} />
            <Route path="/email-confirmed" element={<EmailConfirmed />} />
            <Route path="/driver" element={<DriverDashboard />} />
            <Route path="/settlement/:id" element={<SettlementSheet />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </CompareProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

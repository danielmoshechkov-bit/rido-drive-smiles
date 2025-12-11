import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import AdminDashboard from "./pages/AdminDashboard";
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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Auth />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/landing" element={<Index />} />
          <Route path="/install" element={<Install />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
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
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

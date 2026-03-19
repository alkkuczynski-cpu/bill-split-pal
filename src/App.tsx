import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import Index from "./pages/Index.tsx";
import SessionSetup from "./pages/SessionSetup.tsx";
import ReceiptUpload from "./pages/ReceiptUpload.tsx";
import ClaimItems from "./pages/ClaimItems.tsx";
import Summary from "./pages/Summary.tsx";
import Onboarding from "./pages/Onboarding.tsx";
import ProfileEdit from "./pages/ProfileEdit.tsx";
import ModeSelect from "./pages/ModeSelect.tsx";
import GuestJoin from "./pages/GuestJoin.tsx";
import WaitingRoom from "./pages/WaitingRoom.tsx";
import GuestSummary from "./pages/GuestSummary.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/profile" element={<ProfileEdit />} />
            <Route path="/mode-select" element={<ModeSelect />} />
            <Route path="/setup" element={<SessionSetup />} />
            <Route path="/upload" element={<ReceiptUpload />} />
            <Route path="/claim" element={<ClaimItems />} />
            <Route path="/summary" element={<Summary />} />
            <Route path="/join" element={<GuestJoin />} />
            <Route path="/waiting" element={<WaitingRoom />} />
            <Route path="/guest-summary" element={<GuestSummary />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

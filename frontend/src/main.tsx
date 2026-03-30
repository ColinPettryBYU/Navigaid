import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import App from "./App.tsx";
import "./index.css";

import PublicLayout from "@/components/layout/PublicLayout";
import DashboardLayout from "@/components/layout/DashboardLayout";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import SituationsPage from "./pages/SituationsPage";
import ProfilePage from "./pages/ProfilePage";
import ApplicationsPage from "./pages/ApplicationsPage";
import ResultsPage from "./pages/ResultsPage";
import NotFound from "./pages/NotFound";
import Login from "./pages/login.tsx";
import PrivacyPage from "./pages/PrivacyPage";
import TermsPage from "./pages/TermsPage";
import AccessibilityPage from "./pages/AccessibilityPage";
import ContactPage from "./pages/ContactPage";
import BenefitsGuidePage from "./pages/BenefitsGuidePage";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App>
      <BrowserRouter>
        <Routes>
          {/* Public pages: top nav + footer */}
          <Route element={<PublicLayout />}>
            <Route index element={<Index />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Login />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/accessibility" element={<AccessibilityPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/benefits" element={<BenefitsGuidePage />} />
            <Route path="*" element={<NotFound />} />
          </Route>

          {/* Dashboard pages: sidebar + header, accessible to all */}
          <Route element={<DashboardLayout />}>
            <Route path="/situations" element={<SituationsPage />} />
            <Route path="/results" element={<ResultsPage />} />
            {/* Temporarily public: browse Applications without signing in (saving still requires login). */}
            <Route path="/applications" element={<ApplicationsPage />} />
          </Route>

          {/* Protected dashboard pages: auth check + sidebar + header */}
          <Route element={<ProtectedRoute />}>
            <Route element={<DashboardLayout />}>
              <Route path="/profile" element={<ProfilePage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </App>
  </StrictMode>
);

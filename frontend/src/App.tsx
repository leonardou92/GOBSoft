import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import MainLayout from "@/components/layout/MainLayout";
import { RequireAuth } from "@/components/RequireAuth";
import { SessionTimeoutWatcher } from "@/components/SessionTimeoutWatcher";
import LoginPage from "@/pages/LoginPage";
import DashboardPage from "@/pages/DashboardPage";
import AccountsPage from "@/pages/AccountsPage";
import TransactionsPage from "@/pages/TransactionsPage";
import BanksPage from "@/pages/BanksPage";
import BankIntegrationsPage from "@/pages/BankIntegrationsPage";
import BankIntegrationWizardPage from "@/pages/BankIntegrationWizardPage";
import AssociatesPage from "@/pages/AssociatesPage";
import BNCQueriesPage from "@/pages/BNCQueriesPage";
import P2PPaymentPage from "@/pages/P2PPaymentPage";
import C2PPaymentPage from "@/pages/C2PPaymentPage";
import VPOSPage from "@/pages/VPOSPage";
import CreditDebitPage from "@/pages/CreditDebitPage";
import ProfilePage from "@/pages/ProfilePage";
import UsersPage from "@/pages/UsersPage";
import ApiErrorLogsPage from "@/pages/ApiErrorLogsPage";
import AuditLogsPage from "@/pages/AuditLogsPage";
import RoleAccessPage from "@/pages/RoleAccessPage";
import PreferencesPage from "@/pages/PreferencesPage";
import TwoFactorSettingsPage from "@/pages/TwoFactorSettingsPage";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <SessionTimeoutWatcher />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route
            element={
              <RequireAuth>
                <MainLayout />
              </RequireAuth>
            }
          >
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/bancos" element={<BanksPage />} />
            <Route path="/integraciones-bancarias" element={<BankIntegrationsPage />} />
            <Route path="/banco-integracion-wizard" element={<BankIntegrationWizardPage />} />
            <Route path="/cuentas" element={<AccountsPage />} />
            <Route path="/transacciones" element={<TransactionsPage />} />
            <Route path="/asociados" element={<AssociatesPage />} />
            <Route path="/consultas-bnc" element={<BNCQueriesPage />} />
            <Route path="/pago-p2p" element={<P2PPaymentPage />} />
            <Route path="/pago-c2p" element={<C2PPaymentPage />} />
            <Route path="/vpos" element={<VPOSPage />} />
            <Route path="/credito-debito" element={<CreditDebitPage />} />
            <Route path="/perfil" element={<ProfilePage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/role-access" element={<RoleAccessPage />} />
            <Route path="/api-error-logs" element={<ApiErrorLogsPage />} />
            <Route path="/audit-logs" element={<AuditLogsPage />} />
            <Route path="/preferencias" element={<PreferencesPage />} />
            <Route path="/seguridad-2fa" element={<TwoFactorSettingsPage />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

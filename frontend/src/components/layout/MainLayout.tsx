import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { AppHeader } from "@/components/layout/AppHeader";
import { SessionTimeoutWatcher } from "@/components/SessionTimeoutWatcher";
import { auditNavigationEvent } from "@/services/auditLogs";
import { listBankIntegrations } from "@/services/bankIntegrations";

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/bancos": "Bancos",
  "/cuentas": "Cuentas Bancarias",
  "/transacciones": "Transacciones",
  "/integraciones-bancarias": "Integración bancaria",
  "/asociados": "Asociados y Sucursales",
  "/consultas-bnc": "Consultas BNC",
  "/pago-p2p": "Pago Móvil P2P",
  "/pago-c2p": "Pago Móvil C2P",
  "/vpos": "VPOS (Tarjeta)",
  "/credito-debito": "Crédito / Débito Inmediato",
  "/perfil": "Usuario y Perfil",
  "/preferencias": "Preferencias",
};

export default function MainLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const title =
    pageTitles[location.pathname] ||
    "Gestión de Operaciones Bancarias (GOBSoft)";
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    const currentPath = location.pathname;
    const fromPath = lastPathRef.current;
    lastPathRef.current = currentPath;

    // No auditar la pantalla de login
    if (currentPath === "/login") return;

    void auditNavigationEvent({
      path: currentPath,
      fromPath: fromPath ?? undefined,
      description: undefined,
    });
  }, [location.pathname]);

  // Forzar configuración inicial de integraciones bancarias
  useEffect(() => {
    // No aplicar esta lógica en login ni en la propia pantalla del wizard
    if (location.pathname === "/login" || location.pathname === "/banco-integracion-wizard") {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const integrations = await listBankIntegrations({ isActive: "true" });
        if (!cancelled && (!Array.isArray(integrations) || integrations.length === 0)) {
          navigate("/banco-integracion-wizard", { replace: true });
        }
      } catch {
        // Si falla la llamada, no bloqueamos el sistema, solo no redirigimos
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [location.pathname, navigate]);

  return (
    <>
      <SessionTimeoutWatcher />
      <div className="flex h-screen overflow-hidden">
        <div className="flex w-full overflow-hidden bg-background shadow-xl">
          <AppSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
          <div className="flex flex-1 flex-col overflow-hidden">
            <AppHeader title={title} onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)} />
            <main className="flex-1 overflow-y-auto p-6 animate-fade-in">
              <Outlet />
            </main>
          </div>
        </div>
      </div>
    </>
  );
}

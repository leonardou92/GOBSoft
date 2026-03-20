import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Building2,
  ArrowLeftRight,
  Users,
  Search,
  Smartphone,
  CreditCard,
  Banknote,
  UserCog,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Landmark,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  listBankIntegrations,
  type BankIntegrationService,
} from "@/services/bankIntegrations";
import { logout, logoutApi } from "@/services/auth";

interface AppSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

type MenuItem = {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  requiredPermissions?: string[];
};

const baseMenuSections: { label: string; items: MenuItem[] }[] = [
  {
    label: "Inicio",
    items: [
      {
        to: "/dashboard",
        icon: LayoutDashboard,
        label: "Dashboard",
        requiredPermissions: ["VIEW_DASHBOARD"],
      },
    ],
  },
  {
    label: "Empresa",
    items: [
      /*{ to: "/bancos", icon: Landmark, label: "Bancos", requiredPermissions: ["VIEW_BANKS"] },*/
      
      {
        to: "/transacciones",
        icon: ArrowLeftRight,
        label: "Transacciones",
        requiredPermissions: ["VIEW_TRANSACTIONS"],
      },
      /*{ to: "/asociados", icon: Users, label: "Asociados y sucursales" },*/
      /*{ to: "/consultas-bnc", icon: Search, label: "Consultas BNC" }, */
    ],
  },
  {
    // Egresos de empresa (pagos que salen de las cuentas de la empresa)
    label: "Pagos a proveedores",
    items: [
      // P2P empresa -> terceros (egreso)
      {
        to: "/pago-p2p",
        icon: Smartphone,
        label: "P2P a proveedores (egreso)",
        requiredPermissions: ["EXECUTE_P2P"],
      },
      {
        to: "/credito-debito",
        icon: Banknote,
        label: "Crédito / Débito",
        requiredPermissions: ["EXECUTE_IMMEDIATE_CREDIT_DEBIT"],
      },
    ],
  },
  {
    // Ingresos a la empresa (pagos que entran a las cuentas de la empresa)
    label: "Cobros a clientes",
    items: [
      // VPOS: pagos con tarjeta que abonan a la empresa
      {
        to: "/vpos",
        icon: CreditCard,
        label: "Cobros VPOS (tarjeta)",
        requiredPermissions: ["EXECUTE_VPOS"],
      },
      {
        to: "/pago-c2p",
        icon: Smartphone,
        label: "C2P de clientes",
        requiredPermissions: ["EXECUTE_C2P"],
      },
    ],
  },
  {
    label: "Configuración",
    items: [
      {
        to: "/users",
        icon: UserCog,
        label: "Usuarios",
        requiredPermissions: ["VIEW_USERS"],
      },
      {
        to: "/role-access",
        icon: ShieldCheck,
        label: "Accesos por rol",
        requiredPermissions: ["VIEW_USERS"],
      },
      {
        to: "/cuentas",
        icon: Building2,
        label: "Cuentas bancarias",
        requiredPermissions: ["VIEW_BANK_ACCOUNTS"],
      },
      /*{
        to: "/integraciones-bancarias",
        icon: Settings,
        label: "Integración bancaria",
        requiredPermissions: ["MANAGE_BANK_INTEGRATIONS"],
      },*/
      {
        to: "/banco-integracion-wizard",
        icon: Landmark,
        label: "Integración bancaria",
        requiredPermissions: ["MANAGE_BANK_INTEGRATIONS"],
      },
      {
        to: "/api-error-logs",
        icon: Settings,
        label: "Log de errores API",
        requiredPermissions: ["VIEW_API_ERROR_LOGS"],
      },
      {
        to: "/audit-logs",
        icon: ShieldCheck,
        label: "Auditoría",
        requiredPermissions: ["VIEW_AUDIT_LOGS"],
      },
      {
        to: "/seguridad-2fa",
        icon: ShieldCheck,
        label: "Seguridad / 2FA",
        requiredPermissions: ["MANAGE_SECURITY"],
      },
      /*{ to: "/preferencias", icon: Settings, label: "Preferencias" },*/
    ],
  },
];

function readStoredPermissions(): string[] {
  if (typeof window === "undefined") return [];
  const raw =
    localStorage.getItem("auth_permissions") ??
    sessionStorage.getItem("auth_permissions");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p: unknown): p is string => typeof p === "string");
  } catch {
    return [];
  }
}

function hasPermissions(
  userPermissions: string[],
  required?: string[],
): boolean {
  if (!required || required.length === 0) return true;
  if (!userPermissions || userPermissions.length === 0) return false;
  return required.every((p) => userPermissions.includes(p));
}

export function AppSidebar({ collapsed, onToggle }: AppSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const [enabledServices, setEnabledServices] = useState<Record<BankIntegrationService, boolean>>({
    QUERIES: false,
    VPOS: false,
    C2P: false,
  });

  const [userPermissions, setUserPermissions] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;

    const refreshEnabledServices = async () => {
      try {
        const integrations = await listBankIntegrations({ isActive: "true" });
        if (cancelled || !Array.isArray(integrations)) return;

        const servicesSet: Record<BankIntegrationService, boolean> = {
          QUERIES: false,
          VPOS: false,
          C2P: false,
        };

        for (const cfg of integrations) {
          for (const s of cfg.services) {
            servicesSet[s] = true;
          }
        }

        setEnabledServices(servicesSet);
      } catch {
        // Si falla, dejamos el menú completo para no bloquear la navegación
      }
    };

    void refreshEnabledServices();

    const handler = () => {
      void refreshEnabledServices();
    };

    if (typeof window !== "undefined") {
      window.addEventListener("bank-integrations-updated", handler);
    }

    return () => {
      cancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener("bank-integrations-updated", handler);
      }
    };
  }, []);

  useEffect(() => {
    setUserPermissions(readStoredPermissions());
  }, []);

  const menuSections = baseMenuSections
    .map((section) => {
      let items = section.items;

      if (section.label === "Cobros a clientes") {
        items = items.filter((item) => {
          if (item.to === "/vpos") return enabledServices.VPOS;
          if (item.to === "/pago-c2p") return enabledServices.C2P;
          return true;
        });
      }

      const itemsWithPermissions = items.filter((item) =>
        hasPermissions(userPermissions, item.requiredPermissions),
      );

      return {
        ...section,
        items: itemsWithPermissions,
      };
    })
    // Si no hay VPOS ni C2P habilitados, ocultar toda la sección "Cobros a clientes"
    .filter((section) => {
      if (section.label !== "Cobros a clientes") return section.items.length > 0;
      return section.items.length > 0;
    });

  return (
    <aside
      className={cn(
        "sidebar-gradient flex flex-col border-r border-sidebar-border transition-all duration-200",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary">
          <ShieldCheck className="h-4 w-4 text-sidebar-primary-foreground" />
        </div>
        {!collapsed && (
          <div className="min-w-0 leading-tight" title="Gestión de Operaciones Bancarias (GOBSoft)">
            <div className="text-[11px] text-sidebar-foreground/75 whitespace-normal break-words">
              Gestión de Operaciones Bancarias
            </div>
          </div>
        )}
      </div>

      {/* Menu */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-6">
        {menuSections.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted">
                {section.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = location.pathname === item.to;
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-sidebar-primary text-sidebar-primary-foreground"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>{item.label}</span>}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-2 space-y-1">
        <button
          onClick={onToggle}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          {!collapsed && <span>Colapsar</span>}
        </button>
        <button
          type="button"
          onClick={() => {
            void (async () => {
              await logoutApi();
              logout();
              navigate("/login", { replace: true });
            })();
          }}
          className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 hover:bg-destructive/20 hover:text-destructive transition-colors"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Cerrar sesión</span>}
        </button>
      </div>
    </aside>
  );
}

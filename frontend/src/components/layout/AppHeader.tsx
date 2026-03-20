import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Menu, Bell, User, ChevronDown, UserCog, LogOut, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logout, logoutApi } from "@/services/auth";

interface AppHeaderProps {
  title: string;
  onToggleSidebar: () => void;
}

export function AppHeader({ title, onToggleSidebar }: AppHeaderProps) {
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("Usuario");
  const appVersion = import.meta.env.VITE_APP_VERSION ?? "1.0.0";

  useEffect(() => {
    const storedFullName =
      window.localStorage.getItem("auth_full_name") ??
      window.sessionStorage.getItem("auth_full_name");
    const storedUsername =
      window.localStorage.getItem("auth_username") ??
      window.sessionStorage.getItem("auth_username");

    if (storedFullName && storedFullName.trim().length > 0) {
      setDisplayName(storedFullName.trim());
      return;
    }

    if (storedUsername && storedUsername.trim().length > 0) {
      setDisplayName(storedUsername.trim());
    }
  }, []);

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b bg-card px-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onToggleSidebar} className="lg:hidden">
          <Menu className="h-5 w-5" />
        </Button>
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
      </div>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4 text-muted-foreground" />
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-destructive" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-auto rounded-lg bg-secondary px-3 py-1.5">
              <div className="mr-2 flex h-7 w-7 items-center justify-center rounded-full bg-primary">
                <User className="h-3.5 w-3.5 text-primary-foreground" />
              </div>
              <div className="hidden text-left sm:block">
                <p className="text-xs font-medium text-foreground">{displayName}</p>
              </div>
              <ChevronDown className="ml-2 h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Mi perfil</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="justify-between opacity-100">
              <span className="inline-flex items-center gap-2">
                <Info className="h-4 w-4 text-muted-foreground" />
                Version
              </span>
              <span className="text-xs text-muted-foreground">v{appVersion}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate("/perfil")}>
              <UserCog className="mr-2 h-4 w-4" />
              Modificar
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                void (async () => {
                  await logoutApi();
                  logout();
                  navigate("/login", { replace: true });
                })();
              }}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Cerrar sesion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { logout } from "@/services/auth";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface SessionInfo {
  storage: Storage;
  expiresAt: number;
  ttlMs: number | null;
}

function readSessionInfo(): SessionInfo | null {
  if (typeof window === "undefined") return null;

  const now = Date.now();

  const read = (storage: Storage): SessionInfo | null => {
    const token = storage.getItem("auth_token");
    if (!token) return null;

    const expRaw = storage.getItem("auth_expires_at");
    if (!expRaw) return null;
    const expiresAt = Number(expRaw);
    if (!Number.isFinite(expiresAt)) return null;

    const ttlRaw = storage.getItem("auth_expires_in_ms");
    const ttlMs = ttlRaw ? Number(ttlRaw) : NaN;
    const ttlValue = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : null;

    if (expiresAt <= now) {
      storage.removeItem("auth_token");
      storage.removeItem("auth_expires_at");
      storage.removeItem("auth_expires_in_ms");
      return null;
    }

    return { storage, expiresAt, ttlMs: ttlValue };
  };

  return read(window.localStorage) ?? read(window.sessionStorage);
}

function refreshSessionExpirationFromInfo(info: SessionInfo | null) {
  if (!info) return;
  const now = Date.now();
  const ttlMs = info.ttlMs ?? 15 * 60_000;
  const newExpiresAt = now + ttlMs;
  info.storage.setItem("auth_expires_at", String(newExpiresAt));
}

export function SessionTimeoutWatcher() {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    // No mostrar el modal en la pantalla de login
    if (location.pathname === "/login") {
      setOpen(false);
      setSecondsLeft(null);
      return;
    }

    // Cada vez que cambia la ruta y hay sesión activa, refrescamos la expiración
    const info = readSessionInfo();
    if (info) {
      refreshSessionExpirationFromInfo(info);
    }

    const intervalId = window.setInterval(() => {
      const info = readSessionInfo();

      if (!info) {
        // Si ya no hay sesión, forzamos logout y redirección
        logout();
        navigate("/login", { replace: true });
        setOpen(false);
        setSecondsLeft(null);
        return;
      }

      const now = Date.now();
      const remainingMs = info.expiresAt - now;

      if (remainingMs <= 0) {
        logout();
        navigate("/login", { replace: true });
        setOpen(false);
        setSecondsLeft(null);
        return;
      }

      if (remainingMs <= 30_000) {
        setOpen(true);
        setSecondsLeft(Math.ceil(remainingMs / 1000));
      } else {
        setOpen(false);
        setSecondsLeft(null);
      }
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [location.pathname, navigate]);

  const handleStayLoggedIn = () => {
    const info = readSessionInfo();
    if (!info) {
      logout();
      navigate("/login", { replace: true });
      return;
    }
    refreshSessionExpirationFromInfo(info);

    setOpen(false);
    setSecondsLeft(null);
  };

  const handleLogoutNow = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Tu sesión está a punto de expirar</AlertDialogTitle>
          <AlertDialogDescription>
            {secondsLeft !== null
              ? `Te quedan aproximadamente ${secondsLeft} segundos antes de que la sesión caduque.`
              : "Tu sesión está a punto de caducar."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleLogoutNow}>Cerrar sesión</AlertDialogCancel>
          <AlertDialogAction onClick={handleStayLoggedIn}>Mantener sesión activa</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}


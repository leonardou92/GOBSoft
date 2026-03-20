import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { getStoredToken, refreshTokenIfNeeded } from "@/services/auth";

interface RequireAuthProps {
  children: ReactNode;
}

export function RequireAuth({ children }: RequireAuthProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const token = getStoredToken();

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  useEffect(() => {
    let cancelled = false;

    const maybeRefresh = async () => {
      try {
        await refreshTokenIfNeeded();
      } catch {
        if (!cancelled) {
          navigate("/login", { replace: true, state: { from: location } });
        }
      }
    };

    void maybeRefresh();

    return () => {
      cancelled = true;
    };
  }, [location, navigate]);

  return <>{children}</>;
}


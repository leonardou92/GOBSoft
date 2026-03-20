import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, User, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { login, getStoredToken, parseExpiresInToMs } from "@/services/auth";

export default function LoginPage() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const token = getStoredToken();
    if (token) {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const data = await login(username, password);

      const tokenValue = `${data.tokenType} ${data.token}`;
      const now = Date.now();
      const ttlMs = parseExpiresInToMs(data.expiresIn);
      const expiresAt = now + ttlMs;

      const storage = remember ? localStorage : sessionStorage;
      storage.setItem("auth_token", tokenValue);
      storage.setItem("auth_expires_at", expiresAt.toString());
      storage.setItem("auth_expires_in_ms", ttlMs.toString());
      storage.setItem("auth_username", username.trim());

      // 1) Preferir userId que venga explícito en la respuesta del backend
      let numericId: number | null = null;
      const directId = (data.userId ??
        data.user?.id) as number | string | undefined;
      if (typeof directId === "number") {
        numericId = directId;
      } else if (typeof directId === "string") {
        const n = Number(directId);
        if (Number.isFinite(n)) {
          numericId = n;
        }
      }

      // 2) Extraer también datos del JWT (sub / userId / id / role / permissions / nombre)
      let jwtRole: string | null = null;
      let jwtPermissions: string[] = [];
      let fullName: string | null = null;
      try {
        const parts = data.token.split(".");
        if (parts.length === 3) {
          const payloadBase64 = parts[1]
            .replace(/-/g, "+")
            .replace(/_/g, "/");
          const payloadJson = atob(payloadBase64);
          const payload = JSON.parse(payloadJson) as {
            sub?: unknown;
            userId?: unknown;
            id?: unknown;
            role?: unknown;
            permissions?: unknown;
            firstName?: unknown;
            lastName?: unknown;
            given_name?: unknown;
            family_name?: unknown;
            name?: unknown;
          };

          const rawId = (payload.sub ??
            payload.userId ??
            payload.id) as string | number | undefined;
          if (numericId === null) {
            if (typeof rawId === "number") {
              numericId = rawId;
            } else if (typeof rawId === "string") {
              const n = Number(rawId);
              if (Number.isFinite(n)) {
                numericId = n;
              }
            }
          }

          if (typeof payload.role === "string") {
            jwtRole = payload.role;
          }
          if (Array.isArray(payload.permissions)) {
            jwtPermissions = payload.permissions.filter(
              (p: unknown): p is string => typeof p === "string",
            );
          }

          const firstNameFromJwt =
            typeof payload.firstName === "string"
              ? payload.firstName.trim()
              : typeof payload.given_name === "string"
                ? payload.given_name.trim()
                : "";
          const lastNameFromJwt =
            typeof payload.lastName === "string"
              ? payload.lastName.trim()
              : typeof payload.family_name === "string"
                ? payload.family_name.trim()
                : "";

          if (firstNameFromJwt || lastNameFromJwt) {
            fullName = `${firstNameFromJwt} ${lastNameFromJwt}`.trim();
          } else if (typeof payload.name === "string" && payload.name.trim().length > 0) {
            fullName = payload.name.trim();
          }
        }
      } catch {
        // ignorar fallo de parseo
      }

      // 3) Priorizar nombre y apellido explícitos que vengan del backend en la respuesta de login
      const firstNameFromResponse =
        typeof data.user?.firstName === "string" ? data.user.firstName.trim() : "";
      const lastNameFromResponse =
        typeof data.user?.lastName === "string" ? data.user.lastName.trim() : "";
      if (firstNameFromResponse || lastNameFromResponse) {
        fullName = `${firstNameFromResponse} ${lastNameFromResponse}`.trim();
      }

      if (numericId !== null) {
        storage.setItem("auth_user_id", String(numericId));
      }

      if (jwtRole) {
        storage.setItem("auth_role", jwtRole);
      }
      if (jwtPermissions.length > 0) {
        storage.setItem("auth_permissions", JSON.stringify(jwtPermissions));
      }
      if (fullName && fullName.length > 0) {
        storage.setItem("auth_full_name", fullName);
      }

      navigate("/dashboard");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Ocurrió un error al iniciar sesión.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center relative overflow-hidden">
      <div className="relative z-10 w-full max-w-md px-4">
        <div className="rounded-2xl border border-border bg-card shadow-xl corporate-shadow-lg backdrop-blur-md bg-white/95">
          {/* Encabezado con logo y títulos */}
          <div className="flex flex-col items-center p-6 pb-6 space-y-3 text-center">
            <div className="mx-auto flex w-full max-w-xs flex-col items-center gap-3 mb-2 text-center">
              <div className="mx-auto inline-flex items-center justify-center w-40 h-40 overflow-hidden">
                <img
                  src="/images/kiri-logo.png"
                  alt="Alimentos Kiri"
                  className="block w-40 h-40 object-contain mx-auto"
                />
              </div>
              <h1 className="w-full text-center text-4xl md:text-5xl font-extrabold tracking-tight text-primary">
                GOBSoft
              </h1>
              <p className="w-full text-center text-base md:text-lg font-medium text-foreground">
                Gestión de Operaciones Bancarias
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              Ingrese sus credenciales para acceder al sistema
            </p>
          </div>

          {/* Formulario */}
          <div className="p-6 pt-0 space-y-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label
                  htmlFor="username"
                  className="flex items-center gap-2 text-sm font-medium text-foreground"
                >
                  <User className="h-4 w-4 text-primary" />
                  Usuario
                </Label>
                <div className="relative">
                  <Input
                    id="username"
                    placeholder="Ingrese su usuario"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="username"
                    required
                    className="pl-10 h-11 bg-white/90"
                  />
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                </div>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="password"
                  className="flex items-center gap-2 text-sm font-medium text-foreground"
                >
                  <Lock className="h-4 w-4 text-primary" />
                  Contraseña
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Ingrese su contraseña"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    className="pl-10 pr-10 h-11 bg-white/90"
                  />
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="inline-flex items-center justify-center absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 rounded-md text-muted-foreground hover:text-primary hover:bg-accent transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="remember"
                    checked={remember}
                    onCheckedChange={(value) => setRemember(value === true)}
                  />
                  <Label
                    htmlFor="remember"
                    className="text-sm font-normal text-muted-foreground cursor-pointer"
                  >
                    Recordarme
                  </Label>
                </div>
                <button type="button" className="text-sm text-primary hover:underline">
                  ¿Olvidaste tu contraseña?
                </button>
              </div>

              {/* Botón de iniciar sesión: se mantiene igual en estilos y colores */}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Ingresando..." : "Iniciar sesión"}
              </Button>
            </form>
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          © 2026 Gestión de Operaciones Bancarias (GOBSoft). Todos los derechos reservados.
        </p>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { ShieldCheck, QrCode, CheckCircle2, XCircle, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";
import { toast } from "sonner";
import {
  disableTwoFactor,
  setupTwoFactor,
  verifyTwoFactorSetup,
  getTwoFactorStatus,
  deleteTwoFactorConfig,
  type TwoFactorSetupResponse,
  type TwoFactorStatus,
} from "@/services/twoFactor";

export default function TwoFactorSettingsPage() {
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [setupData, setSetupData] = useState<TwoFactorSetupResponse | null>(null);
  const [code, setCode] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [hasSecurityPermission, setHasSecurityPermission] = useState<boolean | null>(null);

  const enabled = Boolean(status?.enabled);
  const hasConfig = Boolean(status?.configured || status?.hasSecret || status?.enabled);
  const canDeleteConfig = hasConfig && !enabled;

  useEffect(() => {
    const init = async () => {
      // 1) Verificar permisos desde el JWT almacenado
      if (typeof window === "undefined") {
        setHasSecurityPermission(false);
        return;
      }
      try {
        const raw =
          window.localStorage.getItem("auth_permissions") ??
          window.sessionStorage.getItem("auth_permissions");
        let permissions: string[] = [];
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            permissions = parsed.filter((p: unknown): p is string => typeof p === "string");
          }
        }
        const allowed = permissions.includes("MANAGE_SECURITY");
        setHasSecurityPermission(allowed);

        // 2) Si no tiene permiso, no llamamos a los endpoints de 2FA
        if (!allowed) {
          setStatusLoading(false);
          return;
        }

        // 3) Cargar estado 2FA desde backend
        setStatusLoading(true);
        const s = await getTwoFactorStatus();
        setStatus(s);
      } catch (err: any) {
        const msg = err?.message ?? "No se pudo obtener el estado de 2FA.";
        toast.error(msg);
        setStatusMessage(msg);
      } finally {
        setStatusLoading(false);
      }
    };

    void init();
  }, []);

  const handleGenerate = async () => {
    if (enabled || hasConfig) {
      toast.error("El autenticador global ya está configurado. Si deseas cambiarlo, primero deshabilítalo.");
      return;
    }
    if (setupData) {
      // Ya hay una configuración pendiente (QR existente); no generamos otra.
      toast.info("Ya tienes una configuración 2FA generada. Usa el código de tu app para habilitar o deshabilitar.");
      return;
    }
    setLoading(true);
    setStatusMessage(null);
    try {
      const data = await setupTwoFactor();
      setSetupData(data);
      setStatus((prev) => ({
        enabled: false,
        hasSecret: true,
        configured: true,
        enabledAt: prev?.enabledAt ?? null,
      }));
      toast.success(data.message || "Configuración 2FA global generada.");
      setStatusMessage("Configuración 2FA global generada. Escanea el QR y confirma el código.");
    } catch (err: any) {
      const msg = err?.message ?? "No se pudo generar la configuración 2FA.";
      toast.error(msg);
      if (!statusMessage) setStatusMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    const normalized = code.trim();
    if (!/^\d{6}$/.test(normalized)) {
      toast.error("Ingresa el código de 6 dígitos de Google Authenticator.");
      return;
    }
    setLoading(true);
    setStatusMessage(null);
    try {
      const res = await verifyTwoFactorSetup(normalized);
      const enabled =
        typeof res?.twoFactorEnabled === "boolean" ? res.twoFactorEnabled : true;
      setStatus((prev) => ({
        enabled,
        hasSecret: true,
        configured: true,
        enabledAt: prev?.enabledAt ?? new Date().toISOString(),
      }));
      setSetupData(null);
      toast.success(res.message || "2FA global habilitado correctamente.");
      setStatusMessage("2FA global habilitado correctamente. El autenticador ya quedó configurado.");
    } catch (err: any) {
      const msg = err?.message ?? "No se pudo verificar el código 2FA.";
      toast.error(msg);
      setStatusMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async () => {
    const normalized = code.trim();
    if (!/^\d{6}$/.test(normalized)) {
      toast.error("Ingresa el código de 6 dígitos para deshabilitar 2FA.");
      return;
    }
    setLoading(true);
    setStatusMessage(null);
    try {
      const res = await disableTwoFactor(normalized);
      setStatus((prev) => ({
        enabled: false,
        hasSecret: Boolean(prev?.hasSecret),
        configured: Boolean(prev?.configured || prev?.hasSecret),
        enabledAt: null,
      }));
      setSetupData(null);
      setCode("");
      toast.success(res.message || "2FA global deshabilitado correctamente.");
      setStatusMessage("2FA global deshabilitado correctamente.");
    } catch (err: any) {
      const msg = err?.message ?? "No se pudo deshabilitar 2FA.";
      toast.error(msg);
      setStatusMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteConfig = async () => {
    if (!canDeleteConfig) {
      toast.error("Solo puedes eliminar la configuración cuando el 2FA global esté deshabilitado.");
      return;
    }
    setLoading(true);
    setStatusMessage(null);
    try {
      const res = await deleteTwoFactorConfig();
      setStatus({
        enabled: false,
        hasSecret: false,
        configured: false,
        enabledAt: null,
      });
      setSetupData(null);
      setCode("");
      toast.success(res.message || "Configuración 2FA eliminada correctamente.");
      setStatusMessage("Configuración 2FA eliminada correctamente. Puedes crear una nueva si lo deseas.");
    } catch (err: any) {
      const msg = err?.message ?? "No se pudo eliminar la configuración 2FA.";
      toast.error(msg);
      setStatusMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 px-2 sm:px-0">
      <Card className="border shadow-sm">
        <CardHeader className="flex flex-row items-start gap-3 pb-3">
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <div className="space-y-1">
            <CardTitle className="text-base sm:text-lg">
              Seguridad · Autenticación en dos pasos (2FA)
            </CardTitle>
            <p className="text-xs sm:text-sm text-muted-foreground">
              Configura Google Authenticator para autorizar pagos P2P de forma más segura.
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {hasSecurityPermission === false && (
            <div className="rounded-md border bg-muted/40 px-4 py-3 text-xs sm:text-sm text-muted-foreground">
              No tienes permisos para administrar la autenticación 2FA global. Este panel solo está
              disponible para usuarios con el permiso <span className="font-semibold">MANAGE_SECURITY</span>.
            </div>
          )}
          {hasSecurityPermission === false ? null : (
          <>
          <div className="space-y-1 text-xs sm:text-sm text-muted-foreground">
            {statusLoading ? (
              <p>Cargando estado de 2FA...</p>
            ) : enabled ? (
              <>
                <p>
                  El autenticador global ya está <span className="font-semibold">configurado y habilitado</span>.
                </p>
                <p>
                  Solo puede existir un autenticador activo. Para registrar uno nuevo, primero
                  debes deshabilitar el actual.
                </p>
              </>
            ) : (
              <>
                <p>
                  1. Haz clic en <span className="font-semibold">“Generar”</span> para crear la
                  configuración del autenticador global.
                  Luego escanea el código QR con Google Authenticator o ingresa la clave manual.
                </p>
                <p>
                  2. Ingresa el código de 6 dígitos y confirma para habilitar el 2FA global.
                </p>
                <p>
                  Solo puede existir un autenticador global activo. Si ya está configurado, primero
                  debes deshabilitarlo para volver a configurarlo.
                </p>
              </>
            )}
          </div>

          <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
            {!enabled && (
              <div className="flex-1 space-y-2">
                <Label className="text-xs sm:text-sm">Configuración 2FA</Label>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-center h-10 sm:h-11"
                  onClick={handleGenerate}
                  disabled={loading || Boolean(setupData)}
                >
                  <QrCode className="h-4 w-4 mr-2" />
                  Generar
                </Button>

                {setupData && (
                  <div className="space-y-3 border rounded-lg p-3 sm:p-4 bg-muted/40">
                    <p className="text-xs sm:text-sm font-semibold flex items-center gap-2">
                      <QrCode className="h-4 w-4" />
                      Escanea este código en Google Authenticator
                    </p>
                    <div className="flex justify-center">
                      <img
                        src={setupData.qrCodeDataUrl}
                        alt="QR 2FA"
                        className="h-40 w-40 sm:h-48 sm:w-48 rounded-md border bg-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-[11px] sm:text-xs text-muted-foreground">
                        Si no puedes escanear el QR, usa esta clave manual:
                      </p>
                      <p className="text-xs font-mono break-all px-2 py-1 rounded bg-background border">
                        {setupData.manualEntryKey}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex-1 space-y-4">
              <div className="space-y-2 text-center">
                <Label className="text-xs sm:text-sm block text-center">Código Google Authenticator</Label>
                <InputOTP
                  maxLength={6}
                  value={code}
                  onChange={(value) => setCode(value.replace(/[^0-9]/g, "").slice(0, 6))}
                  containerClassName="justify-center"
                >
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
                <p className="text-[11px] sm:text-xs text-muted-foreground text-center">
                  Ingresa el código actual generado por Google Authenticator.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {!enabled && (
                  <Button
                    type="button"
                    onClick={handleVerify}
                    disabled={loading || !code}
                    className="flex-1 min-w-[220px] justify-center h-11 bg-primary text-white font-semibold tracking-normal hover:bg-primary/90 shadow-md transition-colors"
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Confirmar y habilitar 2FA
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDisable}
                  disabled={loading || !code || !enabled}
                  className="flex-1 min-w-[180px] h-11"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Deshabilitar 2FA
                </Button>
                {canDeleteConfig && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleDeleteConfig}
                    disabled={loading}
                    className="flex-1 min-w-[180px] h-11 border-destructive text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Eliminar configuración
                  </Button>
                )}
              </div>

              {status && (
                <div className="text-xs sm:text-[11px]">
                  <p className={enabled ? "text-emerald-600" : "text-muted-foreground"}>
                    Estado actual:{" "}
                    <span className="font-semibold">
                      {enabled
                        ? "habilitado"
                        : hasConfig
                          ? "deshabilitado (configuración existente)"
                          : "sin configurar"}
                    </span>
                    .
                  </p>
                </div>
              )}
            </div>
          </div>

          {statusMessage && (
            <div className="rounded-md border bg-muted/60 px-3 py-2 text-xs sm:text-[11px]">
              {statusMessage}
            </div>
          )}
          </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


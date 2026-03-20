import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Send, CheckCircle2, XCircle, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { p2pSimple } from "@/services/account";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";
import { getTwoFactorStatus } from "@/services/twoFactor";
import { STATIC_BANKS } from "@/constants/staticBanks";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { listBankIntegrations, type BankIntegrationConfig } from "@/services/bankIntegrations";

type LastPaymentSummary = {
  amount: number;
  bankCode: string;
  integrationBankCode?: string;
  phoneE164: string;
  idPrefix: "V" | "E" | "P" | "J" | "G" | "C";
  idDigits: string;
  name: string;
  description: string;
  username: string;
};

export default function P2PPaymentPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<
    | null
    | {
        success: boolean;
        code?: string;
        message: string;
        reference?: string | number | null;
        authorizationCode?: string | number | null;
      }
  >(null);

  const [amount, setAmount] = useState<string>("");
  const [bankCode, setBankCode] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [idPrefix, setIdPrefix] = useState<"V" | "E" | "P" | "J" | "G" | "C">("V");
  const [idDigits, setIdDigits] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [totpCode, setTotpCode] = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const [lastPayment, setLastPayment] = useState<LastPaymentSummary | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [twoFactorEnabled, setTwoFactorEnabled] = useState<boolean | null>(null);
  const [twoFactorLoading, setTwoFactorLoading] = useState(true);
  const [hasP2PPermission, setHasP2PPermission] = useState<boolean | null>(null);

  // Bancos provenientes de las integraciones (banco emisor / banco de integración)
  const [integrationBankCode, setIntegrationBankCode] = useState<string>("");
  const [integrationBanks, setIntegrationBanks] = useState<{ code: string; name: string }[]>([]);
  const [integrationBanksLoading, setIntegrationBanksLoading] = useState(false);
  const [integrationBanksError, setIntegrationBanksError] = useState<string | null>(null);

  // Leer el usuario autenticado desde storage para mostrarlo en el comprobante
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored =
      window.localStorage.getItem("auth_username") ??
      window.sessionStorage.getItem("auth_username") ??
      "";
    setUsername(stored);
  }, []);

  // Verificar permisos EXECUTE_P2P desde el JWT
  useEffect(() => {
    if (typeof window === "undefined") {
      setHasP2PPermission(false);
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
      setHasP2PPermission(permissions.includes("EXECUTE_P2P"));
    } catch {
      setHasP2PPermission(false);
    }
  }, []);

  // Verificar que el autenticador global 2FA esté habilitado para permitir pagos P2P
  useEffect(() => {
    if (hasP2PPermission === false) {
      setTwoFactorLoading(false);
      setTwoFactorEnabled(false);
      return;
    }
    const load2FA = async () => {
      setTwoFactorLoading(true);
      try {
        const status = await getTwoFactorStatus();
        setTwoFactorEnabled(Boolean(status.enabled));
      } catch (err: any) {
        const msg = err?.message ?? "No se pudo verificar el estado del autenticador 2FA.";
        toast.error(msg);
        setTwoFactorEnabled(false);
      } finally {
        setTwoFactorLoading(false);
      }
    };
    void load2FA();
  }, [hasP2PPermission]);

  // Cargar bancos con integración activa para usar como "Banco de integración"
  useEffect(() => {
    let cancelled = false;
    setIntegrationBanksLoading(true);
    setIntegrationBanksError(null);

    listBankIntegrations({ isActive: "true" })
      .then((list: BankIntegrationConfig[]) => {
        if (cancelled) return;
        const map = new Map<string, string>();
        for (const cfg of list ?? []) {
          const code = cfg.bank ? String(cfg.bank.code) : "";
          if (!code) continue;
          const name = cfg.bank?.name ?? `Banco ${code}`;
          map.set(code, name);
        }
        const banks = Array.from(map.entries()).map(([code, name]) => ({ code, name }));
        setIntegrationBanks(banks);
        if (!integrationBankCode && banks.length === 1) {
          setIntegrationBankCode(banks[0].code);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        const msg =
          err instanceof Error
            ? err.message
            : "No se pudieron cargar los bancos de integración.";
        setIntegrationBanksError(msg);
      })
      .finally(() => {
        if (cancelled) return;
        setIntegrationBanksLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [integrationBankCode]);
  const printReceipt = (
    summary: LastPaymentSummary,
    reference?: string | number | null,
    authCode?: string | number | null,
  ) => {
    if (typeof window === "undefined") return;

    const bank = STATIC_BANKS.find((b) => String(Number(b.id)) === summary.bankCode);
    const integrationBank = summary.integrationBankCode
      ? STATIC_BANKS.find((b) => String(Number(b.id)) === summary.integrationBankCode)
      : null;
    const amountNumber = summary.amount;
    const now = new Date();
    const dateStr = now.toLocaleDateString("es-VE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const timeStr = now.toLocaleTimeString("es-VE", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    const w = window.open("", "_blank", "width=480,height=640");
    if (!w) return;

    w.document.write(`
      <html>
        <head>
          <title>Comprobante Pago Móvil P2P</title>
          <style>
            body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 12px; padding: 24px; color: #1B1F25; }
            h1 { font-size: 16px; margin-bottom: 4px; }
            .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; }
            .brand { font-size: 13px; font-weight: 700; }
            .meta { font-size: 11px; line-height: 1.3; }
            .section-title { font-size: 12px; font-weight: 600; margin: 12px 0 6px; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            th, td { padding: 6px 8px; border-bottom: 1px solid #D0D2D3; text-align: left; }
            th { background-color: #F2F2F2; font-weight: 600; }
            .label { font-weight: 600; width: 30%; }
            .value { font-family: monospace; }
            .muted { color: #76797C; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="brand">Banco Nacional de Crédito</div>
              <div class="muted">Comprobante de pago móvil P2P</div>
            </div>
            <div class="meta">
              <div><span class="label">Fecha:</span> ${dateStr}</div>
              <div><span class="label">Hora:</span> ${timeStr}</div>
              <div><span class="label">Usuario:</span> ${username || "-"}</div>
            </div>
          </div>

          <div class="section-title">Datos del pago</div>
          <table>
            <tr>
              <th class="label">Monto Bs.</th>
              <td class="value">${amountNumber.toFixed(2)}</td>
            </tr>
            <tr>
              <th class="label">Banco beneficiario</th>
              <td>${bank ? `${bank.name} (${bank.id})` : summary.bankCode}</td>
            </tr>
            <tr>
              <th class="label">Banco de integración</th>
              <td>${
                integrationBank
                  ? `${integrationBank.name} (${integrationBank.id})`
                  : summary.integrationBankCode ?? "-"
              }</td>
            </tr>
            <tr>
              <th class="label">Teléfono beneficiario</th>
              <td class="value">${summary.phoneE164}</td>
            </tr>
          </table>

          <div class="section-title">Datos del beneficiario</div>
          <table>
            <tr>
              <th class="label">Beneficiario</th>
              <td>${summary.name}</td>
            </tr>
            <tr>
              <th class="label">Cédula / RIF</th>
              <td class="value">${summary.idPrefix}${summary.idDigits}</td>
            </tr>
            <tr>
              <th class="label">Concepto</th>
              <td>${summary.description}</td>
            </tr>
          </table>
          ${
            reference || authCode
              ? `
          <div class="section">
            <div class="row"><span class="label">Referencia BNC:</span><span class="value">${
              reference ?? "-"
            }</span></div>
            <div class="row"><span class="label">Código de autorización:</span><span class="value">${
              authCode ?? "-"
            }</span></div>
          </div>
          `
              : ""
          }
          <hr />
          <div class="section">
            <div style="font-size: 10px; color: #76797C;">
              Este comprobante ha sido generado por la plataforma interna de la empresa como respaldo del pago móvil P2P.
            </div>
          </div>
        </body>
      </html>
    `);
    w.document.close();
    w.focus();
    w.print();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasP2PPermission) {
      toast.error("No tienes permisos para ejecutar pagos P2P.");
      return;
    }
    if (!twoFactorEnabled) {
      toast.error("Debes tener el autenticador global 2FA habilitado para ejecutar pagos P2P.");
      return;
    }
    if (!amount || !bankCode || !integrationBankCode || !phone || !idDigits || !name || !description) {
      toast.error("Completa todos los campos requeridos.");
      return;
    }
    const numericAmount = Number(amount.replace(",", "."));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error("El monto debe ser mayor que cero.");
      return;
    }

    setResult(null);
    setConfirmOpen(true);
    setConfirmError(null);
  };

  const handleConfirmPayment = async () => {
    const normalizedTotp = totpCode.trim();
    if (!/^\d{6}$/.test(normalizedTotp)) {
      toast.error("Ingresa el código de Google Authenticator de 6 dígitos.");
      return;
    }

    const numericAmount = Number(amount.replace(",", "."));
    const phoneDigits = phone.replace(/[^0-9]/g, "");
    const beneficiaryId = `${idPrefix}${idDigits}`;

    setConfirmLoading(true);
    setLoading(true);
    try {
      const res = await p2pSimple({
        amount: numericAmount,
        beneficiaryBankCode: Number(bankCode),
        beneficiaryCellPhone: phoneDigits.length > 0 ? `58${phoneDigits}` : "",
        beneficiaryEmail: "",
        beneficiaryId,
        beneficiaryName: name.trim(),
        description: description.trim(),
        totpCode: normalizedTotp,
      });
      const decrypted = res.decrypted as any;
      const reference = decrypted?.Reference ?? decrypted?.reference;
      const authCode =
        decrypted?.AuthorizationCode ??
        decrypted?.authorizationCode ??
        null;
      setResult({
        success: true,
        message:
          res.message ??
          (reference
            ? `Pago P2P ejecutado exitosamente. Ref: ${reference}`
            : "Pago P2P ejecutado exitosamente."),
        reference,
        authorizationCode: authCode,
      });
      toast.success("Pago P2P ejecutado exitosamente.");
      setLastPayment({
        amount: numericAmount,
        bankCode,
        integrationBankCode,
        phoneE164: phoneDigits.length > 0 ? `+58${phoneDigits}` : "",
        idPrefix,
        idDigits,
        name: name.trim(),
        description: description.trim(),
        username: username || "",
      });
      setAmount("");
      setPhone("");
      setIdDigits("");
      setName("");
      setDescription("");
      setTotpCode("");
      setConfirmOpen(false);
      setConfirmError(null);
    } catch (err: any) {
      const rawMsg = err?.message ?? "No se pudo ejecutar el Pago Móvil P2P.";
      const normalized = typeof rawMsg === "string" ? rawMsg.toLowerCase() : "";
      let msg = rawMsg;
      if (normalized.includes("429") || normalized.includes("demasiados intentos")) {
        msg = "Demasiados intentos fallidos. Espera unos minutos e intenta de nuevo.";
      } else if (
        normalized.includes("token jwt inválido o expirado") ||
        normalized.includes("token jwt invalido o expirado")
      ) {
        msg = "Tu sesión expiró. Inicia sesión nuevamente para continuar.";
      } else if (
        normalized.includes("autenticador global 2fa no está configurado") ||
        normalized.includes("autenticador global 2fa no esta configurado")
      ) {
        msg = "El autenticador global 2FA no está configurado. Solicita al administrador completar el setup en Seguridad / 2FA.";
      } else if (
        normalized.includes("401") ||
        normalized.includes("inválido") ||
        normalized.includes("invalido") ||
        normalized.includes("expirado")
      ) {
        msg = "Código de verificación inválido o expirado.";
      } else if (
        normalized.includes("403") ||
        normalized.includes("inactivo") ||
        normalized.includes("2fa no habilitado")
      ) {
        msg = "Debe tener 2FA habilitado y usuario activo para ejecutar este pago.";
      }
      setResult({
        success: false,
        message: msg,
      });
      toast.error(msg);
      setConfirmError(typeof msg === "string" ? msg : "No se pudo ejecutar el Pago Móvil P2P.");
    } finally {
      setConfirmLoading(false);
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {!lastPayment && (
      <Card className="border shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Pago móvil P2P a proveedores</CardTitle>
        </CardHeader>
        <CardContent>
          {hasP2PPermission === false ? (
            <div className="space-y-3 text-sm">
              <p className="text-destructive font-semibold">
                No tienes permisos para ejecutar pagos P2P.
              </p>
              <p className="text-muted-foreground text-xs">
                Si consideras que deberías tener acceso a esta funcionalidad, contacta al
                administrador del sistema para que te asigne el permiso{" "}
                <span className="font-semibold">EXECUTE_P2P</span>.
              </p>
            </div>
          ) : twoFactorLoading ? (
            <div className="text-sm text-muted-foreground">
              Verificando requisitos de seguridad para pagos P2P...
            </div>
          ) : !twoFactorEnabled ? (
            <div className="space-y-3 text-sm">
              <p className="text-destructive font-semibold">
                El autenticador global 2FA no está habilitado.
              </p>
              <p className="text-muted-foreground text-xs">
                Para poder realizar pagos P2P a proveedores, primero debes configurar y habilitar el
                autenticador en la sección <span className="font-semibold">Seguridad / 2FA</span>.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/seguridad-2fa")}
              >
                Ir a Seguridad / 2FA
              </Button>
            </div>
          ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Monto (Bs.)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                className="font-mono"
                value={amount}
                onChange={(e) => {
                  // Evita montos negativos y caracteres no numéricos
                  const raw = e.target.value.replace(/[^0-9.,]/g, "");
                  setAmount(raw);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Banco beneficiario</Label>
              <Select value={bankCode} onValueChange={setBankCode}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar banco" />
                </SelectTrigger>
                <SelectContent>
                  {STATIC_BANKS.map((b) => (
                    <SelectItem key={b.id} value={String(Number(b.id))}>
                      {b.name} ({b.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Banco de integración</Label>
              <Select
                value={integrationBankCode}
                onValueChange={setIntegrationBankCode}
                disabled={integrationBanksLoading || integrationBanks.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      integrationBanksLoading
                        ? "Cargando bancos de integración..."
                        : "Seleccionar banco de integración"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {integrationBanks.map((b) => (
                    <SelectItem key={b.code} value={b.code}>
                      {b.name} ({b.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {integrationBanksError && (
                <p className="text-xs text-destructive mt-1">{integrationBanksError}</p>
              )}
              {!integrationBanksLoading &&
                !integrationBanksError &&
                integrationBanks.length === 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    No hay bancos con integración activa configurados. Configúralos en
                    {" "}Banco + integración.
                  </p>
                )}
            </div>
            <div className="space-y-2">
              <Label>Teléfono beneficiario</Label>
              <div className="flex gap-2">
                <div className="flex items-center rounded-md border bg-muted px-2 text-xs font-mono text-muted-foreground">
                  +58
                </div>
                <Input
                  placeholder="4241234567"
                  className="font-mono"
                  value={phone}
                  onChange={(e) => {
                    // Solo dígitos, máximo 10 (3 de operador + 7 de número)
                    const digits = e.target.value.replace(/[^0-9]/g, "").slice(0, 10);
                    setPhone(digits);
                  }}
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1">
                <Label>Cédula / RIF</Label>
                <TooltipProvider delayDuration={200}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-muted-foreground/40 text-muted-foreground hover:bg-muted/60"
                        aria-label="Ayuda tipo de documento"
                      >
                        <Info className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-[11px] leading-snug">
                      <p className="mb-1 font-semibold">Tipo de documento</p>
                      <p>
                        <span className="font-mono">V</span>: Venezolanos,&nbsp;
                        <span className="font-mono">E</span>: Extranjeros,&nbsp;
                        <span className="font-mono">P</span>: Pasaporte.
                      </p>
                      <p className="mt-1">
                        <span className="font-mono">J</span>: Jurídico,&nbsp;
                        <span className="font-mono">G</span>: Gubernamental,&nbsp;
                        <span className="font-mono">C</span>: Comunas.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex gap-2">
                  <select
                    className="h-9 rounded-md border bg-white px-2 text-xs font-mono"
                    value={idPrefix}
                    onChange={(e) =>
                      setIdPrefix(
                        (e.target.value as "V" | "E" | "P" | "J" | "G" | "C") ?? "V",
                      )
                    }
                  >
                    <option value="V">V</option>
                    <option value="E">E</option>
                    <option value="P">P</option>
                    <option value="J">J</option>
                    <option value="G">G</option>
                    <option value="C">C</option>
                  </select>
                  <Input
                    placeholder="23000760"
                    className="font-mono"
                    value={idDigits}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/[^0-9]/g, "");
                      setIdDigits(digits);
                    }}
                  />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Nombre beneficiario</Label>
              <Input
                placeholder="Nombre completo"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Concepto</Label>
              <Input
                placeholder="Descripción del pago"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Preparando pago...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Continuar y confirmar pago
                </>
              )}
            </Button>
          </form>
          )}
        </CardContent>
      </Card>
      )}

      <Dialog open={confirmOpen} onOpenChange={(open) => !confirmLoading && setConfirmOpen(open)}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle>Confirmar Pago Móvil P2P</DialogTitle>
            <DialogDescription className="space-y-1 text-xs sm:text-[13px]">
              <p>
                Estás a punto de ejecutar un pago P2P utilizando tus credenciales bancarias e
                integración activa.
              </p>
              <p>
                Revisa el resumen y autoriza el pago ingresando el código de Google Authenticator
                (2FA).
              </p>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-xs sm:text-[13px]">
            <div className="grid grid-cols-2 gap-2 rounded-md border bg-muted/40 px-3 py-2">
              <div>
                <p className="text-muted-foreground">Monto (Bs.)</p>
                <p className="font-mono font-semibold">
                  {amount ? Number(amount.replace(",", ".") || 0).toFixed(2) : "-"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Banco beneficiario</p>
                <p className="font-semibold">
                  {(() => {
                    if (!bankCode) return "-";
                    const bank = STATIC_BANKS.find(
                      (b) => String(Number(b.id)) === String(bankCode),
                    );
                    return bank ? `${bank.name} (${bank.id})` : bankCode;
                  })()}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Teléfono beneficiario</p>
                <p className="font-mono">
                  {phone ? `+58${phone.replace(/[^0-9]/g, "")}` : "-"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Beneficiario</p>
                <p className="font-semibold">{name || "-"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-muted-foreground">Concepto</p>
                <p className="font-mono break-words">{description || "-"}</p>
              </div>
            </div>

            <div className="space-y-2 text-center">
              <Label className="text-xs sm:text-[13px] block text-center">
                Código Google Authenticator
              </Label>
              <InputOTP
                autoFocus
                maxLength={6}
                value={totpCode}
                onChange={(value) => {
                  const digits = value.replace(/[^0-9]/g, "").slice(0, 6);
                  setTotpCode(digits);
                }}
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
              <p className="text-[11px] text-muted-foreground text-center">
                Este código se genera en tu app de Google Authenticator y es válido solo por unos
                segundos.
              </p>
              {confirmError && (
                <p className="text-[11px] text-destructive mt-1">
                  {confirmError}
                </p>
              )}
            </div>

            {confirmLoading && (
              <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground">
                <div className="flex items-start gap-2">
                  <Loader2 className="h-4 w-4 text-primary animate-spin mt-0.5" />
                  <div>
                    <p className="font-semibold text-foreground text-xs">
                      Procesando tu Pago Móvil P2P...
                    </p>
                    <ul className="mt-1 list-disc pl-4 space-y-0.5">
                      <li>Validando el código de Google Authenticator (2FA).</li>
                      <li>Obteniendo y cifrando la workingKey contra el BNC.</li>
                      <li>Enviando la instrucción de pago al banco.</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter className="flex flex-col sm:flex-row sm:justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={confirmLoading}
              onClick={() => setConfirmOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="bg-primary text-white hover:bg-primary/90"
              disabled={confirmLoading || totpCode.trim().length !== 6}
              onClick={handleConfirmPayment}
            >
              {confirmLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Confirmando y enviando pago...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Confirmar y enviar pago
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {result && !result.success && (
        <Card className="border shadow-sm animate-fade-in border-destructive/30">
          <CardContent className="p-6 flex items-start gap-4">
            <XCircle className="h-8 w-8 text-destructive shrink-0" />
            <div>
              <p className="text-sm font-semibold text-destructive">
                Pago P2P rechazado
              </p>
              <p className="text-sm text-foreground mt-1">{result.message}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {result && result.success && lastPayment && (
        <Card className="border shadow-sm animate-fade-in border-success/30">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                <CheckCircle2 className="h-6 w-6 text-success shrink-0" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-success">
                  Su pago móvil ha sido ejecutado exitosamente
                </p>
                {result.reference && (
                  <p className="text-xs text-muted-foreground">
                    Referencia BNC:{" "}
                    <span className="font-mono">{result.reference}</span>
                  </p>
                )}
                {result.authorizationCode && (
                  <p className="text-xs text-muted-foreground">
                    Código autorizador:{" "}
                    <span className="font-mono">{result.authorizationCode}</span>
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs border-t pt-3 mt-2">
              <div className="space-y-1">
                <p className="text-muted-foreground">Monto Bs.</p>
                <p className="font-mono font-semibold">
                  {lastPayment.amount.toFixed(2)} Bs
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">Teléfono beneficiario</p>
                <p className="font-mono">{lastPayment.phoneE164}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">Beneficiario</p>
                <p className="font-semibold">{lastPayment.name}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground">Cédula / RIF</p>
                <p className="font-mono">
                  {lastPayment.idPrefix}
                  {lastPayment.idDigits}
                </p>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <p className="text-muted-foreground">Concepto</p>
                <p className="font-mono break-words">
                  {lastPayment.description}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setLastPayment(null);
                  setResult(null);
                }}
              >
                Hacer otro pago
              </Button>
              <Button
                type="button"
                onClick={() =>
                  printReceipt(lastPayment, result.reference, result.authorizationCode)
                }
              >
                Imprimir comprobante
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

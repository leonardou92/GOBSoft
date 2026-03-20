import { useEffect, useState } from "react";
import { Building2, Landmark, Settings2, StepForward, StepBack, RefreshCw, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { STATIC_BANKS } from "@/constants/staticBanks";
import { listBankAccounts, createBankAccount } from "@/services/bankAccounts";
import { loginSimple, getWorkingKeyFromLoginResponse, balanceSimple } from "@/services/account";
import { deleteLocalBank } from "@/services/localBanks";
import {
  type BankIntegrationEnvironment,
  type BankIntegrationProvider,
  type BankIntegrationService,
  type BankIntegrationConfig,
  getRequiredFields,
  saveBankIntegrationWizard,
  listBankIntegrations,
  deleteBankIntegration,
} from "@/services/bankIntegrations";
import { hasTransactionsForAccount } from "@/services/transactions";

type WizardStep = 1 | 2;

const ENV_OPTIONS: BankIntegrationEnvironment[] = ["SANDBOX", "PRODUCTION"];
const SERVICE_OPTIONS: BankIntegrationService[] = ["QUERIES", "VPOS", "C2P"];

export default function BankIntegrationWizardPage() {
  const { toast } = useToast();
  const [step, setStep] = useState<WizardStep>(1);
  const [showWizard, setShowWizard] = useState(false);

  const [configs, setConfigs] = useState<BankIntegrationConfig[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [bankHasMovements, setBankHasMovements] = useState<Record<number, boolean>>({});

  const [bankCode, setBankCode] = useState<string>("");
  const [bankName, setBankName] = useState<string>("");
  const [bankIsActive, setBankIsActive] = useState<boolean>(true);

  const [provider, setProvider] = useState<BankIntegrationProvider | "">("");
  const [environment, setEnvironment] = useState<BankIntegrationEnvironment>("SANDBOX");
  const [services, setServices] = useState<BankIntegrationService[]>(["QUERIES"]);
  const [urlBase, setUrlBase] = useState<string>("");
  const [isActive, setIsActive] = useState<boolean>(true);

  const [clientGuid, setClientGuid] = useState("");
  const [masterKey, setMasterKey] = useState("");
  const [clientId, setClientId] = useState("");
  const [affiliationNumber, setAffiliationNumber] = useState("");
  const [terminalId, setTerminalId] = useState("");

  const [secret, setSecret] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [token, setToken] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<BankIntegrationConfig | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const resetWizard = () => {
    setStep(1);
    setBankCode("");
    setBankName("");
    setBankIsActive(true);
    setProvider("");
    setEnvironment("SANDBOX");
    setServices(["QUERIES"]);
    setUrlBase("");
    setIsActive(true);
    setClientGuid("");
    setMasterKey("");
    setClientId("");
    setAffiliationNumber("");
    setTerminalId("");
    setSecret("");
    setApiKey("");
    setToken("");
    setError(null);
    setSuccess(null);
  };

  const loadConfigs = async () => {
    setListLoading(true);
    setListError(null);
    try {
      const list = await listBankIntegrations({ isActive: "all" });
      setConfigs(Array.isArray(list) ? list : []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al cargar integraciones bancarias.";
      setListError(msg);
    } finally {
      setListLoading(false);
    }
  };

  const loadBankMovements = async () => {
    try {
      const accounts = await listBankAccounts();
      const result: Record<number, boolean> = {};

      await Promise.all(
        accounts.map(async (acc) => {
          try {
            const hasMov = await hasTransactionsForAccount(acc.accountNumber, acc.clientId);
            if (hasMov) {
              result[acc.bankCode] = true;
            }
          } catch {
            // ignorar errores individuales
          }
        }),
      );

      setBankHasMovements(result);
    } catch {
      // si falla, dejamos el estado como está
    }
  };

  useEffect(() => {
    void (async () => {
      await Promise.all([loadConfigs(), loadBankMovements()]);
    })();
  }, []);

  useEffect(() => {
    if (!bankCode) {
      setProvider("");
      return;
    }

    const codeNum = Number(bankCode);
    if (codeNum === 191) {
      setProvider("BNC");
    } else if (codeNum === 102) {
      setProvider("BDV");
    } else {
      setProvider("");
    }
  }, [bankCode]);

  const canGoNextStep1 = (() => {
    if (!bankCode || !bankName.trim()) return false;
    const codeNum = Number(bankCode);
    if (!Number.isFinite(codeNum) || codeNum <= 0) return false;
    if (codeNum !== 191 && codeNum !== 102) return false;
    return provider === "BNC" || provider === "BDV";
  })();

  const handleNextFromStep1 = () => {
    if (!canGoNextStep1) {
      toast({
        variant: "destructive",
        description: "Selecciona un banco válido (código 191 o 102) antes de continuar.",
      });
      return;
    }
    setStep(2);
  };

  const handleSaveWizard = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      if (!provider) throw new Error("Proveedor no determinado. Verifica el banco seleccionado.");

      const codeNum = Number(bankCode);
      if (!Number.isFinite(codeNum) || codeNum <= 0) {
        throw new Error("Código de banco inválido.");
      }
      if (codeNum !== 191 && codeNum !== 102) {
        throw new Error("Solo se soportan bancos con código 191 (BNC) y 102 (BDV).");
      }

      if (!services || services.length === 0) {
        throw new Error("Debes seleccionar al menos un servicio.");
      }

      const required = getRequiredFields(provider, services);

      const values: Record<string, string> = {
        urlBase,
        clientGuid,
        masterKey,
        clientId,
        affiliationNumber,
        terminalId,
        secret,
        apiKey,
        token,
      };

      const labels: Record<string, string> = {
        urlBase: "URL base",
        clientGuid: "Client GUID",
        masterKey: "Master Key",
        clientId: "Client ID",
        affiliationNumber: "Número de afiliación",
        terminalId: "Terminal ID",
        secret: "Secret",
        apiKey: "API Key",
        token: "Token",
      };

      for (const field of required) {
        const value = values[field];
        if (!value || !value.toString().trim()) {
          const label = labels[field] ?? field;
          throw new Error(`El campo "${label}" es requerido para esta configuración.`);
        }
      }

      const trimmedUrl = urlBase.trim();
      if (required.includes("urlBase")) {
        if (!/^https?:\/\/.+/i.test(trimmedUrl)) {
          throw new Error(
            'La "URL base" debe comenzar con http:// o https:// y ser una URL válida.',
          );
        }
      }

      const normalizedServices: BankIntegrationService[] = Array.isArray(services)
        ? services
        : [services];

      const payload = {
        bank: {
          code: codeNum,
          name: bankName.trim(),
          isActive: bankIsActive,
        },
        integration: {
          environment,
          services: normalizedServices,
          urlBase: trimmedUrl || null,
          clientGuid: clientGuid || null,
          masterKey: masterKey || null,
          clientId: clientId || null,
          affiliationNumber: affiliationNumber || null,
          terminalId: terminalId || null,
          secret: secret || null,
          apiKey: apiKey || null,
          token: token || null,
          isActive,
        },
      };

      await saveBankIntegrationWizard(payload);
      await loadConfigs();
      await loadBankMovements();

      // Sincronizar cuentas bancarias locales automáticamente para BNC (191)
      if (provider === "BNC" && codeNum === 191) {
        try {
          toast({
            description: "Sincronizando cuentas del Banco Nacional de Crédito...",
          });

          const loginRes = await loginSimple();
          const wk = getWorkingKeyFromLoginResponse(loginRes);
          const res = await balanceSimple({ workingKey: wk });
          const decrypted = (res as any)?.decrypted ?? {};
          const entries = Object.entries(decrypted || {});

          if (entries.length > 0) {
            // Usamos el clientId de la integración BNC para asociar las cuentas
            if (!clientId || !clientId.trim()) {
              throw new Error(
                "No se puede sincronizar las cuentas BNC porque falta el Client ID en la integración.",
              );
            }

            const existing = await listBankAccounts(clientId.trim());

            const normalizeCurrencyOrUndefined = (raw: unknown): "VES" | "USD" | "EUR" | undefined => {
              const val = String(raw ?? "").trim().toUpperCase();
              if (val === "VES" || val === "USD" || val === "EUR") return val;
              return undefined;
            };

            for (const [accountNumber, info] of entries) {
              const accountNumberStr = String(accountNumber);

              const exists = existing.some(
                (acc) =>
                  acc.bankCode === 191 &&
                  acc.accountNumber === accountNumberStr &&
                  acc.clientId === clientId.trim(),
              );

              if (exists) continue;

              const accStr = accountNumberStr;
              const last4 = accStr.slice(-4);
              const alias = `BNC ${last4}`;

              const maybe = info as any;
              const rawCurrency =
                maybe?.CurrencyCode ?? maybe?.currency ?? maybe?.Currency ?? maybe?.moneda;

              const currency = normalizeCurrencyOrUndefined(rawCurrency);

              await createBankAccount({
                clientId: clientId.trim(),
                accountNumber: accountNumberStr,
                bankCode: 191,
                alias,
                currency,
                isActive: true,
              });
            }

            toast({ description: "Sincronización de cuentas BNC completada." });
          } else {
            toast({
              description:
                "No se obtuvieron cuentas desde la API BNC al sincronizar. Verifica la integración.",
            });
          }
        } catch (syncError) {
          const msg =
            syncError instanceof Error
              ? syncError.message
              : "Error al sincronizar las cuentas del Banco Nacional de Crédito.";
          toast({
            variant: "destructive",
            description: msg,
          });
        }
      }

      setSuccess("Banco e integración guardados correctamente.");
      setShowWizard(false);
      resetWizard();
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : "Error al guardar el banco y la integración bancaria.";
      setError(msg);
      toast({
        variant: "destructive",
        description: msg,
      });
    } finally {
      setSaving(false);
    }
  };

  const isBnc = provider === "BNC";
  const isBdv = provider === "BDV";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Landmark className="h-5 w-5 text-primary" />
           Integración bancaria
        </h1>
        <p className="text-sm text-muted-foreground">
          Administra los bancos soportados y su integración bancaria. Usa el asistente para crear
          nuevas configuraciones.
        </p>
      </div>

      {/* Toolbar listado */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void loadConfigs()}
          disabled={listLoading}
        >
          <RefreshCw className="mr-1 h-3.5 w-3.5" />
          Recargar
        </Button>
        <Button
          type="button"
          size="sm"
          className="ml-auto relative overflow-hidden group rounded-full px-4"
          onClick={() => {
            resetWizard();
            setShowWizard(true);
          }}
        >
          <span className="absolute inset-0 bg-gradient-to-r from-primary/80 via-primary to-amber-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <span className="relative flex items-center gap-1">
            <Building2 className="h-3.5 w-3.5" />
            <span>Nueva integración bancaria</span>
          </span>
        </Button>
      </div>

      {/* Listado de integraciones actuales (solo cuando el wizard está cerrado) */}
      {!showWizard && (
        <div className="rounded-lg border bg-card shadow-sm overflow-auto animate-fade-in">
          {listLoading && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Cargando integraciones bancarias...
            </div>
          )}
          {listError && !listLoading && (
            <div className="py-4 px-4 text-sm text-destructive bg-destructive/10 border-b border-destructive/30">
              {listError}
            </div>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Banco</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Proveedor</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Entorno</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">Servicios</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">URL base</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Estado</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {configs.map((cfg) => {
                const bankLabel = cfg.bank
                  ? `${cfg.bank.code} - ${cfg.bank.name}`
                  : `#${cfg.bankId}`;
                const bankCodeForCfg =
                  cfg.bank?.code ?? (cfg.provider === "BNC" ? 191 : cfg.provider === "BDV" ? 102 : 0);
                const canDelete = !bankHasMovements[bankCodeForCfg];
                return (
                  <tr key={cfg.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-foreground">{bankLabel}</td>
                    <td className="px-4 py-3 text-xs text-foreground">{cfg.provider}</td>
                    <td className="px-4 py-3 text-xs text-foreground">{cfg.environment}</td>
                    <td className="px-4 py-3 text-xs text-foreground">
                      {cfg.services && cfg.services.length > 0
                        ? cfg.services.join(", ")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground max-w-xs truncate">
                      {cfg.urlBase}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={cfg.isActive ? "default" : "secondary"}
                        className={
                          cfg.isActive
                            ? "bg-success/10 text-success border-success/20"
                            : "bg-muted text-muted-foreground"
                        }
                      >
                        {cfg.isActive ? "Activa" : "Inactiva"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            // Prefill wizard with existing config
                            const codeNum = cfg.bank?.code ?? cfg.bankId;
                            const codeStr = codeNum.toString().padStart(4, "0");
                            setBankCode(codeStr);
                            setBankName(cfg.bank?.name ?? "");
                            setBankIsActive(true);
                            setProvider(cfg.provider);
                            setEnvironment(cfg.environment);
                            setServices(cfg.services && cfg.services.length > 0 ? cfg.services : ["QUERIES"]);
                            setUrlBase(cfg.urlBase ?? "");
                            setIsActive(cfg.isActive);
                            setClientGuid(cfg.clientGuid ?? "");
                            setMasterKey(cfg.masterKey ?? "");
                            setClientId(cfg.clientId ?? "");
                            setAffiliationNumber(cfg.affiliationNumber ?? "");
                            setTerminalId(cfg.terminalId ?? "");
                            setSecret(cfg.secret ?? "");
                            setApiKey(cfg.apiKey ?? "");
                            setToken(cfg.token ?? "");
                            setError(null);
                            setSuccess(null);
                            setShowWizard(true);
                            setStep(2);
                          }}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setDeleteError(null);
                            setDeleteTarget(cfg);
                          }}
                          disabled={!canDelete}
                        >
                          <Trash2
                            className={`h-3.5 w-3.5 ${!canDelete ? "text-muted-foreground/40" : ""}`}
                          />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!listLoading && !listError && configs.length === 0 && (
            <div className="py-10 text-center text-sm text-muted-foreground">
              No hay integraciones configuradas aún. Usa el asistente para crear la primera.
            </div>
          )}
        </div>
      )}

      {/* Confirmar borrado (modal) */}
      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle>¿Eliminar banco e integración?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              Banco:{" "}
              <span className="font-medium">
                {deleteTarget?.bank
                  ? `${deleteTarget.bank.code} - ${deleteTarget.bank.name}`
                  : `#${deleteTarget?.bankId}`}
              </span>
            </p>
            <p>
              Proveedor/Servicios:{" "}
              <span className="font-mono text-xs">
                {deleteTarget?.provider} · {deleteTarget?.environment} ·{" "}
                {deleteTarget?.services && deleteTarget.services.length > 0
                  ? deleteTarget.services.join(", ")
                  : "—"}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              Esta acción eliminará la integración configurada y también el banco local asociado.
              Esta acción no se puede deshacer.
            </p>
            {deleteError && (
              <p className="text-xs text-destructive bg-destructive/10 rounded px-2 py-1">
                {deleteError}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDeleteTarget(null);
                setDeleteError(null);
              }}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={async () => {
                if (!deleteTarget) return;
                setDeleting(true);
                setDeleteError(null);
                try {
                  // Primero eliminar la integración
                  await deleteBankIntegration(deleteTarget.id);
                  // Luego eliminar el banco local asociado (si existe)
                  if (deleteTarget.bankId) {
                    try {
                      await deleteLocalBank(deleteTarget.bankId);
                    } catch {
                      // Si falla la eliminación del banco no bloqueamos la UX,
                      // pero podríamos dejar trazas en logs backend.
                    }
                  }
                  await loadConfigs();
                  setDeleteTarget(null);
                } catch (e) {
                  const msg =
                    e instanceof Error
                      ? e.message
                      : "No se pudo eliminar la integración bancaria.";
                  setDeleteError(msg);
                } finally {
                  setDeleting(false);
                }
              }}
              disabled={deleting}
            >
              {deleting ? "Eliminando..." : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {success && (
        <div className="rounded-md border border-emerald-400/50 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {success}
        </div>
      )}

      {showWizard && (
        <div className="flex gap-4 items-center text-sm animate-fade-in">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
                step === 1
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <Building2 className="h-3 w-3" />
              1. Banco
            </span>
            <StepForward className="h-4 w-4 text-muted-foreground" />
            <span
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium ${
                step === 2
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <Settings2 className="h-3 w-3" />
              2. Integración
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setShowWizard(false);
              resetWizard();
            }}
          >
            Cerrar asistente
          </Button>
        </div>
      )}

      {showWizard && step === 1 && (
        <div className="space-y-4 bg-card border rounded-lg p-4">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            Datos del banco
          </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Código de banco</Label>
              <Select
                value={bankCode}
                onValueChange={(value) => {
                  setBankCode(value);
                  const staticMatch = STATIC_BANKS.find((b) => b.id === value);
                  if (staticMatch) {
                    setBankName(staticMatch.name);
                  }
                }}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Selecciona un banco" />
                </SelectTrigger>
                <SelectContent>
                  {STATIC_BANKS.filter((b) => b.id === "0191" || b.id === "0102").map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name} ({b.id})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* El nombre se deriva del código seleccionado y no es editable */}
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="wizard-bank-active"
              checked={bankIsActive}
              onCheckedChange={(v) => setBankIsActive(v === true)}
            />
            <Label htmlFor="wizard-bank-active" className="font-normal cursor-pointer">
              Banco activo
            </Label>
          </div>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              Solo se permiten bancos con código <strong>191 (Banco Nacional de Crédito)</strong> o{" "}
              <strong>102 (Banco de Venezuela)</strong> para integración.
            </p>
            <p>
              El proveedor se asigna automáticamente según el código y se usará en el siguiente
              paso.
            </p>
          </div>
        </div>
      )}

      {showWizard && step === 2 && (
        <div className="space-y-4 bg-card border rounded-lg p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Banco</Label>
              <Input
                value={bankCode && bankName ? `${bankCode} - ${bankName}` : ""}
                disabled
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label>Proveedor</Label>
              <Input value={provider || ""} disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>Entorno</Label>
              <Select value={environment} onValueChange={(v) => setEnvironment(v as any)}>
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ENV_OPTIONS.map((env) => (
                    <SelectItem key={env} value={env}>
                      {env}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Servicios</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 rounded-md border bg-muted/40 px-3 py-2">
              {provider === "BDV" ? (
                <>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox
                      checked={services.includes("QUERIES")}
                      onCheckedChange={(v) => {
                        setServices((prev) =>
                          v === true
                            ? Array.from(new Set<BankIntegrationService>([...prev, "QUERIES"]))
                            : prev.filter((s) => s !== "QUERIES"),
                        );
                      }}
                    />
                    <span>Consultas</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox
                      checked={services.includes("VPOS") || services.includes("C2P")}
                      onCheckedChange={(v) => {
                        setServices((prev) => {
                          if (v === true) {
                            const next = new Set<BankIntegrationService>(prev);
                            next.add("VPOS");
                            next.add("C2P");
                            return Array.from(next);
                          }
                          return prev.filter((s) => s !== "VPOS" && s !== "C2P");
                        });
                      }}
                    />
                    <span>Pasarela (VPOS + C2P)</span>
                  </label>
                </>
              ) : (
                SERVICE_OPTIONS.map((s) => {
                  const checked = services.includes(s);
                  const label =
                    s === "QUERIES"
                      ? "Consultas"
                      : s === "VPOS"
                        ? "VPOS (tarjeta)"
                        : "Pago Móvil / C2P";
                  return (
                    <label
                      key={s}
                      className="flex items-center gap-2 text-xs cursor-pointer"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          setServices((prev) =>
                            v === true
                              ? Array.from(new Set<BankIntegrationService>([...prev, s]))
                              : prev.filter((item) => item !== s),
                          );
                        }}
                      />
                      <span>{label}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>URL base</Label>
            <Input
              placeholder="https://..."
              value={urlBase}
              onChange={(e) => setUrlBase(e.target.value)}
              className="font-mono text-xs bg-white"
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="wizard-integration-active"
              checked={isActive}
              onCheckedChange={(v) => setIsActive(v === true)}
            />
            <Label htmlFor="wizard-integration-active" className="font-normal cursor-pointer">
              Integración activa
            </Label>
          </div>

          {isBnc && (
            <div className="mt-2 border-t pt-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Campos BNC</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Client GUID</Label>
                  <Input
                    value={clientGuid}
                    onChange={(e) => setClientGuid(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Master Key</Label>
                  <Input value={masterKey} onChange={(e) => setMasterKey(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Client ID</Label>
                  <Input value={clientId} onChange={(e) => setClientId(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Número de afiliación</Label>
                  <Input
                    value={affiliationNumber}
                    onChange={(e) => setAffiliationNumber(e.target.value)}
                    disabled={!services.includes("VPOS")}
                    placeholder={
                      services.includes("VPOS")
                        ? undefined
                        : "Disponible cuando se selecciona VPOS"
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Terminal ID</Label>
                  <Input
                    value={terminalId}
                    onChange={(e) => setTerminalId(e.target.value)}
                    disabled={!services.includes("C2P")}
                    placeholder={
                      services.includes("C2P")
                        ? undefined
                        : "Disponible cuando se selecciona C2P"
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {isBdv && (
            <div className="mt-2 border-t pt-3 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase">Campos BDV</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Secret</Label>
                  <Input
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    disabled={!(services.includes("VPOS") || services.includes("C2P"))}
                    placeholder={
                      services.includes("VPOS") || services.includes("C2P")
                        ? undefined
                        : "Disponible cuando se selecciona Pasarela"
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>API Key</Label>
                  <Input
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    disabled={!(services.includes("VPOS") || services.includes("C2P"))}
                    placeholder={
                      services.includes("VPOS") || services.includes("C2P")
                        ? undefined
                        : "Disponible cuando se selecciona Pasarela"
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label>Token</Label>
                  <Input
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    disabled={!services.includes("QUERIES")}
                    placeholder={
                      services.includes("QUERIES")
                        ? undefined
                        : "Disponible cuando se selecciona Consultas"
                    }
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {showWizard && (
        <div className="flex justify-between pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setStep((prev) => (prev === 2 ? 1 : prev))}
            disabled={step === 1}
          >
            <StepBack className="mr-1 h-3.5 w-3.5" />
            Anterior
          </Button>
          {step === 1 ? (
            <Button type="button" onClick={handleNextFromStep1} disabled={!canGoNextStep1}>
              Siguiente
              <StepForward className="ml-1 h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => void handleSaveWizard()}
              disabled={saving || !provider}
            >
              {saving ? "Guardando..." : "Guardar integración bancaria"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}


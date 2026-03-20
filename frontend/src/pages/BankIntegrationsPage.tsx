import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Filter, RefreshCw, Settings2, Plus, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { listLocalBanks, type LocalBank } from "@/services/localBanks";
import {
  createBankIntegration,
  deleteBankIntegration,
  getRequiredFields,
  listBankIntegrations,
  type BankIntegrationConfig,
  type BankIntegrationEnvironment,
  type BankIntegrationProvider,
  type BankIntegrationService,
  updateBankIntegration,
} from "@/services/bankIntegrations";
import { LoadingIndicator } from "@/components/ui/loading-indicator";

type FilterState = {
  bankId: string;
  provider: "" | BankIntegrationProvider;
  environment: "" | BankIntegrationEnvironment;
  service: "" | BankIntegrationService;
  isActive: "true" | "false" | "all";
};

const PROVIDER_OPTIONS: BankIntegrationProvider[] = ["BNC", "BDV"];
const ENV_OPTIONS: BankIntegrationEnvironment[] = ["SANDBOX", "PRODUCTION"];
const SERVICE_OPTIONS: BankIntegrationService[] = ["QUERIES", "VPOS", "C2P"];

export default function BankIntegrationsPage() {
  const navigate = useNavigate();
  const [banks, setBanks] = useState<LocalBank[]>([]);
  const [banksLoading, setBanksLoading] = useState(false);

  const [configs, setConfigs] = useState<BankIntegrationConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<FilterState>({
    bankId: "",
    provider: "",
    environment: "",
    service: "",
    isActive: "all",
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BankIntegrationConfig | null>(null);
  const [formBankId, setFormBankId] = useState("");
  const [formProvider, setFormProvider] = useState<BankIntegrationProvider | "">("");
  const [formEnvironment, setFormEnvironment] = useState<BankIntegrationEnvironment>("SANDBOX");
  const [formServices, setFormServices] = useState<BankIntegrationService[]>(["QUERIES"]);
  const [formUrlBase, setFormUrlBase] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);
  const [formClientGuid, setFormClientGuid] = useState("");
  const [formMasterKey, setFormMasterKey] = useState("");
  const [formClientId, setFormClientId] = useState("");
  const [formAffiliationNumber, setFormAffiliationNumber] = useState("");
  const [formTerminalId, setFormTerminalId] = useState("");
  const [formSecret, setFormSecret] = useState("");
  const [formApiKey, setFormApiKey] = useState("");
  const [formToken, setFormToken] = useState("");
  const [formExtra, setFormExtra] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<BankIntegrationConfig | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Cargar bancos para selects
  useEffect(() => {
    let cancelled = false;
    setBanksLoading(true);
    listLocalBanks({ isActive: "all" })
      .then((list) => {
        if (cancelled) return;
        setBanks(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (cancelled) return;
        setBanks([]);
      })
      .finally(() => {
        if (cancelled) return;
        setBanksLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Si el proveedor es BDV, aseguramos que siempre tenga seleccionados VPOS y C2P (pasarela)
  useEffect(() => {
    if (formProvider !== "BDV") return;
    setFormServices((prev) => {
      const next = new Set(prev);
      next.add("VPOS");
      next.add("C2P");
      return Array.from(next);
    });
  }, [formProvider]);

  const loadConfigs = async () => {
    setLoading(true);
    setError(null);
    try {
      const params: any = {};
      if (filters.bankId) params.bankId = Number(filters.bankId);
      if (filters.provider) params.provider = filters.provider;
      if (filters.environment) params.environment = filters.environment;
      if (filters.service) params.service = filters.service;
      if (filters.isActive !== "all") params.isActive = filters.isActive;
      const list = await listBankIntegrations(params);
      setConfigs(Array.isArray(list) ? list : []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al cargar integraciones bancarias.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadConfigs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setEditing(null);
    setFormBankId("");
    setFormProvider("");
    setFormEnvironment("SANDBOX");
    setFormServices(["QUERIES"]);
    setFormUrlBase("");
    setFormIsActive(true);
    setFormClientGuid("");
    setFormMasterKey("");
    setFormClientId("");
    setFormAffiliationNumber("");
    setFormTerminalId("");
    setFormSecret("");
    setFormApiKey("");
    setFormToken("");
    setFormExtra("");
    setFormError(null);
  };

  const openCreate = () => {
    resetForm();
    setModalOpen(true);
  };

  const openEdit = (cfg: BankIntegrationConfig) => {
    setEditing(cfg);
    setFormBankId(String(cfg.bankId));
    setFormProvider(cfg.provider);
    setFormEnvironment(cfg.environment);
    setFormServices(cfg.services && cfg.services.length > 0 ? cfg.services : ["QUERIES"]);
    setFormUrlBase(cfg.urlBase ?? "");
    setFormIsActive(cfg.isActive);
    setFormClientGuid(cfg.clientGuid ?? "");
    setFormMasterKey(cfg.masterKey ?? "");
    setFormClientId(cfg.clientId ?? "");
    setFormAffiliationNumber(cfg.affiliationNumber ?? "");
    setFormTerminalId(cfg.terminalId ?? "");
    setFormSecret(cfg.secret ?? "");
    setFormApiKey(cfg.apiKey ?? "");
    setFormToken(cfg.token ?? "");
    setFormExtra(cfg.extra ? JSON.stringify(cfg.extra, null, 2) : "");
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setFormError(null);
    try {
      if (!formBankId) throw new Error("Debes seleccionar un banco.");

      const selectedBank = banks.find((b) => String(b.id) === formBankId);
      if (!selectedBank) {
        throw new Error("Banco seleccionado no válido.");
      }
      const isSupportedBank = selectedBank.code === 191 || selectedBank.code === 102;
      if (!isSupportedBank) {
        throw new Error("Este banco aún no está disponible para configuración.");
      }

      const effectiveProvider: BankIntegrationProvider =
        selectedBank.code === 191 ? "BNC" : "BDV";
      if (effectiveProvider !== formProvider) {
        setFormProvider(effectiveProvider);
      }
      if (!formServices || formServices.length === 0) {
        throw new Error("Debes seleccionar al menos un servicio.");
      }

      const required = getRequiredFields(effectiveProvider, formServices);

      const values: Record<string, string> = {
        urlBase: formUrlBase,
        clientGuid: formClientGuid,
        masterKey: formMasterKey,
        clientId: formClientId,
        affiliationNumber: formAffiliationNumber,
        terminalId: formTerminalId,
        secret: formSecret,
        apiKey: formApiKey,
        token: formToken,
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

      const trimmedUrl = formUrlBase.trim();
      if (!/^https?:\/\/.+/i.test(trimmedUrl)) {
        throw new Error('La "URL base" debe comenzar con http:// o https:// y ser una URL válida.');
      }

      let parsedExtra: unknown = undefined;
      if (formExtra.trim()) {
        try {
          parsedExtra = JSON.parse(formExtra);
        } catch {
          throw new Error("El campo extra debe ser un JSON válido.");
        }
      }

      const payload: any = {
        bankId: Number(formBankId),
        provider: effectiveProvider,
        environment: formEnvironment,
        services: formServices,
        urlBase: trimmedUrl,
        isActive: formIsActive,
      };

      if (formProvider === "BNC") {
        payload.clientGuid = formClientGuid || undefined;
        payload.masterKey = formMasterKey || undefined;
        payload.clientId = formClientId || undefined;
        payload.affiliationNumber = formAffiliationNumber || undefined;
        payload.terminalId = formTerminalId || undefined;
      }
      if (formProvider === "BDV") {
        payload.secret = formSecret || undefined;
        payload.apiKey = formApiKey || undefined;
        payload.token = formToken || undefined;
      }
      if (parsedExtra !== undefined) {
        payload.extra = parsedExtra;
      }

      let saved: BankIntegrationConfig;
      if (editing) {
        saved = await updateBankIntegration(editing.id, payload);
        setConfigs((prev) => prev.map((c) => (c.id === saved.id ? saved : c)));
      } else {
        saved = await createBankIntegration(payload);
        setConfigs((prev) => [saved, ...prev]);
      }

      setModalOpen(false);
      resetForm();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al guardar la integración bancaria.";
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  };

  const filteredConfigs = useMemo(() => {
    return configs;
  }, [configs]);

  const renderBankLabel = (cfg: BankIntegrationConfig) => {
    const bank = cfg.bank ?? banks.find((b) => b.id === cfg.bankId);
    if (!bank) return `#${cfg.bankId}`;
    return `${bank.code} - ${bank.name}`;
  };

  const providerFieldsBNC = formProvider === "BNC";
  const providerFieldsBDV = formProvider === "BDV";

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase">Filtros</span>
        </div>
        <div className="min-w-[200px]">
          <Label className="text-xs text-muted-foreground">Banco</Label>
          <Select
            value={filters.bankId}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, bankId: v === "all" ? "" : v }))
            }
          >
            <SelectTrigger className="h-8 bg-white">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {banks.map((b) => {
                const isSupported = b.code === 191 || b.code === 102;
                return (
                  <SelectItem key={b.id} value={String(b.id)}>
                    {b.code} - {b.name}
                    {!isSupported ? " (No disponible)" : ""}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[140px]">
          <Label className="text-xs text-muted-foreground">Proveedor</Label>
          <Select
            value={filters.provider}
            onValueChange={(v) =>
              setFilters((f) => ({
                ...f,
                provider: (v === "all" ? "" : (v as BankIntegrationProvider)) as FilterState["provider"],
              }))
            }
          >
            <SelectTrigger className="h-8 bg-white">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {PROVIDER_OPTIONS.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[150px]">
          <Label className="text-xs text-muted-foreground">Entorno</Label>
          <Select
            value={filters.environment}
            onValueChange={(v) =>
              setFilters((f) => ({
                ...f,
                environment: (v === "all" ? "" : (v as BankIntegrationEnvironment)) as FilterState["environment"],
              }))
            }
          >
            <SelectTrigger className="h-8 bg-white">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {ENV_OPTIONS.map((env) => (
                <SelectItem key={env} value={env}>
                  {env}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[160px]">
          <Label className="text-xs text-muted-foreground">Servicio</Label>
          <Select
            value={filters.service}
            onValueChange={(v) =>
              setFilters((f) => ({
                ...f,
                service: (v === "all" ? "" : (v as BankIntegrationService)) as FilterState["service"],
              }))
            }
          >
            <SelectTrigger className="h-8 bg-white">
              <SelectValue placeholder="Todos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {SERVICE_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="min-w-[140px]">
          <Label className="text-xs text-muted-foreground">Estado</Label>
          <Select
            value={filters.isActive}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, isActive: v as FilterState["isActive"] }))
            }
          >
            <SelectTrigger className="h-8 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="true">Solo activos</SelectItem>
              <SelectItem value="false">Solo inactivos</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void loadConfigs()}
          disabled={loading}
          className="ml-auto"
        >
          <RefreshCw className="mr-1 h-3.5 w-3.5" />
          Aplicar filtros
        </Button>
        <Button
          type="button"
          size="sm"
          className="relative overflow-hidden group rounded-full px-4"
          onClick={() => navigate("/banco-integracion-wizard")}
        >
          <span className="absolute inset-0 bg-gradient-to-r from-primary/80 via-primary to-amber-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          <span className="relative flex items-center gap-1">
            <Plus className="h-3.5 w-3.5" />
            <span>Nueva integración (wizard)</span>
          </span>
        </Button>

        {/* Diálogo solo para editar integraciones existentes */}
        <Dialog
          open={modalOpen}
          onOpenChange={(open) => {
            setModalOpen(open);
            if (!open) resetForm();
          }}
        >
          <DialogContent className="bg-white max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-primary" />
                {editing ? "Editar integración bancaria" : "Nueva integración bancaria"}
              </DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
              <div className="space-y-2">
                <Label>Banco</Label>
                <Select
                  value={formBankId}
                  onValueChange={(v) => {
                    setFormBankId(v);
                    const bank = banks.find((b) => String(b.id) === v);
                    if (bank) {
                      if (bank.code === 191) {
                        setFormProvider("BNC");
                      } else if (bank.code === 102) {
                        setFormProvider("BDV");
                      }
                    }
                  }}
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Selecciona un banco" />
                  </SelectTrigger>
                  <SelectContent>
                    {banks.map((b) => {
                      const isSupported = b.code === 191 || b.code === 102;
                      return (
                        <SelectItem
                          key={b.id}
                          value={String(b.id)}
                          disabled={!isSupported}
                        >
                          {b.code} - {b.name}
                          {!isSupported ? " (No disponible)" : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Proveedor</Label>
                <Input value={formProvider} disabled className="bg-muted" />
              </div>
              <div className="space-y-2">
                <Label>Entorno</Label>
                <Select
                  value={formEnvironment}
                  onValueChange={(v) => setFormEnvironment(v as BankIntegrationEnvironment)}
                >
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
              <div className="space-y-2">
                <Label>Servicios</Label>
                <div className="grid grid-cols-2 gap-1 rounded-md border bg-muted/40 px-2 py-2">
                  {formProvider === "BDV" ? (
                    <>
                      {/* Consultas */}
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <Checkbox
                          checked={formServices.includes("QUERIES")}
                          onCheckedChange={(v) => {
                            setFormServices((prev) =>
                              v === true
                                ? Array.from(new Set<BankIntegrationService>([...prev, "QUERIES"]))
                                : prev.filter((item) => item !== "QUERIES"),
                            );
                          }}
                        />
                        <span>Consultas</span>
                      </label>
                      {/* Pasarela = VPOS + C2P */}
                      <label className="flex items-center gap-2 text-xs cursor-pointer">
                        <Checkbox
                          checked={
                            formServices.includes("VPOS") || formServices.includes("C2P")
                          }
                          onCheckedChange={(v) => {
                            setFormServices((prev) => {
                              if (v === true) {
                                const next = new Set<BankIntegrationService>(prev);
                                next.add("VPOS");
                                next.add("C2P");
                                return Array.from(next);
                              }
                              return prev.filter((item) => item !== "VPOS" && item !== "C2P");
                            });
                          }}
                        />
                        <span>Pasarela</span>
                      </label>
                    </>
                  ) : (
                    SERVICE_OPTIONS.map((s) => {
                      const checked = formServices.includes(s);
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
                              setFormServices((prev) =>
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
              <div className="space-y-2 md:col-span-2">
                <Label>URL base</Label>
                <Input
                  placeholder="https://..."
                  value={formUrlBase}
                  onChange={(e) => setFormUrlBase(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>
              <div className="flex items-center gap-2 md:col-span-2">
                <Checkbox
                  id="integration-active"
                  checked={formIsActive}
                  onCheckedChange={(v) => setFormIsActive(v === true)}
                />
                <Label htmlFor="integration-active" className="font-normal cursor-pointer">
                  Integración activa
                </Label>
              </div>
            </div>

            {/* Campos específicos por proveedor */}
            {providerFieldsBNC && (
              <div className="mt-2 border-t pt-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase">
                  Campos BNC
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Client GUID</Label>
                    <Input
                      value={formClientGuid}
                      onChange={(e) => setFormClientGuid(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Master Key</Label>
                    <Input
                      value={formMasterKey}
                      onChange={(e) => setFormMasterKey(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Client ID</Label>
                    <Input
                      value={formClientId}
                      onChange={(e) => setFormClientId(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Número de afiliación</Label>
                    <Input
                      value={formAffiliationNumber}
                      onChange={(e) => setFormAffiliationNumber(e.target.value)}
                      disabled={!formServices.includes("VPOS")}
                      placeholder={
                        formServices.includes("VPOS")
                          ? undefined
                          : "Disponible cuando se selecciona VPOS"
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Terminal ID</Label>
                    <Input
                      value={formTerminalId}
                      onChange={(e) => setFormTerminalId(e.target.value)}
                      disabled={!formServices.includes("C2P")}
                      placeholder={
                        formServices.includes("C2P")
                          ? undefined
                          : "Disponible cuando se selecciona C2P"
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            {providerFieldsBDV && (
              <div className="mt-2 border-t pt-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase">
                  Campos BDV
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Secret</Label>
                    <Input
                      value={formSecret}
                      onChange={(e) => setFormSecret(e.target.value)}
                      disabled={!(formServices.includes("VPOS") || formServices.includes("C2P"))}
                      placeholder={
                        formServices.includes("VPOS") || formServices.includes("C2P")
                          ? undefined
                          : "Disponible cuando se selecciona Pasarela"
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>API Key</Label>
                    <Input
                      value={formApiKey}
                      onChange={(e) => setFormApiKey(e.target.value)}
                      disabled={!(formServices.includes("VPOS") || formServices.includes("C2P"))}
                      placeholder={
                        formServices.includes("VPOS") || formServices.includes("C2P")
                          ? undefined
                          : "Disponible cuando se selecciona Pasarela"
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Token</Label>
                    <Input
                      value={formToken}
                      onChange={(e) => setFormToken(e.target.value)}
                      disabled={!formServices.includes("QUERIES")}
                      placeholder={
                        formServices.includes("QUERIES")
                          ? undefined
                          : "Disponible cuando se selecciona Consultas"
                      }
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Campo Extra JSON opcional oculto por ahora según requerimiento */}

            {formError && (
              <div className="mt-3 text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                {formError}
              </div>
            )}

            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
                disabled={saving}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || !formBankId}
              >
                {saving ? "Guardando..." : "Guardar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabla */}
      <div className="rounded-lg border bg-card shadow-sm overflow-auto">
        {loading && (
          <LoadingIndicator text="Cargando integraciones bancarias..." className="py-8" />
        )}
        {error && !loading && (
          <div className="py-4 px-4 text-sm text-destructive bg-destructive/10 border-b border-destructive/30">
            {error}
          </div>
        )}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Banco</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Proveedor</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Entorno</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Servicio</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">URL base</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Estado</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredConfigs.map((cfg) => (
              <tr key={cfg.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 text-foreground">
                  <span className="font-medium">{renderBankLabel(cfg)}</span>
                </td>
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
                    <Button variant="ghost" size="sm" onClick={() => openEdit(cfg)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setDeleteError(null);
                        setDeleteTarget(cfg);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && !error && filteredConfigs.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No hay configuraciones para los filtros seleccionados.
          </div>
        )}
      </div>

      {/* Confirmar borrado */}
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
            <DialogTitle>¿Eliminar integración bancaria?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              Banco:{" "}
              <span className="font-medium">
                {deleteTarget ? renderBankLabel(deleteTarget) : "-"}
              </span>
            </p>
            <p>
              Proveedor/Servicio:{" "}
              <span className="font-mono text-xs">
                {deleteTarget?.provider} · {deleteTarget?.environment} ·{" "}
                {deleteTarget?.services && deleteTarget.services.length > 0
                  ? deleteTarget.services.join(", ")
                  : "—"}
              </span>
            </p>
            <p className="text-muted-foreground">
              Esta acción no se puede deshacer. Es posible volver a crear la configuración luego.
            </p>
            {deleteError && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
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
                  await deleteBankIntegration(deleteTarget.id);
                  setConfigs((prev) => prev.filter((c) => c.id !== deleteTarget.id));
                  setDeleteTarget(null);
                } catch (e) {
                  const msg =
                    e instanceof Error ? e.message : "No se pudo eliminar la integración bancaria.";
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
    </div>
  );
}


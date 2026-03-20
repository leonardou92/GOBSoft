import { useEffect, useState } from "react";
import { Plus, Search, Edit, Ban, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { createBankAccount, deleteBankAccount, listBankAccounts, type BankAccount, updateBankAccount } from "@/services/bankAccounts";
import { hasTransactionsForAccount } from "@/services/transactions";
import { listLocalBanks, type LocalBank } from "@/services/localBanks";

export default function AccountsPage() {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BankAccount | null>(null);
  const [formAlias, setFormAlias] = useState("");
  const [formAccountNumber, setFormAccountNumber] = useState("");
  const [formBankCode, setFormBankCode] = useState("");
  const [formMobPhone, setFormMobPhone] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);
  const [formCurrency, setFormCurrency] = useState<"VES" | "USD" | "EUR">("VES");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [banks, setBanks] = useState<LocalBank[]>([]);
  const [banksLoading, setBanksLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BankAccount | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await listBankAccounts();

        // Para cada cuenta, consultamos si tiene movimientos en la BD
        const dataWithFlags = await Promise.all(
          data.map(async (account) => {
            try {
              const hasMovements = await hasTransactionsForAccount(account.accountNumber, account.clientId);
              return { ...account, hasTransactions: hasMovements };
            } catch {
              return account;
            }
          }),
        );

        setAccounts(dataWithFlags);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error al cargar las cuentas bancarias.";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

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

  const openEditModal = (account: BankAccount) => {
    setEditing(account);
    setFormAlias(account.alias ?? "");
    setFormAccountNumber(account.accountNumber);
    setFormBankCode(String(account.bankCode ?? 191));
    setFormMobPhone(account.mobPaymentPhone ?? "");
    setFormIsActive(account.isActive);
    setFormCurrency((account.currency as any) ?? "VES");
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setFormError(null);

    try {
      if (formAccountNumber.length !== 20) {
        throw new Error("El número de cuenta debe tener exactamente 20 dígitos.");
      }

      if (!formBankCode) {
        throw new Error("El banco es requerido.");
      }
      const bankCode = Number(formBankCode);
      if (!Number.isFinite(bankCode) || bankCode <= 0) {
        throw new Error("Selecciona un banco válido.");
      }

      if (editing) {
        const updated = await updateBankAccount(editing.id, {
          alias: formAlias || undefined,
          accountNumber: formAccountNumber,
          bankCode,
          mobPaymentPhone: formMobPhone || undefined,
          currency: formCurrency,
          isActive: formIsActive,
        });

        setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      } else {
        // Para cuentas creadas manualmente usamos un clientId genérico
        const created = await createBankAccount({
          clientId: "LOCAL",
          accountNumber: formAccountNumber,
          alias: formAlias || undefined,
          bankCode,
          mobPaymentPhone: formMobPhone || undefined,
          currency: formCurrency,
          isActive: formIsActive,
        });

        const hasMovements = await hasTransactionsForAccount(
          created.accountNumber,
          created.clientId,
        );
        setAccounts((prev) => [...prev, { ...created, hasTransactions: hasMovements }]);
      }

      setModalOpen(false);
      setEditing(null);
      setFormAlias("");
      setFormAccountNumber("");
      setFormBankCode("");
      setFormMobPhone("");
      setFormIsActive(true);
      setFormCurrency("VES");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al guardar la cuenta bancaria.";
      setFormError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleAskDelete = async (account: BankAccount) => {
    setDeleteError(null);

    try {
      // Si ya sabemos que tiene movimientos, no mostramos el modal
      if (account.hasTransactions) {
        setDeleteError("No se puede eliminar la cuenta porque tiene movimientos registrados.");
        return;
      }

      const hasMovements = await hasTransactionsForAccount(account.accountNumber, account.clientId);

      if (hasMovements) {
        // Marcamos en memoria que esta cuenta tiene movimientos para ocultar el botón en el futuro
        setAccounts((prev) =>
          prev.map((a) =>
            a.id === account.id
              ? { ...a, hasTransactions: true }
              : a,
          ),
        );
        setDeleteError("No se puede eliminar la cuenta porque tiene movimientos registrados.");
        return;
      }

      setDeleteTarget(account);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "No se pudo verificar los movimientos de la cuenta bancaria.";
      setDeleteError(message);
    }
  };

  const filtered = accounts.filter((a) => {
    const estado = a.isActive ? "Activa" : "Inactiva";
    if (filter !== "all" && estado !== filter) return false;

    const alias = (a.alias ?? "").toLowerCase();
    const numero = a.accountNumber ?? "";

    if (search && !alias.includes(search.toLowerCase()) && !numero.includes(search)) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm bg-white">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Buscar por alias o número..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-40 bg-white">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="Activa">Activa</SelectItem>
            <SelectItem value="Inactiva">Inactiva</SelectItem>
          </SelectContent>
        </Select>
        <Dialog
          open={modalOpen}
          onOpenChange={(open) => {
            setModalOpen(open);
            if (!open) {
              setEditing(null);
              setFormError(null);
              setFormAlias("");
              setFormAccountNumber("");
                setFormBankCode("");
              setFormMobPhone("");
              setFormIsActive(true);
              setFormCurrency("VES");
            }
          }}
        >
          <DialogTrigger asChild>
            <Button
              onClick={() => {
                setEditing(null);
                setFormError(null);
                setFormAlias("");
                setFormAccountNumber("");
                setFormBankCode("");
                setFormMobPhone("");
                setFormIsActive(true);
                setFormCurrency("VES");
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              Nueva cuenta
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-white">
            <DialogHeader>
              <DialogTitle>{editing ? "Editar Cuenta Bancaria" : "Nueva Cuenta Bancaria"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Alias</Label>
                <Input
                  placeholder="Ej: Cuenta Principal"
                  value={formAlias}
                  onChange={(e) => setFormAlias(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Número de cuenta</Label>
                <Input
                  placeholder="20 dígitos"
                  className="font-mono"
                  value={formAccountNumber}
                  onChange={(e) => {
                    const onlyDigits = e.target.value.replace(/\D/g, "").slice(0, 20);
                    setFormAccountNumber(onlyDigits);
                  }}
                  disabled={!!editing}
                />
              </div>
              <div className="space-y-2">
                <Label>Banco</Label>
                <Select
                  value={formBankCode}
                  onValueChange={(v) => setFormBankCode(v)}
                  disabled={banksLoading || banks.length === 0}
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder={banksLoading ? "Cargando bancos..." : "Selecciona un banco"} />
                  </SelectTrigger>
                  <SelectContent>
                    {banks
                      .filter((b) => b.isActive)
                      .sort((a, b) => a.code - b.code)
                      .map((b) => (
                        <SelectItem key={b.id} value={String(b.code)}>
                          {b.code} - {b.name}
                        </SelectItem>
                      ))}
                    {banks.filter((b) => b.isActive).length === 0 && (
                      <SelectItem value="191" disabled>
                        No hay bancos activos (crea uno en Bancos)
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Si no aparece el banco, créalo/actívalo en la sección <span className="font-medium">Bancos</span>.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Teléfono Pago Móvil</Label>
                <Input
                  placeholder="58412..."
                  value={formMobPhone}
                  onChange={(e) => setFormMobPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Moneda</Label>
                <Select value={formCurrency} onValueChange={(v) => setFormCurrency(v as any)}>
                  <SelectTrigger className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="VES">Bs</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="active"
                  checked={formIsActive}
                  onCheckedChange={(v) => setFormIsActive(v === true)}
                />
                <Label htmlFor="active" className="font-normal cursor-pointer">Cuenta activa</Label>
              </div>
              {formError && (
                <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                  {formError}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleSave} disabled={saving || !formBankCode}>
                Guardar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card shadow-sm overflow-auto">
        {loading && (
          <LoadingIndicator text="Cargando cuentas bancarias..." className="py-8" />
        )}
        {error && !loading && (
          <div className="py-4 px-4 text-sm text-destructive bg-destructive/10 border-b border-destructive/30">
            {error}
          </div>
        )}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Alias</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Nº Cuenta</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Banco</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Teléfono</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Estado</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((a) => {
              const estado = a.isActive ? "Activa" : "Inactiva";
              const bank =
                banks.find((b) => (a.bankId != null ? b.id === a.bankId : b.code === a.bankCode)) ??
                banks.find((b) => b.code === a.bankCode);
              const bankLabel = bank ? `${bank.code} - ${bank.name}` : a.bankCode?.toString() ?? "";

              return (
              <tr key={a.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-medium text-foreground">{a.alias || "-"}</td>
                <td className="px-4 py-3 font-mono text-xs text-foreground">{a.accountNumber}</td>
                <td className="px-4 py-3 text-foreground">{bankLabel}</td>
                <td className="px-4 py-3 font-mono text-xs text-foreground">{a.mobPaymentPhone || "-"}</td>
                <td className="px-4 py-3">
                  <Badge variant={estado === "Activa" ? "default" : "secondary"}
                    className={estado === "Activa" ? "bg-success/10 text-success border-success/20" : "bg-muted text-muted-foreground"}>
                    {estado === "Activa" ? <Check className="mr-1 h-3 w-3" /> : <Ban className="mr-1 h-3 w-3" />}
                    {estado}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEditModal(a)}>
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    {!a.hasTransactions && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          void handleAskDelete(a);
                        }}
                      >
                        <Ban className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
        {!loading && !error && filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">No se encontraron cuentas.</div>
        )}
      </div>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cuenta bancaria?</AlertDialogTitle>
          </AlertDialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              Estás a punto de eliminar la cuenta{" "}
              <span className="font-mono">{deleteTarget?.accountNumber}</span>{" "}
              ({deleteTarget?.alias || "sin alias"}).
            </p>
            <p className="text-muted-foreground">
              Si existen movimientos o transacciones asociadas a esta cuenta, el sistema no permitirá borrarla.
            </p>
            {deleteError && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                {deleteError}
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setDeleteTarget(null);
                setDeleteError(null);
              }}
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleteTarget) return;
                setDeleting(true);
                setDeleteError(null);
                try {
                  await deleteBankAccount(deleteTarget.id);
                  setAccounts((prev) => prev.filter((a) => a.id !== deleteTarget.id));
                  setDeleteTarget(null);
                } catch (err) {
                  const message =
                    err instanceof Error
                      ? err.message
                      : "No se pudo eliminar la cuenta bancaria.";
                  setDeleteError(message);
                } finally {
                  setDeleting(false);
                }
              }}
              disabled={deleting}
            >
              {deleting ? "Eliminando..." : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

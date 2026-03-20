import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Edit, Trash2, Building2, Ban, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import {
  createLocalBank,
  deleteLocalBank,
  listLocalBanks,
  type LocalBank,
  updateLocalBank,
} from "@/services/localBanks";
import { STATIC_BANKS } from "@/constants/staticBanks";

export default function BanksPage() {
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("active");
  const [search, setSearch] = useState("");
  const [banks, setBanks] = useState<LocalBank[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<LocalBank | null>(null);
  const [formCode, setFormCode] = useState("");
  const [formName, setFormName] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<LocalBank | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listLocalBanks({ isActive: "all" });
      setBanks(Array.isArray(list) ? list : []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al cargar bancos.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resetForm = () => {
    setEditing(null);
    setFormCode("");
    setFormName("");
    setFormIsActive(true);
    setFormError(null);
  };

  const openCreate = () => {
    resetForm();
    setModalOpen(true);
  };

  const openEdit = (b: LocalBank) => {
    setEditing(b);
    const staticMatch = STATIC_BANKS.find((sb) => Number(sb.id) === b.code);
    setFormCode(staticMatch ? staticMatch.id : String(b.code));
    setFormName(b.name ?? "");
    setFormIsActive(!!b.isActive);
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setFormError(null);
    try {
      const codeNum = Number(formCode);
      if (!Number.isFinite(codeNum) || codeNum <= 0) {
        throw new Error("Debes seleccionar un banco válido.");
      }

      // Evitar bancos duplicados por código
      const duplicate = banks.find(
        (b) => b.code === codeNum && (!editing || b.id !== editing.id),
      );
      if (duplicate) {
        throw new Error(
          "Ya existe un banco registrado con ese código. No se permiten duplicados.",
        );
      }
      // El nombre se autocompleta según el banco seleccionado (catálogo estático).

      if (editing) {
        const updated = await updateLocalBank(editing.id, {
          code: codeNum,
          name: formName.trim(),
          isActive: formIsActive,
        });
        setBanks((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      } else {
        const created = await createLocalBank({
          code: codeNum,
          name: formName.trim(),
          isActive: formIsActive,
        });
        setBanks((prev) => [created, ...prev]);
      }

      setModalOpen(false);
      resetForm();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al guardar banco.";
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  };

  const filteredBanks = useMemo(() => {
    const term = search.trim().toLowerCase();
    return banks.filter((b) => {
      if (filter === "active" && !b.isActive) return false;
      if (filter === "inactive" && b.isActive) return false;
      if (!term) return true;
      return (
        String(b.code).includes(term) ||
        (b.name ?? "").toLowerCase().includes(term)
      );
    });
  }, [banks, filter, search]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm bg-white">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por código o nombre..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
          <SelectTrigger className="w-44 bg-white">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Solo activos</SelectItem>
            <SelectItem value="inactive">Solo inactivos</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>

        <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
          Recargar
        </Button>

        <Dialog
          open={modalOpen}
          onOpenChange={(open) => {
            setModalOpen(open);
            if (!open) resetForm();
          }}
        >
          <DialogTrigger asChild>
            <Button onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo banco
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-white">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                {editing ? "Editar banco" : "Nuevo banco"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Banco</Label>
                <Select
                  value={formCode}
                  onValueChange={(value) => {
                    setFormCode(value);
                    const found = STATIC_BANKS.find((b) => b.id === value);
                    if (found) {
                      setFormName(found.name);
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
              <div className="flex items-center gap-2">
                <Checkbox
                  id="bank-active"
                  checked={formIsActive}
                  onCheckedChange={(v) => setFormIsActive(v === true)}
                />
                <Label htmlFor="bank-active" className="font-normal cursor-pointer">
                  Banco activo
                </Label>
              </div>

              {formError && (
                <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                  {formError}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setModalOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saving || !formCode}>
                {saving ? "Guardando..." : "Guardar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card shadow-sm overflow-auto">
        {loading && (
          <LoadingIndicator text="Cargando bancos..." className="py-8" />
        )}
        {error && !loading && (
          <div className="py-4 px-4 text-sm text-destructive bg-destructive/10 border-b border-destructive/30">
            {error}
          </div>
        )}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Código</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Nombre</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Estado</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filteredBanks.map((b) => {
              const estado = b.isActive ? "Activo" : "Inactivo";
              return (
                <tr key={b.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-foreground">{b.code}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{b.name}</td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={b.isActive ? "default" : "secondary"}
                      className={
                        b.isActive
                          ? "bg-success/10 text-success border-success/20"
                          : "bg-muted text-muted-foreground"
                      }
                    >
                      {b.isActive ? <Check className="mr-1 h-3 w-3" /> : <Ban className="mr-1 h-3 w-3" />}
                      {estado}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(b)}>
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setDeleteError(null);
                          setDeleteTarget(b);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && !error && filteredBanks.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No se encontraron bancos.
          </div>
        )}
      </div>

      {/* Delete confirm */}
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
            <DialogTitle>¿Eliminar banco?</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <p>
              Estás a punto de eliminar el banco{" "}
              <span className="font-medium">{deleteTarget?.name}</span> (código{" "}
              <span className="font-mono">{deleteTarget?.code}</span>).
            </p>
            <p className="text-muted-foreground">
              Esta acción no se puede deshacer.
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
                  await deleteLocalBank(deleteTarget.id);
                  setBanks((prev) => prev.filter((x) => x.id !== deleteTarget.id));
                  setDeleteTarget(null);
                } catch (e) {
                  const msg = e instanceof Error ? e.message : "No se pudo eliminar el banco.";
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


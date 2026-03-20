import { useEffect, useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { getStoredToken } from "@/services/auth";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

type RoleWithPermissions = {
  id: number;
  name: string;
  description?: string | null;
  permissions: string[];
};

type PermissionMeta = {
  code: string;
  label: string;
  group: string;
};

const ALL_PERMISSIONS: PermissionMeta[] = [
  { code: "VIEW_DASHBOARD", label: "Ver dashboard", group: "Generales" },
  { code: "VIEW_BANKS", label: "Ver bancos", group: "Bancos" },
  { code: "MANAGE_BANKS", label: "Gestionar bancos", group: "Bancos" },
  { code: "VIEW_BANK_ACCOUNTS", label: "Ver cuentas bancarias", group: "Cuentas" },
  { code: "MANAGE_BANK_ACCOUNTS", label: "Gestionar cuentas bancarias", group: "Cuentas" },
  {
    code: "VIEW_BANK_INTEGRATIONS",
    label: "Ver integraciones bancarias",
    group: "Integraciones",
  },
  {
    code: "MANAGE_BANK_INTEGRATIONS",
    label: "Gestionar integraciones bancarias",
    group: "Integraciones",
  },
  { code: "VIEW_TRANSACTIONS", label: "Ver transacciones", group: "Transacciones" },
  { code: "EXECUTE_P2P", label: "Ejecutar pagos P2P", group: "Operaciones" },
  {
    code: "EXECUTE_IMMEDIATE_CREDIT_DEBIT",
    label: "Ejecutar crédito/débito inmediato",
    group: "Operaciones",
  },
  { code: "EXECUTE_VPOS", label: "Ejecutar cobros VPOS", group: "Operaciones" },
  { code: "EXECUTE_C2P", label: "Ejecutar cobros C2P", group: "Operaciones" },
  { code: "VIEW_USERS", label: "Ver usuarios", group: "Usuarios" },
  { code: "MANAGE_USERS", label: "Gestionar usuarios", group: "Usuarios" },
  {
    code: "VIEW_API_ERROR_LOGS",
    label: "Ver log de errores API",
    group: "Auditoría",
  },
  { code: "VIEW_AUDIT_LOGS", label: "Ver auditoría", group: "Auditoría" },
  {
    code: "MANAGE_SECURITY",
    label: "Gestionar seguridad global (2FA)",
    group: "Seguridad",
  },
];

type Status = "idle" | "loading" | "saving" | "creating";

export default function RoleAccessPage() {
  const [roles, setRoles] = useState<RoleWithPermissions[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [currentPermissions, setCurrentPermissions] = useState<string[]>([]);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const { toast } = useToast();

  const token = getStoredToken();
  const authHeader =
    token && token.startsWith("Bearer ") ? token : token ? `Bearer ${token}` : null;

  const selectedRole = useMemo(
    () => roles.find((r) => r.id === selectedRoleId) ?? null,
    [roles, selectedRoleId],
  );

  useEffect(() => {
    const loadRoles = async () => {
      if (!authHeader) return;
      setStatus("loading");
      setError(null);
      try {
        const res = await fetch(`${API_BASE_URL}/api/roles/with-permissions`, {
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
          },
        });
        const data = await res.json().catch(() => []);
        if (!res.ok) {
          const msg =
            (data && typeof data.message === "string" && data.message) ||
            "No se pudieron cargar los roles.";
          throw new Error(msg);
        }
        if (Array.isArray(data)) {
          setRoles(data as RoleWithPermissions[]);
          if (data.length > 0) {
            setSelectedRoleId(data[0].id);
            setCurrentPermissions((data[0] as RoleWithPermissions).permissions ?? []);
          }
        }
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Ocurrió un error al cargar los roles.";
        setError(msg);
        toast({
          variant: "destructive",
          description: msg,
        });
      } finally {
        setStatus("idle");
      }
    };

    void loadRoles();
  }, [authHeader]);

  useEffect(() => {
    if (selectedRole) {
      setCurrentPermissions(selectedRole.permissions ?? []);
      setEditName(selectedRole.name);
      setEditDescription(selectedRole.description ?? "");
      setSuccess(null);
      setError(null);
    }
  }, [selectedRole]);

  const handleTogglePermission = (code: string, checked: boolean) => {
    setCurrentPermissions((prev) => {
      if (checked) {
        if (prev.includes(code)) return prev;
        return [...prev, code];
      }
      return prev.filter((p) => p !== code);
    });
  };

  const handleSavePermissions = async () => {
    if (!selectedRole || !authHeader) return;
    setStatus("saving");
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/roles/${selectedRole.id}/permissions`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: authHeader,
          },
          body: JSON.stringify({ permissions: currentPermissions }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          (data && typeof data.message === "string" && data.message) ||
          "No se pudieron guardar los permisos del rol.";
        throw new Error(msg);
      }
      const updated = data as RoleWithPermissions;
      setRoles((prev) =>
        prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)),
      );
      setSuccess("Permisos del rol actualizados correctamente.");
      toast({
        description: "Permisos del rol actualizados correctamente.",
      });
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : "Ocurrió un error al guardar los permisos del rol.";
      setError(msg);
      toast({
        variant: "destructive",
        description: msg,
      });
    } finally {
      setStatus("idle");
    }
  };

  const handleUpdateRoleMeta = async () => {
    if (!selectedRole || !authHeader) return;
    if (!editName.trim()) {
      setError("El nombre del rol es obligatorio.");
      return;
    }
    setStatus("saving");
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/roles/${selectedRole.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          (data && typeof data.message === "string" && data.message) ||
          "No se pudo actualizar el rol.";
        throw new Error(msg);
      }
      const updatedMeta = data as { id: number; name: string; description?: string | null };
      setRoles((prev) =>
        prev.map((r) =>
          r.id === updatedMeta.id ? { ...r, name: updatedMeta.name, description: updatedMeta.description ?? null } : r,
        ),
      );
      setSuccess("Nombre y descripción del rol actualizados correctamente.");
      toast({
        description: "Rol actualizado correctamente.",
      });
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Ocurrió un error al actualizar el rol.";
      setError(msg);
      toast({
        variant: "destructive",
        description: msg,
      });
    } finally {
      setStatus("idle");
    }
  };

  const handleDeleteRole = async () => {
    if (!selectedRole || !authHeader) return;

    const confirmed = window.confirm(
      `¿Seguro que deseas eliminar el rol "${selectedRole.name}"? Esta acción no se puede deshacer.`,
    );
    if (!confirmed) return;

    setStatus("saving");
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/roles/${selectedRole.id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
      });

      if (res.status === 204) {
        setRoles((prev) => prev.filter((r) => r.id !== selectedRole.id));
        setSelectedRoleId(null);
        setCurrentPermissions([]);
        setEditName("");
        setEditDescription("");
        setSuccess("Rol eliminado correctamente.");
        toast({
          description: "Rol eliminado correctamente.",
        });
        return;
      }

      const data = await res.json().catch(() => ({}));
      const msg =
        (data && typeof data.message === "string" && data.message) ||
        "No se pudo eliminar el rol.";
      throw new Error(
        data && typeof data.usersUsingRoleCount === "number"
          ? `${msg} Usuarios usando este rol: ${data.usersUsingRoleCount}.`
          : msg,
      );
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Ocurrió un error al eliminar el rol.";
      setError(msg);
      toast({
        variant: "destructive",
        description: msg,
      });
    } finally {
      setStatus("idle");
    }
  };

  const handleCreateRole = async () => {
    if (!authHeader) return;
    if (!newRoleName.trim()) {
      setError("El nombre del nuevo rol es obligatorio.");
      return;
    }
    setStatus("creating");
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/roles`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({
          name: newRoleName.trim(),
          description: newRoleDescription.trim() || null,
          permissions: currentPermissions,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          (data && typeof data.message === "string" && data.message) ||
          "No se pudo crear el rol.";
        throw new Error(msg);
      }
      const created = data as RoleWithPermissions;
      setRoles((prev) => [...prev, created]);
      setSelectedRoleId(created.id);
      setCurrentPermissions(created.permissions ?? []);
      setNewRoleName("");
      setNewRoleDescription("");
      setSuccess("Rol creado correctamente.");
      toast({
        description: "Rol creado correctamente.",
      });
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Ocurrió un error al crear el rol.";
      setError(msg);
      toast({
        variant: "destructive",
        description: msg,
      });
    } finally {
      setStatus("idle");
    }
  };

  const groupedPermissions = useMemo(() => {
    const groups = new Map<string, PermissionMeta[]>();
    for (const p of ALL_PERMISSIONS) {
      const arr = groups.get(p.group) ?? [];
      arr.push(p);
      groups.set(p.group, arr);
    }
    return Array.from(groups.entries());
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-semibold">Perfiles y accesos por rol</h1>
      </div>
      <p className="text-sm text-muted-foreground max-w-2xl">
        Administra los roles lógicos del sistema y los permisos asociados. Estos
        permisos se utilizan para generar el JWT y controlar el acceso a menús, rutas y
        operaciones.
      </p>

      {error && (
        <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 border border-emerald-200">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Columna izquierda: listado de roles y creación */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Roles definidos</Label>
            <div className="rounded-lg border bg-card max-h-72 overflow-auto">
              {roles.length === 0 && (
                <div className="px-3 py-4 text-xs text-muted-foreground">
                  No hay roles configurados aún.
                </div>
              )}
              {roles.map((role) => {
                const isActive = role.id === selectedRoleId;
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => setSelectedRoleId(role.id)}
                    className={`w-full text-left px-3 py-2 text-sm border-b last:border-b-0 transition-colors ${
                      isActive
                        ? "bg-primary/10 text-primary font-semibold"
                        : "hover:bg-muted"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>{role.name}</span>
                      {isActive && (
                        <Badge
                          variant="secondary"
                          className="text-[10px] uppercase tracking-wide"
                        >
                          seleccionado
                        </Badge>
                      )}
                    </div>
                    {role.description && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">
                        {role.description}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Crear nuevo rol</Label>
            <Input
              placeholder="Nombre del rol (ej. SUPERVISOR)"
              value={newRoleName}
              onChange={(e) => setNewRoleName(e.target.value.toUpperCase())}
              className="bg-white"
            />
            <Input
              placeholder="Descripción (opcional)"
              value={newRoleDescription}
              onChange={(e) => setNewRoleDescription(e.target.value)}
              className="bg-white"
            />
            <p className="text-[11px] text-muted-foreground">
              El nuevo rol se creará con los permisos actualmente seleccionados en la
              columna derecha.
            </p>
            <Button
              type="button"
              size="sm"
              onClick={handleCreateRole}
              disabled={status === "creating" || !authHeader}
            >
              {status === "creating" ? "Creando..." : "Crear rol"}
            </Button>
          </div>
        </div>

        {/* Columna derecha: permisos del rol seleccionado */}
        <div className="md:col-span-2 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="space-y-1">
              <p className="text-sm font-semibold">Detalle del rol seleccionado</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  placeholder="Nombre del rol"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="bg-white sm:w-48"
                  disabled={!selectedRole}
                />
                <Input
                  placeholder="Descripción"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="bg-white"
                  disabled={!selectedRole}
                />
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              onClick={handleUpdateRoleMeta}
              disabled={!selectedRole || status === "saving" || !authHeader}
            >
              {status === "saving" ? "Guardando..." : "Guardar rol"}
            </Button>
          </div>

          {!selectedRole && (
            <div className="text-xs text-muted-foreground">
              Selecciona un rol en la lista de la izquierda para editar sus permisos.
            </div>
          )}

          {selectedRole && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground">
                  Marca o desmarca los permisos que debe tener este rol.
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSavePermissions}
                    disabled={status === "saving" || !authHeader}
                  >
                    {status === "saving" ? "Guardando..." : "Guardar permisos"}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={handleDeleteRole}
                    disabled={status === "saving" || !authHeader}
                  >
                    Eliminar rol
                  </Button>
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3 space-y-3 max-h-[480px] overflow-auto">
                {groupedPermissions.map(([groupName, perms]) => (
                  <div key={groupName} className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {groupName}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                      {perms.map((perm) => {
                        const checked = currentPermissions.includes(perm.code);
                        return (
                          <label
                            key={perm.code}
                            className="flex items-center gap-2 text-xs cursor-pointer"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={(v) =>
                                handleTogglePermission(perm.code, v === true)
                              }
                            />
                            <span>
                              <span className="font-medium">{perm.label}</span>
                              <span className="ml-1 font-mono text-[10px] text-muted-foreground">
                                ({perm.code})
                              </span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  type User,
  type UpdateUserBody,
} from "@/services/users";
import { listRoles, type RoleSummary } from "@/services/roles";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const getCurrentUsername = (): string | null => {
  if (typeof window === "undefined") return null;
  return (
    window.localStorage.getItem("auth_username") ||
    window.sessionStorage.getItem("auth_username")
  );
};

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);

  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<RoleSummary[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
  const [form, setForm] = useState({
    username: "",
    password: "",
    firstName: "",
    lastName: "",
    email: "",
    isActive: true,
  });

  const resetForm = () => {
    setEditingUser(null);
    setForm({
      username: "",
      password: "",
      firstName: "",
      lastName: "",
      email: "",
      isActive: true,
    });
    setSelectedRoleId(null);
  };

  const loadUsers = async (pageToLoad = page) => {
    setLoading(true);
    try {
      const data = await listUsers(pageToLoad, pageSize);
      setUsers(data.items ?? []);
      setPage(data.page);
      setTotalPages(data.totalPages);
    } catch (err: any) {
      toast.error(err?.message ?? "Error listando usuarios.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers(1);
    void (async () => {
      try {
        const data = await listRoles();
        setRoles(data ?? []);
      } catch (err: any) {
        toast.error(err?.message ?? "Error listando roles.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser && !form.username.trim()) {
      toast.error("El username es requerido.");
      return;
    }
    if (!editingUser && !form.password.trim()) {
      toast.error("La contraseña es requerida al crear un usuario.");
      return;
    }

    try {
      if (editingUser) {
        const payload: UpdateUserBody = {
          firstName: form.firstName || null,
          lastName: form.lastName || null,
          email: form.email || null,
          isActive: form.isActive,
          password: form.password || undefined,
        };
        // Solo enviamos roleId cuando hay un rol seleccionado, para cumplir con la
        // regla de que debe ser un entero positivo y evitar enviar null/0.
        if (selectedRoleId && Number.isFinite(selectedRoleId) && selectedRoleId > 0) {
          payload.roleId = selectedRoleId;
        }

        const updated = await updateUser(editingUser.id, payload);
        setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
        toast.success("Usuario actualizado correctamente.");
      } else {
        const created = await createUser({
          username: form.username.trim(),
          password: form.password.trim(),
          firstName: form.firstName || undefined,
          lastName: form.lastName || undefined,
          email: form.email || undefined,
        });

        let finalUser = created;

        // Si se seleccionó un rol al crear, aplicar roleId vía PUT /api/users/:id
        if (selectedRoleId && Number.isFinite(selectedRoleId) && selectedRoleId > 0) {
          try {
            finalUser = await updateUser(created.id, { roleId: selectedRoleId });
          } catch (roleErr: any) {
            toast.error(
              roleErr?.message ??
                "Usuario creado, pero ocurrió un error al asignar el rol.",
            );
          }
        }

        setUsers((prev) => [finalUser, ...prev]);
        toast.success("Usuario creado correctamente.");
      }
      resetForm();
    } catch (err: any) {
      toast.error(err?.message ?? "Error guardando usuario.");
    }
  };

  const startEdit = (user: User) => {
    setEditingUser(user);
    setForm({
      username: user.username,
      password: "",
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      email: user.email ?? "",
      isActive: user.isActive,
    });
    setSelectedRoleId(user.role?.id ?? null);
  };

  const handleDelete = async (user: User) => {
    const currentUsername = getCurrentUsername();

    if (currentUsername && user.username === currentUsername) {
      toast.error("No puedes eliminar el usuario actualmente autenticado.");
      return;
    }

    if (users.length <= 1) {
      toast.error("Debe existir al menos un usuario en el sistema. No puedes eliminar el último usuario.");
      return;
    }

    if (!window.confirm(`¿Eliminar usuario "${user.username}"?`)) return;
    try {
      await deleteUser(user.id);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      toast.success("Usuario eliminado.");
    } catch (err: any) {
      toast.error(err?.message ?? "Error eliminando usuario.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Administración de usuarios</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            resetForm();
            void loadUsers(1);
          }}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refrescar
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Formulario */}
        <Card className="border shadow-sm lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              {editingUser ? "Editar usuario" : "Crear usuario"}
              {editingUser && (
                <Button variant="ghost" size="sm" onClick={resetForm}>
                  Cancelar
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-3">
              {!editingUser && (
                <div className="space-y-1.5">
                  <Label>Username</Label>
                  <Input
                    className="font-mono"
                    value={form.username}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, username: e.target.value }))
                    }
                    placeholder="usuario1"
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>
                  Contraseña{" "}
                  {editingUser && (
                    <span className="text-[11px] text-muted-foreground">
                      (dejar en blanco para no cambiarla)
                    </span>
                  )}
                </Label>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, password: e.target.value }))
                  }
                  placeholder={
                    editingUser ? "Nueva contraseña (opcional)" : "Contraseña123!"
                  }
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Nombre</Label>
                  <Input
                    value={form.firstName}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, firstName: e.target.value }))
                    }
                    placeholder="Nombre"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Apellido</Label>
                  <Input
                    value={form.lastName}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, lastName: e.target.value }))
                    }
                    placeholder="Apellido"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Correo electrónico</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, email: e.target.value }))
                  }
                  placeholder="correo@example.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Rol</Label>
                <Select
                  value={selectedRoleId ? String(selectedRoleId) : "none"}
                  onValueChange={(value) =>
                    setSelectedRoleId(value === "none" ? null : Number(value))
                  }
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Sin rol asignado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin rol</SelectItem>
                    {roles.map((role) => (
                      <SelectItem key={role.id} value={String(role.id)}>
                        {role.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {editingUser && (
                <div className="flex items-center gap-2 pt-1">
                  <Switch
                    checked={form.isActive}
                    onCheckedChange={(checked) =>
                      setForm((f) => ({ ...f, isActive: checked }))
                    }
                  />
                  <span className="text-xs text-muted-foreground">
                    Usuario activo
                  </span>
                </div>
              )}
              <Button type="submit" className="w-full mt-2" disabled={loading}>
                {loading ? "Guardando..." : editingUser ? "Actualizar usuario" : "Crear usuario"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Lista */}
        <Card className="border shadow-sm lg:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center justify-between">
              Usuarios
              <span className="text-[11px] text-muted-foreground">
                Página {page} de {totalPages}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                      Usuario
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                      Nombre
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                      Email
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                      Rol
                    </th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">
                      Estado
                    </th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const currentUsername = getCurrentUsername();
                    const isCurrentUser =
                      currentUsername && u.username === currentUsername;
                    const isOnlyUser = users.length <= 1;

                    return (
                    <tr key={u.id} className="border-b last:border-0">
                      <td className="px-3 py-2 font-mono text-xs">{u.username}</td>
                      <td className="px-3 py-2">
                        {(u.firstName || u.lastName) ?
                          `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() :
                          <span className="text-xs text-muted-foreground">Sin nombre</span>}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {u.email ?? <span className="text-muted-foreground">Sin correo</span>}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {u.role ? (
                          <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2 py-0.5 font-mono text-[10px]">
                            {u.role.name}
                          </span>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">Sin rol</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            u.isActive
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {u.isActive ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => startEdit(u)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          {!isCurrentUser && !isOnlyUser && (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-7 w-7 text-destructive border-destructive/40 hover:bg-destructive/5"
                              onClick={() => handleDelete(u)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )})}
                  {users.length === 0 && !loading && (
                    <tr>
                      <td
                        className="px-3 py-4 text-xs text-muted-foreground text-center"
                        colSpan={5}
                      >
                        No hay usuarios para mostrar.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between px-4 py-2 border-t">
              <span className="text-[11px] text-muted-foreground">
                Total páginas: {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => void loadUsers(page - 1)}
                >
                  Anterior
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => void loadUsers(page + 1)}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


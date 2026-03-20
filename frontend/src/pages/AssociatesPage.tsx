import { useEffect, useState } from "react";
import { Plus, Building, Users as UsersIcon, Trash2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import {
  type Associate,
  listAssociates,
  createAssociate,
  updateAssociate,
  deleteAssociate,
  associateDetailSimple,
  associateDisableSimple,
} from "@/services/associates";
import { useToast } from "@/hooks/use-toast";

export default function AssociatesPage() {
  const { toast } = useToast();
  const [items, setItems] = useState<Associate[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [syncingFromBnc, setSyncingFromBnc] = useState(false);

  const [newChildClientId, setNewChildClientId] = useState("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");

  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const selectedAssoc = items.find((a) => a.id === selected) ?? null;

  const load = async () => {
    setLoading(true);
    try {
      const res = await listAssociates({ page: 1, pageSize: 200 });
      const fetched = res.items ?? [];
      setItems(fetched);
      if (fetched.length > 0 && !selected) {
        setSelected(fetched[0].id);
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "No se pudieron cargar los asociados.";
      toast({
        title: "Error",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreate = async () => {
    if (!newChildClientId.trim() || !newName.trim()) {
      toast({
        title: "Campos requeridos",
        description: "Debes ingresar ChildClientID y nombre del asociado.",
        variant: "destructive",
      });
      return;
    }
    setCreating(true);
    try {
      const created = await createAssociate({
        childClientId: newChildClientId.trim(),
        name: newName.trim(),
        description: newDescription.trim() || undefined,
      });
      setItems((prev) => [...prev, created]);
      setSelected(created.id);
      setNewChildClientId("");
      setNewName("");
      setNewDescription("");
      toast({
        title: "Asociado creado",
        description: "El asociado se creó correctamente en la base de datos.",
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "No se pudo crear el asociado.";
      toast({
        title: "Error",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedAssoc) return;
    setUpdating(true);
    try {
      const updated = await updateAssociate(selectedAssoc.id, {
        name: editName.trim() || undefined,
        description: editDescription.trim() || undefined,
      });
      setItems((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      toast({
        title: "Asociado actualizado",
        description: "Los datos del asociado se actualizaron correctamente.",
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "No se pudo actualizar el asociado.";
      toast({
        title: "Error",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedAssoc) return;
    try {
      await deleteAssociate(selectedAssoc.id);
      setItems((prev) => prev.filter((a) => a.id !== selectedAssoc.id));
      setSelected(null);
      toast({
        title: "Asociado eliminado",
        description: "El asociado fue eliminado de la base de datos.",
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "No se pudo eliminar el asociado.";
      toast({
        title: "Error",
        description: msg,
        variant: "destructive",
      });
    }
  };

  const handleSyncFromBnc = async () => {
    if (!newChildClientId.trim()) {
      toast({
        title: "ChildClientID requerido",
        description: "Ingresa un ChildClientID para consultar en el BNC.",
        variant: "destructive",
      });
      return;
    }
    setSyncingFromBnc(true);
    try {
      const res = await associateDetailSimple({
        childClientId: newChildClientId.trim(),
      });
      if (!res.existsInBnc || !res.child) {
        toast({
          title: "No encontrado",
          description: res.message,
          variant: "destructive",
        });
        return;
      }
      const child = res.child;
      setNewName(child.ChildName ?? "");
      setNewDescription(
        `ClientNumber: ${child.ClientNumber}, AccountNumber: ${child.AccountNumber}`,
      );
      toast({
        title: "Detalle obtenido",
        description:
          "Se obtuvo el detalle del asociado desde el BNC y se sincronizó en la base de datos.",
      });
      await load();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "No se pudo obtener el detalle desde el BNC.";
      toast({
        title: "Error",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setSyncingFromBnc(false);
    }
  };

  const handleDisableInBnc = async () => {
    if (!selectedAssoc) return;
    setDisabling(true);
    try {
      const res = await associateDisableSimple({
        childClientId: selectedAssoc.childClientId,
      });
      toast({
        title: "Resultado",
        description: res.message,
      });
      await load();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "No se pudo deshabilitar el asociado.";
      toast({
        title: "Error",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setDisabling(false);
    }
  };

  return (
    <div className="flex gap-6 h-[calc(100vh-10rem)]">
      {/* Master list */}
      <div className="w-80 shrink-0 flex flex-col rounded-lg border bg-card shadow-sm">
        <div className="flex items-center justify-between border-b p-4">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <UsersIcon className="h-4 w-4" /> Asociados
          </h2>
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="mr-1 h-3.5 w-3.5" />
                Nuevo
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white">
              <DialogHeader>
                <DialogTitle>Nuevo Asociado</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2 ">
                <div className="space-y-2">
                  <Label>ChildClientID</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="J301370139"
                      className="font-mono"
                      value={newChildClientId}
                      onChange={(e) => setNewChildClientId(e.target.value.toUpperCase())}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      disabled={syncingFromBnc}
                      onClick={handleSyncFromBnc}
                      title="Consultar detalle en el BNC y sincronizar"
                    >
                      <RefreshCcw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Nombre</Label>
                  <Input
                    placeholder="Nombre del asociado"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Descripción</Label>
                  <Input
                    placeholder="Descripción opcional"
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline">Cerrar</Button>
                <Button type="button" onClick={handleCreate} disabled={creating}>
                  {creating ? "Guardando..." : "Guardar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <div className="flex-1 overflow-y-auto divide-y">
          {loading ? (
            <LoadingIndicator text="Cargando asociados..." />
          ) : items.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              No hay asociados registrados aún.
            </div>
          ) : (
            items.map((a) => (
              <button
                key={a.id}
                onClick={() => {
                  setSelected(a.id);
                  setEditName(a.name);
                  setEditDescription(a.description ?? "");
                }}
                className={cn(
                  "w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors",
                  selected === a.id && "bg-primary/5 border-l-2 border-l-primary",
                )}
              >
                <p className="text-sm font-medium text-foreground">{a.name}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground">
                    {a.childClientId}
                  </span>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "text-[10px]",
                      a.isActive
                        ? "bg-success/10 text-success"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {a.isActive ? "Activo" : "Inactivo"}
                  </Badge>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Detail */}
      <div className="flex-1 rounded-lg border bg-card shadow-sm flex flex-col">
        {selectedAssoc ? (
          <>
            <div className="flex items-center justify-between border-b p-4">
              <div>
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Building className="h-4 w-4" /> Asociado {selectedAssoc.name}
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {selectedAssoc.childClientId}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleDisableInBnc}
                  disabled={disabling}
                >
                  {disabling ? "Deshabilitando..." : "Deshabilitar en BNC"}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  onClick={handleDelete}
                  title="Eliminar asociado de la base de datos"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-4">
              <div className="space-y-1">
                <Label>Nombre</Label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Nombre del asociado"
                />
              </div>
              <div className="space-y-1">
                <Label>Descripción</Label>
                <Input
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Descripción opcional"
                />
              </div>
              <div className="pt-2">
                <Button type="button" onClick={handleUpdate} disabled={updating}>
                  {updating ? "Guardando cambios..." : "Guardar cambios"}
                </Button>
              </div>
              <div className="pt-4 border-t">
                <p className="text-xs text-muted-foreground">
                  La administración de sucursales individuales (Branches) se realiza desde otros
                  formularios específicos. Aquí controlas solo el asociado principal y su estado.
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground gap-2">
            <Building className="h-10 w-10 opacity-30" />
            <p className="text-sm">Selecciona un asociado para ver sus sucursales</p>
          </div>
        )}
      </div>
    </div>
  );
}

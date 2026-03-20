import { useEffect, useState } from "react";
import { Shield, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { listAuditLogs, type AuditLog } from "@/services/auditLogs";
import { useToast } from "@/hooks/use-toast";

export default function AuditLogsPage() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [usernamesFilter, setUsernamesFilter] = useState<string[]>([]);
  const [contextsFilter, setContextsFilter] = useState<string[]>([]);
  const [actionsFilter, setActionsFilter] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}-01`;
  });
  const [endDate, setEndDate] = useState(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    return `${y}-${m}-${String(lastDay).padStart(2, "0")}`;
  });

  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const usernameParam = usernamesFilter.length === 1 ? usernamesFilter[0] : undefined;
      const contextParam = contextsFilter.length === 1 ? contextsFilter[0] : undefined;
      const actionParam = actionsFilter.length === 1 ? actionsFilter[0] : undefined;
      const res = await listAuditLogs({
        page,
        pageSize,
        username: usernameParam,
        context: contextParam,
        action: actionParam,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        withTotal: true,
      });
      let items = res.items ?? [];
      // Si hay múltiples usuarios o múltiples acciones seleccionadas, filtramos en frontend
      if (usernamesFilter.length > 1) {
        items = items.filter((log) =>
          log.username ? usernamesFilter.includes(log.username) : false,
        );
      }
      if (contextsFilter.length > 1) {
        items = items.filter((log) => contextsFilter.includes(log.context));
      }
      if (actionsFilter.length > 1) {
        items = items.filter((log) => actionsFilter.includes(log.action));
      }
      setLogs(items);
      if (
        usernamesFilter.length > 1 ||
        contextsFilter.length > 1 ||
        actionsFilter.length > 1
      ) {
        setTotal(items.length);
        setTotalPages(Math.max(1, Math.ceil(items.length / pageSize)));
      } else {
        setTotal(res.total ?? items.length);
        setTotalPages(Math.max(1, res.totalPages ?? 1));
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "No se pudieron cargar los registros de auditoría.";
      toast({
        title: "Error al cargar auditoría",
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
  }, [page, pageSize, usernamesFilter, contextsFilter, actionsFilter, startDate, endDate]);

  const formatDateTime = (value: string) => {
    if (!value) return "";
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return value;
    return dt.toLocaleString("es-VE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  return (
    <div className="space-y-4">
      <Card className="border shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-primary" />
            Auditoría de acciones de usuario
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Usuarios</p>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between bg-white text-[11px]"
                  >
                    {usernamesFilter.length === 0
                      ? "Todos los usuarios"
                      : usernamesFilter.join(", ")}
                    <Search className="h-3.5 w-3.5 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 bg-white p-2 shadow-lg">
                  <div className="max-h-48 overflow-auto space-y-1">
                    {Array.from(new Set(logs.map((l) => l.username).filter(Boolean))).map(
                      (name) => (
                        <label
                          key={String(name)}
                          className="flex items-center gap-2 rounded px-2 py-1 text-[11px] hover:bg-muted cursor-pointer"
                        >
                          <Checkbox
                            className="h-3 w-3"
                            checked={usernamesFilter.includes(String(name))}
                            onCheckedChange={(checked) => {
                              const value = String(name);
                              setUsernamesFilter((prev) =>
                                checked
                                  ? [...prev, value]
                                  : prev.filter((u) => u !== value),
                              );
                            }}
                          />
                          <span>{name}</span>
                        </label>
                      ),
                    )}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Contextos</p>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between bg-white text-[11px]"
                  >
                    {contextsFilter.length === 0
                      ? "Todos los contextos"
                      : contextsFilter.join(", ")}
                    <Search className="h-3.5 w-3.5 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 bg-white p-2 shadow-lg">
                  <div className="max-h-56 overflow-auto space-y-1">
                    {Array.from(new Set(logs.map((l) => l.context))).map((ctx) => (
                        <label
                          key={ctx}
                          className="flex items-center gap-2 rounded px-2 py-1 text-[11px] hover:bg-muted cursor-pointer"
                        >
                        <Checkbox
                          className="h-3 w-3"
                          checked={contextsFilter.includes(ctx)}
                          onCheckedChange={(checked) => {
                            setContextsFilter((prev) =>
                              checked ? [...prev, ctx] : prev.filter((c) => c !== ctx),
                            );
                          }}
                        />
                        <span>{ctx}</span>
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Acciones</p>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full justify-between bg-white text-[11px] font-mono"
                  >
                    {actionsFilter.length === 0
                      ? "Todas las acciones"
                      : actionsFilter.join(", ")}
                    <Search className="h-3.5 w-3.5 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 bg-white p-2 shadow-lg">
                  <div className="max-h-48 overflow-auto space-y-1">
                    {[
                      "VIEW",
                      "CREATE",
                      "UPDATE",
                      "DELETE",
                      "PAYMENT_EXECUTED",
                      "SYNC_EXECUTED",
                      "STATUS_QUERY",
                      "NAVIGATE",
                    ].map((action) => (
                      <label
                        key={action}
                        className="flex items-center gap-2 rounded px-2 py-1 text-[11px] hover:bg-muted cursor-pointer"
                      >
                        <Checkbox
                          className="h-3 w-3"
                          checked={actionsFilter.includes(action)}
                          onCheckedChange={(checked) => {
                            setActionsFilter((prev) =>
                              checked
                                ? [...prev, action]
                                : prev.filter((a) => a !== action),
                            );
                          }}
                        />
                        <span className="font-mono">{action}</span>
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1 grid grid-cols-2 gap-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Desde</p>
                <Input
                  type="date"
                  className="bg-white"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Hasta</p>
                <Input
                  type="date"
                  className="bg-white"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Los filtros se aplican automáticamente; ya no necesitamos botón explícito */}

          <div className="rounded-lg border bg-card shadow-sm overflow-auto">
            {loading ? (
              <LoadingIndicator text="Cargando registros de auditoria..." />
            ) : logs.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No hay registros de auditoría para los filtros actuales.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                      Fecha
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                      Usuario
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                      Contexto
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                      Acción
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                      Descripción
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-3 py-2 text-xs text-foreground whitespace-nowrap">
                        {formatDateTime(log.createdAt)}
                      </td>
                      <td className="px-3 py-2 text-xs text-foreground whitespace-nowrap">
                        <span className="font-mono">
                          {log.username ?? `#${log.userId ?? "-"}`}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs text-foreground">
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {log.context}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-foreground">
                        <Badge variant="secondary" className="text-[10px]">
                          {log.action}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-foreground">
                        {log.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex items-center justify-between pt-2">
            <p className="text-xs text-muted-foreground">
              {total > 0
                ? `Mostrando página ${page} de ${totalPages} (${total} registros)`
                : "Sin registros"}
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-3 py-1 shrink-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground min-w-[80px] text-center">
                Página {page} de {totalPages}
              </span>
              <Button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 h-8 px-3 py-1 shrink-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


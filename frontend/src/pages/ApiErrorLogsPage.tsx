import { useEffect, useState } from "react";
import { AlertTriangle, Search, Eye } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import { listApiErrorLogs, getApiErrorLog, type ApiErrorLog } from "@/services/errorLogs";
import { useToast } from "@/hooks/use-toast";

export default function ApiErrorLogsPage() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<ApiErrorLog[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [contextFilter, setContextFilter] = useState("");
  const [loading, setLoading] = useState(false);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState<ApiErrorLog | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await listApiErrorLogs({
        page,
        pageSize,
        context: contextFilter || undefined,
      });
      setLogs(res.items ?? []);
      setTotal(res.total ?? 0);
      setTotalPages(Math.max(1, res.totalPages ?? 1));
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "No se pudieron cargar los logs de errores de la API.";
      toast({
        title: "Error al cargar logs",
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
  }, [page, pageSize]);

  const handleApplyFilter = () => {
    setPage(1);
    void load();
  };

  const handleOpenDetail = async (log: ApiErrorLog) => {
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const full = await getApiErrorLog(log.id);
      setSelectedLog(full);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : "No se pudo obtener el detalle del log.";
      toast({
        title: "Error al cargar detalle",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setDetailLoading(false);
    }
  };

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
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Log de errores de la API
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1 min-w-[240px] flex-1">
              <p className="text-xs font-medium text-muted-foreground">
                Filtrar por contexto
              </p>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  className="pl-8 bg-white"
                  placeholder="Ej: p2p, account/p2p-simple..."
                  value={contextFilter}
                  onChange={(e) => setContextFilter(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleApplyFilter();
                    }
                  }}
                />
              </div>
            </div>
            <Button type="button" onClick={handleApplyFilter} disabled={loading}>
              Aplicar filtro
            </Button>
          </div>

          <div className="rounded-lg border bg-card shadow-sm overflow-auto">
            {loading ? (
              <LoadingIndicator text="Cargando logs de errores..." />
            ) : logs.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                No hay registros de errores para los filtros actuales.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                      Fecha
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                      Contexto
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                      Mensaje
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-muted-foreground">
                      Detalle
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-3 py-2 text-xs text-foreground whitespace-nowrap">
                        {formatDateTime(log.createdAt)}
                      </td>
                      <td className="px-3 py-2 text-xs text-foreground">
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {log.context}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs text-foreground">
                        {log.message}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          onClick={() => handleOpenDetail(log)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
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
                size="sm"
                variant="outline"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-3xl bg-white">
          <DialogHeader>
            <DialogTitle>Detalle de error</DialogTitle>
          </DialogHeader>
          {detailLoading || !selectedLog ? (
            <LoadingIndicator text="Cargando detalle..." />
          ) : (
            <div className="space-y-3 text-xs">
              <div>
                <p className="font-semibold text-foreground">Contexto</p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  {selectedLog.context}
                </p>
              </div>
              <div>
                <p className="font-semibold text-foreground">Mensaje</p>
                <p className="text-muted-foreground">{selectedLog.message}</p>
              </div>
              {selectedLog.name && (
                <div>
                  <p className="font-semibold text-foreground">Nombre</p>
                  <p className="text-muted-foreground">{selectedLog.name}</p>
                </div>
              )}
              {selectedLog.stack && (
                <div>
                  <p className="font-semibold text-foreground">Stack trace</p>
                  <pre className="mt-1 max-h-64 overflow-auto rounded bg-muted p-2 text-[11px] text-muted-foreground whitespace-pre-wrap">
                    {selectedLog.stack}
                  </pre>
                </div>
              )}
              {selectedLog.extra && (
                <div>
                  <p className="font-semibold text-foreground">Extra</p>
                  <pre className="mt-1 max-h-64 overflow-auto rounded bg-muted p-2 text-[11px] text-muted-foreground whitespace-pre-wrap">
                    {JSON.stringify(selectedLog.extra, null, 2)}
                  </pre>
                </div>
              )}
              <div>
                <p className="font-semibold text-foreground">Fecha</p>
                <p className="text-muted-foreground">
                  {formatDateTime(selectedLog.createdAt)}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}


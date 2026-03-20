import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, X, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listTransactions } from "@/services/transactions";
import { syncTransactions, loginSimple, getWorkingKeyFromLoginResponse } from "@/services/account";
import { listBankAccounts, type BankAccount } from "@/services/bankAccounts";
import { useToast } from "@/hooks/use-toast";

type TransactionRow = {
  id: number;
  movementDate: string;
  controlNumber: string;
  accountNumber: string;
  amount: number;
  movementType: string;
  direction: string;
  references: string;
  description: string;
  operationType: string;
  transactionTypeLabel: string;
   userLabel: string;
};

export default function TransactionsPage() {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [search, setSearch] = useState("");
  const [directionFilter, setDirectionFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [transactionTypeFilter, setTransactionTypeFilter] = useState("all");
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
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncAccountNumber, setSyncAccountNumber] = useState("");
  const [syncStartDate, setSyncStartDate] = useState("");
  const [syncEndDate, setSyncEndDate] = useState("");
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSuccessCount, setSyncSuccessCount] = useState<number | null>(null);
  const [bankAccountsForSync, setBankAccountsForSync] = useState<BankAccount[]>([]);
  const [bankAccountsLoading, setBankAccountsLoading] = useState(false);

  // Para mostrar la moneda real del monto (Bs/USD/EUR) en la tabla de transacciones
  const [bankAccountsForCurrency, setBankAccountsForCurrency] = useState<BankAccount[]>([]);
  const [bankAccountsForCurrencyLoading, setBankAccountsForCurrencyLoading] = useState(false);

  const getCurrencyLabel = (currency?: string) => {
    if (!currency || currency === "VES") return "Bs";
    return currency;
  };

  const getCurrencyForAccountNumber = (accountNumber: string) => {
    const match = bankAccountsForCurrency.find((a) => a.accountNumber === accountNumber);
    return match?.currency ?? "VES";
  };

  const openSyncModal = () => {
    setSyncError(null);
    setSyncSuccessCount(null);
    setSyncAccountNumber("");
    if (!syncStartDate || !syncEndDate) {
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, "0");
      const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
      setSyncStartDate(`${y}-${m}-01`);
      setSyncEndDate(`${y}-${m}-${String(lastDay).padStart(2, "0")}`);
    }
    setSyncModalOpen(true);
  };

  useEffect(() => {
    if (!syncModalOpen) return;
    let cancelled = false;
    setBankAccountsLoading(true);
    listBankAccounts()
      .then((list) => {
        if (!cancelled) setBankAccountsForSync(list ?? []);
      })
      .catch(() => {
        if (!cancelled) setBankAccountsForSync([]);
      })
      .finally(() => {
        if (!cancelled) setBankAccountsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [syncModalOpen]);

  const handleSyncSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!syncAccountNumber.trim() || !syncStartDate || !syncEndDate) {
      setSyncError("Selecciona cuenta y rango de fechas.");
      return;
    }
    const start = new Date(syncStartDate);
    const end = new Date(syncEndDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      setSyncError("Fechas inválidas. Verifica fecha inicio y fecha fin.");
      return;
    }
    if (end < start) {
      setSyncError("La fecha fin no puede ser menor que la fecha inicio.");
      return;
    }
    const diffMs = end.getTime() - start.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays > 31) {
      setSyncError("Solo puedes sincronizar un rango máximo de 31 días.");
      return;
    }
    setSyncLoading(true);
    setSyncError(null);
    setSyncSuccessCount(null);
    try {
      const loginRes = await loginSimple();
      const workingKey = getWorkingKeyFromLoginResponse(loginRes);
      const res = await syncTransactions({
        accountNumber: syncAccountNumber.trim(),
        startDate: syncStartDate,
        endDate: syncEndDate,
        workingKey,
      });
      setSyncSuccessCount(res.syncedCount);
      setSyncModalOpen(false);
      toast({
        title: "Sincronización completa",
        description: `Se sincronizaron ${res.syncedCount} transacciones (BNC devolvió ${res.totalFromBnc}).`,
        className:
          "border-green-500 bg-green-50 text-green-900 dark:bg-green-900/30 dark:text-green-50",
      });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error al sincronizar.";
      setSyncError(msg);
    } finally {
      setSyncLoading(false);
    }
  };

  useEffect(() => {
    setPage(1);
  }, [search, directionFilter, accountFilter, transactionTypeFilter, startDate, endDate]);

  useEffect(() => {
    let cancelled = false;
    setBankAccountsForCurrencyLoading(true);
    listBankAccounts()
      .then((list) => {
        if (cancelled) return;
        setBankAccountsForCurrency(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (cancelled) return;
        setBankAccountsForCurrency([]);
      })
      .finally(() => {
        if (cancelled) return;
        setBankAccountsForCurrencyLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const term = search.trim().toLowerCase();
        const needsFullScan = term.length > 0;

        let allItems: any[] = [];
        let data: Awaited<ReturnType<typeof listTransactions>>;

        if (needsFullScan) {
          // Cuando hay búsqueda de texto, traemos todas las páginas que
          // correspondan a los filtros de backend (cuenta, rango de fechas)
          // y aplicamos la búsqueda en frontend sobre el conjunto completo.
          let currentPage = 1;
          const pageSizeForFetch = 200;
          const first = await listTransactions({
            page: currentPage,
            pageSize: pageSizeForFetch,
            accountNumber: accountFilter !== "all" ? accountFilter : undefined,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
            withTotal: true,
          });
          data = first;
          allItems = (first.items ?? []).slice();
          const totalPagesFromApi = Math.max(1, first.totalPages ?? 1);
          while (currentPage < totalPagesFromApi) {
            currentPage += 1;
            const next = await listTransactions({
              page: currentPage,
              pageSize: pageSizeForFetch,
              accountNumber: accountFilter !== "all" ? accountFilter : undefined,
              startDate: startDate || undefined,
              endDate: endDate || undefined,
              withTotal: false,
            });
            if (!next.items || next.items.length === 0) break;
            allItems = allItems.concat(next.items);
          }
        } else {
          // Sin búsqueda de texto, usamos paginación normal del backend
          data = await listTransactions({
            page,
            pageSize,
            accountNumber: accountFilter !== "all" ? accountFilter : undefined,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
            withTotal: true,
          });
          allItems = data.items ?? [];
        }

        const rows: TransactionRow[] = allItems.map((item: any, index: number) => {
          const user = item.user as
            | {
                id?: number;
                username?: string;
                firstName?: string;
                lastName?: string;
                email?: string;
              }
            | null
            | undefined;

          let userLabel = "API";
          if (user) {
            if (user.firstName || user.lastName) {
              userLabel = `${(user.firstName ?? "").toString().trim()} ${(user.lastName ?? "")
                .toString()
                .trim()}`.trim();
            } else if (user.username) {
              userLabel = user.username;
            } else if (user.email) {
              userLabel = user.email;
            }
          }

          return {
            id: item.id ?? index,
            movementDate: item.movementDate ?? "",
            controlNumber: item.controlNumber ?? "",
            accountNumber: item.accountNumber ?? "",
            amount:
              typeof item.amount === "number" ? item.amount : Number(item.amount ?? 0),
            movementType: item.type ?? "",
            direction: item.balanceDelta ?? "",
            references: [
              item.referenceA,
              item.referenceB,
              item.referenceC,
              item.referenceD,
            ]
              .filter((x: unknown) => typeof x === "string" && x.trim().length > 0)
              .join(" • "),
            description: item.concept ?? "",
            operationType: item.operationType ?? "",
            transactionTypeLabel: item.transactionTypeLabel ?? "",
            userLabel,
          };
        });
        setTransactions(rows);

        if (needsFullScan) {
          // Cuando buscamos en todas las páginas, el total relevante para la UI
          // es el número de filas después del filtrado en memoria.
          setTotal(rows.length);
          setTotalPages(Math.max(1, Math.ceil(rows.length / pageSize)));
        } else {
          setTotal(data.total ?? rows.length);
          setTotalPages(Math.max(1, data.totalPages ?? 1));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error al cargar las transacciones.";
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [page, pageSize, search, directionFilter, accountFilter, transactionTypeFilter, startDate, endDate, refreshKey]);

  // Devuelve una llave de fecha normalizada 'YYYY-MM-DD' a partir de movementDate,
  // evitando problemas de zona horaria al trabajar siempre con la parte de fecha.
  const getMovementDateKey = (value: string): string | null => {
    if (!value || typeof value !== "string") return null;
    const trimmed = value.trim();
    const isoDateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoDateOnly) {
      const [, y, m, d] = isoDateOnly;
      return `${y}-${m}-${d}`;
    }
    // Fallback: intentar formatear cualquier fecha válida a YYYY-MM-DD
    const dt = new Date(trimmed);
    if (Number.isNaN(dt.getTime())) return null;
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const filteredTx = useMemo(() => {
    const term = search.trim().toLowerCase();

    // El backend ya devuelve las transacciones ordenadas por movementDate DESC,
    // externalOrder DESC, id DESC. Aquí solo aplicamos filtros adicionales
    // respetando ese orden original.
    return transactions.filter((tx) => {
      if (directionFilter !== "all" && tx.direction !== directionFilter) return false;
      if (accountFilter !== "all" && tx.accountNumber !== accountFilter) return false;
      if (transactionTypeFilter !== "all" && tx.transactionTypeLabel !== transactionTypeFilter) return false;
      if (term) {
        const haystack = [
          tx.movementDate,
          tx.controlNumber,
          tx.accountNumber,
          tx.amount?.toString(),
          tx.movementType,
          tx.direction,
          tx.operationType,
          tx.transactionTypeLabel,
          tx.references,
          tx.description,
          tx.userLabel,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [transactions, directionFilter, accountFilter, transactionTypeFilter, search, startDate, endDate]);

  const accountOptions = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((tx) => {
      if (tx.accountNumber) set.add(tx.accountNumber);
    });
    return Array.from(set);
  }, [transactions]);

  const directionOptions = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((tx) => {
      if (tx.direction) set.add(tx.direction);
    });
    return Array.from(set);
  }, [transactions]);

  const transactionTypeOptions = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach((tx) => {
      if (tx.transactionTypeLabel) set.add(tx.transactionTypeLabel);
    });
    return Array.from(set);
  }, [transactions]);

  const formatAmount = (value: number, currency?: string) => {
    const sign = value < 0 ? "-" : "";
    const abs = Math.abs(value);
    const numericPart = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(abs);
    const label = getCurrencyLabel(currency);
    return `${sign}${numericPart} ${label}`;
  };

  const handlePrint = (tx: TransactionRow) => {
    if (typeof window === "undefined") return;
    const w = window.open("", "_blank", "width=800,height=600");
    if (!w) return;

    const currencyLabel = getCurrencyLabel(getCurrencyForAccountNumber(tx.accountNumber));

    const dateStr = formatDateTime(tx.movementDate);
    const now = new Date();
    const printTime = now.toLocaleTimeString("es-VE", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    w.document.write(`
      <html>
        <head>
          <title>Comprobante de transacción</title>
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
              <div class="muted">Comprobante de transacción</div>
            </div>
            <div class="meta">
              <div><span class="label">Fecha:</span> ${dateStr}</div>
              <div><span class="label">Hora impresión:</span> ${printTime}</div>
              <div><span class="label">Usuario:</span> ${tx.userLabel || "-"}</div>
            </div>
          </div>

          <div class="section-title">Datos de la operación</div>
          <table>
            <tr>
              <th class="label">Fecha movimiento</th>
              <td class="value">${dateStr}</td>
            </tr>
            <tr>
              <th class="label">Nº Control</th>
              <td class="value">${tx.controlNumber || "-"}</td>
            </tr>
            <tr>
              <th class="label">Cuenta</th>
              <td class="value">${tx.accountNumber}</td>
            </tr>
            <tr>
              <th class="label">Dirección</th>
              <td>${tx.direction || "-"}</td>
            </tr>
            <tr>
              <th class="label">Monto</th>
              <td class="value">${tx.amount.toFixed(2)} ${currencyLabel}</td>
            </tr>
            <tr>
              <th class="label">Tipo transacción</th>
              <td>${tx.transactionTypeLabel || tx.movementType || "-"}</td>
            </tr>
          </table>

          <div class="section-title">Detalle</div>
          <table>
            <tr>
              <th class="label">Referencias</th>
              <td>${tx.references || "-"}</td>
            </tr>
            <tr>
              <th class="label">Concepto</th>
              <td>${tx.description || "-"}</td>
            </tr>
          </table>
        </body>
      </html>
    `);
    w.document.close();
    w.focus();
    w.print();
  };

  const formatDateTime = (value: string) => {
    if (!value) return "";
    // Usamos la misma lógica que parseMovementDate: tomamos solo la parte de fecha
    // para evitar desfaces por zona horaria (el backend envía UTC).
    const trimmed = value.trim();
    const isoDateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoDateOnly) {
      const [, y, m, d] = isoDateOnly;
      const date = new Date(Number(y), Number(m) - 1, Number(d));
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleDateString("es-VE", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        });
      }
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString("es-VE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  };

  // Filtros que aplicamos solo en frontend (además del rango de fechas que maneja el backend).
  // Si alguno de estos está activo, recalculamos totales a partir de filteredTx.
  const hasGlobalFilters =
    search.trim().length > 0 ||
    directionFilter !== "all" ||
    accountFilter !== "all" ||
    transactionTypeFilter !== "all";

  const displayTotal = hasGlobalFilters ? filteredTx.length : total;
  const displayTotalPages = hasGlobalFilters
    ? Math.max(1, Math.ceil(filteredTx.length / pageSize))
    : totalPages;
  const paginatedRows = hasGlobalFilters
    ? filteredTx.slice((page - 1) * pageSize, page * pageSize)
    : filteredTx;
  const startItem = displayTotal === 0 ? 0 : (page - 1) * pageSize + 1;
  const endItem = displayTotal === 0 ? 0 : Math.min(page * pageSize, displayTotal);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1 min-w-[240px] flex-1">
          <Label className="text-xs text-muted-foreground">Buscar por concepto o referencias</Label>
          <Input
            placeholder="Ej: pago proveedor, REF123..."
            className="bg-white"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Desde</Label>
          <Input
            type="date"
            className="w-40 bg-white"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Hasta</Label>
          <Input
            type="date"
            className="w-40 bg-white"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Dirección</Label>
          <Select value={directionFilter} onValueChange={setDirectionFilter}>
            <SelectTrigger className="w-32 bg-white"><SelectValue placeholder="Ingreso/Egreso" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {directionOptions.map((dir) => (
                <SelectItem key={dir} value={dir}>
                  {dir}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Cuenta</Label>
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="w-44 bg-white"><SelectValue placeholder="Todas las cuentas" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {accountOptions.map((acc) => (
                <SelectItem key={acc} value={acc}>{acc}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Tipo de transacción</Label>
          <Select value={transactionTypeFilter} onValueChange={setTransactionTypeFilter}>
            <SelectTrigger className="w-48 bg-white"><SelectValue placeholder="Todas" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {transactionTypeOptions.map((label) => (
                <SelectItem key={label} value={label}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="default" onClick={openSyncModal} className="shrink-0">
          <RefreshCw className="h-4 w-4 mr-2" />
          Sincronizar
        </Button>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-card shadow-sm overflow-auto">
        {loading && (
          <LoadingIndicator text="Cargando transacciones..." className="py-8" />
        )}
        {error && !loading && (
          <div className="py-4 px-4 text-sm text-destructive bg-destructive/10 border-b border-destructive/30">
            {error}
          </div>
        )}
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Fecha</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Nº Control</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Cuenta</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">Dirección</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Monto</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tipo transacción</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Referencias</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Concepto</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Usuario</th>
              <th className="px-4 py-3 text-center font-medium text-muted-foreground">Imprimir</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {paginatedRows.map((tx) => (
              <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 text-foreground">{formatDateTime(tx.movementDate)}</td>
                <td className="px-4 py-3 font-mono text-xs text-foreground">{tx.controlNumber}</td>
                <td className="px-4 py-3 font-mono text-xs text-foreground">{tx.accountNumber}</td>
                <td className="px-4 py-3 text-center text-xs text-foreground">
                  {tx.direction || "-"}
                </td>
                <td className="px-4 py-3 text-right font-mono font-semibold text-foreground">
                  {formatAmount(
                    tx.direction && tx.direction.toLowerCase().includes("egreso")
                      ? -tx.amount
                      : tx.amount,
                    getCurrencyForAccountNumber(tx.accountNumber),
                  )}
                </td>
              
                <td className="px-4 py-3 text-left text-xs text-foreground">
                  {tx.transactionTypeLabel || tx.movementType || "-"}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{tx.references}</td>
                <td className="px-4 py-3 text-muted-foreground">{tx.description}</td>
                <td className="px-4 py-3 text-xs text-foreground">
                  {tx.userLabel}
                </td>
                <td className="px-4 py-3 text-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handlePrint(tx)}
                  >
                    <Printer className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {displayTotal > 0
            ? `Mostrando ${startItem}-${endItem} de ${displayTotal} transacciones`
            : "No hay transacciones para los filtros actuales"}
        </p>
        <div className="flex items-center gap-2">
          <Button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 shrink-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground min-w-[80px] text-center">
            Página {page} de {displayTotalPages}
          </span>
          <Button
            disabled={page >= displayTotalPages}
            onClick={() => setPage((p) => Math.min(displayTotalPages, p + 1))}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 shrink-0"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Modal Sincronizar transacciones */}
      <Dialog open={syncModalOpen} onOpenChange={setSyncModalOpen}>
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle>Sincronizar transacciones</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Obtiene el historial del BNC para una cuenta y rango de fechas y lo guarda en la base de datos.
          </p>
          <form onSubmit={handleSyncSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="sync-account">Cuenta</Label>
              {bankAccountsLoading ? (
                <p className="text-sm text-muted-foreground py-2">Cargando cuentas…</p>
              ) : bankAccountsForSync.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">No hay cuentas registradas. Regístralas en Cuentas bancarias.</p>
              ) : (
                <Select
                  value={syncAccountNumber || ""}
                  onValueChange={setSyncAccountNumber}
                >
                  <SelectTrigger id="sync-account" className="bg-white">
                    <SelectValue placeholder="Selecciona una cuenta" />
                  </SelectTrigger>
                  <SelectContent>
                    {bankAccountsForSync.map((acc) => (
                      <SelectItem key={acc.id} value={acc.accountNumber}>
                        {acc.alias ? `${acc.alias} (${acc.accountNumber})` : acc.accountNumber}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sync-start">Fecha inicio</Label>
                <Input
                  id="sync-start"
                  type="date"
                  className="bg-white"
                  value={syncStartDate}
                  onChange={(e) => setSyncStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sync-end">Fecha fin</Label>
                <Input
                  id="sync-end"
                  type="date"
                  className="bg-white"
                  value={syncEndDate}
                  onChange={(e) => setSyncEndDate(e.target.value)}
                />
              </div>
            </div>
            {syncError && (
              <p className="text-sm text-destructive bg-destructive/10 p-2 rounded">{syncError}</p>
            )}
            {syncSuccessCount !== null && (
              <p className="text-sm text-green-600 bg-green-500/10 p-2 rounded">
                Se sincronizaron {syncSuccessCount} transacciones. La lista se actualizará en breve.
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSyncModalOpen(false)}
                disabled={syncLoading}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={syncLoading || bankAccountsForSync.length === 0 || !syncAccountNumber}
              >
                {syncLoading ? "Sincronizando…" : "Sincronizar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

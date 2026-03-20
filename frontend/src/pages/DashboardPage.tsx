import { DollarSign, ArrowLeftRight, Smartphone, CreditCard, TrendingUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { loginSimple, getWorkingKeyFromLoginResponse, balanceSimple } from "@/services/account";
import { listBankAccounts } from "@/services/bankAccounts";
import { listTransactions } from "@/services/transactions";
import { getDashboardHeartbeat } from "@/services/dashboard";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";

type AccountBalance = {
  accountNumber: string;
  currency?: string;
  balance: number;
};

type RecentTx = {
  id: number;
  date: string;
  type: string;
  amount: number;
  direction: string;
  accountNumber: string;
};

type TxStats = {
  p2pCount: number;
  c2pCount: number;
  vposCount: number;
  immediateCreditCount: number;
};

type DailyCurrencySummary = {
  dateKey: string;
  label: string;
  currency: string;
  totalAmount: number;
  accounts: { accountNumber: string; totalAmount: number }[];
};

const getCurrencyLabel = (currency?: string) => {
  if (!currency) return "";
  if (currency === "VES") return "Bs";
  return currency;
};

function getHeartbeatIntervalMs(): number {
  const raw = import.meta.env.VITE_DASHBOARD_HEARTBEAT_MS;
  const parsed = Number(raw);
  // Permitimos entre 5s y 5min; fallback 45s.
  if (Number.isFinite(parsed) && parsed >= 5_000 && parsed <= 300_000) {
    return parsed;
  }
  return 45_000;
}

export default function DashboardPage() {
  const heartbeatIntervalMs = getHeartbeatIntervalMs();
  const [accountBalances, setAccountBalances] = useState<AccountBalance[]>([]);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [recentTx, setRecentTx] = useState<RecentTx[]>([]);
  const [loadingRecentTx, setLoadingRecentTx] = useState(false);
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
  const [todayTxCount, setTodayTxCount] = useState(0);
  const [yesterdayTxCount, setYesterdayTxCount] = useState(0);
  const [txStats, setTxStats] = useState<TxStats>({
    p2pCount: 0,
    c2pCount: 0,
    vposCount: 0,
    immediateCreditCount: 0,
  });
  const [dailySummaries, setDailySummaries] = useState<DailyCurrencySummary[]>([]);
  const [selectedCurrency, setSelectedCurrency] = useState<"VES" | "USD">("VES");
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [heartbeatWatermark, setHeartbeatWatermark] = useState<string | null>(null);
  const hasLoadedRecentRef = useRef(false);
  const [accountAliasMap, setAccountAliasMap] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const accounts = await listBankAccounts();
        if (cancelled) return;
        const nextMap: Record<string, string> = {};
        for (const account of accounts) {
          const accountNumber = account.accountNumber?.trim();
          const alias = account.alias?.trim();
          if (accountNumber && alias) {
            nextMap[accountNumber] = alias;
          }
        }
        setAccountAliasMap(nextMap);
      } catch {
        if (!cancelled) setAccountAliasMap({});
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const getDateKeyAndLabel = (raw: string): { dateKey: string; label: string } | null => {
    if (!raw) return null;
    const trimmed = String(raw).trim();
    const isoDateOnly = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoDateOnly) {
      const [, y, m, d] = isoDateOnly;
      return { dateKey: `${y}-${m}-${d}`, label: `${d}/${m}` };
    }
    const dt = new Date(trimmed);
    if (Number.isNaN(dt.getTime())) return null;
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, "0");
    const d = String(dt.getDate()).padStart(2, "0");
    return { dateKey: `${y}-${m}-${d}`, label: `${d}/${m}` };
  };

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoadingBalances(true);
      try {
        // loginSimple once to obtain workingKey
        const loginRes = await loginSimple();
        const wk = getWorkingKeyFromLoginResponse(loginRes);

        // Call balanceSimple without accountNumber to get all accounts returned by the API
        const res = await balanceSimple({ workingKey: wk });
        const decrypted = (res as any).decrypted ?? {};
        const entries = Object.entries(decrypted || {});

        if (entries.length === 0) {
          toast({ title: "Cuentas", description: "No se obtuvieron cuentas desde la API BNC." });
          setAccountBalances([]);
          return;
        }

        const balances: AccountBalance[] = [];
        for (const [accountNumber, info] of entries) {
          try {
            const maybe = info as any;
            const balanceVal = maybe?.Balance ?? maybe?.balance ?? maybe?.Amount ?? maybe?.amount;
            const currency = maybe?.CurrencyCode ?? maybe?.currency ?? maybe?.Currency ?? maybe?.moneda ?? "VES";
            const num = typeof balanceVal === "number" ? balanceVal : Number(String(balanceVal).replace(/[^0-9.-]+/g, ""));
            if (!Number.isFinite(num)) {
              throw new Error("Saldo inválido");
            }
            balances.push({
              accountNumber,
              currency,
              balance: num,
            });
          } catch (e: any) {
            const msg = e?.message ?? String(e);
            toast({ title: `Cuenta ${accountNumber}`, description: `Error al parsear saldo: ${msg}`, variant: "destructive" });
          }
        }

        if (!mounted) return;
        setAccountBalances(balances);
      } catch (err: any) {
        toast({ title: "Dashboard", description: err?.message ?? String(err), variant: "destructive" });
      } finally {
        if (mounted) setLoadingBalances(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadRecent = async () => {
      const shouldShowSkeleton = !hasLoadedRecentRef.current;
      if (shouldShowSkeleton) {
        setLoadingRecentTx(true);
      }
      try {
        let allItems: any[] = [];

        // Usamos el filtro de fechas del backend (startDate/endDate inclusivos)
        // y pedimos solo esta ventana de tiempo. Como el backend ya devuelve
        // total/totalPages, iteramos páginas si hace falta.
        let currentPage = 1;
        const pageSizeForFetch = 200;
        const first = await listTransactions({
          page: currentPage,
          pageSize: pageSizeForFetch,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          withTotal: true,
        });
        allItems = (first.items ?? []).slice();

        const totalPagesFromApi = Math.max(1, first.totalPages ?? 1);
        while (currentPage < totalPagesFromApi) {
          currentPage += 1;
          const next = await listTransactions({
            page: currentPage,
            pageSize: pageSizeForFetch,
            startDate: startDate || undefined,
            endDate: endDate || undefined,
            withTotal: false,
          });
          if (!next.items || next.items.length === 0) break;
          allItems = allItems.concat(next.items);
        }

        // calcular cuántas transacciones son de "hoy" y "ayer"
        // - Si endDate pertenece al mes/año actual -> usar la fecha actual como "hoy".
        // - Si endDate está en otro mes/año -> usar endDate como "hoy" lógico del dashboard.
        const realToday = new Date();
        let refToday = realToday;
        if (endDate) {
          const [eyStr, emStr, edStr] = endDate.split("-");
          const ey = Number(eyStr);
          const em = Number(emStr) - 1; // 0-based
          const ed = Number(edStr);
          if (!Number.isNaN(ey) && em >= 0 && !Number.isNaN(ed)) {
            const endDt = new Date(ey, em, ed);
            if (
              endDt.getFullYear() === realToday.getFullYear() &&
              endDt.getMonth() === realToday.getMonth()
            ) {
              // mismo mes/año actual -> mantener "hoy" real
              refToday = realToday;
            } else {
              // otro mes/año -> usar endDate como "hoy" del dashboard
              refToday = endDt;
            }
          }
        }

        const y = refToday.getFullYear();
        const m = refToday.getMonth();
        const d = refToday.getDate();
        const yesterday = new Date(refToday);
        yesterday.setDate(refToday.getDate() - 1);
        const yY = yesterday.getFullYear();
        const mY = yesterday.getMonth();
        const dY = yesterday.getDate();

        let todayCount = 0;
        let yesterdayCount = 0;
        let p2pCount = 0;
        let c2pCount = 0;
        let vposCount = 0;
        let immediateCreditCount = 0;

        // mapa auxiliar para moneda por cuenta
        const accountCurrency = new Map<string, string>();
        accountBalances.forEach((a) => {
          accountCurrency.set(a.accountNumber, a.currency ?? "VES");
        });

        // mapa para resúmenes diarios por moneda
        const summaryMap = new Map<string, DailyCurrencySummary>();

        const inRangeItems: any[] = [];

        for (const item of allItems) {
          if (!item.movementDate) continue;
          const parsed = getDateKeyAndLabel(item.movementDate);
          if (!parsed) continue;
          const { dateKey, label } = parsed;

          // Aplicar filtro de rango de fechas del Dashboard si está definido
          if (startDate && dateKey < startDate) continue;
          if (endDate && dateKey > endDate) continue;

          inRangeItems.push(item);

          const [py, pm, pd] = dateKey.split("-").map((v) => Number(v));
          const isToday = py === y && pm === m + 1 && pd === d;
          const isYesterday = py === yY && pm === mY + 1 && pd === dY;

          if (isToday) todayCount += 1;
          if (isYesterday) yesterdayCount += 1;

          const labelType = (item.transactionTypeLabel || item.type || "").toUpperCase();
          if (labelType.includes("P2P")) p2pCount += 1;
          if (labelType.includes("C2P")) c2pCount += 1;
          if (labelType.includes("VPOS")) vposCount += 1;
          if (labelType.includes("CRÉDITO INMEDIATO") || labelType.includes("CREDITO INMEDIATO")) {
            immediateCreditCount += 1;
          }

          // construir resúmenes por día/moneda
          const accountNumber = item.accountNumber ?? "Sin cuenta";
          const currency = accountCurrency.get(accountNumber) ?? "VES";

          const rawAmount =
            typeof item.amount === "number" ? item.amount : Number(item.amount ?? 0);
          const isEgreso = (item.balanceDelta ?? "").toLowerCase().includes("egreso");
          const signedAmount = isEgreso ? -rawAmount : rawAmount;
          if (!Number.isFinite(signedAmount)) continue;

          const summaryKey = `${currency}|${dateKey}`;
          let summary = summaryMap.get(summaryKey);
          if (!summary) {
            summary = {
              dateKey,
              label,
              currency,
              totalAmount: 0,
              accounts: [],
            };
            summaryMap.set(summaryKey, summary);
          }
          summary.totalAmount += signedAmount;

          const accEntry =
            summary.accounts.find((a) => a.accountNumber === accountNumber) ??
            (() => {
              const created = { accountNumber, totalAmount: 0 };
              summary!.accounts.push(created);
              return created;
            })();
          accEntry.totalAmount += signedAmount;
        }

        // El backend ya devuelve las transacciones ordenadas (movementDate DESC,
        // externalOrder DESC, id DESC). Tomamos simplemente las primeras 5 dentro
        // del rango filtrado para "Últimas transacciones".
        const items = inRangeItems
          .slice(0, 5)
          .map((item, idx) => ({
            id: item.id ?? idx,
            date: item.movementDate ?? "",
            type: item.transactionTypeLabel || item.type || "",
            amount: typeof item.amount === "number" ? item.amount : Number(item.amount ?? 0),
            direction: item.balanceDelta ?? "",
            accountNumber: item.accountNumber ?? "",
          }));
        if (!cancelled) {
          setRecentTx(items);
          setTodayTxCount(todayCount);
          setYesterdayTxCount(yesterdayCount);
          setTxStats({
            p2pCount,
            c2pCount,
            vposCount,
            immediateCreditCount,
          });
          setDailySummaries(Array.from(summaryMap.values()));
          hasLoadedRecentRef.current = true;
        }
      } catch (err: any) {
        if (!cancelled) {
          toast({
            title: "Transacciones",
            description: err?.message ?? "Error al cargar las últimas transacciones.",
            variant: "destructive",
          });
        }
      } finally {
        if (!cancelled) {
          setLoadingRecentTx(false);
        }
      }
    };

    void loadRecent();

    return () => {
      cancelled = true;
    };
  }, [accountBalances, startDate, endDate]);

  // Heartbeat: usa watermark/since para detectar cambios sin recargas pesadas.
  useEffect(() => {
    let timerId: number | undefined;

    const tick = async () => {
      try {
        if (typeof document !== "undefined" && document.visibilityState === "hidden") {
          // Si la pestaña no está visible, reprogramar más adelante sin llamar al servidor.
          timerId = window.setTimeout(tick, heartbeatIntervalMs);
          return;
        }
        const hb = await getDashboardHeartbeat({
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          recentPageSize: 5,
          since: heartbeatWatermark ?? undefined,
        });

        if (hb.updated) {
          setHeartbeatWatermark(hb.watermark ?? null);
          const mappedRecent = (hb.recentTx ?? []).slice(0, 5).map((item, idx) => ({
            id: item.id ?? idx,
            date: item.movementDate ?? "",
            type: item.transactionTypeLabel || item.type || "",
            amount: typeof item.amount === "number" ? item.amount : Number(item.amount ?? 0),
            direction: item.balanceDelta ?? "",
            accountNumber: item.accountNumber ?? "",
          }));
          setRecentTx(mappedRecent);
          setTodayTxCount(Number(hb.todayTxCount ?? 0));
          setYesterdayTxCount(Number(hb.yesterdayTxCount ?? 0));
          setTxStats({
            p2pCount: Number(hb.txStats?.p2pCount ?? 0),
            c2pCount: Number(hb.txStats?.c2pCount ?? 0),
            vposCount: Number(hb.txStats?.vposCount ?? 0),
            immediateCreditCount: Number(hb.txStats?.immediateCreditCount ?? 0),
          });
        } else {
          // updated=false: no recargas pesadas adicionales.
          if (hb.watermark) {
            setHeartbeatWatermark(hb.watermark);
          }
        }
      } finally {
        timerId = window.setTimeout(tick, heartbeatIntervalMs);
      }
    };

    // Ejecuta de inmediato al entrar al dashboard y luego mantiene el polling.
    void tick();

    return () => {
      if (timerId !== undefined) {
        window.clearTimeout(timerId);
      }
    };
  }, [startDate, endDate, heartbeatIntervalMs, heartbeatWatermark]);


  const formatNumber = (v: number) => {
    // Formato: miles con "," y decimales con "."
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v);
  };

  // Format for totals: thousands = '.' and decimal = ',' (e.g. 1.234.567,89)
  const formatTotals = (v: number) => {
    // Formato: miles con "," y decimales con "."
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v);
  };

  const formatRecentAmount = (amount: number, direction: string, currency?: string) => {
    const isEgreso = direction && direction.toLowerCase().includes("egreso");
    const value = isEgreso ? -amount : amount;
    const sign = value < 0 ? "-" : "";
    const abs = Math.abs(value);
    const numericPart = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(abs);
    const label = getCurrencyLabel(currency) || "Bs";
    return `${sign}${numericPart} ${label}`;
  };
  const totalsByCurrency = accountBalances.reduce((acc, a) => {
    const cur = a.currency ?? "VES";
    acc[cur] = (acc[cur] || 0) + (Number.isFinite(a.balance) ? a.balance : 0);
    return acc;
  }, {} as Record<string, number>);
  // Ensure VES and USD keys exist so the columns render in a stable order
  totalsByCurrency["VES"] = totalsByCurrency["VES"] ?? 0;
  totalsByCurrency["USD"] = totalsByCurrency["USD"] ?? 0;

  const currencyOrder = ["VES", "USD"];
  const displayCurrencies = [
    ...currencyOrder,
    ...Object.keys(totalsByCurrency).filter((c) => !currencyOrder.includes(c)),
  ];

  const todayVsYesterdayLabel = (() => {
    if (yesterdayTxCount <= 0) return "0%";
    const diff = todayTxCount - yesterdayTxCount;
    const pct = (diff / yesterdayTxCount) * 100;
    const rounded = Math.round(pct * 10) / 10;
    const sign = rounded > 0 ? "+" : "";
    return `${sign}${rounded}%`;
  })();

  // Construye el dataset para la gráfica según moneda seleccionada,
  // incluyendo solo los días dentro del rango filtrado.
  const chartDataForSelectedCurrency = (() => {
    const summariesByKey = new Map<string, DailyCurrencySummary>();
    dailySummaries
      .filter((d) => d.currency === selectedCurrency)
      .forEach((d) => {
        summariesByKey.set(d.dateKey, d);
      });

    const data: { day: string; monto: number; dateKey: string }[] = [];
    if (!startDate || !endDate || startDate > endDate) {
      // Sin rango válido, devolvemos lo que haya en summaries (ordenado)
      summariesByKey.forEach((summary, dateKey) => {
        data.push({
          day: summary.label,
          monto: summary.totalAmount,
          dateKey,
        });
      });
      data.sort((a, b) => (a.dateKey < b.dateKey ? -1 : a.dateKey > b.dateKey ? 1 : 0));
      return data;
    }

    let cursor = startDate;
    while (cursor <= endDate) {
      const [yStr, mStr, dStr] = cursor.split("-");
      const dd = dStr;
      const mm = mStr;
      const dateKey = cursor;
      const summary = summariesByKey.get(dateKey);
      data.push({
        day: `${dd}/${mm}`,
        monto: summary ? summary.totalAmount : 0,
        dateKey,
      });

      // avanzar un día
      const dt = new Date(Number(yStr), Number(mStr) - 1, Number(dStr));
      dt.setDate(dt.getDate() + 1);
      const ny = dt.getFullYear();
      const nm = String(dt.getMonth() + 1).padStart(2, "0");
      const nd = String(dt.getDate()).padStart(2, "0");
      cursor = `${ny}-${nm}-${nd}`;
    }

    return data;
  })();

  const selectedSummary =
    selectedDayKey == null
      ? null
      : dailySummaries.find((d) => d.currency === selectedCurrency && d.dateKey === selectedDayKey);

  const hasMultiAccountDay = dailySummaries.some(
    (d) => d.currency === selectedCurrency && d.accounts.length > 1,
  );

  return (
    <div className="space-y-6">
      {/* Filtros de rango de fechas para todo el Dashboard */}
      <Card className="border shadow-sm">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end w-full">
            <div className="space-y-1 w-full">
              <p className="text-xs font-medium text-muted-foreground">Desde</p>
              <input
                type="date"
                className="h-9 w-full rounded-md border px-3 text-xs bg-white"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1 w-full">
              <p className="text-xs font-medium text-muted-foreground">Hasta</p>
              <input
                type="date"
                className="h-9 w-full rounded-md border px-3 text-xs bg-white"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            
          </div>
        </CardContent>
      </Card>
      {/* Totales y tarjetas de resumen */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="col-span-1">
          <Card className="border shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">Saldo actual por moneda</p>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <DollarSign className="h-4 w-4 text-primary" />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                {loadingBalances
                  ? currencyOrder.map((cur) => (
                      <div key={cur} className="flex items-center justify-between gap-2 rounded px-3 py-2 bg-muted/5">
                        <div className="min-w-0 w-full">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="mt-2 h-3 w-12" />
                        </div>
                      </div>
                    ))
                  : currencyOrder.map((cur) => (
                      <div key={cur} className="flex items-center justify-between gap-2 rounded px-3 py-2 bg-muted/5">
                        <div className="min-w-0">
                          <p className="mt-0.5 text-sm font-semibold font-mono whitespace-nowrap overflow-x-auto">{`${formatTotals(totalsByCurrency[cur] ?? 0)} ${getCurrencyLabel(cur)}`}</p>
                        </div>
                      </div>
                    ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Transacciones Hoy (data real, vs ayer) */}
        <Card className="border shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Transacciones Hoy</p>
                {loadingRecentTx ? (
                  <Skeleton className="mt-1 h-8 w-20" />
                ) : (
                  <p className="mt-1 text-2xl font-bold text-foreground font-mono">
                    {todayTxCount}
                  </p>
                )}
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <ArrowLeftRight className="h-5 w-5 text-primary" />
              </div>
            </div>
            {loadingRecentTx ? (
              <Skeleton className="mt-3 h-4 w-24" />
            ) : (
              <div className="mt-3 flex items-center gap-1 text-xs">
                <TrendingUp className="h-3 w-3 text-success" />
                <span className="font-medium text-success">{todayVsYesterdayLabel}</span>
                <span className="text-muted-foreground">vs ayer</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagos P2P / C2P (data real) */}
        <Card className="border shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Pagos P2P / C2P</p>
                {loadingRecentTx ? (
                  <Skeleton className="mt-1 h-8 w-24" />
                ) : (
                  <p className="mt-1 text-2xl font-bold text-foreground font-mono">
                    {txStats.p2pCount} / {txStats.c2pCount}
                  </p>
                )}
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Smartphone className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* VPOS / Créd. Inmediato (data real) */}
        <Card className="border shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground">VPOS / Créd. Inmediato</p>
                {loadingRecentTx ? (
                  <Skeleton className="mt-1 h-8 w-24" />
                ) : (
                  <p className="mt-1 text-2xl font-bold text-foreground font-mono">
                    {txStats.vposCount} / {txStats.immediateCreditCount}
                  </p>
                )}
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <CreditCard className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
        <Card className="border shadow-sm">
            <CardContent className="p-5">
              <p className="text-xs font-medium text-muted-foreground">Saldos actuales por cuenta</p>
              <div className="mt-3 max-h-56 overflow-y-auto space-y-2">
                {loadingBalances && (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, idx) => (
                      <div key={idx} className="rounded-md border px-3 py-2">
                        <Skeleton className="h-3 w-14" />
                        <Skeleton className="mt-2 h-4 w-40" />
                        <Skeleton className="mt-2 h-3 w-20" />
                      </div>
                    ))}
                  </div>
                )}
                {!loadingBalances && accountBalances.length === 0 && <p className="text-sm text-muted-foreground">No hay saldos disponibles</p>}
                {!loadingBalances && accountBalances.map((a) => (
                  <div key={a.accountNumber} className="flex items-center justify-between rounded-md border px-3 py-2 bg-white/5">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">
                        Cuenta{accountAliasMap[a.accountNumber] ? ` · ${accountAliasMap[a.accountNumber]}` : ""}
                      </p>
                      <p className="font-mono text-sm text-foreground">{a.accountNumber}</p>
                    </div>
                    <div className="text-right ml-3 max-w-[40%] sm:max-w-[50%]">
                      <p className="text-sm font-medium font-mono whitespace-nowrap overflow-x-auto">{`${getCurrencyLabel(a.currency)} ${formatNumber(a.balance)}`}</p>
                      <span className="text-xs text-muted-foreground">{getCurrencyLabel(a.currency)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

        {/* Recent transactions */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Últimas Transacciones</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loadingRecentTx && (
              <div className="divide-y">
                {Array.from({ length: 4 }).map((_, idx) => (
                  <div key={idx} className="px-5 py-3">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="mt-2 h-3 w-44" />
                    <Skeleton className="mt-2 h-3 w-28" />
                  </div>
                ))}
              </div>
            )}
            {!loadingRecentTx && recentTx.length === 0 && (
              <div className="px-5 py-3 text-xs text-muted-foreground">No hay transacciones recientes.</div>
            )}
            {!loadingRecentTx && recentTx.length > 0 && (
              <div className="divide-y">
                {recentTx.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between px-5 py-3">
                    <div>
                      <p className="text-sm font-medium text-foreground font-mono">
                        {tx.type || "Transacción"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {tx.date ? new Date(tx.date).toLocaleDateString("es-VE") : ""} ·{" "}
                        {tx.direction || "-"}
                      </p>
                      <p className="text-[11px] text-muted-foreground font-mono">
                        {tx.accountNumber || "Sin cuenta"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold font-mono text-foreground">
                        {formatRecentAmount(
                          tx.amount,
                          tx.direction,
                          accountBalances.find((a) => a.accountNumber === tx.accountNumber)?.currency,
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chart */}
        <Card className="xl:col-span-2 border shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-sm font-semibold">Monto Transaccionado por Día</CardTitle>
              <div className="inline-flex items-center gap-2">
              
                <div className="inline-flex items-center gap-1 rounded border bg-muted/40 px-1 py-0.5">
                {(["VES", "USD"] as const).map((cur) => (
                  <button
                    key={cur}
                    type="button"
                    onClick={() => setSelectedCurrency(cur)}
                    className={`px-2 py-0.5 text-xs rounded ${
                      selectedCurrency === cur
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {getCurrencyLabel(cur)}
                  </button>
                ))}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartDataForSelectedCurrency} margin={{ top: 10, right: 10, left: 0, bottom: 40 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="day"
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 10 }}
                    interval={2}
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    stroke="hsl(var(--muted-foreground))"
                    domain={["auto", "auto"]}
                  />
                  <ReferenceLine y={0} stroke="hsl(var(--border))" strokeWidth={1} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(value: number) => [
                      `${selectedCurrency === "USD" ? "$" : "Bs"} ${Number(value).toLocaleString()}`,
                      "Monto",
                    ]}
                  />
                  <Bar
                    dataKey="monto"
                    radius={[4, 4, 0, 0]}
                    onClick={(_, index) => {
                      const entry = chartDataForSelectedCurrency[index];
                      if (!entry) return;
                      const summary = dailySummaries.find(
                        (d) =>
                          d.currency === selectedCurrency && d.dateKey === entry.dateKey,
                      );
                      if (!summary || summary.accounts.length <= 1) {
                        setSelectedDayKey(null);
                        return;
                      }
                      setSelectedDayKey(entry.dateKey);
                    }}
                    style={{ cursor: hasMultiAccountDay ? "pointer" : "default" }}
                  >
                    {chartDataForSelectedCurrency.map((entry) => (
                      <Cell
                        key={entry.dateKey}
                        fill={entry.monto < 0 ? "hsl(var(--destructive))" : "hsl(var(--primary))"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {hasMultiAccountDay && (
              <div className="mt-3 space-y-2">
                {!selectedSummary && (
                  <p className="text-[11px] text-muted-foreground">
                    Haz clic en una barra (cuando haya varias cuentas) para ver el detalle por cuenta.
                  </p>
                )}
                {selectedSummary && selectedSummary.accounts.length > 1 && (
                  <div className="border rounded-md p-2 bg-muted/30">
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      Detalle por cuenta ({selectedSummary.label} ·{" "}
                      {getCurrencyLabel(selectedSummary.currency)})
                    </p>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {selectedSummary.accounts.map((acc) => (
                        <div
                          key={acc.accountNumber}
                          className="flex items-center justify-between text-xs"
                        >
                          <span className="font-mono text-muted-foreground">
                            {acc.accountNumber}
                          </span>
                          <span className="font-mono text-foreground">
                            {formatRecentAmount(acc.totalAmount, acc.totalAmount < 0 ? "egreso" : "ingreso")}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

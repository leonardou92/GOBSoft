import { useEffect, useState } from "react";
import { Wallet, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { listBankAccounts, BankAccount } from "@/services/bankAccounts";
import { toast } from "@/hooks/use-toast";
import { loginSimple, getWorkingKeyFromLoginResponse, balanceSimple } from "@/services/account";

export default function BNCQueriesPage() {
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceResult, setBalanceResult] = useState<
    | null
    | { cuenta: string; moneda: string; saldo: string; rawDecrypted?: unknown }
  >(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<string | undefined>(undefined);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyResult, setHistoryResult] = useState(false);

  const simulateBalance = () => {
    (async () => {
      setBalanceLoading(true);
      setBalanceResult(null);
      try {
        const loginRes = await loginSimple();
        const wk = getWorkingKeyFromLoginResponse(loginRes);
        const res = await balanceSimple({ workingKey: wk, accountNumber: selectedAccount });
        const raw = (res as any).decrypted ?? (res as any).rawResponse ?? res;

        // Si la respuesta viene como un objeto con clave por número de cuenta:
        // { "01910001482101010049": { "CurrencyCode":"VES", "Balance":1714449.48 } }
        let accountKey = selectedAccount;
        let currency: string | undefined;
        let balanceValue: number | string | undefined;

        if (!accountKey && raw && typeof raw === "object") {
          const keys = Object.keys(raw as Record<string, unknown>);
          if (keys.length === 1) accountKey = keys[0];
        }

        if (accountKey && raw && typeof raw === "object") {
          const maybe = (raw as any)[accountKey];
          if (maybe && typeof maybe === "object") {
            currency = maybe.CurrencyCode ?? maybe.currency ?? maybe.Currency ?? maybe.Moneda ?? maybe.moneda;
            balanceValue = maybe.Balance ?? maybe.balance ?? maybe.Amount ?? maybe.amount;
          }
        }

        // Fallbacks: search top-level fields
        if (!currency && raw && typeof raw === "object") {
          const r = raw as any;
          currency = r.CurrencyCode ?? r.currency ?? r.Currency ?? r.moneda;
        }
        if (balanceValue === undefined && raw && typeof raw === "object") {
          const r = raw as any;
          balanceValue = r.Balance ?? r.balance ?? r.Amount ?? r.amount;
        }

        const fmt = (val: number | string | undefined) => {
          if (val === undefined || val === null) return "-";
          const num =
            typeof val === "number" ? val : Number(String(val).replace(/[^0-9.-]+/g, ""));
          if (!Number.isFinite(num)) return String(val);
          // Formato: miles con "," y decimales con "."
          return new Intl.NumberFormat("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }).format(num);
        };

        const displayAccount = accountKey ?? "";
        const displayCurrency = currency ?? "";
        const displayBalance = fmt(balanceValue);

        if (balanceValue === undefined || balanceValue === null || (typeof balanceValue === "number" && !Number.isFinite(balanceValue))) {
          toast({ title: "Saldo", description: "No se obtuvo saldo para la cuenta seleccionada.", variant: "destructive" });
          setBalanceResult(null);
        } else {
          setBalanceResult({ cuenta: displayAccount, moneda: displayCurrency, saldo: displayBalance, rawDecrypted: (raw as any).decrypted ?? raw });
        }
      } catch (err: any) {
        setBalanceResult(null);
        const msg = err?.message || String(err);
        setAccountsError(msg);
        toast({ title: "Error al consultar saldo", description: msg, variant: "destructive" });
      } finally {
        setBalanceLoading(false);
      }
    })();
  };

  useEffect(() => {
    let mounted = true;
    setAccountsLoading(true);
    setAccountsError(null);
    listBankAccounts()
      .then((res) => {
        if (!mounted) return;
        const arr = Array.isArray(res) ? res : [];
        setAccounts(arr);
        if (arr.length === 0) {
          toast({ title: "Cuentas", description: "No hay cuentas registradas." });
        }
      })
      .catch((err) => {
        if (!mounted) return;
        const msg = err?.message || String(err);
        setAccountsError(msg);
        toast({ title: "Error al cargar cuentas", description: msg, variant: "destructive" });
      })
      .finally(() => {
        if (!mounted) return;
        setAccountsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  const simulateHistory = () => {
    setHistoryLoading(true);
    setHistoryResult(false);
    setTimeout(() => {
      setHistoryResult(true);
      setHistoryLoading(false);
    }, 1000);
  };

  const historyData = [
    { fecha: "13/03/2026", ref: "REF-001", desc: "Pago proveedor", monto: "-Bs. 5,200.00" },
    { fecha: "12/03/2026", ref: "REF-002", desc: "Depósito", monto: "+Bs. 42,000.00" },
    { fecha: "11/03/2026", ref: "REF-003", desc: "Transferencia", monto: "-Bs. 3,500.00" },
  ];

  return (
    <Tabs defaultValue="saldo" className="space-y-6">
      <TabsList>
        <TabsTrigger value="saldo" className="gap-2"><Wallet className="h-4 w-4" />Consulta de Saldo</TabsTrigger>
        <TabsTrigger value="historial" className="gap-2"><History className="h-4 w-4" />Historial por Fecha</TabsTrigger>
      </TabsList>

      <TabsContent value="saldo" className="space-y-6">
        <Card className="max-w-lg border shadow-sm">
          <CardContent className="p-6 space-y-4">
            <div className="space-y-2">
              <Label>Cuenta</Label>
              <Select value={selectedAccount} onValueChange={(v) => setSelectedAccount(v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar cuenta" /></SelectTrigger>
                <SelectContent>
                  {accountsLoading && <SelectItem value="loading">Cargando cuentas...</SelectItem>}
                  {!accountsLoading && accounts.length === 0 && <SelectItem value="empty">No hay cuentas registradas</SelectItem>}
                  {!accountsLoading && accounts.map((a) => (
                    <SelectItem key={a.id} value={a.accountNumber}>
                      {a.accountNumber} {a.alias ? `- ${a.alias}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {accountsError && <p className="text-sm text-destructive mt-1">{accountsError}</p>}
            </div>
            <Button onClick={simulateBalance} disabled={balanceLoading}>
              {balanceLoading ? "Consultando..." : "Consultar saldo"}
            </Button>
          </CardContent>
        </Card>

        {balanceLoading && (
          <Card className="max-w-lg border shadow-sm">
            <CardContent className="p-6 space-y-3">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-10 w-64" />
            </CardContent>
          </Card>
        )}

        {balanceResult && !balanceLoading && (
          <Card className="max-w-lg border shadow-sm animate-fade-in">
            <CardContent className="p-6">
              <p className="text-xs text-muted-foreground">Cuenta</p>
              <p className="font-mono text-sm text-foreground">{balanceResult.cuenta}</p>
              <p className="mt-3 text-xs text-muted-foreground">Moneda</p>
              <p className="text-sm font-medium text-foreground">{balanceResult.moneda}</p>
              <p className="mt-3 text-xs text-muted-foreground">Saldo Disponible</p>
              <p className="text-3xl font-bold font-mono text-primary">{(balanceResult.moneda === "VES" ? "Bs." : balanceResult.moneda) + " " + balanceResult.saldo}</p>
            </CardContent>
          </Card>
        )}
      </TabsContent>

      <TabsContent value="historial" className="space-y-6">
        <Card className="max-w-2xl border shadow-sm">
          <CardContent className="p-6">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-2">
                <Label>Cuenta</Label>
                <Select value={selectedAccount} onValueChange={(v) => setSelectedAccount(v)}>
                    <SelectTrigger className="w-56"><SelectValue placeholder="Seleccionar cuenta" /></SelectTrigger>
                    <SelectContent>
                      {accountsLoading && <SelectItem value="loading">Cargando cuentas...</SelectItem>}
                      {!accountsLoading && accounts.length === 0 && <SelectItem value="empty">No hay cuentas registradas</SelectItem>}
                      {!accountsLoading && accounts.map((a) => (
                        <SelectItem key={a.id} value={a.accountNumber}>{a.accountNumber}{a.alias ? ` - ${a.alias}` : ''}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
              </div>
              <div className="space-y-2">
                <Label>Desde</Label>
                <Input type="date" className="w-40" />
              </div>
              <div className="space-y-2">
                <Label>Hasta</Label>
                <Input type="date" className="w-40" />
              </div>
              <Button onClick={simulateHistory} disabled={historyLoading}>
                {historyLoading ? "Buscando..." : "Buscar"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {historyLoading && (
          <div className="space-y-2 max-w-2xl">
            {[1,2,3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        )}

        {historyResult && !historyLoading && (
          <div className="rounded-lg border bg-card shadow-sm overflow-auto max-w-2xl animate-fade-in">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Fecha</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Referencia</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Descripción</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {historyData.map((h) => (
                  <tr key={h.ref} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-foreground">{h.fecha}</td>
                    <td className="px-4 py-3 font-mono text-xs text-foreground">{h.ref}</td>
                    <td className="px-4 py-3 text-foreground">{h.desc}</td>
                    <td className={`px-4 py-3 text-right font-mono font-semibold ${h.monto.startsWith("+") ? "text-success" : "text-destructive"}`}>{h.monto}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}

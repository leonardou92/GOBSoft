import { useState } from "react";
import { Send, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  immediateDebitBeginnerSimple,
  type ImmediateDebitBeginnerParams,
} from "@/services/account";

function PaymentForm({ type }: { type: "credito" | "debito" }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<null | { success: boolean; message: string }>(null);

  const [amount, setAmount] = useState("");
  const [debtorAccount, setDebtorAccount] = useState("");
  const [debtorAccountType, setDebtorAccountType] = useState<"CNTA" | "CELE">("CNTA");
  const [debtorBank, setDebtorBank] = useState("0191");
  const [debtorId, setDebtorId] = useState("");
  const [debtorName, setDebtorName] = useState("");
  const [concept, setConcept] = useState(type === "credito" ? "Crédito inmediato" : "Débito inmediato");
  const [token, setToken] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const numericAmount = Number(amount.replace(",", "."));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error("El monto debe ser mayor que cero.");
      return;
    }
    if (!debtorAccount.trim()) {
      toast.error("Ingresa la cuenta o teléfono del deudor.");
      return;
    }
    if (!debtorId.trim()) {
      toast.error("Ingresa la Cédula / RIF del deudor.");
      return;
    }
    if (!debtorName.trim()) {
      toast.error("Ingresa el nombre del deudor.");
      return;
    }
    if (!concept.trim()) {
      toast.error("Ingresa el concepto del débito.");
      return;
    }
    if (!token.trim() || token.trim().length > 8) {
      toast.error("Ingresa el token SIMF (máx. 8 dígitos).");
      return;
    }

    setLoading(true);
    setResult(null);
    (async () => {
      try {
        const params: ImmediateDebitBeginnerParams = {
          amount: numericAmount,
          debtorAccount: debtorAccount.trim(),
          debtorAccountType,
          debtorBank,
          debtorId: debtorId.trim().toUpperCase(),
          debtorName: debtorName.trim(),
          concept: concept.trim(),
          token: Number(token.trim()),
        };

        const res = await immediateDebitBeginnerSimple(params);
        const decrypted = res.decrypted as any;
        const status = decrypted?.Status ?? "ACCP";
        const ref = decrypted?.Reference;
        const baseMessage =
          res.message ?? (decrypted?.RejectDescription as string) ?? "Débito inmediato procesado.";
        const fullMessage =
          ref != null ? `${baseMessage} Ref: ${ref}` : baseMessage;

        const success = status === "ACCP";
        setResult({ success, message: fullMessage });
        toast[success ? "success" : "error"](fullMessage);

        if (success) {
          setAmount("");
          setDebtorAccount("");
          setDebtorId("");
          setDebtorName("");
          setConcept(type === "credito" ? "Crédito inmediato" : "Débito inmediato");
          setToken("");
        }
      } catch (err: any) {
        const msg = err?.message ?? "No se pudo ejecutar el débito inmediato.";
        setResult({ success: false, message: msg });
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    })();
  };

  return (
    <div className="space-y-6">
      <Card className="border shadow-sm max-w-lg">
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>{type === "credito" ? "Cuenta / teléfono del deudor" : "Cuenta / teléfono del deudor"}</Label>
              <Input
                placeholder="Cuenta (20 dígitos) o teléfono (12)"
                className="font-mono"
                value={debtorAccount}
                onChange={(e) => setDebtorAccount(e.target.value.replace(/[^0-9]/g, ""))}
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo de identificador</Label>
              <Select
                value={debtorAccountType}
                onValueChange={(v: "CNTA" | "CELE") => setDebtorAccountType(v)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CNTA">CNTA - Cuenta bancaria</SelectItem>
                  <SelectItem value="CELE">CELE - Teléfono celular</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Banco del deudor</Label>
              <Input
                placeholder="0191"
                className="font-mono"
                value={debtorBank}
                onChange={(e) => setDebtorBank(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
              />
            </div>
            <div className="space-y-2">
              <Label>Cédula / RIF del deudor</Label>
              <Input
                placeholder="V16113363"
                className="font-mono"
                value={debtorId}
                onChange={(e) => setDebtorId(e.target.value.toUpperCase())}
              />
            </div>
            <div className="space-y-2">
              <Label>Nombre del deudor</Label>
              <Input
                placeholder="Nombre completo del deudor"
                value={debtorName}
                onChange={(e) => setDebtorName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Monto (Bs.)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                className="font-mono"
                value={amount}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^0-9.,]/g, "");
                  setAmount(raw);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>Concepto</Label>
              <Input
                placeholder="Concepto de la operación"
                value={concept}
                onChange={(e) => setConcept(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Token SIMF</Label>
              <Input
                placeholder="Token (máx. 8 dígitos)"
                className="font-mono"
                value={token}
                onChange={(e) => setToken(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Procesando..." : <><Send className="mr-2 h-4 w-4" />Ejecutar {type === "credito" ? "crédito" : "débito"}</>}
            </Button>
          </form>
        </CardContent>
      </Card>

      {result && (
        <Card className={`border shadow-sm max-w-lg animate-fade-in ${result.success ? "border-success/30" : "border-destructive/30"}`}>
          <CardContent className="p-6 flex items-start gap-4">
            {result.success ? <CheckCircle2 className="h-8 w-8 text-success shrink-0" /> : <XCircle className="h-8 w-8 text-destructive shrink-0" />}
            <div>
              <p className={`text-sm font-semibold ${result.success ? "text-success" : "text-destructive"}`}>
                {result.success ? "Operación Exitosa" : "Operación Rechazada"}
              </p>
              <p className="text-sm text-foreground mt-1">{result.message}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function CreditDebitPage() {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="credito">
        <TabsList>
          <TabsTrigger value="credito">Crédito inmediato</TabsTrigger>
          <TabsTrigger value="debito">Débito inmediato (SIMF)</TabsTrigger>
        </TabsList>
        <TabsContent value="credito" className="mt-6"><PaymentForm type="credito" /></TabsContent>
        <TabsContent value="debito" className="mt-6"><PaymentForm type="debito" /></TabsContent>
      </Tabs>
    </div>
  );
}

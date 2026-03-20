  import { useState } from "react";
import { CreditCard, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { vposSimple } from "@/services/account";

export default function VPOSPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<null | { success: boolean; code: string; message: string }>(null);
  const [amount, setAmount] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [holderName, setHolderName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [accountType, setAccountType] = useState<"00" | "10" | "20">("20");
  const [transactionId, setTransactionId] = useState("");

  const detectCardBrand = (rawDigits: string): "VISA" | "MASTERCARD" | "OTRA" | null => {
    if (!rawDigits) return null;
    if (rawDigits.startsWith("4")) return "VISA";
    if (rawDigits.startsWith("5")) return "MASTERCARD";
    return "OTRA";
  };

  const rawCardDigits = cardNumber.replace(/\D/g, "");
  const cardBrand = detectCardBrand(rawCardDigits);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const numericAmount = Number(amount.replace(",", "."));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error("El monto debe ser mayor que cero.");
      return;
    }
    if (rawCardDigits.length < 13) {
      toast.error("Número de tarjeta incompleto.");
      return;
    }
    if (expiry.length !== 5 || !/^\d{2}\/\d{2}$/.test(expiry)) {
      toast.error("Vencimiento inválido. Usa formato MM/AA.");
      return;
    }
    if (cvv.length !== 3) {
      toast.error("CVV debe tener 3 dígitos.");
      return;
    }
    if (!holderName.trim() || !idNumber.trim()) {
      toast.error("Completa nombre del titular y Cédula/RIF.");
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const [mm, yy] = expiry.split("/");
      const fourDigitYear = Number(yy) >= 0 && Number(yy) <= 79 ? `20${yy}` : `19${yy}`;
      const dtExpiration = Number(`${mm}${fourDigitYear}`);

      const brand =
        cardBrand === "VISA" ? 1 : cardBrand === "MASTERCARD" ? 2 : 3;

      const res = await vposSimple({
        amount: numericAmount,
        accountType: Number(accountType),
        cardHolderId: Number(idNumber.replace(/\D/g, "")),
        cardHolderName: holderName.trim(),
        cardNumber,
        cvv: Number(cvv),
        expirationDate: dtExpiration,
        cardType: brand,
        cardPin: null,
        transactionId:
          transactionId && transactionId.trim().length > 0
            ? transactionId.trim()
            : `VPOS-${Date.now()}`,
      });

      const decrypted = res.decrypted as any;
      const status = decrypted?.Status ?? "OK";
      const code = decrypted?.Code ?? (status === "OK" ? "00" : "");
      const ref = decrypted?.Reference;
      const baseMessage =
        res.message ?? (decrypted?.Message as string) ?? "Transacción procesada.";
      const fullMessage =
        ref != null ? `${baseMessage} Ref: ${ref}` : baseMessage;

      const success = status === "OK";

      setResult({
        success,
        code: String(code ?? ""),
        message: fullMessage,
      });
      toast[success ? "success" : "error"](fullMessage);

      if (success) {
        setAmount("");
        setCardNumber("");
        setExpiry("");
        setCvv("");
        setHolderName("");
        setIdNumber("");
        setTransactionId("");
      }
    } catch (err: any) {
      const msg = err?.message ?? "No se pudo procesar el pago VPOS.";
      setResult({
        success: false,
        code: "ERR",
        message: msg,
      });
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Form */}
        <Card className="border shadow-sm lg:col-span-3">
          <CardHeader className="pb-4">
            <CardTitle className="text-base flex items-center gap-2">
              <CreditCard className="h-4 w-4" /> Pago con Tarjeta (VPOS)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Monto (Bs.)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="font-mono text-lg"
                  value={amount}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9.,]/g, "");
                    setAmount(raw);
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo de cuenta del deudor</Label>
                <select
                  className="h-9 w-full rounded-md border px-2 text-sm bg-white"
                  value={accountType}
                  onChange={(e) =>
                    setAccountType(e.target.value as "00" | "10" | "20")
                  }
                >
                  <option value="00">Principal</option>
                  <option value="10">Ahorro</option>
                  <option value="20">Corriente</option>
                </select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Número de tarjeta</Label>
                  {cardBrand && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-semibold">
                      {cardBrand === "OTRA" ? "Otra marca" : cardBrand}
                    </span>
                  )}
                </div>
                <Input
                  placeholder="4111 1111 1111 1111"
                  className="font-mono tracking-widest"
                  maxLength={19}
                  value={cardNumber}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 16);
                    const groups = digits.match(/.{1,4}/g) ?? [];
                    setCardNumber(groups.join(" "));
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Vencimiento</Label>
                  <Input
                    placeholder="MM/AA"
                    className="font-mono"
                    maxLength={5}
                    value={expiry}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
                      let formatted = digits;
                      if (digits.length >= 3) {
                        formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
                      }
                      setExpiry(formatted);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>CVV</Label>
                  <Input
                    placeholder="•••"
                    type="password"
                    className="font-mono"
                    maxLength={3}
                    value={cvv}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 3);
                      setCvv(digits);
                    }}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Nombre del titular</Label>
                <Input
                  placeholder="Como aparece en la tarjeta"
                  value={holderName}
                  onChange={(e) => setHolderName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Cédula / RIF (solo números)</Label>
                <Input
                  placeholder="012345678"
                  className="font-mono"
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value.replace(/\D/g, "").slice(0, 9))}
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Procesando..." : "Procesar pago"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Summary */}
        <div className="space-y-4 lg:col-span-2">
          <Card className="border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Resumen de Operación</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Monto</span>
                <span className="font-mono font-semibold text-foreground">Bs. 0.00</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Concepto</span>
                <span className="text-foreground">Pago VPOS</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Método</span>
                <span className="text-foreground">Tarjeta</span>
              </div>
            </CardContent>
          </Card>

          {result && (
            <Card className={`border shadow-sm animate-fade-in ${result.success ? "border-success/30" : "border-destructive/30"}`}>
              <CardContent className="p-5 flex items-start gap-3">
                {result.success ? <CheckCircle2 className="h-6 w-6 text-success shrink-0" /> : <XCircle className="h-6 w-6 text-destructive shrink-0" />}
                <div>
                  <p className={`text-sm font-semibold ${result.success ? "text-success" : "text-destructive"}`}>
                    {result.success ? "Aprobado" : "Rechazado"}
                  </p>
                  <p className="text-xs text-foreground mt-1">{result.message}</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Send, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { c2pSimple } from "@/services/account";

const STATIC_BANKS = [
  // Mismo listado que P2P a proveedores
  { id: "0001", name: "BANCO CENTRAL DE VENEZUELA" },
  { id: "0102", name: "BANCO DE VENEZUELA, S.A. BANCO UNIVERSAL" },
  { id: "0104", name: "BANCO VENEZOLANO DE CRÉDITO, S.A BANCO UNIVERSAL" },
  { id: "0105", name: "BANCO MERCANTIL C.A., BANCO UNIVERSAL" },
  { id: "0108", name: "BANCO PROVINCIAL, S.A. BANCO UNIVERSAL" },
  { id: "0114", name: "BANCO DEL CARIBE C.A., BANCO UNIVERSAL" },
  { id: "0115", name: "BANCO EXTERIOR C.A., BANCO UNIVERSAL" },
  { id: "0128", name: "BANCO CARONÍ C.A., BANCO UNIVERSAL" },
  { id: "0134", name: "BANESCO BANCO UNIVERSAL, C.A." },
  { id: "0137", name: "BANCO SOFITASA BANCO UNIVERSAL, C.A." },
  { id: "0138", name: "BANCO PLAZA, BANCO UNIVERSAL" },
  { id: "0146", name: "BANCO DE LA GENTE EMPRENDEDORA C.A" },
  { id: "0151", name: "BANCO FONDO COMÚN, C.A BANCO UNIVERSAL" },
  { id: "0156", name: "100% BANCO, BANCO COMERCIAL, C.A" },
  { id: "0157", name: "DELSUR, BANCO UNIVERSAL C.A." },
  { id: "0163", name: "BANCO DEL TESORO C.A., BANCO UNIVERSAL" },
  { id: "0166", name: "BANCO AGRÍCOLA DE VENEZUELA C.A., BANCO UNIVERSAL" },
  { id: "0168", name: "BANCRECER S.A., BANCO MICROFINANCIERO" },
  { id: "0169", name: "R4, BANCO MICROFINANCIERO, C.A." },
  { id: "0171", name: "BANCO ACTIVO C.A., BANCO UNIVERSAL" },
  { id: "0172", name: "BANCAMIGA BANCO UNIVERSAL, C.A." },
  { id: "0173", name: "BANCO INTERNACIONAL DE DESARROLLO C.A., BANCO UNIVERSAL" },
  { id: "0174", name: "BANPLUS BANCO UNIVERSAL, C.A." },
  { id: "0175", name: "BANCO DIGITAL DE LOS TRABAJADORES, BANCO UNIVERSAL C.A." },
  { id: "0177", name: "BANCO DE LA FUERZA ARMADA NACIONAL BOLIVARIANA, B.U." },
  { id: "0178", name: "N58 BANCO DIGITAL, BANCO MICROFINANCIERO" },
  { id: "0191", name: "BANCO NACIONAL DE CRÉDITO C.A., BANCO UNIVERSAL" },
  { id: "0601", name: "INSTITUTO MUNICIPAL DE CRÉDITO POPULAR" },
] as const;

const C2P_TOKEN_HELP: Record<string, string> = {
  // SMS
  "0102": 'Banco de Venezuela: envía "CLAVE PAGO" al 2661 o 2662 desde el teléfono afiliado.',
  "0134": 'Banesco: envía "CLAVE" al 2846 desde el teléfono afiliado.',
  "0105": 'Mercantil: envía "SCP" al 24024 o usa Tpago.',
  "0114": 'Bancaribe: envía "CLAVE <espacio> Cédula" (ej: CLAVE V12345678) al 22741.',
  "0115": 'Banco Exterior: envía "CLAVE <espacio> Cédula" al 278.',
  "0163": 'Banco del Tesoro: envía "COMERCIO <espacio> V/E <espacio> Cédula" al 2383.',
  "0171": 'Banco Activo: envía "COMERCIO <espacio> Cédula" al 263.',
  "0177": 'BANFANB: envía "BFP <espacio> Cédula" al 78491.',

  // App / canales digitales
  "0172": "Bancamiga: app Bancamiga Suite → Pago Móvil → Generar OTP (vigencia 6 horas).",
  "0191": "BNC: App BNC → Pagos → Pago Móvil → Generar Clave C2P.",
  "0108": 'BBVA Provincial: App Provincial → "Dinero Rápido" → Generar clave de compra.',
  "0175": "Banco Digital de los Trabajadores / Bicentenario: app → sección Pago Móvil C2P → generar código.",
  "0151": 'BFC: app "BFC Pago Móvil" → opción "Generar clave pago comercio C2P".',
  "0174": "Banplus: App Banplus Pay → menú C2P → generar token.",
};

export default function C2PPaymentPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<null | { success: boolean; code?: string; message: string }>(null);

  const [phone, setPhone] = useState("");
  const [debtorId, setDebtorId] = useState("");
  const [debtorBankCode, setDebtorBankCode] = useState("");
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState("");
  const [concept, setConcept] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!phone || !debtorId || !debtorBankCode || !amount || !token) {
      toast.error("Completa todos los campos obligatorios del cliente, monto y token.");
      return;
    }
    const numericAmount = Number(amount.replace(",", "."));
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      toast.error("El monto debe ser mayor que cero.");
      return;
    }
    if (token.trim().length < 4) {
      toast.error("El token debe tener al menos 4 caracteres.");
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const res = await c2pSimple({
        amount: numericAmount,
        debtorBankCode: Number(debtorBankCode),
        debtorCellPhone: phone.replace(/[^0-9]/g, ""),
        debtorId: debtorId.trim().toUpperCase(),
        token: token.trim(),
      });

      const ref = (res.decrypted as any)?.Reference;
      const idTx = (res.decrypted as any)?.IdTransaction;
      const baseMessage = res.message ?? "Cobro C2P ejecutado exitosamente.";
      const messageWithRef =
        ref != null ? `${baseMessage} Ref: ${ref}` : baseMessage;

      setResult({
        success: true,
        code: ref ? String(ref) : undefined,
        message: messageWithRef,
      });
      toast.success(messageWithRef);

      // Limpiar campos
      setPhone("");
      setDebtorId("");
      setDebtorBankCode("");
      setAmount("");
      setToken("");
      setConcept("");
    } catch (err: any) {
      const msg = err?.message ?? "No se pudo ejecutar el cobro C2P.";
      setResult({
        success: false,
        message: msg,
      });
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Card className="border shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Pago Móvil C2P</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Datos del Cliente</p>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Teléfono del cliente</Label>
                  <Input
                    placeholder="584241234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cédula / RIF del cliente</Label>
                  <Input
                    placeholder="V23000760"
                    className="font-mono"
                    value={debtorId}
                    onChange={(e) => setDebtorId(e.target.value.toUpperCase())}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Banco del cliente</Label>
                  <Select value={debtorBankCode} onValueChange={setDebtorBankCode}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar banco" />
                    </SelectTrigger>
                    <SelectContent>
                      {STATIC_BANKS.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name} ({b.id})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Separator />

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Datos del Pago</p>
              <div className="space-y-4">
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
                  <Label>Token</Label>
                  <Input
                    placeholder="Token C2P del cliente"
                    className="font-mono"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                  />
                  {debtorBankCode && (
                    <div className="mt-2 rounded-md bg-muted/40 px-3 py-2 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold text-muted-foreground">
                          ¿Cómo obtiene el cliente su token C2P?
                        </p>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        {C2P_TOKEN_HELP[debtorBankCode] ??
                          "Revisa en la app o portal del banco del cliente la opción de Pago Móvil / C2P para generar el token."}
                      </p>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Concepto</Label>
                  <Input
                    placeholder="Descripción del pago"
                    value={concept}
                    onChange={(e) => setConcept(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Procesando..." : <><Send className="mr-2 h-4 w-4" />Enviar pago C2P</>}
            </Button>
          </form>
        </CardContent>
      </Card>

      {result && (
        <Card className={`border shadow-sm animate-fade-in ${result.success ? "border-success/30" : "border-destructive/30"}`}>
          <CardContent className="p-6 flex items-start gap-4">
            {result.success ? <CheckCircle2 className="h-8 w-8 text-success shrink-0" /> : <XCircle className="h-8 w-8 text-destructive shrink-0" />}
            <div>
              <p className={`text-sm font-semibold ${result.success ? "text-success" : "text-destructive"}`}>
                {result.success ? "Cobro C2P aprobado" : "Cobro C2P rechazado"}
              </p>
              {result.code && (
                <p className="text-xs text-muted-foreground mt-1">
                  Referencia: <span className="font-mono">{result.code}</span>
                </p>
              )}
              <p className="text-sm text-foreground mt-1">{result.message}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

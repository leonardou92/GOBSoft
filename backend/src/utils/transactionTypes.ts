/**
 * Códigos de tipo de transacción BNC → identificador corto (operationType)
 * y descripción entendible para el usuario (transactionTypeLabel).
 */
export const BNC_TRANSACTION_TYPE_TO_OPERATION: Record<number, string> = {
  262: 'CARGO',
  387: 'P2PTSP',
  388: 'P2PTSP',
  487: 'CIOPPS',
  488: 'CIPOTR',
  489: 'CIORPS',
  612: 'ABONO',
  751: 'CIOCCS',
};

/** Descripción en español para mostrar al usuario (por código BNC). */
export const BNC_TRANSACTION_TYPE_LABEL: Record<number, string> = {
  262: 'Transferencia entre cuentas Internet',
  387: 'Cargo Pago Móvil BNC',
  388: 'Abono Pago Móvil BNC',
  487: 'Crédito Inmediato Emitido',
  488: 'Crédito Inmediato Recibido',
  489: 'Crédito Inmediato Devuelto o Reversado',
  612: 'Abono POS Internet TDD',
  751: 'Comisión Crédito Inmediato',
};

export function getOperationTypeFromCode(code: number | string | null | undefined): string | null {
  if (code === null || code === undefined) return null;
  const num = typeof code === 'string' ? parseInt(code, 10) : code;
  if (Number.isNaN(num)) return null;
  return BNC_TRANSACTION_TYPE_TO_OPERATION[num] ?? null;
}

/** Devuelve la etiqueta entendible para el usuario según el código BNC. */
export function getTransactionTypeLabel(code: number | string | null | undefined): string | null {
  if (code === null || code === undefined) return null;
  const num = typeof code === 'string' ? parseInt(code, 10) : code;
  if (Number.isNaN(num)) return null;
  return BNC_TRANSACTION_TYPE_LABEL[num] ?? null;
}

/** Códigos numéricos por operationType (para filtrar en BD por el campo code). */
const OPERATION_TYPE_TO_CODES: Record<string, string[]> = (() => {
  const map: Record<string, string[]> = {};
  for (const [codeStr, op] of Object.entries(BNC_TRANSACTION_TYPE_TO_OPERATION)) {
    const code = String(codeStr);
    if (!map[op]) map[op] = [];
    map[op].push(code);
  }
  return map;
})();

/** Devuelve los valores de `code` (string) que corresponden a un operationType, para filtrar en BD. */
export function getCodesForOperationType(operationType: string): string[] {
  return OPERATION_TYPE_TO_CODES[operationType] ?? [];
}

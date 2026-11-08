/**
 * Importes en céntimos enteros para sumar sin errores de coma flotante. Solo sirve para mostrar
 * estimaciones en pantalla: el importe real lo calcula siempre el servidor.
 */
export function toCents(amount: string): number {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
  if (!match) throw new Error(`Invalid amount: ${amount}`);
  const cents = Number(match[2]) * 100 + Number((match[3] ?? "").padEnd(2, "0") || 0);
  return match[1] ? -cents : cents;
}

export function fromCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

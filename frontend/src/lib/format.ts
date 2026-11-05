const euroFormatter = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

/** Formatea para mostrar un importe decimal recibido de la API como cadena (por ejemplo "9.50"). */
export function formatEuro(amount: string): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid amount: ${amount}`);
  }
  return euroFormatter.format(value);
}

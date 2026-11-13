/**
 * ¿Cubre esta entrada de una zona de reparto el código postal? Una entrada es un código exacto
 * («28029») o un prefijo con asterisco («28*» = toda la Comunidad de Madrid). El servidor decide
 * siempre; esto solo sirve para avisar antes de enviar el pedido.
 */
export function zoneCoversPostalCode(codes: readonly string[], postalCode: string): boolean {
  return codes.some((entry) =>
    entry.endsWith("*") ? postalCode.startsWith(entry.slice(0, -1)) : entry === postalCode,
  );
}

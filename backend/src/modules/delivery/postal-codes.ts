/**
 * Códigos postales de una zona de reparto. Cada entrada es un código exacto («28029») o un prefijo de
 * provincia con asterisco («28*» = todos los códigos que empiezan por 28, es decir, toda la Comunidad
 * de Madrid). Si varias zonas cubren un código, gana la que lo nombra exactamente.
 */
export const POSTAL_CODE_ENTRY = /^(?:[0-9]{5}|[0-9]{2}\*)$/;

export function entryCovers(entry: string, postalCode: string): boolean {
  return entry.endsWith("*") ? postalCode.startsWith(entry.slice(0, -1)) : entry === postalCode;
}

export function findZoneForPostalCode<T extends { postalCodes: readonly string[] }>(
  zones: readonly T[],
  postalCode: string,
): T | null {
  const exact = zones.find((zone) => zone.postalCodes.includes(postalCode));
  if (exact) return exact;
  return (
    zones.find((zone) => zone.postalCodes.some((entry) => entryCovers(entry, postalCode))) ?? null
  );
}

/** Texto legible: «28* (todos los que empiezan por 28)». */
export function describePostalCodes(codes: readonly string[]): string {
  return codes
    .map((entry) =>
      entry.endsWith("*") ? `${entry} (todos los que empiezan por ${entry.slice(0, -1)})` : entry,
    )
    .join(", ");
}

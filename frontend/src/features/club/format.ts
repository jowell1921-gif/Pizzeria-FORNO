/** «1 punto por cada euro», «0.5 puntos por cada euro»… a partir de la regla que configura el local. */
export function pointsRuleText(pointsPerEuro: string | null): string {
  if (pointsPerEuro === null) return "puntos por cada euro de tus pedidos";
  const value = Number(pointsPerEuro);
  return `${value.toLocaleString("es-ES")} ${value === 1 ? "punto" : "puntos"} por cada euro`;
}

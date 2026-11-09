/** «Pizza Cuatro Quesos» -> «pizza-cuatro-quesos» (sin tildes, minúsculas, con guiones). */
export function slugify(text: string): string {
  const slug = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "producto";
}

/** Devuelve un slug libre añadiendo -2, -3… si el deseado ya existe. */
export async function uniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  let candidate = base;
  for (let n = 2; await exists(candidate); n += 1) candidate = `${base}-${n}`;
  return candidate;
}

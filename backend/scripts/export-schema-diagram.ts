import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Genera el diagrama entidad-relación de la base de datos (Mermaid) a partir de `schema.prisma`
 * (npm run docs:schema). Así el diagrama nunca se separa del esquema real: una prueba comprueba que
 * el archivo guardado coincide con el que sale del esquema.
 */
const SCHEMA = resolve(import.meta.dirname, "../prisma/schema.prisma");
export const DIAGRAM_FILE = resolve(import.meta.dirname, "../../docs/database/diagrama.md");

interface Field {
  name: string;
  type: string;
  optional: boolean;
  list: boolean;
  attributes: string;
}
interface Model {
  name: string;
  fields: Field[];
}

function parse(source: string) {
  const models: Model[] = [];
  const enums = new Set<string>();
  for (const match of source.matchAll(/^enum\s+(\w+)\s*\{/gm)) enums.add(match[1]!);
  for (const match of source.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const fields: Field[] = [];
    for (const raw of match[2]!.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("//") || line.startsWith("@@")) continue;
      const field = /^(\w+)\s+(\w+)(\[\])?(\?)?(.*)$/.exec(line);
      if (field) {
        fields.push({
          name: field[1]!,
          type: field[2]!,
          list: Boolean(field[3]),
          optional: Boolean(field[4]),
          attributes: field[5]!,
        });
      }
    }
    models.push({ name: match[1]!, fields });
  }
  return { models, enums };
}

export function buildDiagram(source = readFileSync(SCHEMA, "utf8")): string {
  const { models, enums } = parse(source);
  const names = new Set(models.map((model) => model.name));
  const lines = ["erDiagram"];

  for (const model of models) {
    lines.push(`  ${model.name} {`);
    for (const field of model.fields) {
      if (names.has(field.type)) continue; // relación: se dibuja como línea
      const type = enums.has(field.type) ? "enum" : field.type.toLowerCase();
      const keys = [
        /@id\b/.test(field.attributes) ? "PK" : "",
        /@unique\b/.test(field.attributes) ? "UK" : "",
      ]
        .filter(Boolean)
        .join(",");
      lines.push(`    ${type} ${field.name}${field.list ? "_list" : ""}${keys ? ` ${keys}` : ""}`);
    }
    lines.push("  }");
  }

  for (const model of models) {
    for (const field of model.fields) {
      const target = names.has(field.type) && !field.list ? field.type : null;
      const relation = /@relation\([^)]*fields:\s*\[(\w+)\]/.exec(field.attributes);
      if (!target || !relation) continue;
      // «Padre ||--o{ Hijo»: el modelo que guarda la clave foránea es el lado «muchos».
      const parent = field.optional ? "|o" : "||";
      lines.push(`  ${target} ${parent}--o{ ${model.name} : "${relation[1]}"`);
    }
  }

  return [
    "# Diagrama de la base de datos",
    "",
    "Generado automáticamente desde `backend/prisma/schema.prisma` (`npm run docs:schema` en `backend/`).",
    "No lo edites a mano: una prueba comprueba que coincide con el esquema. Cada línea une una tabla con la",
    "que referencia (clave foránea); `|o` indica que la referencia es opcional.",
    "",
    "```mermaid",
    ...lines,
    "```",
    "",
  ].join("\n");
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  writeFileSync(DIAGRAM_FILE, buildDiagram());
  console.log(`Escrito ${DIAGRAM_FILE}`);
}

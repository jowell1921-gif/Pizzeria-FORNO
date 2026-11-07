import type { RoleName } from "../generated/prisma/enums.js";

/**
 * Permisos explícitos de la plataforma. Cada endpoint exige uno; nunca se decide por el nombre
 * del rol. Se amplían junto con los módulos (fases 5–8).
 */
export const PERMISSIONS = [
  // Datos propios de cualquier usuario autenticado (cliente).
  "profile:read:own",
  "profile:update:own",
  "addresses:manage:own",
  "orders:create",
  "orders:read:own",
  "loyalty:read:own",
  "loyalty:redeem",
  // Gestión de pedidos (personal).
  "orders:read:all",
  "orders:update-status",
  // Pantalla de cocina: solo lo imprescindible para preparar pedidos.
  "kitchen:orders:read",
  "kitchen:orders:update-status",
  // Administración.
  "dashboard:read",
  "catalog:manage",
  "promotions:manage",
  "loyalty:manage",
  "settings:manage",
  "customers:read",
  "payments:read",
  "audit:read",
  "roles:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Permisos de todo usuario autenticado, tenga o no un rol de personal. */
export const CUSTOMER_PERMISSIONS: readonly Permission[] = [
  "profile:read:own",
  "profile:update:own",
  "addresses:manage:own",
  "orders:create",
  "orders:read:own",
  "loyalty:read:own",
  "loyalty:redeem",
];

/** Permisos adicionales de cada rol. ADMIN lo puede todo; KITCHEN, solo la cocina. */
export const ROLE_PERMISSIONS: Record<RoleName, readonly Permission[]> = {
  ADMIN: PERMISSIONS,
  STAFF: [
    "orders:read:all",
    "orders:update-status",
    "kitchen:orders:read",
    "kitchen:orders:update-status",
    "dashboard:read",
    "customers:read",
    "payments:read",
  ],
  KITCHEN: ["kitchen:orders:read", "kitchen:orders:update-status"],
};

/** Permisos efectivos de un usuario: los de cliente más los de sus roles, sin duplicados. */
export function permissionsFor(roles: readonly RoleName[]): Permission[] {
  const all = new Set<Permission>(CUSTOMER_PERMISSIONS);
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role]) all.add(permission);
  }
  return [...all].sort();
}

export function hasPermission(roles: readonly RoleName[], permission: Permission): boolean {
  return permissionsFor(roles).includes(permission);
}

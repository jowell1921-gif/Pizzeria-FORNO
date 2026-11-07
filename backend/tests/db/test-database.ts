const DEFAULT_TEST_URL = "postgresql://forno:forno_dev_password@localhost:5432/forno_test";

/**
 * URL de la base de pruebas. Por seguridad solo se aceptan bases cuyo nombre termine en «_test»:
 * estas pruebas borran y recrean el esquema, y nunca deben apuntar a desarrollo ni a producción.
 */
export function getTestDatabaseUrl(): string {
  const url = process.env["DATABASE_URL_TEST"] ?? DEFAULT_TEST_URL;
  const databaseName = new URL(url).pathname.replace(/^\//, "");
  if (!databaseName.endsWith("_test")) {
    throw new Error(
      `Refusing to run database tests against "${databaseName}": the name must end with "_test"`,
    );
  }
  return url;
}

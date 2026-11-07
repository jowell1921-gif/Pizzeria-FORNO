-- Seguridad por defecto: activa RLS en todas las tablas del esquema público, sin políticas.
--
-- En Supabase, los roles «anon» y «authenticated» (los que usan los clientes web y móvil con la
-- API de Supabase) no pueden leer ni escribir ninguna tabla de negocio: todas las operaciones
-- pasan por el backend. El backend se conecta con el rol propietario de las tablas, que no está
-- sujeto a RLS. Si en el futuro se necesita acceso directo desde clientes, se añaden políticas
-- explícitas en una migración.
--
-- Las tablas nuevas deben activar RLS en su propia migración; una prueba automatizada lo verifica.
DO $$
DECLARE
  table_name text;
BEGIN
  FOR table_name IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
  END LOOP;
END;
$$;

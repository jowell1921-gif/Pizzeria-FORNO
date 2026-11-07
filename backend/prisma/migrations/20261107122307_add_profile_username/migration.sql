-- Nombre de usuario que se muestra en la web (botón «Mi cuenta»).
ALTER TABLE "Profile" ADD COLUMN "username" TEXT;

-- De 3 a 12 caracteres (que quepan en el botón de la cabecera): letras, números, punto, guion y
-- guion bajo. Las letras incluyen las acentuadas.
ALTER TABLE "Profile"
  ADD CONSTRAINT "ck_profile_username" CHECK (
    "username" IS NULL OR "username" ~ '^[[:alnum:]_.-]{3,12}$'
  ),
  -- El teléfono es obligatorio para hacer pedidos (lo exige el servicio); aquí solo se valida el formato.
  ADD CONSTRAINT "ck_profile_phone_format" CHECK (
    "phone" IS NULL OR "phone" ~ '^\+?[0-9 ()-]{6,20}$'
  );
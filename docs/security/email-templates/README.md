# Plantillas de correo de Supabase Auth

Plantillas con la marca FORNEA para los correos que envía Supabase.

| Archivo | Plantilla en Supabase | Asunto sugerido |
| --- | --- | --- |
| `confirmar-registro.html` | Confirm sign up | `Confirma tu cuenta en FORNEA` |
| `restablecer-contrasena.html` | Reset password | `Restablece tu contraseña de FORNEA` |

## Cómo aplicarlas

1. **Logo público.** Los clientes de correo no pueden ver imágenes de `localhost`. Sube
   `logo-forno-email.png` a un bucket **público** de Supabase Storage (Storage → New bucket →
   marcar _Public bucket_) y copia su URL pública.
2. En los dos `.html`, sustituye `LOGO_URL` por esa URL.
3. En Supabase: **Authentication → Emails → Templates**. Para cada plantilla pega el asunto y el
   contenido HTML del archivo correspondiente y guarda.
4. En **Authentication → URL Configuration** define:
   - Site URL: `http://localhost:3000` (en producción, el dominio real).
   - Redirect URLs: `http://localhost:3000/auth/callback` y `http://localhost:3000/auth/confirm`.

Los enlaces usan `{{ .SiteURL }}/auth/confirm?token_hash=…` (flujo `token_hash`), que gestiona la
ruta `/auth/confirm` del frontend.

El logo tiene letras oscuras: por eso las plantillas lo colocan sobre un fondo crema.

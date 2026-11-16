# Plantillas de correo de Supabase Auth

Plantillas con la marca FORNEA para los correos que envía Supabase.

| Archivo | Plantilla en Supabase | Asunto sugerido |
| --- | --- | --- |
| `confirmar-registro.html` | Confirm sign up | `Confirma tu cuenta en FORNEA` |
| `restablecer-contrasena.html` | Reset password | `Restablece tu contraseña de FORNEA` |

## Cómo aplicarlas

1. **Logo.** Los clientes de correo no pueden ver imágenes de `localhost`. Las plantillas cargan el
   logo desde la propia web (`{{ .SiteURL }}/image/logo-fornea-email.png`, archivo
   `frontend/public/image/logo-fornea-email.png`), así que no hay que subir nada a Supabase: basta
   con que la web esté desplegada y el *Site URL* de Supabase sea su dirección. El logo es un PNG
   (los correos no admiten WebP) aplanado sobre el crema de la tarjeta.
2. Si cambias el logo de la web, regenera ese PNG (480 px de ancho) y vuelve a desplegar.
3. En Supabase: **Authentication → Emails → Templates**. Para cada plantilla pega el asunto y el
   contenido HTML del archivo correspondiente y guarda.
4. En **Authentication → URL Configuration** define:
   - Site URL: `http://localhost:3000` (en producción, el dominio real).
   - Redirect URLs: `http://localhost:3000/auth/callback` y `http://localhost:3000/auth/confirm`.

Los enlaces usan `{{ .SiteURL }}/auth/confirm?token_hash=…` (flujo `token_hash`), que gestiona la
ruta `/auth/confirm` del frontend.

El logo tiene letras oscuras: por eso el PNG va aplanado sobre un fondo crema, igual que la tarjeta del correo.

## Por qué el enlace pasa por una página con un botón

El enlace del correo (`/auth/confirm?token_hash=…`) no gasta el código: lleva a `/confirmar-correo`, que
muestra un botón. Muchos clientes de correo y antivirus abren los enlaces para analizarlos y, como el
código de Supabase es de un solo uso, lo consumían antes de que la persona pulsara («el enlace no es
válido o ha caducado»). Un robot no pulsa botones.

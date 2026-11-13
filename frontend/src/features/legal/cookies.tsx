import Link from "next/link";

import { COMPANY } from "@/lib/legal";

import { LegalDocument, LegalSection, LegalTable, List, P } from "./legal-parts";

/**
 * Política de cookies. Debe coincidir con lo que la web guarda de verdad (hoy solo elementos
 * técnicos).
 */
export function Cookies() {
  return (
    <LegalDocument>
      <LegalSection title="1. Qué son las cookies y el almacenamiento local">
        <P>
          Las cookies son pequeños archivos que el sitio guarda en tu navegador. El almacenamiento
          local (localStorage) cumple una función parecida. Se usan para recordar tu sesión o tu
          carrito entre visitas.
        </P>
      </LegalSection>

      <LegalSection title={`2. Qué utiliza ${COMPANY.brand}`}>
        <P>
          Este sitio solo utiliza elementos <strong>técnicos y necesarios</strong> para prestar el
          servicio que pides. No usamos cookies de análisis, de publicidad ni de seguimiento, ni
          compartimos esta información con redes publicitarias.
        </P>
        <LegalTable
          caption="Cookies y almacenamiento local que utiliza el sitio"
          head={["Nombre", "Tipo", "Finalidad", "Duración"]}
          rows={[
            [
              "sb-…-auth-token (cookie)",
              "Técnica, propia",
              "Mantener tu sesión iniciada de forma segura (proveedor de acceso Supabase)",
              "Mientras dure la sesión, con renovación automática",
            ],
            [
              "fornea-cart-v1 (almacenamiento local)",
              "Técnica, propia",
              "Recordar los productos de tu carrito al volver",
              "Hasta que vacíes el carrito o borres los datos del navegador",
            ],
            [
              "fornea-promo-code (almacenamiento local)",
              "Técnica, propia",
              "Recordar el código promocional que has guardado",
              "Hasta que lo quites o borres los datos del navegador",
            ],
            [
              "fornea-admin-offer-v1 (almacenamiento local)",
              "Técnica, propia",
              "Recordar si ya has respondido a la oferta de acceso al panel de personal",
              "Hasta que borres los datos del navegador",
            ],
          ]}
        />
        <P>
          Cuando pagas con tarjeta, la página de pago de Stripe, que es de un tercero, puede usar
          sus propias cookies técnicas y de prevención del fraude, sujetas a su política. El inicio
          de sesión con Google también se rige por las condiciones de Google.
        </P>
      </LegalSection>

      <LegalSection title="3. Consentimiento">
        <P>
          Las cookies estrictamente necesarias para prestar el servicio solicitado quedan exentas
          del deber de obtener consentimiento (art. 22.2 de la LSSI-CE). Por eso no mostramos un
          banner de cookies. Si en el futuro incorporamos cookies de análisis o publicidad, te
          pediremos tu consentimiento antes de activarlas y actualizaremos esta política.
        </P>
      </LegalSection>

      <LegalSection title="4. Cómo gestionarlas o eliminarlas">
        <P>
          Puedes borrar o bloquear las cookies y el almacenamiento local desde la configuración de
          tu navegador. Si lo haces, se cerrará tu sesión y se vaciará tu carrito, y es posible que
          algunas funciones no estén disponibles. Consulta la ayuda de tu navegador:
        </P>
        <List
          items={[
            "Chrome: Configuración → Privacidad y seguridad → Cookies y otros datos de sitios.",
            "Firefox: Ajustes → Privacidad y seguridad → Cookies y datos del sitio.",
            "Safari: Ajustes → Privacidad → Gestionar datos de sitios web.",
            "Edge: Configuración → Cookies y permisos del sitio.",
          ]}
        />
      </LegalSection>

      <LegalSection title="5. Más información">
        <P>
          El tratamiento de datos personales se explica en la{" "}
          <Link href="/legal/privacidad" className="underline underline-offset-4">
            Política de privacidad
          </Link>
          . Para cualquier duda, contacta con {COMPANY.name} en el {COMPANY.phone}.
        </P>
      </LegalSection>
    </LegalDocument>
  );
}

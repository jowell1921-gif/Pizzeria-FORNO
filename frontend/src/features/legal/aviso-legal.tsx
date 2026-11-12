import Link from "next/link";

import { COMPANY } from "@/lib/legal";

import { LegalDocument, LegalSection, List, P } from "./legal-parts";

export function AvisoLegal() {
  return (
    <LegalDocument>
      <LegalSection title="1. Titular del sitio web">
        <P>
          En cumplimiento de la Ley 34/2002, de servicios de la sociedad de la información y de
          comercio electrónico (LSSI-CE), se informa de que este sitio web es titularidad de:
        </P>
        <List
          items={[
            <>
              <strong>Denominación:</strong> {COMPANY.name}
            </>,
            <>
              <strong>Marca comercial:</strong> {COMPANY.brand}
            </>,
            <>
              <strong>NIF/CIF:</strong> {COMPANY.taxId}
            </>,
            <>
              <strong>Domicilio social:</strong> {COMPANY.registeredAddress}
            </>,
            <>
              <strong>Correo electrónico:</strong> {COMPANY.email}
            </>,
            <>
              <strong>Teléfono:</strong> {COMPANY.phone}
            </>,
            <>
              <strong>Establecimiento:</strong> {COMPANY.establishment}
            </>,
            <>
              <strong>Inscripción registral:</strong> {COMPANY.registry}
            </>,
          ]}
        />
      </LegalSection>

      <LegalSection title="2. Objeto">
        <P>
          Este sitio web permite consultar la carta y las promociones de {COMPANY.brand}, crear una
          cuenta, realizar pedidos para recoger en el establecimiento o recibir a domicilio,
          participar en el programa de fidelización {COMPANY.brand} CLUB y consultar el historial de
          pedidos.
        </P>
      </LegalSection>

      <LegalSection title="3. Condiciones de uso">
        <P>
          El acceso y la navegación son gratuitos. Para realizar pedidos es necesario crear una
          cuenta. Quien utiliza el sitio se compromete a hacerlo conforme a la ley, a la buena fe y
          al presente aviso, y a facilitar datos veraces y actualizados.
        </P>
        <P>Queda prohibido, entre otras conductas:</P>
        <List
          items={[
            "Suplantar la identidad de otra persona o utilizar cuentas ajenas.",
            "Introducir datos falsos o realizar pedidos sin intención de recibirlos o pagarlos.",
            "Intentar acceder a áreas restringidas, alterar precios, descuentos, puntos o estados de pedidos, o interferir en el funcionamiento del sitio.",
            "Usar medios automatizados para extraer contenidos o sobrecargar el servicio.",
          ]}
        />
        <P>{COMPANY.name} podrá suspender o cancelar cuentas que incumplan estas condiciones.</P>
      </LegalSection>

      <LegalSection title="4. Propiedad intelectual e industrial">
        <P>
          Los textos, imágenes, fotografías, diseños, logotipos, marcas, código y demás contenidos
          del sitio son titularidad de {COMPANY.name} o se utilizan con la correspondiente
          autorización, y están protegidos por la normativa de propiedad intelectual e industrial.
          Queda prohibida su reproducción, distribución o transformación sin autorización expresa y
          por escrito, salvo lo permitido por la ley.
        </P>
      </LegalSection>

      <LegalSection title="5. Responsabilidad">
        <List
          items={[
            "Se procura que la información (carta, precios, horarios, zonas de reparto y alérgenos) sea exacta y esté actualizada, pero puede haber errores o cambios. El importe que se cobra es siempre el calculado por el sistema en el momento de confirmar el pedido.",
            "La información sobre alérgenos es orientativa. Si tienes una alergia o intolerancia grave, indícalo en las observaciones del pedido y consúltalo con el establecimiento.",
            "PizzAI, el asistente virtual, utiliza inteligencia artificial y puede equivocarse. Sus respuestas no constituyen una oferta vinculante ni información definitiva sobre alérgenos; en caso de duda prevalece lo indicado en la carta y en el pedido.",
            "No se garantiza la disponibilidad continua del servicio, que puede interrumpirse por mantenimiento, fallos técnicos o causas ajenas a nuestro control.",
            "El sitio puede contener enlaces a páginas de terceros (por ejemplo, la pasarela de pago). No nos responsabilizamos de su contenido ni de sus políticas.",
          ]}
        />
      </LegalSection>

      <LegalSection title="6. Protección de datos y cookies">
        <P>
          El tratamiento de datos personales se describe en la{" "}
          <Link href="/legal/privacidad" className="underline underline-offset-4">
            Política de privacidad
          </Link>{" "}
          y el uso de cookies y almacenamiento local, en la{" "}
          <Link href="/legal/cookies" className="underline underline-offset-4">
            Política de cookies
          </Link>
          . Las condiciones de los pedidos están en las{" "}
          <Link href="/legal/condiciones-de-compra" className="underline underline-offset-4">
            Condiciones de compra
          </Link>
          .
        </P>
      </LegalSection>

      <LegalSection title="7. Legislación aplicable y jurisdicción">
        <P>
          Este aviso legal se rige por la legislación española. Cuando el usuario tenga la condición
          de consumidor, serán competentes los juzgados y tribunales que correspondan conforme a la
          normativa de protección de consumidores y usuarios. En los demás casos, los juzgados y
          tribunales de Madrid, con renuncia a cualquier otro fuero que pudiera corresponder.
        </P>
      </LegalSection>
    </LegalDocument>
  );
}

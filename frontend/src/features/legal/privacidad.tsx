import { COMPANY } from "@/lib/legal";

import { LegalDocument, LegalSection, LegalTable, List, P } from "./legal-parts";

export function Privacidad() {
  return (
    <LegalDocument>
      <LegalSection title="1. Responsable del tratamiento">
        <P>
          El responsable del tratamiento de tus datos personales es {COMPANY.name} (marca{" "}
          {COMPANY.brand}), con NIF/CIF {COMPANY.taxId} y domicilio social en{" "}
          {COMPANY.registeredAddress}. Puedes contactar con nosotros en {COMPANY.email} o en el
          teléfono {COMPANY.phone}.
        </P>
        <P>
          Esta política cumple el Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018
          (LOPDGDD).
        </P>
      </LegalSection>

      <LegalSection title="2. Qué datos tratamos y para qué">
        <LegalTable
          caption="Finalidades, datos y base jurídica del tratamiento"
          head={["Finalidad", "Datos", "Base jurídica"]}
          rows={[
            [
              "Crear y gestionar tu cuenta y tu sesión",
              "Correo, nombre de usuario, teléfono, contraseña (la gestiona nuestro proveedor de acceso y no la vemos) o cuenta de Google",
              "Ejecución del contrato (art. 6.1.b RGPD)",
            ],
            [
              "Gestionar tus pedidos: preparación, entrega o recogida, atención y avisos del pedido",
              "Pedido, dirección de entrega, observaciones, hora solicitada, estado del pedido",
              "Ejecución del contrato",
            ],
            [
              "Cobro del pedido y facturación",
              "Importe, método de pago, estado del pago y datos fiscales si pides factura. No guardamos el número de tu tarjeta: lo trata la pasarela de pago",
              "Ejecución del contrato y obligación legal (art. 6.1.c)",
            ],
            [
              `Programa de fidelización ${COMPANY.brand} CLUB`,
              "Puntos, movimientos y recompensas canjeadas",
              "Ejecución del contrato (condiciones del programa)",
            ],
            [
              "Enviarte correos sobre tu pedido (confirmación, estado, ticket)",
              "Correo y datos del pedido",
              "Ejecución del contrato",
            ],
            [
              "Ofertas y novedades por correo, solo si lo has marcado",
              "Correo y nombre",
              "Consentimiento (art. 6.1.a), que puedes retirar cuando quieras",
            ],
            [
              "Seguridad y prevención del fraude y del abuso",
              "Dirección IP, registros técnicos, registro de operaciones administrativas",
              "Interés legítimo (art. 6.1.f)",
            ],
            [
              "Responder a tus preguntas con el asistente PizzAI",
              "El texto que escribes en el chat",
              "Ejecución de tu solicitud y interés legítimo",
            ],
          ]}
        />
        <P>
          No elaboramos perfiles ni tomamos decisiones automatizadas con efectos jurídicos sobre ti.
        </P>
      </LegalSection>

      <LegalSection title="3. PizzAI, el asistente con inteligencia artificial">
        <P>
          Lo que escribes en el chat de PizzAI se envía a nuestro proveedor de inteligencia
          artificial (actualmente, Google Gemini) para generar la respuesta, junto con información
          pública de la carta, las promociones, el reparto y los horarios. PizzAI no accede a tu
          cuenta, a tus pedidos ni a tus datos personales y no puede realizar operaciones.{" "}
          <strong>No escribas en el chat datos personales, de salud ni de pago.</strong> El
          proveedor puede tratar esos mensajes conforme a sus propias condiciones.
        </P>
      </LegalSection>

      <LegalSection title="4. Cuánto tiempo conservamos los datos">
        <List
          items={[
            "Los datos de la cuenta, mientras la mantengas. Puedes pedir su supresión en cualquier momento: se suprimirán o anonimizarán, salvo lo que debamos conservar por ley.",
            "Los pedidos, tickets y facturas, durante los plazos exigidos por la normativa mercantil y tributaria (con carácter general, seis años).",
            "Los registros técnicos de seguridad, el tiempo necesario para su finalidad.",
            "Los datos tratados con tu consentimiento, hasta que lo retires.",
            "Tras esos plazos, los datos permanecen bloqueados solo mientras puedan surgir responsabilidades, y después se destruyen.",
          ]}
        />
      </LegalSection>

      <LegalSection title="5. Destinatarios y proveedores">
        <P>
          No vendemos tus datos. Los compartimos solo con proveedores que los tratan por nuestra
          cuenta (encargados del tratamiento), con contrato conforme al art. 28 RGPD, y con las
          administraciones cuando la ley lo exige.
        </P>
        <LegalTable
          caption="Proveedores que tratan datos por cuenta del responsable"
          head={["Proveedor", "Para qué"]}
          rows={[
            [
              "Supabase",
              "Autenticación (correo y Google), base de datos y almacenamiento de imágenes",
            ],
            ["Stripe", "Pasarela de pago con tarjeta"],
            ["Resend", "Envío de correos de pedido"],
            ["Vercel y Railway", "Alojamiento de la web y de la API"],
            ["Google", "Inicio de sesión con Google y asistente PizzAI (Gemini)"],
          ]}
        />
        <P>
          Algunos de estos proveedores pueden tratar datos fuera del Espacio Económico Europeo. En
          ese caso, las transferencias se amparan en una decisión de adecuación (como el Marco de
          Privacidad de Datos UE–EE. UU.) o en cláusulas contractuales tipo de la Comisión Europea.
        </P>
      </LegalSection>

      <LegalSection title="6. Tus derechos">
        <P>
          Puedes ejercer los derechos de acceso, rectificación, supresión, oposición, limitación del
          tratamiento y portabilidad, y retirar tu consentimiento en cualquier momento, escribiendo
          a {COMPANY.email} e indicando el derecho que ejerces. Podemos pedirte que acredites tu
          identidad. Muchos datos puedes corregirlos tú mismo desde «Mi cuenta».
        </P>
        <P>
          Si consideras que no tratamos tus datos correctamente, puedes presentar una reclamación
          ante la Agencia Española de Protección de Datos (www.aepd.es).
        </P>
      </LegalSection>

      <LegalSection title="7. Menores">
        <P>
          Para crear una cuenta debes ser mayor de 14 años. Si eres menor de esa edad, necesitas el
          consentimiento de tus padres o tutores. Si tenemos conocimiento de que hemos recogido
          datos de un menor sin ese consentimiento, los suprimiremos.
        </P>
      </LegalSection>

      <LegalSection title="8. Seguridad">
        <P>
          Aplicamos medidas técnicas y organizativas adecuadas: comunicaciones cifradas (HTTPS),
          control de acceso por roles, verificación de la identidad en el servidor, registro de las
          operaciones administrativas y separación entre los datos de la cocina y los de los
          clientes. Ningún sistema es infalible; si se produjera una brecha que te afectara, te lo
          comunicaremos en los casos y plazos que exige la ley.
        </P>
      </LegalSection>

      <LegalSection title="9. Cambios en esta política">
        <P>
          Podemos actualizar esta política, por ejemplo si cambiamos de proveedor o de finalidad. La
          fecha de la última revisión figura al principio de esta página.
        </P>
      </LegalSection>
    </LegalDocument>
  );
}

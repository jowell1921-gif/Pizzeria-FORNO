import Link from "next/link";

import { DELIVERY_NOTICE } from "@/lib/demo-data";
import { COMPANY } from "@/lib/legal";

import { LegalDocument, LegalSection, List, P } from "./legal-parts";

/** Condiciones de compra: pedidos, precios, pagos, cancelaciones, alérgenos y FORNEA CLUB. */
export function CondicionesDeCompra() {
  return (
    <LegalDocument>
      <LegalSection title="1. Quién vende">
        <P>
          Este sitio es una demostración de {COMPANY.name} (marca {COMPANY.brand}). {COMPANY.brand}{" "}
          es un establecimiento de ejemplo, situado en {COMPANY.establishment}, con teléfono{" "}
          {COMPANY.phone}. Mientras el proyecto esté en fase de demostración, los pedidos no se
          preparan ni se entregan y los pagos no son reales. Más información en el{" "}
          <Link href="/legal/aviso-legal" className="underline underline-offset-4">
            Aviso legal
          </Link>
          .
        </P>
      </LegalSection>

      <LegalSection title="2. Cómo hacer un pedido">
        <List
          items={[
            "Para pedir necesitas una cuenta con tu perfil completo (nombre de usuario y teléfono). No hay compra como invitado.",
            "Eliges los productos y sus opciones, la modalidad (recogida o domicilio) y la hora, y revisas el resumen antes de confirmar.",
            "El pedido queda formalizado cuando lo confirmas y el sistema lo registra. Recibirás un correo de confirmación y podrás seguir su estado en «Mi cuenta».",
            "Podemos rechazar un pedido cuando no sea posible atenderlo (por ejemplo, por falta de existencias, cierre o exceso de pedidos). En ese caso te lo comunicaremos y, si ya lo habías pagado, se te devolverá el importe.",
            "Podemos pausar temporalmente la recepción de pedidos. Mientras esté pausada, la web lo indicará.",
          ]}
        />
      </LegalSection>

      <LegalSection title="3. Precios e impuestos">
        <P>
          Todos los precios se muestran en euros e incluyen el IVA. El desglose figura en el ticket
          o en la factura. Los gastos de envío, el pedido mínimo y el tiempo estimado dependen de la
          zona de reparto y se muestran antes de confirmar. El importe final lo calcula siempre el
          sistema en el momento de confirmar el pedido; no se puede modificar desde el navegador.
        </P>
      </LegalSection>

      <LegalSection title="4. Recogida y entrega a domicilio">
        <List
          items={[
            `Recogida: en el establecimiento (${COMPANY.establishment}), a la hora elegida o lo antes posible según el horario.`,
            `Domicilio: ${DELIVERY_NOTICE.short} Debes estar disponible para recibir el pedido en el momento de la entrega.`,
            "Los tiempos de preparación y entrega son estimaciones y pueden variar por la carga de trabajo, el tráfico o las condiciones meteorológicas.",
          ]}
        />
      </LegalSection>

      <LegalSection title="5. Formas de pago">
        <List
          items={[
            "Efectivo al recoger o al recibir el pedido.",
            "Tarjeta, mediante la pasarela de pago segura de Stripe. Los datos de tu tarjeta no pasan por nuestros servidores ni los almacenamos. El pedido solo se considera pagado cuando la pasarela confirma el cobro.",
            "Si el pago con tarjeta no se completa en media hora, el pedido se cancela automáticamente.",
            "Mientras la pasarela de pago funcione en modo de prueba, los pagos con tarjeta son únicamente demostrativos: se realizan con una tarjeta de prueba y no se cobra ningún importe.",
          ]}
        />
      </LegalSection>

      <LegalSection title="6. Cancelaciones y devoluciones">
        <List
          items={[
            "Puedes cancelar tu pedido desde «Mi cuenta» mientras no haya sido aceptado por el establecimiento.",
            "Una vez aceptado, ya está en preparación; si necesitas cambiarlo o cancelarlo, llama al establecimiento y valoraremos cada caso.",
            "Si se cancela o rechaza un pedido ya pagado con tarjeta, se reembolsa el importe por el mismo medio de pago. El plazo en que el banco refleja el abono depende de la entidad.",
            "Si hay un problema con tu pedido (producto equivocado, en mal estado o no entregado), contacta con nosotros en el mismo día para que podamos solucionarlo.",
          ]}
        />
      </LegalSection>

      <LegalSection title="7. Derecho de desistimiento">
        <P>
          De acuerdo con el artículo 103 del texto refundido de la Ley General para la Defensa de
          los Consumidores y Usuarios, no existe derecho de desistimiento en el suministro de
          productos que puedan deteriorarse o caducar con rapidez, como la comida preparada. Esto no
          afecta a tus derechos legales de garantía ni a lo dispuesto en el apartado anterior.
        </P>
      </LegalSection>

      <LegalSection title="8. Alérgenos">
        <P>
          Cada producto indica los alérgenos que contiene, conforme al Reglamento (UE) 1169/2011.
          Nuestra cocina manipula varios alérgenos, por lo que no podemos garantizar la ausencia
          total de trazas. Si tienes una alergia o intolerancia, indícalo en las observaciones del
          pedido y consúltanos antes de pedir.
        </P>
      </LegalSection>

      <LegalSection title={`9. Programa ${COMPANY.brand} CLUB`}>
        <List
          items={[
            "Los puntos se calculan según la regla vigente en cada momento (puntos por euro gastado en productos), que no incluye gastos de envío ni descuentos.",
            "Se conceden cuando el pedido se completa y una sola vez por pedido. Si el pedido se cancela o se devuelve, los puntos concedidos se revierten.",
            "Los puntos no tienen valor monetario, no son transferibles ni canjeables por dinero, y pueden caducar si así se indica en las condiciones del programa.",
            "Las recompensas se canjean desde «Mi cuenta» y se aplican a un pedido. Si el pedido se cancela, los puntos gastados se devuelven.",
            "Podemos modificar o cancelar el programa avisando con antelación razonable, y suspender cuentas en caso de uso fraudulento.",
          ]}
        />
      </LegalSection>

      <LegalSection title="10. Promociones y cupones">
        <P>
          Las promociones y cupones tienen las fechas, límites de uso, importes mínimos y
          restricciones indicados en su descripción, y el sistema los valida al confirmar el pedido.
          No son acumulables salvo que se indique lo contrario.
        </P>
      </LegalSection>

      <LegalSection title="11. Documentos de compra">
        <P>
          Cuando el pedido está cobrado puedes descargar el ticket (factura simplificada) desde «Mi
          cuenta». Si necesitas factura con tus datos fiscales, puedes solicitarla desde el propio
          pedido.
        </P>
      </LegalSection>

      <LegalSection title="12. Reclamaciones">
        <P>
          Dispones de hojas de reclamaciones en el establecimiento. También puedes llamar al{" "}
          {COMPANY.phone} y acudir a los servicios de consumo de tu comunidad autónoma. Para el
          tratamiento de tus datos, consulta la{" "}
          <Link href="/legal/privacidad" className="underline underline-offset-4">
            Política de privacidad
          </Link>
          .
        </P>
      </LegalSection>

      <LegalSection title="13. Legislación aplicable">
        <P>
          Estas condiciones se rigen por la legislación española. Cuando el comprador sea
          consumidor, serán competentes los juzgados y tribunales que correspondan conforme a la
          normativa de protección de consumidores y usuarios.
        </P>
      </LegalSection>
    </LegalDocument>
  );
}
